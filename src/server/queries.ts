import { getDb } from "./db";
import { addDays, businessDate, periodKey } from "./format";

const db = () => getDb();

export type Store = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  currency: string;
  timezone: string;
  tax_enabled: number;
  tax_rate: number;
  tax_inclusive: number;
  rounding_increment: number;
  receipt_footer: string | null;
};

export function getStore(storeId: string): Store {
  return db().prepare("SELECT * FROM stores WHERE id = ?").get(storeId) as Store;
}

export function getOpenShift(storeId: string) {
  return db()
    .prepare(
      `SELECT s.*, u.name AS cashier_name,
              s.opening_cash + COALESCE((SELECT SUM(amount) FROM cash_movements WHERE shift_id = s.id), 0) AS expected_cash_live
       FROM shifts s JOIN users u ON u.id = s.opened_by
       WHERE s.store_id = ? AND s.status = 'open'
       ORDER BY s.opened_at DESC LIMIT 1`,
    )
    .get(storeId) as
    | {
        id: string;
        register_name: string;
        device_id: string;
        opener: string;
        cashier_name: string;
        opened_at: string;
        opening_cash: number;
        status: string;
        business_date: string;
        expected_cash_live: number;
      }
    | undefined;
}

export function getShiftHistory(storeId: string, limit = 12) {
  return db()
    .prepare(
      `SELECT s.*, u.name AS cashier_name
       FROM shifts s JOIN users u ON u.id = s.opened_by
       WHERE s.store_id = ? ORDER BY s.opened_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

type Totals = { transactions: number; gross: number; cogs: number; credit: number };

function salesTotals(storeId: string, from: string, to: string): Totals {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS transactions,
              COALESCE(SUM(grand_total), 0) AS gross,
              COALESCE(SUM(cost_total), 0) AS cogs,
              COALESCE(SUM(due_total), 0) AS credit
       FROM sales
       WHERE store_id = ? AND status = 'completed' AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, from, to) as Totals;
  return row;
}

export function getDashboard(storeId: string) {
  const today = businessDate();
  const yesterday = addDays(today, -1);
  const monthStart = `${periodKey(today)}-01`;
  const last14 = addDays(today, -13);

  const todayTotals = salesTotals(storeId, today, today);
  const yesterdayTotals = salesTotals(storeId, yesterday, yesterday);
  const monthTotals = salesTotals(storeId, monthStart, today);

  const revenueRow = db()
    .prepare(
      `SELECT COALESCE(SUM(grand_total), 0) AS revenue, COALESCE(SUM(cost_total), 0) AS cogs
       FROM sales WHERE store_id = ? AND status = 'completed' AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, monthStart, today) as { revenue: number; cogs: number };
  const expenseRow = db()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE store_id = ? AND voided_at IS NULL AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, monthStart, today) as { total: number };
  const grossProfit = Number(revenueRow.revenue) - Number(revenueRow.cogs);
  const netProfit = grossProfit - Number(expenseRow.total);

  const receivables = db()
    .prepare("SELECT COALESCE(SUM(credit_balance), 0) AS total FROM customers WHERE store_id = ? AND deleted_at IS NULL")
    .get(storeId) as { total: number };
  const overdue = db()
    .prepare(
      `SELECT COALESCE(SUM(overdue_amount), 0) AS total
       FROM v_customer_ar WHERE store_id = ?`,
    )
    .get(storeId) as { total: number };
  const payables = db()
    .prepare(
      "SELECT COALESCE(SUM(due_total), 0) AS total FROM purchases WHERE store_id = ? AND status = 'posted'",
    )
    .get(storeId) as { total: number };

  const lowStock = db()
    .prepare(`SELECT * FROM v_low_stock WHERE store_id = ? ORDER BY qty_on_hand ASC LIMIT 6`)
    .all(storeId) as {
    product_id: string;
    name: string;
    sku: string | null;
    qty_on_hand: number;
    min_stock_qty: number;
    base_unit: string;
  }[];

  const lowStockCount = db()
    .prepare("SELECT COUNT(*) AS total FROM v_low_stock WHERE store_id = ?")
    .get(storeId) as { total: number };

  const topProducts = db()
    .prepare(
      `SELECT p.id, p.name, p.sku, SUM(si.qty_base) AS units,
              SUM(si.line_total) AS revenue, SUM(si.cost_total) AS cogs
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
       GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
    )
    .all(storeId, addDays(today, -6), today) as {
    id: string;
    name: string;
    sku: string | null;
    units: number;
    revenue: number;
    cogs: number;
  }[];

  const payments = db()
    .prepare(
      `SELECT pm.method, SUM(pm.amount) AS amount, COUNT(*) AS count
       FROM payments pm JOIN sales s ON s.id = pm.sale_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date = ?
       AND pm.status = 'settled'
       GROUP BY pm.method`,
    )
    .all(storeId, today) as { method: string; amount: number; count: number }[];

  const hourly = db()
    .prepare(
      `SELECT strftime('%H', datetime(created_at, '+7 hours')) AS hour,
              SUM(grand_total) AS total, COUNT(*) AS count
       FROM sales
       WHERE store_id = ? AND status = 'completed' AND business_date = ?
       GROUP BY hour ORDER BY hour`,
    )
    .all(storeId, today) as { hour: string; total: number; count: number }[];

  const seriesRows = db()
    .prepare(
      `SELECT business_date AS date, SUM(grand_total) AS total, COUNT(*) AS count,
              SUM(grand_total - cost_total) AS profit
       FROM sales
       WHERE store_id = ? AND status = 'completed' AND business_date BETWEEN ? AND ?
       GROUP BY business_date ORDER BY business_date`,
    )
    .all(storeId, last14, today) as { date: string; total: number; count: number; profit: number }[];

  const seriesMap = new Map(seriesRows.map((r) => [r.date, r]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(last14, i);
    const row = seriesMap.get(date);
    return { date, total: Number(row?.total ?? 0), count: Number(row?.count ?? 0), profit: Number(row?.profit ?? 0) };
  });

  const hourMap = new Map(hourly.map((h) => [h.hour, h]));
  const hourlySeries = Array.from({ length: 14 }, (_, i) => {
    const hour = String(i + 7).padStart(2, "0");
    const row = hourMap.get(hour);
    return { hour: `${hour}:00`, total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
  });

  const recentSales = db()
    .prepare(
      `SELECT s.id, s.receipt_no, s.grand_total, s.paid_total, s.due_total, s.payment_status,
              s.completed_at, s.business_date, u.name AS cashier, c.name AS customer,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.store_id = ? AND s.status IN ('completed','voided')
       ORDER BY s.completed_at DESC LIMIT 7`,
    )
    .all(storeId) as unknown[];

  return {
    today,
    todayTotals,
    yesterdayTotals,
    monthTotals,
    grossProfit,
    netProfit,
    expenses: Number(expenseRow.total),
    receivables: Number(receivables.total),
    overdue: Number(overdue.total),
    payables: Number(payables.total),
    lowStock,
    lowStockCount: Number(lowStockCount.total),
    topProducts,
    payments,
    hourlySeries,
    series,
    recentSales,
    openShift: getOpenShift(storeId),
  };
}

export function getProductList(storeId: string, query = "") {
  const like = `%${query.trim().toLowerCase()}%`;
  return db()
    .prepare(
      `SELECT p.id, p.name, p.sku, p.brand, p.retail_price, p.cost_price, p.min_stock_qty,
              p.track_stock, p.is_active, p.category_id, c.name AS category,
              u.code AS base_unit, u.id AS base_unit_id,
              COALESCE(v.qty_on_hand, 0) AS qty_on_hand,
              COALESCE(v.is_low_stock, 0) AS is_low_stock,
              COALESCE(v.avg_cost, p.cost_price) AS avg_cost,
              COALESCE(v.stock_value, 0) AS stock_value
       FROM products p
       JOIN units u ON u.id = p.base_unit_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN v_product_stock v ON v.product_id = p.id
       WHERE p.store_id = ? AND p.deleted_at IS NULL
         AND (? = '' OR lower(p.name) LIKE ? OR lower(COALESCE(p.sku,'')) LIKE ? OR lower(COALESCE(p.brand,'')) LIKE ?)
       ORDER BY p.name`,
    )
    .all(storeId, query, like, like, like);
}

export function getProductDetail(storeId: string, productId: string) {
  const product = db()
    .prepare(
      `SELECT p.*, u.code AS base_unit, c.name AS category
       FROM products p JOIN units u ON u.id = p.base_unit_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = ? AND p.id = ?`,
    )
    .get(storeId, productId);
  if (!product) return null;
  const units = db()
    .prepare(
      `SELECT pu.unit_id, pu.factor_to_base, pu.selling_price, pu.is_base, u.code, u.name
       FROM product_units pu JOIN units u ON u.id = pu.unit_id
       WHERE pu.product_id = ? ORDER BY pu.sort_order, pu.factor_to_base`,
    )
    .all(productId);
  const barcodes = db()
    .prepare("SELECT barcode, unit_id, is_primary FROM product_barcodes WHERE product_id = ?")
    .all(productId);
  return { product, units, barcodes };
}

export function getCategories(storeId: string) {
  return db()
    .prepare("SELECT id, name FROM categories WHERE store_id = ? AND deleted_at IS NULL ORDER BY sort_order, name")
    .all(storeId) as { id: string; name: string }[];
}

export function getUnits(storeId: string) {
  return db()
    .prepare("SELECT id, code, name, allow_decimal FROM units WHERE store_id = ? AND is_active = 1 ORDER BY name")
    .all(storeId) as { id: string; code: string; name: string; allow_decimal: number }[];
}

export function getInventory(storeId: string) {
  const items = db()
    .prepare(
      `SELECT p.id, p.name, p.sku, c.name AS category, u.code AS base_unit,
              COALESCE(v.qty_on_hand, 0) AS qty_on_hand,
              COALESCE(v.avg_cost, p.cost_price) AS avg_cost,
              COALESCE(v.stock_value, 0) AS stock_value,
              p.min_stock_qty, COALESCE(v.is_low_stock, 0) AS is_low_stock,
              p.cost_price, p.retail_price
       FROM products p
       JOIN units u ON u.id = p.base_unit_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN v_product_stock v ON v.product_id = p.id
       WHERE p.store_id = ? AND p.deleted_at IS NULL AND p.track_stock = 1
       ORDER BY (COALESCE(v.is_low_stock,0)) DESC, p.name`,
    )
    .all(storeId) as {
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    base_unit: string;
    qty_on_hand: number;
    avg_cost: number;
    stock_value: number;
    min_stock_qty: number;
    is_low_stock: number;
    cost_price: number;
    retail_price: number;
  }[];
  const totals = items.reduce(
    (acc, item) => {
      acc.value += Number(item.stock_value);
      acc.units += Number(item.qty_on_hand);
      if (item.is_low_stock) acc.low += 1;
      return acc;
    },
    { value: 0, units: 0, low: 0 },
  );
  return { items, totals };
}

export function getStockMovements(storeId: string, limit = 40) {
  return db()
    .prepare(
      `SELECT sm.id, sm.movement_type, sm.qty_delta, sm.qty_input, sm.unit_cost, sm.total_cost,
              sm.reference_type, sm.reason, sm.business_date, sm.created_at,
              p.name AS product_name, u.code AS unit_code, us.name AS user_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN units u ON u.id = sm.unit_id
       LEFT JOIN users us ON us.id = sm.user_id
       WHERE sm.store_id = ?
       ORDER BY sm.created_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  credit_balance: number;
  credit_term_days: number;
  available_credit: number;
  overdue_amount: number;
};

