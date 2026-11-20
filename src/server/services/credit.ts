import { one, transaction, type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";
import { nextDocNumber, postJournal } from "./accounting";
import { recordActivity } from "./audit";

export function recordCreditPayment(
  db: Db,
  input: {
    storeId: string;
    userId: string;
    shiftId: string | null;
    customerId: string;
    amount: number;
    method: "cash" | "bank_transfer" | "ewallet" | "qris" | "other";
    referenceNo?: string | null;
    note?: string | null;
    businessDate: string;
  },
): { id: string; paymentNo: string } {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("AMOUNT_INVALID");

  return transaction(db, () => {
    const customer = one<{ id: string; name: string; credit_balance: number }>(
      db,
      "SELECT id, name, credit_balance FROM customers WHERE id = ? AND store_id = ? AND deleted_at IS NULL",
      input.customerId,
      input.storeId,
    );
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    if (amount > Number(customer.credit_balance)) throw new Error("PAYMENT_EXCEEDS_BALANCE");

    const paymentId = uuidv7();
    const createdAt = nowIso();
    db.prepare(
      `INSERT INTO credit_payments
        (id, store_id, customer_id, shift_id, amount, method, reference_no, note, paid_at, received_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      paymentId,
      input.storeId,
      input.customerId,
      input.shiftId,
      amount,
      input.method,
      input.referenceNo ?? null,
      input.note ?? null,
      createdAt,
      input.userId,
      createdAt,
    );

    db.prepare(
      `INSERT INTO credit_ledger
        (id, store_id, customer_id, entry_type, amount, balance_after, sale_id, due_date,
         reference_type, reference_id, note, created_by, created_at)
       VALUES (?, ?, ?, 'payment', ?, ?, NULL, NULL, 'credit_payment', ?, ?, ?, ?)`,
    ).run(
      uuidv7(),
      input.storeId,
      input.customerId,
      -amount,
      Number(customer.credit_balance) - amount,
      paymentId,
      input.note ?? null,
      input.userId,
      createdAt,
    );

    db.prepare("UPDATE customers SET credit_balance = credit_balance - ?, updated_at = ? WHERE id = ?").run(
      amount,
      createdAt,
      input.customerId,
    );

    if (input.method === "cash" && input.shiftId) {
      db.prepare(
        `INSERT INTO cash_movements
          (id, store_id, shift_id, type, amount, reference_type, reference_id, note, business_date, user_id, created_at)
         VALUES (?, ?, ?, 'credit_payment', ?, 'credit_payment', ?, NULL, ?, ?, ?)`,
      ).run(
        uuidv7(),
        input.storeId,
        input.shiftId,
        amount,
        paymentId,
        input.businessDate,
        input.userId,
        createdAt,
      );
    }

    const mappingKey =
      input.method === "cash" ? "cash_drawer" : input.method === "qris" ? "qris_clearing" : input.method === "ewallet" ? "ewallet_clearing" : "bank";
    const paymentNo = nextDocNumber(
      db,
      input.storeId,
      "credit_payment",
      input.businessDate.replaceAll("-", ""),
      "ARP-K1",
      4,
    );

    postJournal(db, {
      storeId: input.storeId,
      sourceType: "credit_payment",
      sourceId: paymentId,
      entryDate: input.businessDate,
      description: `Pembayaran kasbon ${customer.name} — ${paymentNo}`,
      userId: input.userId,
      lines: [
        { mappingKey, debit: amount },
        { mappingKey: "accounts_receivable", credit: amount, customerId: input.customerId },
      ],
    });

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "credit.payment",
      entityType: "customer",
      entityId: input.customerId,
      after: { amount, paymentNo },
    });

    return { id: paymentId, paymentNo };
  });
}
