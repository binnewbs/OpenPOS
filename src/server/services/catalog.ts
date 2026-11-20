import { many, one, type Db } from "../db";
import type { CartItemInput, QuotedLine, QuoteTotals } from "@/lib/types";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  retail_price: number;
  cost_price: number;
  base_unit_id: string;
  track_stock: number;
  is_taxable: number;
  tax_rate: number;
  is_active: number;
};

type UnitRow = {
  id: string;
  product_id: string;
  unit_id: string;
  factor_to_base: number;
  selling_price: number | null;
  is_base: number;
  code: string;
  name: string;
  allow_decimal: number;
};

export function getProductUnit(db: Db, productId: string, unitId: string): UnitRow | undefined {
  return one<UnitRow>(
    db,
    `SELECT pu.id, pu.product_id, pu.unit_id, pu.factor_to_base, pu.selling_price,
            pu.is_base, u.code, u.name, u.allow_decimal
     FROM product_units pu
     JOIN units u ON u.id = pu.unit_id
     WHERE pu.product_id = ? AND pu.unit_id = ?`,
    productId,
    unitId,
  );
}

export function productUnits(db: Db, productId: string): UnitRow[] {
  return many<UnitRow>(
    db,
    `SELECT pu.id, pu.product_id, pu.unit_id, pu.factor_to_base, pu.selling_price,
            pu.is_base, u.code, u.name, u.allow_decimal
     FROM product_units pu
     JOIN units u ON u.id = pu.unit_id
     WHERE pu.product_id = ?
     ORDER BY pu.sort_order, pu.factor_to_base`,
    productId,
  );
}

export function stockFor(db: Db, storeId: string, productId: string): number {
  const row = one<{ qty: number }>(
    db,
    `SELECT COALESCE(SUM(qty_on_hand), 0) AS qty
     FROM stock_levels WHERE store_id = ? AND product_id = ? AND variant_id IS NULL`,
    storeId,
    productId,
  );
  return Number(row?.qty ?? 0);
}

export function quoteCart(db: Db, storeId: string, items: CartItemInput[]): { lines: QuotedLine[]; totals: QuoteTotals } {
  const store = one<{ tax_enabled: number; tax_rate: number }>(
    db,
    "SELECT tax_enabled, tax_rate FROM stores WHERE id = ?",
    storeId,
  );
  const taxEnabled = Boolean(store?.tax_enabled);
  const storeTaxRate = Number(store?.tax_rate ?? 0);

  const lines: QuotedLine[] = items.map((item) => {
    const product = one<ProductRow>(
      db,
      `SELECT id, name, sku, retail_price, cost_price, base_unit_id, track_stock, is_taxable, tax_rate, is_active
       FROM products WHERE id = ? AND store_id = ? AND deleted_at IS NULL`,
      item.productId,
      storeId,
    );
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const unit = getProductUnit(db, item.productId, item.unitId);
    if (!unit) throw new Error("UNIT_INVALID");

    const factor = Number(unit.factor_to_base);
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("QTY_INVALID");

    const unitPrice = unit.selling_price ?? Math.round(Number(product.retail_price) * factor);
    const gross = Math.round(qty * unitPrice);
    const discountPercent = Math.min(Math.max(Number(item.discountPercent ?? 0), 0), 100);
    const discountAmount = Math.round((gross * discountPercent) / 100);
    const taxable = taxEnabled && Boolean(product.is_taxable);
    const taxRate = taxable ? Number(product.tax_rate || storeTaxRate) : 0;
    const taxAmount = taxable ? Math.round(((gross - discountAmount) * taxRate) / 100) : 0;
    const lineTotal = gross - discountAmount + taxAmount;

    const stockRow = one<{ qty_on_hand: number; avg_cost: number }>(
      db,
      `SELECT COALESCE(SUM(qty_on_hand), 0) AS qty_on_hand, COALESCE(MAX(avg_cost), ?) AS avg_cost
       FROM stock_levels WHERE store_id = ? AND product_id = ? AND variant_id IS NULL`,
      Number(product.cost_price),
      storeId,
      item.productId,
    );
    const stockAvailable = Number(stockRow?.qty_on_hand ?? 0);
    const costBase = Number(stockRow?.avg_cost ?? product.cost_price ?? 0);
    const costTotal = Math.round(qty * factor * costBase);

    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitId: unit.unit_id,
      unitCode: unit.code,
      qty,
      factor,
      qtyBase: qty * factor,
      unitPrice,
      priceSource: unit.selling_price != null ? "unit" : "product",
      gross,
      discountPercent,
      discountAmount,
      taxRate,
      taxAmount,
      lineTotal,
      costBase,
      costTotal,
      stockAvailable,
      trackStock: Boolean(product.track_stock),
      note: item.note,
    };
  });

  const totals: QuoteTotals = {
    subtotal: lines.reduce((s, l) => s + l.gross, 0),
    itemDiscountTotal: lines.reduce((s, l) => s + l.discountAmount, 0),
    taxTotal: lines.reduce((s, l) => s + l.taxAmount, 0),
    roundingTotal: 0,
    grandTotal: lines.reduce((s, l) => s + l.lineTotal, 0),
    costTotal: lines.reduce((s, l) => s + l.costTotal, 0),
  };
  return { lines, totals };
}

