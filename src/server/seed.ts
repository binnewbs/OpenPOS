import { type Db } from "./db";
import { uuidv7 } from "./ids";
import { addDays, businessDate, nowIso, periodKey } from "./format";
import { hashPin } from "./pin";
import { postJournal } from "./services/accounting";
import { applyCashRounding, quoteCart } from "./services/catalog";
import { postPurchase } from "./services/inventory";
import { completeSale } from "./services/sales";

type SeedProduct = {
  name: string;
  sku: string;
  category: string;
  brand: string;
  base: string;
  cost: number;
  retail: number;
  min: number;
  stock: number;
  units: { code: string; factor: number; price: number }[];
};

const PRODUCTS: SeedProduct[] = [
  { name: "Indomie Goreng", sku: "MKN-001", category: "Makanan", brand: "Indofood", base: "pcs", cost: 2800, retail: 3500, min: 36, stock: 240, units: [{ code: "pcs", factor: 1, price: 3500 }, { code: "dus", factor: 40, price: 132000 }] },
  { name: "Mie Sedaap Soto", sku: "MKN-002", category: "Makanan", brand: "Wings", base: "pcs", cost: 2700, retail: 3200, min: 24, stock: 180, units: [{ code: "pcs", factor: 1, price: 3200 }, { code: "dus", factor: 40, price: 120000 }] },
  { name: "Chitato Sapi Panggang 68g", sku: "MKN-003", category: "Makanan", brand: "Chitato", base: "pcs", cost: 9000, retail: 11500, min: 24, stock: 48, units: [{ code: "pcs", factor: 1, price: 11500 }] },
  { name: "Aqua Botol 600ml", sku: "MNM-001", category: "Minuman", brand: "Aqua", base: "pcs", cost: 2800, retail: 3800, min: 24, stock: 144, units: [{ code: "pcs", factor: 1, price: 3800 }] },
  { name: "Teh Botol Sosro 350ml", sku: "MNM-002", category: "Minuman", brand: "Sosro", base: "pcs", cost: 3500, retail: 4500, min: 24, stock: 120, units: [{ code: "pcs", factor: 1, price: 4500 }, { code: "dus", factor: 24, price: 96000 }] },
  { name: "Kopi Kapal Api Sachet", sku: "MNM-003", category: "Minuman", brand: "Kapal Api", base: "sachet", cost: 900, retail: 1500, min: 50, stock: 300, units: [{ code: "sachet", factor: 1, price: 1500 }, { code: "renceng", factor: 10, price: 13000 }] },
  { name: "Galon Air Isi Ulang", sku: "MNM-004", category: "Minuman", brand: "Lokal", base: "galon", cost: 5000, retail: 7000, min: 12, stock: 30, units: [{ code: "galon", factor: 1, price: 7000 }] },
  { name: "Beras Pandan Wangi", sku: "SMB-001", category: "Sembako", brand: "Pandan Wangi", base: "kg", cost: 12500, retail: 15000, min: 20, stock: 160, units: [{ code: "kg", factor: 1, price: 15000 }, { code: "sak", factor: 5, price: 72000 }] },
  { name: "Minyak Goreng Sania 2L", sku: "SMB-002", category: "Sembako", brand: "Sania", base: "pcs", cost: 34000, retail: 38000, min: 50, stock: 60, units: [{ code: "pcs", factor: 1, price: 38000 }] },
  { name: "Gula Pasir", sku: "SMB-003", category: "Sembako", brand: "Gulaku", base: "kg", cost: 15000, retail: 17000, min: 15, stock: 80, units: [{ code: "kg", factor: 1, price: 17000 }] },
  { name: "Telur Ayam", sku: "SMB-004", category: "Sembako", brand: "Lokal", base: "kg", cost: 25000, retail: 29000, min: 15, stock: 90, units: [{ code: "kg", factor: 1, price: 29000 }] },
  { name: "Sampoerna Mild 16", sku: "RKK-001", category: "Rokok", brand: "Sampoerna", base: "pack", cost: 28500, retail: 33500, min: 10, stock: 60, units: [{ code: "pack", factor: 1, price: 33500 }, { code: "slop", factor: 10, price: 320000 }] },
  { name: "Gudang Garam Surya 12", sku: "RKK-002", category: "Rokok", brand: "Gudang Garam", base: "pack", cost: 24000, retail: 28000, min: 24, stock: 48, units: [{ code: "pack", factor: 1, price: 28000 }] },
  { name: "Sabun Lifebuoy", sku: "KBR-001", category: "Kebersihan", brand: "Lifebuoy", base: "pcs", cost: 3500, retail: 4500, min: 12, stock: 72, units: [{ code: "pcs", factor: 1, price: 4500 }] },
  { name: "Shampo Sunsilk Sachet", sku: "KBR-002", category: "Kebersihan", brand: "Sunsilk", base: "sachet", cost: 800, retail: 1200, min: 24, stock: 144, units: [{ code: "sachet", factor: 1, price: 1200 }, { code: "renceng", factor: 12, price: 13200 }] },
  { name: "Pepsodent 120g", sku: "KBR-003", category: "Kebersihan", brand: "Pepsodent", base: "pcs", cost: 12000, retail: 14500, min: 24, stock: 48, units: [{ code: "pcs", factor: 1, price: 14500 }] },
  { name: "Tisu Paseo", sku: "KBR-004", category: "Kebersihan", brand: "Paseo", base: "pack", cost: 6000, retail: 8500, min: 12, stock: 48, units: [{ code: "pack", factor: 1, price: 8500 }] },
  { name: "Panadol Extra", sku: "OBT-001", category: "Obat", brand: "Panadol", base: "strip", cost: 8000, retail: 10500, min: 10, stock: 60, units: [{ code: "strip", factor: 1, price: 10500 }] },
  { name: "Tolak Angin", sku: "OBT-002", category: "Obat", brand: "Tolak Angin", base: "sachet", cost: 2500, retail: 3500, min: 20, stock: 120, units: [{ code: "sachet", factor: 1, price: 3500 }] },
  { name: "Baterai ABC AA", sku: "LAI-001", category: "Lain-lain", brand: "ABC", base: "pcs", cost: 5000, retail: 7000, min: 12, stock: 48, units: [{ code: "pcs", factor: 1, price: 7000 }, { code: "pack", factor: 4, price: 26000 }] },
];

