import { one, transaction, type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";
import { getProductUnit } from "./catalog";
import { nextDocNumber, postJournal } from "./accounting";
import { queueOutbox, recordActivity } from "./audit";

export type PurchaseItemInput = {
  productId: string;
  unitId: string;
  qty: number;
  unitCost: number;
  expiryDate?: string | null;
  batchNo?: string | null;
};

export function postPurchase(
  db: Db,
  input: {
    storeId: string;
    userId: string;
    supplierId: string;
    invoiceDate: string;
    dueDate: string | null;
    supplierInvoiceNo?: string | null;
    items: PurchaseItemInput[];
    notes?: string | null;
    deviceCode?: string;
  },
): { id: string; purchaseNo: string; grandTotal: number } {
  if (!input.items.length) throw new Error("PURCHASE_EMPTY");

  return transaction(db, () => {
    const purchaseId = uuidv7();
    const createdAt = nowIso();
    const purchaseNo = nextDocNumber(
      db,
      input.storeId,
      "purchase",
      input.invoiceDate.replaceAll("-", ""),
      `PUR-${input.deviceCode ?? "K1"}`,
      4,
    );

    let subtotal = 0;
    const prepared = input.items.map((item) => {
      const unit = getProductUnit(db, item.productId, item.unitId);
      if (!unit) throw new Error("UNIT_INVALID");
      const factor = Number(unit.factor_to_base);
      const qty = Number(item.qty);
      const unitCost = Math.round(Number(item.unitCost));
      const unitCostBase = unitCost / factor;
      const lineTotal = Math.round(qty * unitCost);
      subtotal += lineTotal;
      return { ...item, factor, qty, unitCost, unitCostBase, lineTotal, qtyBase: qty * factor };
    });

    db.prepare(
      `INSERT INTO purchases
        (id, store_id, purchase_no, supplier_invoice_no, supplier_id, status, invoice_date, due_date,
         subtotal, discount_total, tax_total, shipping_total, grand_total, paid_total, due_total,
         notes, created_by, posted_by, posted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, 0, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      purchaseId,
      input.storeId,
      purchaseNo,
      input.supplierInvoiceNo ?? null,
      input.supplierId,
      input.invoiceDate,
      input.dueDate,
      subtotal,
      subtotal,
      subtotal,
      input.notes ?? null,
      input.userId,
      input.userId,
      createdAt,
      createdAt,
      createdAt,
    );

    const insertItem = db.prepare(
      `INSERT INTO purchase_items
        (id, store_id, purchase_id, product_id, variant_id, unit_id, qty, conversion_factor, qty_base,
         unit_cost, unit_cost_base, discount_amount, line_total, expiry_date, batch_no, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    );
    const insertBatch = db.prepare(
      `INSERT INTO stock_batches
        (id, store_id, product_id, variant_id, purchase_item_id, batch_no, expiry_date,
         qty_received, qty_remaining, unit_cost, received_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMovement = db.prepare(
      `INSERT INTO stock_movements
        (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
         conversion_factor, unit_cost, total_cost, reference_type, reference_id, business_date, user_id, created_at)
       VALUES (?, ?, ?, NULL, ?, 'purchase', ?, ?, ?, ?, ?, ?, 'purchase', ?, ?, ?, ?)`,
    );

    for (const item of prepared) {
      const itemId = uuidv7();
      const batchId = uuidv7();
      insertItem.run(
        itemId,
        input.storeId,
        purchaseId,
        item.productId,
        item.unitId,
        item.qty,
        item.factor,
        item.qtyBase,
        item.unitCost,
        item.unitCostBase,
        item.lineTotal,
        item.expiryDate ?? null,
        item.batchNo ?? null,
        createdAt,
      );
      insertBatch.run(
        batchId,
        input.storeId,
        item.productId,
        itemId,
        item.batchNo ?? `B-${purchaseNo.slice(-4)}`,
        item.expiryDate ?? null,
        item.qtyBase,
        item.qtyBase,
        item.unitCostBase,
        createdAt,
        createdAt,
      );
      insertMovement.run(
        uuidv7(),
        input.storeId,
        item.productId,
        batchId,
        item.qtyBase,
        item.qty,
        item.unitId,
        item.factor,
        item.unitCostBase,
        item.lineTotal,
        purchaseId,
        input.invoiceDate,
        input.userId,
        createdAt,
      );
      addStock(db, input.storeId, item.productId, item.qtyBase, item.unitCostBase);
      db.prepare("UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ?").run(
        item.unitCostBase,
        createdAt,
        item.productId,
      );
    }

    postJournal(db, {
      storeId: input.storeId,
      sourceType: "purchase",
      sourceId: purchaseId,
      entryDate: input.invoiceDate,
      description: `Pembelian ${purchaseNo}`,
      userId: input.userId,
      lines: [
        { mappingKey: "inventory", debit: subtotal, supplierId: input.supplierId },
        { mappingKey: "accounts_payable", credit: subtotal, supplierId: input.supplierId },
      ],
    });

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "purchase.post",
      entityType: "purchase",
      entityId: purchaseId,
      after: { purchaseNo, grandTotal: subtotal },
    });
    queueOutbox(db, {
      storeId: input.storeId,
      tableName: "purchases",
      rowId: purchaseId,
      payload: { id: purchaseId, purchase_no: purchaseNo, grand_total: subtotal },
      updatedAt: createdAt,
    });

    return { id: purchaseId, purchaseNo, grandTotal: subtotal };
  });
}

function addStock(db: Db, storeId: string, productId: string, qtyBase: number, unitCostBase: number): void {
  const level = one<{ id: string; qty_on_hand: number; avg_cost: number }>(
    db,
    "SELECT id, qty_on_hand, avg_cost FROM stock_levels WHERE store_id = ? AND product_id = ? AND variant_id IS NULL",
    storeId,
    productId,
  );
  if (!level) {
    db.prepare(
      `INSERT INTO stock_levels (id, store_id, product_id, variant_id, qty_on_hand, qty_reserved, avg_cost, last_cost, updated_at)
       VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?)`,
    ).run(uuidv7(), storeId, productId, qtyBase, unitCostBase, unitCostBase, nowIso());
    return;
  }
  const oldQty = Number(level.qty_on_hand);
  const oldAvg = Number(level.avg_cost);
  const newQty = oldQty + qtyBase;
  const newAvg = newQty > 0 ? (oldQty * oldAvg + qtyBase * unitCostBase) / newQty : unitCostBase;
  db.prepare(
    "UPDATE stock_levels SET qty_on_hand = ?, avg_cost = ?, last_cost = ?, updated_at = ? WHERE id = ?",
  ).run(newQty, newAvg, unitCostBase, nowIso(), level.id);
}

export function adjustStock(
  db: Db,
  input: {
    storeId: string;
    userId: string;
    productId: string;
    qtyDelta: number;
    reason: string;
    unitCost?: number;
    businessDate: string;
  },
): void {
  if (!input.qtyDelta) throw new Error("QTY_INVALID");
  if (!input.reason.trim()) throw new Error("REASON_REQUIRED");

  transaction(db, () => {
    const level = one<{ qty_on_hand: number; avg_cost: number }>(
      db,
      "SELECT COALESCE(SUM(qty_on_hand),0) AS qty_on_hand, COALESCE(MAX(avg_cost),0) AS avg_cost FROM stock_levels WHERE store_id = ? AND product_id = ? AND variant_id IS NULL",
      input.storeId,
      input.productId,
    );
    const avgCost = Number(input.unitCost ?? level?.avg_cost ?? 0);
    const totalCost = Math.round(Math.abs(input.qtyDelta) * avgCost);
    const movementId = uuidv7();

    db.prepare(
      `INSERT INTO stock_movements
        (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
         conversion_factor, unit_cost, total_cost, reference_type, reference_id, reason, business_date, user_id, created_at)
       VALUES (?, ?, ?, NULL, NULL, 'adjustment', ?, ?, NULL, 1, ?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
    ).run(
      movementId,
      input.storeId,
      input.productId,
      input.qtyDelta,
      input.qtyDelta,
      avgCost,
      input.qtyDelta > 0 ? totalCost : -totalCost,
      movementId,
      input.reason,
      input.businessDate,
      input.userId,
      nowIso(),
    );

    addStock(db, input.storeId, input.productId, input.qtyDelta, avgCost);

    postJournal(db, {
      storeId: input.storeId,
      sourceType: "stock_adjustment",
      sourceId: movementId,
      entryDate: input.businessDate,
      description: `Penyesuaian stok: ${input.reason}`,
      userId: input.userId,
      lines:
        input.qtyDelta > 0
          ? [
              { mappingKey: "inventory", debit: totalCost },
              { mappingKey: "inventory_adjustment", credit: totalCost },
            ]
          : [
              { mappingKey: "inventory_adjustment", debit: totalCost },
              { mappingKey: "inventory", credit: totalCost },
            ],
    });

    recordActivity(db, {
      storeId: input.storeId,
      userId: input.userId,
      action: "stock.adjust",
      entityType: "product",
      entityId: input.productId,
      reason: input.reason,
      after: { qtyDelta: input.qtyDelta },
    });
  });
}
