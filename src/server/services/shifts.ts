import { one, transaction, type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";
import { postJournal } from "./accounting";
import { recordActivity } from "./audit";

export type ShiftRow = {
  id: string;
  register_name: string;
  device_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  status: string;
  business_date: string;
  expected_cash: number;
};

export function openShift(
  db: Db,
  input: { storeId: string; userId: string; openingCash: number; registerName?: string; deviceId?: string; businessDate: string },
): string {
  return transaction(db, () => {
    const existing = one<{ id: string }>(
      db,
      "SELECT id FROM shifts WHERE store_id = ? AND status = 'open' LIMIT 1",
      input.storeId,
    );
    if (existing) throw new Error("SHIFT_ALREADY_OPEN");

    const id = uuidv7();
    db.prepare(
      `INSERT INTO shifts
        (id, store_id, register_name, device_id, opened_by, opened_at, opening_cash, status, business_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).run(
      id,
      input.storeId,
      input.registerName ?? "Kasir Utama",
      input.deviceId ?? "K1",
      input.userId,
      nowIso(),
      Math.round(input.openingCash),
      input.businessDate,
      nowIso(),
      nowIso(),
    );

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "shift.open",
      entityType: "shift",
      entityId: id,
      after: { openingCash: input.openingCash },
    });
    return id;
  });
}

export function closeShift(
  db: Db,
  input: { storeId: string; userId: string; shiftId: string; countedCash: number; note?: string },
): { expected: number; difference: number } {
  return transaction(db, () => {
    const shift = one<{ opening_cash: number; status: string; business_date: string }>(
      db,
      "SELECT opening_cash, status, business_date FROM shifts WHERE id = ? AND store_id = ?",
      input.shiftId,
      input.storeId,
    );
    if (!shift) throw new Error("SHIFT_NOT_FOUND");
    if (shift.status !== "open") throw new Error("SHIFT_CLOSED");

    const movements = one<{ total: number }>(
      db,
      "SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE shift_id = ?",
      input.shiftId,
    );
    const expected = Number(shift.opening_cash) + Number(movements?.total ?? 0);
    const counted = Math.round(input.countedCash);
    const difference = counted - expected;

    db.prepare(
      `UPDATE shifts SET status = 'closed', closed_by = ?, closed_at = ?, expected_cash = ?,
        counted_cash = ?, difference = ?, closing_note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.userId, nowIso(), expected, counted, difference, input.note ?? null, nowIso(), input.shiftId);

    if (difference !== 0) {
      postJournal(db, {
        storeId: input.storeId,
        sourceType: "shift_close",
        sourceId: input.shiftId,
        entryDate: shift.business_date,
        description: `Selisih kas shift (${difference > 0 ? "lebih" : "kurang"})`,
        userId: input.userId,
        lines:
          difference > 0
            ? [
                { mappingKey: "cash_drawer", debit: difference },
                { mappingKey: "cash_over_short", credit: difference },
              ]
            : [
                { mappingKey: "cash_over_short", debit: -difference },
                { mappingKey: "cash_drawer", credit: -difference },
              ],
      });
    }

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "shift.close",
      entityType: "shift",
      entityId: input.shiftId,
      after: { expected, counted, difference },
    });
    return { expected, difference };
  });
}

export function expectedCash(db: Db, shiftId: string): number {
  const row = one<{ opening_cash: number; movements: number }>(
    db,
    `SELECT s.opening_cash,
            COALESCE((SELECT SUM(amount) FROM cash_movements WHERE shift_id = s.id), 0) AS movements
     FROM shifts s WHERE s.id = ?`,
    shiftId,
  );
  return Number(row?.opening_cash ?? 0) + Number(row?.movements ?? 0);
}