const UNITS: { code: string; name: string; decimal: boolean }[] = [
  { code: "pcs", name: "Pcs", decimal: false },
  { code: "sachet", name: "Sachet", decimal: false },
  { code: "pack", name: "Pack", decimal: false },
  { code: "dus", name: "Dus", decimal: false },
  { code: "bal", name: "Bal", decimal: false },
  { code: "sak", name: "Sak", decimal: false },
  { code: "renceng", name: "Renceng", decimal: false },
  { code: "slop", name: "Slop", decimal: false },
  { code: "galon", name: "Galon", decimal: false },
  { code: "strip", name: "Strip", decimal: false },
  { code: "kg", name: "Kilogram", decimal: true },
  { code: "gram", name: "Gram", decimal: true },
  { code: "liter", name: "Liter", decimal: true },
  { code: "ml", name: "Mililiter", decimal: true },
];

const CATEGORIES = ["Makanan", "Minuman", "Rokok", "Sembako", "Kebersihan", "Obat", "Lain-lain"];

const COA: { code: string; name: string; type: string; normal: "debit" | "credit" }[] = [
  { code: "1000", name: "Kas di Laci", type: "asset", normal: "debit" },
  { code: "1010", name: "Bank", type: "asset", normal: "debit" },
  { code: "1020", name: "Kliring E-Wallet", type: "asset", normal: "debit" },
  { code: "1030", name: "Kliring QRIS", type: "asset", normal: "debit" },
  { code: "1100", name: "Piutang Usaha", type: "asset", normal: "debit" },
  { code: "1200", name: "Persediaan", type: "asset", normal: "debit" },
  { code: "2000", name: "Utang Usaha", type: "liability", normal: "credit" },
  { code: "2100", name: "Utang PPN", type: "liability", normal: "credit" },
  { code: "3000", name: "Modal Pemilik", type: "equity", normal: "credit" },
  { code: "3200", name: "Prive Pemilik", type: "equity", normal: "debit" },
  { code: "4000", name: "Penjualan", type: "revenue", normal: "credit" },
  { code: "4100", name: "Retur Penjualan", type: "revenue", normal: "debit" },
  { code: "4200", name: "Diskon Penjualan", type: "revenue", normal: "debit" },
  { code: "5000", name: "Harga Pokok Penjualan", type: "expense", normal: "debit" },
  { code: "5100", name: "Penyesuaian Persediaan", type: "expense", normal: "debit" },
  { code: "6000", name: "Beban Operasional", type: "expense", normal: "debit" },
  { code: "6900", name: "Selisih Kas", type: "expense", normal: "debit" },
  { code: "7000", name: "Pendapatan Lain", type: "revenue", normal: "credit" },
];

