"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, requireUser } from "../auth";
import { getDb, transaction } from "../db";
import { businessDate, nowIso } from "../format";
import { uuidv7 } from "../ids";
import { hashPin } from "../pin";
import { postJournal } from "../services/accounting";
import { recordActivity } from "../services/audit";
import { getOpenShift } from "../queries";
import type { ActionResult } from "./auth";

function fail(error: unknown): ActionResult<never> {
  const e = error as Error & { code?: string };
  return { ok: false, error: e.message || "Terjadi kesalahan.", code: e.code };
}

export async function updateStoreAction(input: {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  taxEnabled: boolean;
  taxRate: number;
  roundingIncrement: number;
  receiptFooter?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "settings.manage");
    if (!input.name.trim()) return { ok: false, error: "Nama toko wajib diisi." };
    getDb()
      .prepare(
        `UPDATE stores SET name = ?, legal_name = ?, address = ?, phone = ?, tax_enabled = ?, tax_rate = ?,
           rounding_increment = ?, receipt_footer = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name.trim(),
        input.legalName || null,
        input.address || null,
        input.phone || null,
        input.taxEnabled ? 1 : 0,
        Math.min(Math.max(input.taxRate, 0), 100),
        Math.max(0, Math.round(input.roundingIncrement)),
        input.receiptFooter || null,
        nowIso(),
        user.storeId,
      );
    recordActivity(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      action: "settings.update",
      entityType: "store",
      entityId: user.storeId,
    });
    revalidatePath("/pengaturan");
    revalidatePath("/");
    revalidatePath("/kasir");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function resetPinAction(input: { userId: string; pin: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "users.manage");
    if (!/^\d{4,8}$/.test(input.pin)) return { ok: false, error: "PIN harus 4–8 angka." };
    getDb()
      .prepare("UPDATE users SET pin_hash = ?, must_change_pin = 0, updated_at = ? WHERE id = ? AND store_id = ?")
      .run(hashPin(input.pin), nowIso(), input.userId, user.storeId);
    recordActivity(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      action: "user.pin_reset",
      entityType: "user",
      entityId: input.userId,
    });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createExpenseAction(input: {
  categoryId: string;
  amount: number;
  description: string;
  paidFrom: "cash_drawer" | "bank" | "ewallet" | "other";
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "expenses.create");
    const amount = Math.round(input.amount);
    if (amount <= 0) return { ok: false, error: "Nominal pengeluaran harus lebih dari nol." };
    if (!input.description.trim()) return { ok: false, error: "Keterangan wajib diisi." };

    const db = getDb();
    const shift = getOpenShift(user.storeId);
    if (input.paidFrom === "cash_drawer" && !shift) {
      return { ok: false, error: "Pengeluaran dari laci membutuhkan shift terbuka.", code: "SHIFT_REQUIRED" };
    }

    transaction(db, () => {
      const expenseId = uuidv7();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO expenses
          (id, store_id, shift_id, category_id, amount, paid_from, description, business_date, spent_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        expenseId,
        user.storeId,
        shift?.id ?? null,
        input.categoryId,
        amount,
        input.paidFrom,
        input.description.trim(),
        businessDate(),
        createdAt,
        user.id,
        createdAt,
      );

      if (input.paidFrom === "cash_drawer" && shift) {
        db.prepare(
          `INSERT INTO cash_movements
            (id, store_id, shift_id, type, amount, reference_type, reference_id, note, business_date, user_id, created_at)
           VALUES (?, ?, ?, 'expense', ?, 'expense', ?, ?, ?, ?, ?)`,
        ).run(
          uuidv7(),
          user.storeId,
          shift.id,
          -amount,
          expenseId,
          input.description.trim(),
          businessDate(),
          user.id,
          createdAt,
        );
      }

      const sourceKey =
        input.paidFrom === "cash_drawer" ? "cash_drawer" : input.paidFrom === "bank" ? "bank" : "ewallet_clearing";
      postJournal(db, {
        storeId: user.storeId,
        sourceType: "expense",
        sourceId: expenseId,
        entryDate: businessDate(),
        description: `Pengeluaran: ${input.description.trim()}`,
        userId: user.id,
        lines: [
          { mappingKey: "operating_expense_default", debit: amount },
          { mappingKey: sourceKey, credit: amount },
        ],
      });

      recordActivity(db, {
        storeId: user.storeId,
        userId: user.id,
        action: "expense.create",
        entityType: "expense",
        entityId: expenseId,
        after: { amount, description: input.description },
      });
    });

    revalidatePath("/shift");
    revalidatePath("/laporan");
    revalidatePath("/akuntansi");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
