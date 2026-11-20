import { many, one, transaction, type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";
import type { CompletedSale, CompleteSaleInput, QuotedLine, QuoteTotals } from "@/lib/types";
import { applyCashRounding, quoteCart, stockFor } from "./catalog";
import { nextDocNumber, postJournal, type MappingKey } from "./accounting";
import { queueOutbox, recordActivity } from "./audit";

export class PosError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function completeSale(db: Db, input: CompleteSaleInput): CompletedSale {
  if (!input.items.length) throw new PosError("CART_EMPTY", "Keranjang masih kosong.");
  if (!input.shiftId) throw new PosError("SHIFT_REQUIRED", "Buka shift terlebih dahulu.");

  return transaction(db, () => {
    const store = one<{ rounding_increment: number; device_code: string }>(
      db,
      `SELECT rounding_increment,
              COALESCE((SELECT value_json FROM app_settings WHERE store_id = stores.id AND key = 'device_code'), '"K1"') AS device_code
       FROM stores WHERE id = ?`,
      input.storeId,
    );
    if (!store) throw new PosError("STORE_NOT_FOUND");

    const { lines, totals: quotedTotals } = quoteCart(db, input.storeId, input.items);

    for (const line of lines) {
      if (!line.trackStock) continue;
      if (line.stockAvailable < line.qtyBase) {
        throw new PosError(
          "INSUFFICIENT_STOCK",
          `Stok ${line.name} tidak cukup. Tersedia ${line.stockAvailable} ${line.unitCode}.`,
        );
      }
    }

    const hasCash = input.payments.some((p) => p.method === "cash");
    const increment = hasCash ? Number(input.roundingIncrement ?? store.rounding_increment ?? 0) : 0;
    const totals: QuoteTotals = applyCashRounding(quotedTotals, increment);

    const paidTotal = input.payments.reduce((sum, p) => sum + Math.round(p.amount), 0);
    const dueTotal = Math.max(0, totals.grandTotal - paidTotal);
    if (paidTotal > totals.grandTotal) throw new PosError("PAYMENT_MISMATCH", "Pembayaran melebihi total.");
    if (paidTotal + dueTotal < totals.grandTotal) throw new PosError("PAYMENT_MISMATCH", "Pembayaran belum lengkap.");
    if (dueTotal > 0 && !input.customerId) {
      throw new PosError("CUSTOMER_REQUIRED", "Penjualan kredit membutuhkan pelanggan.");
    }

    let customer: { id: string; name: string; credit_limit: number; credit_balance: number; credit_term_days: number } | undefined;
    if (input.customerId) {
      customer = one(
        db,
        `SELECT id, name, credit_limit, credit_balance, credit_term_days
         FROM customers WHERE id = ? AND store_id = ? AND deleted_at IS NULL AND is_active = 1`,
        input.customerId,
        input.storeId,
      );
      if (!customer) throw new PosError("CUSTOMER_NOT_FOUND");
      const available = Number(customer.credit_limit) - Number(customer.credit_balance);
      if (dueTotal > available) throw new PosError("CREDIT_LIMIT_EXCEEDED", "Batas kasbon pelanggan terlampaui.");
    }

    const changeTotal = input.payments.reduce((sum, p) => {
      if (p.method !== "cash") return sum;
      const tendered = Math.round(p.tendered ?? p.amount);
      return sum + Math.max(0, tendered - Math.round(p.amount));
    }, 0);
    for (const p of input.payments) {
      if (p.method !== "cash" && (p.tendered ?? p.amount) > p.amount) {
        throw new PosError("CHANGE_NOT_ALLOWED", "Kembalian hanya untuk pembayaran tunai.");
      }
    }

    const deviceCode = String(store.device_code ?? "K1").replace(/"/g, "");
    const receiptNo = nextDocNumber(db, input.storeId, "sale", input.businessDate.replaceAll("-", ""), `INV-${deviceCode}`, 4);
    const saleId = uuidv7();
    const completedAt = input.occurredAt ?? nowIso();
    const paymentStatus = dueTotal === 0 ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
    const orderDiscountTotal = 0;

    db.prepare(
      `INSERT INTO sales
        (id, store_id, shift_id, receipt_no, business_date, customer_id, cashier_id, status, payment_status,
         price_tier, subtotal, item_discount_total, order_discount_total, tax_total, rounding_total,
         grand_total, paid_total, change_total, due_total, cost_total, note, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, 'retail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      saleId,
      input.storeId,
      input.shiftId,
      receiptNo,
      input.businessDate,
      input.customerId ?? null,
      input.userId,
      paymentStatus,
      totals.subtotal,
      totals.itemDiscountTotal,
      orderDiscountTotal,
      totals.taxTotal,
      totals.roundingTotal,
      totals.grandTotal,
      paidTotal,
      changeTotal,
      dueTotal,
      totals.costTotal,
      input.note ?? null,
      completedAt,
      completedAt,
      completedAt,
    );

    const insertItem = db.prepare(
      `INSERT INTO sale_items
        (id, store_id, sale_id, line_no, product_id, variant_id, unit_id, qty, conversion_factor, qty_base,
         unit_price, price_source, price_rule_id, discount_percent, discount_amount, tax_rate, tax_amount,
         gross_amount, line_total, unit_cost_base, cost_total, note)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMovement = db.prepare(
      `INSERT INTO stock_movements
        (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
         conversion_factor, unit_cost, total_cost, reference_type, reference_id, business_date, user_id, created_at)
       VALUES (?, ?, ?, NULL, NULL, 'sale', ?, ?, ?, ?, ?, ?, 'sale', ?, ?, ?, ?)`,
    );

    lines.forEach((line, index) => {
      insertItem.run(
        uuidv7(),
        input.storeId,
        saleId,
        index + 1,
        line.productId,
        line.unitId,
        line.qty,
        line.factor,
        line.qtyBase,
        line.unitPrice,
        line.priceSource,
        line.discountPercent,
        line.discountAmount,
        line.taxRate,
        line.taxAmount,
        line.gross,
        line.lineTotal,
        line.costBase,
        line.costTotal,
        line.note ?? null,
      );

      if (line.trackStock) {
        insertMovement.run(
          uuidv7(),
          input.storeId,
          line.productId,
          -line.qtyBase,
          line.qty,
          line.unitId,
          line.factor,
          line.costBase,
          -line.costTotal,
          saleId,
          input.businessDate,
          input.userId,
          completedAt,
        );
        decrementStock(db, input.storeId, line);
      }
    });

    const insertPayment = db.prepare(
      `INSERT INTO payments
        (id, store_id, sale_id, shift_id, method, amount, tendered_amount, change_amount, reference_no, provider,
         status, paid_at, received_by, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'settled', ?, ?, NULL, ?)`,
    );
    const insertCash = db.prepare(
      `INSERT INTO cash_movements
        (id, store_id, shift_id, type, amount, reference_type, reference_id, note, business_date, user_id, created_at)
       VALUES (?, ?, ?, 'sale', ?, 'sale', ?, NULL, ?, ?, ?)`,
    );

    for (const payment of input.payments) {
      const amount = Math.round(payment.amount);
      if (amount <= 0) continue;
      const tendered = Math.round(payment.tendered ?? amount);
      const change = payment.method === "cash" ? Math.max(0, tendered - amount) : 0;
      insertPayment.run(
        uuidv7(),
        input.storeId,
        saleId,
        input.shiftId,
        payment.method,
        amount,
        tendered,
        change,
        payment.referenceNo ?? null,
        payment.provider ?? null,
        completedAt,
        input.userId,
        completedAt,
      );
      if (payment.method === "cash") {
        insertCash.run(uuidv7(), input.storeId, input.shiftId, amount, saleId, input.businessDate, input.userId, completedAt);
      }
    }

    if (dueTotal > 0 && customer) {
      const dueDate = new Date(`${input.businessDate}T12:00:00+07:00`);
      dueDate.setDate(dueDate.getDate() + Number(customer.credit_term_days || 30));
      db.prepare(
        `INSERT INTO credit_ledger
           (id, store_id, customer_id, entry_type, amount, balance_after, sale_id, due_date,
            reference_type, reference_id, note, created_by, created_at)
         VALUES (?, ?, ?, 'charge', ?, ?, ?, ?, 'sale', ?, NULL, ?, ?)`,
      ).run(
        uuidv7(),
        input.storeId,
        customer.id,
        dueTotal,
        Number(customer.credit_balance) + dueTotal,
        saleId,
        dueDate.toISOString().slice(0, 10),
        saleId,
        input.userId,
        completedAt,
      );
      db.prepare("UPDATE customers SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?").run(
        dueTotal,
        completedAt,
        customer.id,
      );
    }

    postSaleJournal(db, {
      storeId: input.storeId,
      userId: input.userId,
      saleId,
      businessDate: input.businessDate,
      description: `Penjualan ${receiptNo}`,
      totals,
      lines,
      payments: input.payments,
      dueTotal,
      customerId: input.customerId ?? null,
    });

    if (!input.silent) {
      recordActivity(db, {
        storeId: input.storeId,
        userId: input.userId,
        action: "sale.complete",
        entityType: "sale",
        entityId: saleId,
        after: { receiptNo, grandTotal: totals.grandTotal },
      });
      queueOutbox(db, {
        storeId: input.storeId,
        tableName: "sales",
        rowId: saleId,
        payload: { id: saleId, receipt_no: receiptNo, grand_total: totals.grandTotal, status: "completed" },
        updatedAt: completedAt,
      });
    }

    return {
      id: saleId,
      receiptNo,
      grandTotal: totals.grandTotal,
      paidTotal,
      changeTotal,
      dueTotal,
      lines,
      completedAt,
    };
  });
}

function decrementStock(db: Db, storeId: string, line: QuotedLine): void {
  const row = one<{ id: string; qty_on_hand: number }>(
    db,
    `SELECT id, qty_on_hand FROM stock_levels
     WHERE store_id = ? AND product_id = ? AND variant_id IS NULL`,
    storeId,
    line.productId,
  );
  if (row) {
    db.prepare("UPDATE stock_levels SET qty_on_hand = qty_on_hand - ?, updated_at = ? WHERE id = ?").run(
      line.qtyBase,
      nowIso(),
      row.id,
    );
  } else {
    db.prepare(
      `INSERT INTO stock_levels (id, store_id, product_id, variant_id, qty_on_hand, qty_reserved, avg_cost, last_cost, updated_at)
       VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?)`,
    ).run(uuidv7(), storeId, line.productId, -line.qtyBase, line.costBase, line.costBase, nowIso());
  }
}

function postSaleJournal(
  db: Db,
  input: {
    storeId: string;
    userId: string;
    saleId: string;
    businessDate: string;
    description: string;
    totals: QuoteTotals;
    lines: QuotedLine[];
    payments: CompleteSaleInput["payments"];
    dueTotal: number;
    customerId: string | null;
  },
): void {
  const methodTotals = new Map<string, number>();
  for (const p of input.payments) {
    methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + Math.round(p.amount));
  }
  const keyFor: Record<string, "cash_drawer" | "bank" | "ewallet_clearing" | "qris_clearing"> = {
    cash: "cash_drawer",
    bank_transfer: "bank",
    ewallet: "ewallet_clearing",
    qris: "qris_clearing",
    other: "cash_drawer",
  };
  const lines = [];
  for (const [method, amount] of methodTotals) {
    if (amount > 0) lines.push({ mappingKey: keyFor[method] ?? "cash_drawer", debit: amount });
  }
  if (input.dueTotal > 0) {
    lines.push({
      mappingKey: "accounts_receivable" as const,
      debit: input.dueTotal,
      customerId: input.customerId,
    });
  }
  lines.push({
    mappingKey: "sales_revenue" as const,
    credit: input.totals.grandTotal - input.totals.taxTotal,
  });
  if (input.totals.taxTotal > 0) lines.push({ mappingKey: "tax_output" as const, credit: input.totals.taxTotal });
  if (input.totals.costTotal > 0) {
    lines.push({ mappingKey: "cogs" as const, debit: input.totals.costTotal });
    lines.push({ mappingKey: "inventory" as const, credit: input.totals.costTotal });
  }

  postJournal(db, {
    storeId: input.storeId,
    sourceType: "sale",
    sourceId: input.saleId,
    entryDate: input.businessDate,
    description: input.description,
    userId: input.userId,
    lines,
  });
}

export function voidSale(db: Db, input: { storeId: string; userId: string; saleId: string; reason: string }): void {
  transaction(db, () => {
    const sale = one<{
      id: string;
      receipt_no: string;
      status: string;
      grand_total: number;
      tax_total: number;
      due_total: number;
      cost_total: number;
      customer_id: string | null;
      business_date: string;
      shift_id: string | null;
    }>(
      db,
      "SELECT id, receipt_no, status, grand_total, tax_total, due_total, cost_total, customer_id, business_date, shift_id FROM sales WHERE id = ? AND store_id = ?",
      input.saleId,
      input.storeId,
    );
    if (!sale) throw new PosError("SALE_NOT_FOUND");
    if (sale.status !== "completed") throw new PosError("SALE_ALREADY_VOIDED", "Penjualan tidak dapat dibatalkan.");
    if (!input.reason.trim()) throw new PosError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.");

    const items = db
      .prepare("SELECT product_id, unit_id, qty, qty_base, conversion_factor, unit_cost_base FROM sale_items WHERE sale_id = ?")
      .all(input.saleId) as { product_id: string; unit_id: string; qty: number; qty_base: number; conversion_factor: number; unit_cost_base: number }[];

    const insertMovement = db.prepare(
      `INSERT INTO stock_movements
        (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
         conversion_factor, unit_cost, total_cost, reference_type, reference_id, reason, business_date, user_id, created_at)
       VALUES (?, ?, ?, NULL, NULL, 'sale_return', ?, ?, ?, ?, ?, ?, 'sale_void', ?, ?, ?, ?, ?)`,
    );
    for (const item of items) {
      insertMovement.run(
        uuidv7(),
        input.storeId,
        item.product_id,
        Number(item.qty_base),
        Number(item.qty),
        item.unit_id,
        Number(item.conversion_factor),
        Number(item.unit_cost_base),
        Math.round(Number(item.qty_base) * Number(item.unit_cost_base)),
        input.saleId,
        input.reason,
        sale.business_date,
        input.userId,
        nowIso(),
      );
      const level = one<{ id: string }>(
        db,
        "SELECT id FROM stock_levels WHERE store_id = ? AND product_id = ? AND variant_id IS NULL",
        input.storeId,
        item.product_id,
      );
      if (level) {
        db.prepare("UPDATE stock_levels SET qty_on_hand = qty_on_hand + ?, updated_at = ? WHERE id = ?").run(
          Number(item.qty_base),
          nowIso(),
          level.id,
        );
      }
    }

    db.prepare("UPDATE payments SET status = 'voided' WHERE sale_id = ?").run(input.saleId);
    const cash = one<{ total: number }>(
      db,
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE sale_id = ? AND method = 'cash'",
      input.saleId,
    );
    if (cash && Number(cash.total) > 0) {
      db.prepare(
        `INSERT INTO cash_movements
           (id, store_id, shift_id, type, amount, reference_type, reference_id, note, business_date, user_id, created_at)
         VALUES (?, ?, ?, 'refund', ?, 'sale_void', ?, ?, ?, ?, ?)`,
      ).run(
        uuidv7(),
        input.storeId,
        sale.shift_id,
        -Math.round(Number(cash.total)),
        input.saleId,
        input.reason,
        sale.business_date,
        input.userId,
        nowIso(),
      );
    }

    if (sale.customer_id && sale.due_total > 0) {
      const customer = one<{ credit_balance: number }>(
        db,
        "SELECT credit_balance FROM customers WHERE id = ?",
        sale.customer_id,
      );
      if (customer) {
        db.prepare(
          `INSERT INTO credit_ledger
             (id, store_id, customer_id, entry_type, amount, balance_after, sale_id, due_date,
              reference_type, reference_id, note, created_by, created_at)
           VALUES (?, ?, ?, 'void', ?, ?, ?, NULL, 'sale_void', ?, ?, ?, ?)`,
        ).run(
          uuidv7(),
          input.storeId,
          sale.customer_id,
          -sale.due_total,
          Number(customer.credit_balance) - sale.due_total,
          sale.id,
          input.saleId,
          input.reason,
          input.userId,
          nowIso(),
        );
        db.prepare("UPDATE customers SET credit_balance = credit_balance - ?, updated_at = ? WHERE id = ?").run(
          sale.due_total,
          nowIso(),
          sale.customer_id,
        );
      }
    }

    db.prepare("UPDATE sales SET status = 'voided', voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ? WHERE id = ?").run(nowIso(), input.userId, input.reason, nowIso(), input.saleId);

    db.prepare(
      `INSERT INTO sale_voids (id, store_id, sale_id, reason, voided_by, approved_by, shift_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(uuidv7(), input.storeId, input.saleId, input.reason, input.userId, sale.shift_id, nowIso());

    const paidByMethod = many<{ method: string; total: number }>(
      db,
      "SELECT method, SUM(amount) AS total FROM payments WHERE sale_id = ? GROUP BY method",
      input.saleId,
    );
    const methodMapping: Record<string, MappingKey> = {
      cash: "cash_drawer",
      bank_transfer: "bank",
      ewallet: "ewallet_clearing",
      qris: "qris_clearing",
      other: "cash_drawer",
    };
    const reversalLines: { mappingKey: MappingKey; debit?: number; credit?: number; customerId?: string }[] = [
      { mappingKey: "sales_revenue", debit: sale.grand_total - sale.tax_total },
      ...(sale.tax_total > 0 ? [{ mappingKey: "tax_output" as MappingKey, debit: sale.tax_total }] : []),
      ...paidByMethod
        .filter((row) => Number(row.total) > 0)
        .map((row) => ({ mappingKey: methodMapping[row.method] ?? "cash_drawer", credit: Math.round(Number(row.total)) })),
      ...(sale.due_total > 0
        ? [{ mappingKey: "accounts_receivable" as MappingKey, credit: sale.due_total, customerId: sale.customer_id ?? undefined }]
        : []),
      { mappingKey: "inventory", debit: sale.cost_total },
      { mappingKey: "cogs", credit: sale.cost_total },
    ];

    postJournal(db, {
      storeId: input.storeId,
      sourceType: "sale_void",
      sourceId: input.saleId,
      entryDate: sale.business_date,
      description: `Pembatalan ${sale.receipt_no}`,
      userId: input.userId,
      lines: reversalLines,
    });

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "sale.void",
      entityType: "sale",
      entityId: input.saleId,
      reason: input.reason,
    });
  });
}

export { stockFor };