const MAPPINGS: Record<string, string> = {
  cash_drawer: "1000",
  bank: "1010",
  ewallet_clearing: "1020",
  qris_clearing: "1030",
  accounts_receivable: "1100",
  inventory: "1200",
  accounts_payable: "2000",
  tax_output: "2100",
  tax_input: "2100",
  owner_equity: "3000",
  opening_balance_equity: "3000",
  owner_drawings: "3200",
  sales_revenue: "4000",
  sales_returns: "4100",
  sales_discount: "4200",
  cogs: "5000",
  inventory_adjustment: "5100",
  cash_over_short: "6900",
  rounding: "7000",
  operating_expense_default: "6000",
};

const CASHIER_PERMISSIONS = [
  "sales.create",
  "sales.hold",
  "products.view",
  "inventory.view",
  "customers.view",
  "customers.create",
  "credit.payment",
  "shifts.open",
  "shifts.close",
  "reports.sales",
];

function hashSeed(n: number): number {
  return Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
}

export function seedIfEmpty(db: Db): void {
  const count = db.prepare("SELECT COUNT(*) AS c FROM stores").get() as { c: number };
  if (Number(count.c) > 0) return;

  const storeId = uuidv7();
  const today = businessDate();
  const now = nowIso();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO stores
        (id, name, legal_name, address, phone, currency, timezone, tax_enabled, tax_rate, tax_inclusive,
         rounding_increment, receipt_footer, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'IDR', 'Asia/Jakarta', 0, 11.0, 1, 100, ?, 1, ?, ?)`,
    ).run(
      storeId,
      "Warung Berkah",
      "Warung Berkah Sejahtera",
      "Jl. Merdeka No. 24, Bandung",
      "0812-3456-7890",
      "Terima kasih sudah berbelanja. Barang yang sudah dibeli tidak dapat ditukar.",
      now,
      now,
    );

    db.prepare(
      `INSERT INTO app_settings (store_id, key, value_json, scope, is_secret, updated_at)
       VALUES (?, 'device_code', '"K1"', 'device', 0, ?)`,
    ).run(storeId, now);

    const ownerRoleId = uuidv7();
    const cashierRoleId = uuidv7();
    const roleStmt = db.prepare(
      `INSERT INTO roles (id, store_id, name, slug, description, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    roleStmt.run(ownerRoleId, storeId, "Pemilik", "owner", "Akses penuh ke seluruh fitur toko", now, now);
    roleStmt.run(cashierRoleId, storeId, "Kasir", "cashier", "Penjualan, pelanggan, dan tutup shift", now, now);

    const allPermissions = db.prepare("SELECT key FROM permissions").all() as { key: string }[];
    const assign = db.prepare(
      "INSERT INTO role_permissions (store_id, role_id, permission_key, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const p of allPermissions) assign.run(storeId, ownerRoleId, p.key, now);
    for (const key of CASHIER_PERMISSIONS) {
      if (allPermissions.some((p) => p.key === key)) assign.run(storeId, cashierRoleId, key, now);
    }

    const ownerId = uuidv7();
    const cashierId = uuidv7();
    const userStmt = db.prepare(
      `INSERT INTO users (id, store_id, name, username, pin_hash, role_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    userStmt.run(ownerId, storeId, "Budi Santoso", "owner", hashPin("1234"), ownerRoleId, now, now);
    userStmt.run(cashierId, storeId, "Sari Wulandari", "kasir", hashPin("1111"), cashierRoleId, now, now);

    const unitIds = new Map<string, string>();
    const unitStmt = db.prepare(
      `INSERT INTO units (id, store_id, code, name, allow_decimal, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    for (const unit of UNITS) {
      const id = uuidv7();
      unitIds.set(unit.code, id);
      unitStmt.run(id, storeId, unit.code, unit.name, unit.decimal ? 1 : 0, now, now);
    }

    const categoryIds = new Map<string, string>();
    const categoryStmt = db.prepare(
      `INSERT INTO categories (id, store_id, name, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    );
    CATEGORIES.forEach((name, index) => {
      const id = uuidv7();
      categoryIds.set(name, id);
      categoryStmt.run(id, storeId, name, index, now, now);
    });

    const groupStmt = db.prepare(
      `INSERT INTO customer_groups (id, store_id, name, price_tier, default_discount_percent, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    );
    const retailGroupId = uuidv7();
    groupStmt.run(retailGroupId, storeId, "Retail", "retail", 1, now, now);
    groupStmt.run(uuidv7(), storeId, "Grosir", "wholesale", 0, now, now);
    groupStmt.run(uuidv7(), storeId, "Langganan", "member", 0, now, now);

    const accountIds = new Map<string, string>();
    const accountStmt = db.prepare(
      `INSERT INTO accounts (id, store_id, code, name, type, normal_balance, is_system, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    );
    for (const account of COA) {
      const id = uuidv7();
      accountIds.set(account.code, id);
      accountStmt.run(id, storeId, account.code, account.name, account.type, account.normal, now, now);
    }
    const mappingStmt = db.prepare(
      `INSERT INTO account_mappings (id, store_id, mapping_key, account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [key, code] of Object.entries(MAPPINGS)) {
      const accountId = accountIds.get(code);
      if (accountId) mappingStmt.run(uuidv7(), storeId, key, accountId, now, now);
    }

    const products: { id: string; baseUnitId: string; cost: number; name: string }[] = [];
    const productStmt = db.prepare(
      `INSERT INTO products
        (id, store_id, sku, name, category_id, base_unit_id, brand, cost_price, retail_price, min_stock_qty,
         track_stock, track_expiry, is_taxable, tax_rate, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 1, ?, ?)`,
    );
    const productUnitStmt = db.prepare(
      `INSERT INTO product_units
        (id, store_id, product_id, unit_id, parent_unit_id, factor_to_parent, factor_to_base,
         selling_price, is_base, is_default_sale, is_default_purchase, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const barcodeStmt = db.prepare(
      `INSERT INTO product_barcodes (id, store_id, product_id, variant_id, unit_id, barcode, is_primary, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, 1, ?)`,
    );

    PRODUCTS.forEach((product, index) => {
      const productId = uuidv7();
      const baseUnitId = unitIds.get(product.base)!;
      productStmt.run(
        productId,
        storeId,
        product.sku,
        product.name,
        categoryIds.get(product.category)!,
        baseUnitId,
        product.brand,
        product.cost,
        product.retail,
        product.min,
        now,
        now,
      );
      product.units.forEach((unit, unitIndex) => {
        productUnitStmt.run(
          uuidv7(),
          storeId,
          productId,
          unitIds.get(unit.code)!,
          unit.factor,
          unit.price,
          unit.code === product.base ? 1 : 0,
          unitIndex === 0 ? 1 : 0,
          unitIndex === 0 ? 1 : 0,
          unitIndex,
          now,
          now,
        );
      });
      barcodeStmt.run(
        uuidv7(),
        storeId,
        productId,
        baseUnitId,
        `899${String(1000000000 + index)}`,
        now,
      );
      products.push({ id: productId, baseUnitId, cost: product.cost, name: product.name });

      const movementId = uuidv7();
      db.prepare(
        `INSERT INTO stock_movements
          (id, store_id, product_id, variant_id, batch_id, movement_type, qty_delta, qty_input, unit_id,
           conversion_factor, unit_cost, total_cost, reference_type, reference_id, business_date, user_id, created_at)
         VALUES (?, ?, ?, NULL, NULL, 'opening', ?, ?, ?, 1, ?, ?, 'opening', ?, ?, ?, ?)`,
      ).run(
        movementId,
        storeId,
        productId,
        product.stock,
        product.stock,
        baseUnitId,
        product.cost,
        Math.round(product.stock * product.cost),
        storeId,
        addDays(today, -30),
        ownerId,
        now,
      );
      db.prepare(
        `INSERT INTO stock_levels
          (id, store_id, product_id, variant_id, qty_on_hand, qty_reserved, avg_cost, last_cost, updated_at)
         VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?)`,
      ).run(uuidv7(), storeId, productId, product.stock, product.cost, product.cost, now);
    });

    const customers = [
      { name: "Ibu Ani", phone: "0813-2211-4455", group: retailGroupId, limit: 500000, term: 30 },
      { name: "Pak Joko", phone: "0812-9988-7766", group: retailGroupId, limit: 300000, term: 14 },
      { name: "Warung Sebelah", phone: "0857-1122-3344", group: retailGroupId, limit: 1000000, term: 30 },
      { name: "Bu Rina", phone: "0821-4455-6677", group: retailGroupId, limit: 0, term: 30 },
      { name: "Mas Dedi", phone: "0899-8877-6655", group: retailGroupId, limit: 250000, term: 7 },
    ];
    const customerStmt = db.prepare(
      `INSERT INTO customers
        (id, store_id, name, phone, phone_normalized, customer_group_id, credit_limit, credit_term_days,
         credit_balance, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    );
    const customerIds: string[] = [];
    for (const customer of customers) {
      const id = uuidv7();
      customerIds.push(id);
      customerStmt.run(
        id,
        storeId,
        customer.name,
        customer.phone,
        customer.phone.replace(/\D/g, ""),
        customer.group,
        customer.limit,
        customer.term,
        now,
        now,
      );
    }

    const supplierStmt = db.prepare(
      `INSERT INTO suppliers
        (id, store_id, name, code, contact_name, phone, address, payment_term_days, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    const supplierIds: string[] = [];
    const suppliers = [
      { name: "PT Sumber Rejeki", code: "SUP-01", contact: "Hendra", phone: "022-555-0101", term: 14 },
      { name: "CV Anugerah Pangan", code: "SUP-02", contact: "Lina", phone: "022-555-0202", term: 7 },
      { name: "Toko Grosir Jaya", code: "SUP-03", contact: "Wawan", phone: "0812-777-0303", term: 0 },
    ];
    for (const supplier of suppliers) {
      const id = uuidv7();
      supplierIds.push(id);
      supplierStmt.run(id, storeId, supplier.name, supplier.code, supplier.contact, supplier.phone, "Bandung", supplier.term, now, now);
    }

    const expenseCategoryStmt = db.prepare(
      "INSERT INTO expense_categories (id, store_id, name, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
    );
    for (const name of ["Kantong Plastik", "Token Listrik", "Makan Staf", "Transport", "Kebersihan", "Sewa", "Internet", "Lain-lain"]) {
      expenseCategoryStmt.run(uuidv7(), storeId, name, now);
    }

    const shiftId = uuidv7();
    db.prepare(
      `INSERT INTO shifts
        (id, store_id, register_name, device_id, opened_by, opened_at, opening_cash, status, business_date, created_at, updated_at)
       VALUES (?, ?, 'Kasir Utama', 'K1', ?, ?, 250000, 'open', ?, ?, ?)`,
    ).run(shiftId, storeId, ownerId, `${today}T00:30:00.000Z`, today, now, now);

    const openingTotal = products.reduce((sum, p, index) => sum + Math.round(PRODUCTS[index].stock * p.cost), 0);
    postJournal(db, {
      storeId,
      sourceType: "opening_balance",
      sourceId: storeId,
      entryDate: addDays(today, -30),
      description: "Saldo awal persediaan",
      userId: ownerId,
      lines: [
        { mappingKey: "inventory", debit: openingTotal },
        { mappingKey: "opening_balance_equity", credit: openingTotal },
      ],
    });

    db.exec("COMMIT");

    seedTransactions(db, {
      storeId,
      ownerId,
      shiftId,
      today,
      products: products.map((p) => ({
        id: p.id,
        baseUnitId: p.baseUnitId,
        cost: p.cost,
      })),
      supplierIds,
      customerIds: [customerIds[0], customerIds[1], customerIds[2], customerIds[4]],
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedTransactions(
  db: Db,
  ctx: {
    storeId: string;
    ownerId: string;
    shiftId: string;
    today: string;
    products: { id: string; baseUnitId: string; cost: number }[];
    supplierIds: string[];
    customerIds: string[];
  },
): void {
  const productIds = ctx.products.map((p) => p.id);
  const baseUnits = new Map(ctx.products.map((p) => [p.id, p.baseUnitId]));
  const units = db
    .prepare("SELECT unit_id, product_id, factor_to_base FROM product_units WHERE store_id = ?")
    .all(ctx.storeId) as { unit_id: string; product_id: string; factor_to_base: number }[];
  const saleUnit = new Map<string, string>();
  for (const unit of units) {
    if (Number(unit.factor_to_base) === 1) saleUnit.set(unit.product_id, unit.unit_id);
  }
  for (const [productId, unitId] of baseUnits) {
    if (!saleUnit.has(productId)) saleUnit.set(productId, unitId);
  }

  postPurchase(db, {
    storeId: ctx.storeId,
    userId: ctx.ownerId,
    supplierId: ctx.supplierIds[0],
    invoiceDate: addDays(ctx.today, -12),
    dueDate: addDays(ctx.today, 2),
    supplierInvoiceNo: "INV/SR/2411",
    deviceCode: "K1",
    items: [
      { productId: productIds[0], unitId: saleUnit.get(productIds[0])!, qty: 48, unitCost: 2800 },
      { productId: productIds[3], unitId: saleUnit.get(productIds[3])!, qty: 48, unitCost: 2800 },
      { productId: productIds[7], unitId: saleUnit.get(productIds[7])!, qty: 20, unitCost: 12500 },
    ],
  });

  postPurchase(db, {
    storeId: ctx.storeId,
    userId: ctx.ownerId,
    supplierId: ctx.supplierIds[1],
    invoiceDate: addDays(ctx.today, -4),
    dueDate: addDays(ctx.today, 10),
    supplierInvoiceNo: "AP/2417",
    deviceCode: "K1",
    items: [
      { productId: productIds[5], unitId: saleUnit.get(productIds[5])!, qty: 100, unitCost: 900 },
      { productId: productIds[14], unitId: saleUnit.get(productIds[14])!, qty: 60, unitCost: 800 },
      { productId: productIds[15], unitId: saleUnit.get(productIds[15])!, qty: 48, unitCost: 12000 },
    ],
  });

  const methods = ["cash", "cash", "cash", "qris", "bank_transfer", "ewallet"] as const;
  const increment = 100;

  for (let day = 13; day >= 0; day -= 1) {
    const date = addDays(ctx.today, -day);
    const dayFactor = hashSeed(day + 3);
    const saleCount = 5 + Math.floor(dayFactor * 5) + (day === 0 ? 3 : 0);

    for (let s = 0; s < saleCount; s += 1) {
      const seed = day * 31 + s * 7 + 1;
      const lineCount = 1 + Math.floor(hashSeed(seed) * 4);
      const items: { productId: string; unitId: string; qty: number }[] = [];
      const used = new Set<string>();
      for (let l = 0; l < lineCount; l += 1) {
        const pIndex = Math.floor(hashSeed(seed + l * 13) * productIds.length);
        const productId = productIds[pIndex];
        if (used.has(productId)) continue;
        used.add(productId);
        const qty = 1 + Math.floor(hashSeed(seed + l * 29) * 3);
        items.push({ productId, unitId: saleUnit.get(productId)!, qty });
      }
      if (!items.length) continue;

      try {
        const quote = quoteCart(db, ctx.storeId, items);
        const isCredit = hashSeed(seed + 5) < 0.08 && ctx.customerIds.length > 0;
        let payments: { method: "cash" | "qris" | "bank_transfer" | "ewallet"; amount: number; tendered?: number }[] = [];
        let customerId: string | null = null;

        if (isCredit) {
          customerId = ctx.customerIds[Math.floor(hashSeed(seed + 9) * ctx.customerIds.length)];
        } else {
          const method = methods[Math.floor(hashSeed(seed + 11) * methods.length)];
          if (method === "cash") {
            const rounded = applyCashRounding(quote.totals, increment);
            payments = [{ method, amount: rounded.grandTotal, tendered: Math.ceil(rounded.grandTotal / 10000) * 10000 }];
          } else {
            payments = [{ method, amount: quote.totals.grandTotal }];
          }
        }

        const jakartaHour = Number(
          new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date()),
        );
        const hour = day === 0 ? Math.floor(hashSeed(seed + 17) * Math.max(1, jakartaHour + 1)) : 8 + Math.floor(hashSeed(seed + 17) * 12);
        const minute = Math.floor(hashSeed(seed + 19) * 60);
        const occurredAt = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`).toISOString();

        completeSale(db, {
          storeId: ctx.storeId,
          userId: ctx.ownerId,
          shiftId: ctx.shiftId,
          businessDate: date,
          items,
          payments,
          customerId,
          roundingIncrement: increment,
          occurredAt,
          silent: true,
        });
      } catch {
        // Skip a seeded sale if stock or credit limits do not allow it.
      }
    }
  }
}