export function getCustomers(storeId: string): CustomerListRow[] {
  return db()
    .prepare(
      `SELECT c.id, c.name, c.phone, c.address, c.credit_limit, c.credit_balance, c.credit_term_days,
              COALESCE(a.available_credit, c.credit_limit - c.credit_balance) AS available_credit,
              COALESCE(a.overdue_amount, 0) AS overdue_amount
       FROM customers c
       LEFT JOIN v_customer_ar a ON a.customer_id = c.id
       WHERE c.store_id = ? AND c.deleted_at IS NULL
       ORDER BY c.credit_balance DESC, c.name`,
    )
    .all(storeId) as CustomerListRow[];
}

export function getCustomerDetail(storeId: string, customerId: string) {
  const customer = db()
    .prepare("SELECT * FROM customers WHERE id = ? AND store_id = ? AND deleted_at IS NULL")
    .get(customerId, storeId) as CustomerListRow | undefined;
  if (!customer) return null;
  const ledger = db()
    .prepare(
      `SELECT l.id, l.entry_type, l.amount, l.balance_after, l.due_date, l.note, l.created_at,
              l.sale_id, s.receipt_no
       FROM credit_ledger l
       LEFT JOIN sales s ON s.id = l.sale_id
       WHERE l.customer_id = ? ORDER BY l.created_at DESC LIMIT 30`,
    )
    .all(customerId);
  const sales = db()
    .prepare(
      `SELECT id, receipt_no, business_date, grand_total, due_total, payment_status
       FROM sales WHERE customer_id = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 10`,
    )
    .all(customerId);
  return { customer, ledger, sales };
}

