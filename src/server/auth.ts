import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, one } from "./db";
import { verifyPin } from "./pin";
import type { SessionUser } from "@/lib/types";

const COOKIE = "openpos_session";

function secret(): string {
  if (process.env.OPENPOS_SESSION_SECRET) return process.env.OPENPOS_SESSION_SECRET;
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".session-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const value = randomBytes(32).toString("hex");
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

function verifyCookie(value: string): string | null {
  const [userId, signature] = value.split(".");
  if (!userId || !signature) return null;
  const expected = Buffer.from(sign(userId));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return userId;
}

type UserRow = {
  id: string;
  store_id: string;
  name: string;
  username: string;
  pin_hash: string;
  role_id: string;
  role_name: string;
  role_slug: string;
  is_active: number;
};

export function findUserByUsername(storeId: string, username: string): UserRow | undefined {
  return one<UserRow>(
    getDb(),
    `SELECT u.id, u.store_id, u.name, u.username, u.pin_hash, u.role_id,
            r.name AS role_name, r.slug AS role_slug, u.is_active
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.store_id = ? AND u.username = ? AND u.deleted_at IS NULL`,
    storeId,
    username,
  );
}

export function loadSessionUser(userId: string): SessionUser | null {
  const db = getDb();
  const row = one<UserRow>(
    db,
    `SELECT u.id, u.store_id, u.name, u.username, u.pin_hash, u.role_id,
            r.name AS role_name, r.slug AS role_slug, u.is_active
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    userId,
  );
  if (!row || !row.is_active) return null;
  const permissions = (
    db.prepare("SELECT permission_key FROM role_permissions WHERE role_id = ?").all(row.role_id) as { permission_key: string }[]
  ).map((p) => p.permission_key);
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    username: row.username,
    roleId: row.role_id,
    roleName: row.role_name,
    roleSlug: row.role_slug,
    permissions,
  };
}

export function authenticate(username: string, pin: string): SessionUser | null {
  const db = getDb();
  const store = one<{ id: string }>(db, "SELECT id FROM stores LIMIT 1");
  if (!store) return null;
  const user = findUserByUsername(store.id, username.trim());
  if (!user || !user.is_active) return null;
  if (!verifyPin(pin, user.pin_hash)) return null;
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  return loadSessionUser(user.id);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return null;
  const userId = verifyCookie(value);
  if (!userId) return null;
  return loadSessionUser(userId);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: SessionUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

export function assertPermission(user: SessionUser, permission: string): void {
  if (!can(user, permission)) {
    const error = new Error("PERMISSION_DENIED");
    (error as Error & { code?: string }).code = "PERMISSION_DENIED";
    throw error;
  }
}
