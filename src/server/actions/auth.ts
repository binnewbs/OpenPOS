"use server";

import { redirect } from "next/navigation";
import { authenticate, clearSessionCookie, getCurrentUser, setSessionCookie } from "../auth";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: string };

export async function loginAction(input: { username: string; pin: string }): Promise<ActionResult> {
  const user = authenticate(input.username, input.pin);
  if (!user) return { ok: false, error: "Nama pengguna atau PIN salah.", code: "AUTH_INVALID_PIN" };
  await setSessionCookie(user.id);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

export async function currentUserAction() {
  return getCurrentUser();
}