export function getSuppliers(storeId: string) {
  return db()
    .prepare(
      `SELECT s.*, COALESCE(SUM(p.due_total), 0) AS total_due
       FROM suppliers s
       LEFT JOIN purchases p ON p.supplier_id = s.id AND p.status = 'posted'
       WHERE s.store_id = ? AND s.deleted_at IS NULL
       GROUP BY s.id ORDER BY s.name`,
    )
    .all(storeId);
}

export function getPurchases(storeId: string, limit = 25) {
  return db()
    .prepare(
      `SELECT p.id, p.purchase_no, p.supplier_invoice_no, p.status, p.invoice_date, p.due_date,
              p.grand_total, p.paid_total, p.due_total, s.name AS supplier_name,
              (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count,
              u.name AS created_by_name
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.store_id = ?
       ORDER BY p.invoice_date DESC, p.created_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

export function getExpenseCategories(storeId: string) {
  return db()
    .prepare("SELECT id, name FROM expense_categories WHERE store_id = ? AND is_active = 1 ORDER BY name")
    .all(storeId) as { id: string; name: string }[];
}

export function getExpenses(storeId: string, limit = 20) {
  return db()
    .prepare(
      `SELECT e.id, e.amount, e.description, e.paid_from, e.business_date, e.created_at,
              c.name AS category, u.name AS created_by_name
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.store_id = ? AND e.voided_at IS NULL
       ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

export function getSalesHistory(storeId: string, limit = 50) {
  return db()
    .prepare(
      `SELECT s.id, s.receipt_no, s.business_date, s.completed_at, s.status, s.payment_status,
              s.grand_total, s.paid_total, s.due_total, s.change_total, s.cost_total,
              u.name AS cashier, c.name AS customer,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.store_id = ? AND s.status IN ('completed','voided')
       ORDER BY s.completed_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

export function getSaleDetail(storeId: string, saleId: string) {
  const sale = db()
    .prepare(
      `SELECT s.*, u.name AS cashier, c.name AS customer, c.phone AS customer_phone
       FROM sales s JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ? AND s.store_id = ?`,
    )
    .get(saleId, storeId) as Record<string, unknown> | undefined;
  if (!sale) return null;
  const items = db()
    .prepare(
      `SELECT si.*, p.name AS product_name, u.code AS unit_code
       FROM sale_items si JOIN products p ON p.id = si.product_id
       JOIN units u ON u.id = si.unit_id
       WHERE si.sale_id = ? ORDER BY si.line_no`,
    )
    .all(saleId);
  const payments = db()
    .prepare("SELECT * FROM payments WHERE sale_id = ? ORDER BY paid_at")
    .all(saleId);
  return { sale, items, payments };
}

export function getReports(storeId: string, from: string, to: string) {
  const totals = salesTotals(storeId, from, to);
  const returns = db()
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(refund_amount), 0) AS amount
       FROM sale_returns WHERE store_id = ? AND status = 'posted' AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, from, to) as { count: number; amount: number };

  const daily = db()
    .prepare(
      `SELECT business_date AS date, COUNT(*) AS transactions, SUM(grand_total) AS gross,
              SUM(cost_total) AS cogs, SUM(grand_total - cost_total) AS profit
       FROM sales WHERE store_id = ? AND status = 'completed' AND business_date BETWEEN ? AND ?
       GROUP BY business_date ORDER BY business_date`,
    )
    .all(storeId, from, to) as { date: string; transactions: number; gross: number; cogs: number; profit: number }[];

  const paymentMix = db()
    .prepare(
      `SELECT pm.method, SUM(pm.amount) AS amount, COUNT(*) AS count
       FROM payments pm JOIN sales s ON s.id = pm.sale_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
         AND pm.status = 'settled'
       GROUP BY pm.method ORDER BY amount DESC`,
    )
    .all(storeId, from, to) as { method: string; amount: number; count: number }[];

  const byCategory = db()
    .prepare(
      `SELECT COALESCE(c.name, 'Tanpa kategori') AS category,
              SUM(si.qty_base) AS units, SUM(si.line_total) AS revenue,
              SUM(si.line_total - si.cost_total) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
       GROUP BY c.name ORDER BY revenue DESC`,
    )
    .all(storeId, from, to) as { category: string; units: number; revenue: number; profit: number }[];

  const topProducts = db()
    .prepare(
      `SELECT p.id, p.name, p.sku, SUM(si.qty_base) AS units, SUM(si.line_total) AS revenue,
              SUM(si.line_total - si.cost_total) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
       GROUP BY p.id ORDER BY revenue DESC LIMIT 10`,
    )
    .all(storeId, from, to) as { id: string; name: string; sku: string | null; units: number; revenue: number; profit: number }[];

  const byCashier = db()
    .prepare(
      `SELECT u.name AS cashier, COUNT(*) AS transactions, SUM(s.grand_total) AS gross
       FROM sales s JOIN users u ON u.id = s.cashier_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date BETWEEN ? AND ?
       GROUP BY u.id ORDER BY gross DESC`,
    )
    .all(storeId, from, to) as { cashier: string; transactions: number; gross: number }[];

  return {
    totals,
    returns: { count: Number(returns.count), amount: Number(returns.amount) },
    daily,
    paymentMix,
    byCategory,
    topProducts,
    byCashier,
  };
}

export function getAccounting(storeId: string, from: string, to: string, trialFrom = from) {
  const trial = db()
    .prepare(
      `SELECT a.code, a.name, a.type, a.normal_balance,
              COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) AS debit,
              COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) AS credit
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.status = 'posted' AND je.entry_date BETWEEN ? AND ?
       WHERE a.store_id = ?
       GROUP BY a.id
       HAVING debit <> 0 OR credit <> 0
       ORDER BY a.code`,
    )
    .all(trialFrom, to, storeId) as { code: string; name: string; type: string; normal_balance: string; debit: number; credit: number }[];

  const journals = db()
    .prepare(
      `SELECT je.id, je.entry_no, je.entry_date, je.source_type, je.description, je.status,
              SUM(jl.debit) AS total, COUNT(jl.id) AS line_count
       FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.store_id = ? AND je.entry_date BETWEEN ? AND ?
       GROUP BY je.id ORDER BY je.entry_date DESC, je.entry_no DESC LIMIT 40`,
    )
    .all(storeId, from, to) as {
    id: string;
    entry_no: string;
    entry_date: string;
    source_type: string;
    description: string;
    status: string;
    total: number;
    line_count: number;
  }[];

  const revenue = db()
    .prepare(
      `SELECT COALESCE(SUM(grand_total),0) AS gross, COALESCE(SUM(cost_total),0) AS cogs
       FROM sales WHERE store_id = ? AND status = 'completed' AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, from, to) as { gross: number; cogs: number };
  const expenses = db()
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
       WHERE store_id = ? AND voided_at IS NULL AND business_date BETWEEN ? AND ?`,
    )
    .get(storeId, from, to) as { total: number };

  return {
    trial,
    journals,
    summary: {
      revenue: Number(revenue.gross),
      cogs: Number(revenue.cogs),
      grossProfit: Number(revenue.gross) - Number(revenue.cogs),
      expenses: Number(expenses.total),
      netProfit: Number(revenue.gross) - Number(revenue.cogs) - Number(expenses.total),
    },
  };
}

export function getUsers(storeId: string) {
  return db()
    .prepare(
      `SELECT u.id, u.name, u.username, u.is_active, u.last_login_at, r.name AS role_name, r.slug AS role_slug
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.store_id = ? AND u.deleted_at IS NULL ORDER BY u.name`,
    )
    .all(storeId);
}

export function getActivityLog(storeId: string, limit = 20) {
  return db()
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.reason, a.created_at, u.name AS user_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.store_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    )
    .all(storeId, limit);
}

export function getExpiringBatches(storeId: string) {
  return db()
    .prepare(
      `SELECT * FROM v_expiring_batches WHERE store_id = ? AND days_to_expiry <= 90
       ORDER BY days_to_expiry ASC LIMIT 20`,
    )
    .all(storeId);
}

export function getAllProductUnits(storeId: string) {
  return db()
    .prepare(
      `SELECT pu.product_id, pu.unit_id, pu.factor_to_base, pu.selling_price, pu.is_base,
              u.code, u.name
       FROM product_units pu JOIN units u ON u.id = pu.unit_id
       WHERE pu.store_id = ?
       ORDER BY pu.sort_order, pu.factor_to_base`,
    )
    .all(storeId) as {
    product_id: string;
    unit_id: string;
    factor_to_base: number;
    selling_price: number | null;
    is_base: number;
    code: string;
    name: string;
  }[];
}

export function getShiftCashMovements(shiftId: string) {
  return db()
    .prepare(
      `SELECT cm.id, cm.type, cm.amount, cm.reference_type, cm.note, cm.business_date, cm.created_at,
              u.name AS user_name
       FROM cash_movements cm LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.shift_id = ? ORDER BY cm.created_at DESC`,
    )
    .all(shiftId) as {
    id: string;
    type: string;
    amount: number;
    reference_type: string | null;
    note: string | null;
    business_date: string;
    created_at: string;
    user_name: string | null;
  }[];
}

export function getShiftSalesSummary(shiftId: string) {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total), 0) AS gross,
              COALESCE(SUM(cost_total), 0) AS cogs, COALESCE(SUM(due_total), 0) AS credit
       FROM sales WHERE shift_id = ? AND status = 'completed'`,
    )
    .get(shiftId) as { transactions: number; gross: number; cogs: number; credit: number };
  const payments = db()
    .prepare(
      `SELECT method, SUM(amount) AS amount, COUNT(*) AS count FROM payments
       WHERE shift_id = ? AND status = 'settled' GROUP BY method`,
    )
    .all(shiftId) as { method: string; amount: number; count: number }[];
  return { ...row, payments };
}

export function getCustomerDetails(storeId: string) {
  const customers = getCustomers(storeId);
  return customers.map((customer) => {
    const ledger = db()
      .prepare(
        `SELECT l.id, l.entry_type, l.amount, l.balance_after, l.due_date, l.note, l.created_at,
                s.receipt_no
         FROM credit_ledger l LEFT JOIN sales s ON s.id = l.sale_id
         WHERE l.customer_id = ? ORDER BY l.created_at DESC LIMIT 20`,
      )
      .all(customer.id);
    return { customer, ledger };
  });
}

export function getPaymentMethodsToday(storeId: string) {
  return db()
    .prepare(
      `SELECT pm.method, SUM(pm.amount) AS amount FROM payments pm
       JOIN sales s ON s.id = pm.sale_id
       WHERE s.store_id = ? AND s.status = 'completed' AND s.business_date = ?
       AND pm.status = 'settled' GROUP BY pm.method`,
    )
    .all(storeId, businessDate());
}

export type { Totals };
