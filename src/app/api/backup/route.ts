import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (!user.permissions.includes("backup.manage")) {
    return NextResponse.json({ error: "PERMISSION_DENIED" }, { status: 403 });
  }

  const target = path.join(os.tmpdir(), `openpos-backup-${Date.now()}.sqlite`);
  try {
    const db = getDb();
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    const file = fs.readFileSync(target);
    fs.unlinkSync(target);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="openpos-backup-${stamp}.sqlite"`,
        "Content-Length": String(file.byteLength),
      },
    });
  } catch (error) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return NextResponse.json({ error: "BACKUP_FAILED", message: (error as Error).message }, { status: 500 });
  }
}
