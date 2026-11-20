"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, requireUser } from "../auth";
import { getDb, transaction } from "../db";
import { businessDate, nowIso } from "../format";
import { uuidv7 } from "../ids";
import { postJournal } from "../services/accounting";
import { adjustStock } from "../services/inventory";
import { recordActivity } from "../services/audit";
import type { ActionResult } from "./auth";

function fail(error: unknown): ActionResult<never> {
  const e = error as Error & { code?: string };
  return { ok: false, error: e.message || "Terjadi kesalahan.", code: e.code };
}

export type ProductInput = {
  id?: string;
  name: string;
  sku?: string;
  brand?: string;
  categoryId?: string | null;
  baseUnitId: string;
  costPrice: number;
  retailPrice: number;
  minStock: number;
  openingStock?: number;
  units: { unitId: string; factor: number; price: number }[];
};

export async function saveProductAction(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user, input.id ? "products.edit" : "products.create");
    if (!input.name.trim()) return { ok: false, error: "Nama produk wajib diisi." };
    if (!input.units.length) return { ok: false, error: "Minimal satu satuan diperlukan." };

    const db = getDb();
    const id = input.id ?? uuidv7();
    const updatedAt = nowIso();

    transaction(db, () => {
      if (input.id) {
        db.prepare(
          `UPDATE products SET name = ?, sku = ?, brand = ?, category_id = ?, base_unit_id = ?,
             cost_price = ?, retail_price = ?, min_stock_qty = ?, updated_at = ?
           WHERE id = ? AND store_id = ?`,
        ).run(
          input.name.trim(),
          input.sku || null,
          input.brand || null,
          input.categoryId || null,
          input.baseUnitId,
          Math.max(0, input.costPrice),
          Math.max(0, Math.round(input.retailPrice)),
          Math.max(0, input.minStock),
          updatedAt,
          id,
          user.storeId,
        );
        db.prepare("DELETE FROM product_units WHERE product_id = ?").run(id);
      } else {
        db.prepare(
          `INSERT INTO products
            (id, store_id, sku, name, category_id, base_unit_id, brand, cost_price, retail_price,
             min_stock_qty, track_stock, track_expiry, is_taxable, tax_rate, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 1, ?, ?)`,
        ).run(
          id,
          user.storeId,
          input.sku || null,
          input.name.trim(),
          input.categoryId || null,
          input.baseUnitId,
          input.brand || null,
          Math.max(0, input.costPrice),
          Math.max(0, Math.round(input.retailPrice)),
          Math.max(0, input.minStock),
          updatedAt,
          updatedAt,
        );
      }

      const insertUnit = db.prepare(
        `INSERT INTO product_units
          (id, store_id, product_id, unit_id, parent_unit_id, factor_to_parent, factor_to_base,
           selling_price, is_base, is_default_sale, is_default_purchase, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      input.units.forEach((unit, index) => {
        const isBase = unit.unitId === input.baseUnitId;
        insertUnit.run(
          uuidv7(),
          user.storeId,
          id,
          unit.unitId,
          isBase ? 1 : Math.max(unit.factor, 0.0001),
          Math.max(0, Math.round(unit.price)),
          isBase ? 1 : 0,
          index === 0 ? 1 : 0,
          index === 0 ? 1 : 0,
          index,
          updatedAt,
          updatedAt,
        );
      });

      if (!input.id && input.openingStock && input.openingStock > 0) {
        const movementId = uuidv7();
        const totalCost = Math.round(input.openingStock * input.costPrice);
        db.prepare(
          `INSERT INTO stock_movements
            (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
             conversion_factor, unit_cost, total_cost, reference_type, reference_id, business_date, user_id, created_at)
           VALUES (?, ?, ?, NULL, NULL, 'opening', ?, ?, ?, 1, ?, ?, 'opening', ?, ?, ?, ?)`,
        ).run(
          movementId,
          user.storeId,
          id,
          input.openingStock,
          input.openingStock,
          input.baseUnitId,
          input.costPrice,
          totalCost,
          id,
          businessDate(),
          user.id,
          updatedAt,
        );
        db.prepare(
          `INSERT INTO stock_levels
            (id, store_id, product_id, variant_id, qty_on_hand, qty_reserved, avg_cost, last_cost, updated_at)
           VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?)`,
        ).run(uuidv7(), user.storeId, id, input.openingStock, input.costPrice, input.costPrice, updatedAt);
        if (totalCost > 0) {
          postJournal(db, {
            storeId: user.storeId,
            sourceType: "stock_adjustment",
            sourceId: movementId,
            entryDate: businessDate(),
            description: `Stok awal ${input.name.trim()}`,
            userId: user.id,
            lines: [
              { mappingKey: "inventory", debit: totalCost },
              { mappingKey: "inventory_adjustment", credit: totalCost },
            ],
          });
        }
      }
    });

    recordActivity(db, {
      storeId: user.storeId,
      userId: user.id,
      action: input.id ? "product.update" : "product.create",
      entityType: "product",
      entityId: id,
    });

    revalidatePath("/produk");
    revalidatePath("/stok");
    revalidatePath("/kasir");
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function createCategoryAction(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user, "products.edit");
    if (!input.name.trim()) return { ok: false, error: "Nama kategori wajib diisi." };
    const id = uuidv7();
    getDb()
      .prepare(
        "INSERT INTO categories (id, store_id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 99, 1, ?, ?)",
      )
      .run(id, user.storeId, input.name.trim(), nowIso(), nowIso());
    revalidatePath("/produk");
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function adjustStockAction(input: {
  productId: string;
  qtyDelta: number;
  reason: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "inventory.adjust");
    adjustStock(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      productId: input.productId,
      qtyDelta: input.qtyDelta,
      reason: input.reason,
      businessDate: businessDate(),
    });
    revalidatePath("/stok");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createCustomerAction(input: {
  name: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  creditTermDays: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user, "customers.create");
    if (!input.name.trim()) return { ok: false, error: "Nama pelanggan wajib diisi." };
    const db = getDb();
    const id = uuidv7();
    const group = db.prepare("SELECT id FROM customer_groups WHERE store_id = ? AND is_default = 1").get(user.storeId) as
      | { id: string }
      | undefined;
    db.prepare(
      `INSERT INTO customers
        (id, store_id, name, phone, phone_normalized, address, customer_group_id, credit_limit, credit_term_days,
         credit_balance, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).run(
      id,
      user.storeId,
      input.name.trim(),
      input.phone || null,
      input.phone ? input.phone.replace(/\D/g, "") : null,
      input.address || null,
      group?.id ?? null,
      Math.max(0, Math.round(input.creditLimit)),
      Math.max(0, Math.round(input.creditTermDays)),
      nowIso(),
      nowIso(),
    );
    revalidatePath("/pelanggan");
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}
