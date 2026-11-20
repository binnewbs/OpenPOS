import { type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";

export function recordActivity(
  db: Db,
  input: {
    storeId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string | null;
    after?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO activity_logs
       (id, store_id, user_id, action, entity_type, entity_id, before_json, after_json, reason, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
  ).run(
    uuidv7(),
    input.storeId,
    input.userId,
    input.action,
    input.entityType,
    input.entityId,
    input.after ? JSON.stringify(input.after) : null,
    input.reason ?? null,
    nowIso(),
  );
}

export function queueOutbox(
  db: Db,
  input: { storeId: string; tableName: string; rowId: string; payload: unknown; updatedAt: string | null },
): void {
  db.prepare(
    `INSERT INTO sync_outbox
       (store_id, op_id, table_name, row_id, operation, payload_json, base_updated_at, created_at)
     VALUES (?, ?, ?, ?, 'upsert', ?, ?, ?)`,
  ).run(
    input.storeId,
    uuidv7(),
    input.tableName,
    input.rowId,
    JSON.stringify(input.payload),
    input.updatedAt,
    nowIso(),
  );
}
