import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedIfEmpty } from "@/server/seed";
import { businessDate } from "@/server/format";
import { applyCashRounding, quoteCart, searchProducts } from "@/server/services/catalog";
import { completeSale, voidSale } from "@/server/services/sales";

let db: DatabaseSync;
let storeId: string;
let ownerId: string;
let shiftId: string;
let rounding: number;
let products: ReturnType<typeof searchProducts>;

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(path.join(process.cwd(), "db", "sqlite", "0001_init.sql"), "utf8"));
  seedIfEmpty(db);

  const store = db.prepare("SELECT id, rounding_increment FROM stores LIMIT 1").get() as {
    id: string;
    rounding_increment: number;
  };
  storeId = store.id;
  rounding = Number(store.rounding_increment);
  ownerId = (db.prepare("SELECT id FROM users WHERE username = 'owner'").get() as { id: string }).id;
  shiftId = (db.prepare("SELECT id FROM shifts WHERE status = 'open' LIMIT 1").get() as { id: string }).id;
  products = searchProducts(db, storeId, "", 100);
});

function balanced() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT je.id FROM journal_entries je
         JOIN journal_lines jl ON jl.journal_entry_id = je.id
         GROUP BY je.id HAVING SUM(jl.debit) <> SUM(jl.credit)
       )`,
    )
    .get() as { c: number };
  return Number(row.c) === 0;
}

function stackBalanced() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM stock_levels sl
       WHERE sl.store_id = ? AND ABS(sl.qty_on_hand - COALESCE((
         SELECT SUM(sm.qty_delta) FROM stock_movements sm
         WHERE sm.store_id = sl.store_id AND sm.product_id = sl.product_id AND sm.variant_id IS NULL
       ), 0)) > 0.0005`,
    )
    .get(storeId) as { c: number };
  return Number(row.c) === 0;
}

describe("OpenPOS domain", () => {
  it("seeds a balanced ledger", () => {
    expect(balanced()).toBe(true);
    expect(stackBalanced()).toBe(true);
  });

  it("resolves multi-unit prices using the conversion factor", () => {
    const product = products.find((item) => item.units.length > 1);
    expect(product).toBeDefined();
    const unit = product!.units[1];
    const { lines, totals } = quoteCart(db, storeId, [{ productId: product!.id, unitId: unit.unitId, qty: 2 }]);
    expect(lines[0].factor).toBe(unit.factor);
    expect(lines[0].qtyBase).toBe(2 * unit.factor);
    expect(lines[0].unitPrice).toBe(unit.price);
    expect(totals.grandTotal).toBe(Math.round(2 * unit.price));
  });

  it("rounds cash totals up to the configured increment", () => {
    const quote = quoteCart(db, storeId, [{ productId: products[0].id, unitId: products[0].unitId, qty: 1 }]);
    const rounded = applyCashRounding(quote.totals, rounding);
    expect(rounded.grandTotal % rounding).toBe(0);
    expect(rounded.grandTotal).toBeGreaterThanOrEqual(quote.totals.grandTotal);
  });

  it("completes a cash sale atomically and updates the stock ledger", () => {
    const product = products.find((item) => item.trackStock && item.stock > 20)!;
    const before = Number(
      (db.prepare("SELECT qty_on_hand AS q FROM stock_levels WHERE product_id = ? AND store_id = ?").get(product.id, storeId) as {
        q: number;
      }).q,
    );
    const quote = quoteCart(db, storeId, [{ productId: product.id, unitId: product.unitId, qty: 2 }]);
    const rounded = applyCashRounding(quote.totals, rounding);

    const sale = completeSale(db, {
      storeId,
      userId: ownerId,
      shiftId,
      businessDate: businessDate(),
      items: [{ productId: product.id, unitId: product.unitId, qty: 2 }],
      payments: [{ method: "cash", amount: rounded.grandTotal, tendered: rounded.grandTotal }],
      occurredAt: new Date().toISOString(),
    });

    const after = Number(
      (db.prepare("SELECT qty_on_hand AS q FROM stock_levels WHERE product_id = ? AND store_id = ?").get(product.id, storeId) as {
        q: number;
      }).q,
    );
    expect(sale.receiptNo).toMatch(/^INV-/);
    expect(sale.grandTotal).toBe(rounded.grandTotal);
    expect(before - after).toBe(2 * product.factor);
    expect(balanced()).toBe(true);
    expect(stackBalanced()).toBe(true);
  });

  it("voiding reverses stock, cash, and the journal", () => {
    const product = products.find((item) => item.trackStock && item.stock > 20)!;
    const before = Number(
      (db.prepare("SELECT qty_on_hand AS q FROM stock_levels WHERE product_id = ? AND store_id = ?").get(product.id, storeId) as {
        q: number;
      }).q,
    );
    const quote = quoteCart(db, storeId, [{ productId: product.id, unitId: product.unitId, qty: 1 }]);
    const rounded = applyCashRounding(quote.totals, rounding);
    const sale = completeSale(db, {
      storeId,
      userId: ownerId,
      shiftId,
      businessDate: businessDate(),
      items: [{ productId: product.id, unitId: product.unitId, qty: 1 }],
      payments: [{ method: "qris", amount: quote.totals.grandTotal }],
      occurredAt: new Date().toISOString(),
    });

    voidSale(db, { storeId, userId: ownerId, saleId: sale.id, reason: "tes pembatalan" });

    const after = Number(
      (db.prepare("SELECT qty_on_hand AS q FROM stock_levels WHERE product_id = ? AND store_id = ?").get(product.id, storeId) as {
        q: number;
      }).q,
    );
    const status = (db.prepare("SELECT status FROM sales WHERE id = ?").get(sale.id) as { status: string }).status;
    expect(status).toBe("voided");
    expect(after).toBe(before);
    expect(balanced()).toBe(true);
    expect(stackBalanced()).toBe(true);
  });
});
