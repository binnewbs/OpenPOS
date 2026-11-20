import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedIfEmpty } from "./seed";

type GlobalWithDb = typeof globalThis & { __openposDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (g.__openposDb) return g.__openposDb;

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, "openpos.sqlite"));
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");

  const schemaPath = path.join(process.cwd(), "db", "sqlite", "0001_init.sql");
  db.exec(fs.readFileSync(schemaPath, "utf8"));

  seedIfEmpty(db);

  g.__openposDb = db;
  return db;
}

export type Db = DatabaseSync;

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function one<T>(db: Db, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function many<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}