export function applyCashRounding(totals: QuoteTotals, increment: number): QuoteTotals {
  if (!increment || increment <= 0) return totals;
  const rounded = Math.ceil(totals.grandTotal / increment) * increment;
  return { ...totals, roundingTotal: rounded - totals.grandTotal, grandTotal: rounded };
}

export type SearchResult = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unitId: string;
  unitCode: string;
  factor: number;
  price: number;
  stock: number;
  trackStock: boolean;
  barcodes: string[];
  units: { unitId: string; code: string; name: string; factor: number; price: number }[];
};

export function searchProducts(db: Db, storeId: string, query: string, limit = 24): SearchResult[] {
  const q = query.trim();
  const like = `%${q.toLowerCase()}%`;
  const rows = many<{
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    base_unit_id: string;
    retail_price: number;
    track_stock: number;
  }>(
    db,
    `SELECT p.id, p.name, p.sku, c.name AS category, p.base_unit_id, p.retail_price, p.track_stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.store_id = ? AND p.deleted_at IS NULL AND p.is_active = 1
       AND (? = '' OR lower(p.name) LIKE ? OR lower(COALESCE(p.sku,'')) LIKE ?
            OR EXISTS (SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id AND b.barcode LIKE ?))
     ORDER BY
       CASE WHEN lower(p.name) LIKE ? THEN 0 ELSE 1 END,
       p.name
     LIMIT ?`,
    storeId,
    q,
    like,
    like,
    `%${q}%`,
    `${q.toLowerCase()}%`,
    limit,
  );

  return rows.map((r) => {
    const units = productUnits(db, r.id);
    const defaultUnit = units.find((u) => u.is_base) ?? units[0];
    const price = defaultUnit?.selling_price ?? Math.round(Number(r.retail_price) * Number(defaultUnit?.factor_to_base ?? 1));
    const barcodes = (
      db.prepare("SELECT barcode FROM product_barcodes WHERE product_id = ?").all(r.id) as { barcode: string }[]
    ).map((b) => b.barcode);
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      category: r.category,
      unitId: defaultUnit?.unit_id ?? r.base_unit_id,
      unitCode: defaultUnit?.code ?? "",
      factor: Number(defaultUnit?.factor_to_base ?? 1),
      price,
      stock: stockFor(db, storeId, r.id),
      trackStock: Boolean(r.track_stock),
      barcodes,
      units: units.map((u) => ({
        unitId: u.unit_id,
        code: u.code,
        name: u.name,
        factor: Number(u.factor_to_base),
        price: u.selling_price ?? Math.round(Number(r.retail_price) * Number(u.factor_to_base)),
      })),
    };
  });
}
