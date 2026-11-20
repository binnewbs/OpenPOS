import { many, one, type Db } from "../db";
import { uuidv7 } from "../ids";
import { nowIso } from "../format";

export type MappingKey =
  | "cash_drawer"
  | "bank"
  | "ewallet_clearing"
  | "qris_clearing"
  | "accounts_receivable"
  | "inventory"
  | "accounts_payable"
  | "sales_revenue"
  | "sales_returns"
  | "sales_discount"
  | "cogs"
  | "inventory_adjustment"
  | "cash_over_short"
  | "tax_output"
  | "tax_input"
  | "rounding"
  | "owner_equity"
  | "owner_drawings"
  | "opening_balance_equity"
  | "operating_expense_default";

export type JournalLineInput = {
  mappingKey: MappingKey;
  debit?: number;
  credit?: number;
  memo?: string;
  customerId?: string | null;
  supplierId?: string | null;
};

const MAPPING_CODES: Record<MappingKey, string> = {
  cash_drawer: "1000",
  bank: "1010",
  ewallet_clearing: "1020",
  qris_clearing: "1030",
  accounts_receivable: "1100",
  inventory: "1200",
  accounts_payable: "2000",
  sales_revenue: "4000",
  sales_returns: "4100",
  sales_discount: "4200",
  cogs: "5000",
  inventory_adjustment: "5100",
  cash_over_short: "6900",
  tax_output: "2100",
  tax_input: "2100",
  rounding: "7000",
  owner_equity: "3000",
  owner_drawings: "3200",
  opening_balance_equity: "3000",
  operating_expense_default: "6000",
};

export function nextDocNumber(
  db: Db,
  storeId: string,
  docType: string,
  period: string,
  prefix: string,
  padding: number,
): string {
  const existing = one<{ id: string; next_value: number }>(
    db,
    "SELECT id, next_value FROM document_sequences WHERE store_id = ? AND doc_type = ? AND period_key = ? AND prefix = ?",
    storeId,
    docType,
    period,
    prefix,
  );

  const value = existing?.next_value ?? 1;
  if (existing) {
    db.prepare("UPDATE document_sequences SET next_value = next_value + 1, updated_at = ? WHERE id = ?").run(nowIso(), existing.id);
  } else {
    db.prepare(
      `INSERT INTO document_sequences (id, store_id, doc_type, period_key, prefix, next_value, padding, updated_at)
       VALUES (?, ?, ?, ?, ?, 2, ?, ?)`,
    ).run(uuidv7(), storeId, docType, period, prefix, padding, nowIso());
  }
  return `${prefix}-${period}-${String(value).padStart(padding, "0")}`;
}

export function accountIdFor(db: Db, storeId: string, key: MappingKey): string {
  const row = one<{ account_id: string }>(
    db,
    `SELECT m.account_id FROM account_mappings m
     JOIN accounts a ON a.id = m.account_id
     WHERE m.store_id = ? AND m.mapping_key = ?`,
    storeId,
    key,
  );
  if (row) return row.account_id;
  const fallback = one<{ id: string }>(
    db,
    "SELECT id FROM accounts WHERE store_id = ? AND code = ?",
    storeId,
    MAPPING_CODES[key],
  );
  if (!fallback) throw new Error(`ACCOUNT_MAPPING_MISSING:${key}`);
  return fallback.id;
}

export type PostJournalInput = {
  storeId: string;
  sourceType:
    | "sale"
    | "sale_return"
    | "sale_void"
    | "purchase"
    | "purchase_return"
    | "supplier_payment"
    | "credit_payment"
    | "expense"
    | "stock_adjustment"
    | "opname"
    | "shift_close"
    | "opening_balance"
    | "manual";
  sourceId: string;
  entryDate: string;
  description: string;
  userId?: string | null;
  lines: JournalLineInput[];
};

export function postJournal(db: Db, input: PostJournalInput): string | null {
  const existing = one<{ id: string }>(
    db,
    "SELECT id FROM journal_entries WHERE store_id = ? AND source_type = ? AND source_id = ?",
    input.storeId,
    input.sourceType,
    input.sourceId,
  );
  if (existing) return existing.id;

  const lines = input.lines
    .map((l) => ({ ...l, debit: Math.round(l.debit ?? 0), credit: Math.round(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit !== totalCredit) throw new Error(`JOURNAL_UNBALANCED:${totalDebit}:${totalCredit}`);
  if (lines.length === 0) return null;

  const entryId = uuidv7();
  const period = input.entryDate.slice(0, 7);
  const entryNo = nextDocNumber(db, input.storeId, "journal", period, "JE", 5);

  const periodRow = one<{ id: string }>(
    db,
    "SELECT id FROM accounting_periods WHERE store_id = ? AND period_key = ?",
    input.storeId,
    period,
  );
  if (!periodRow) {
    db.prepare(
      "INSERT INTO accounting_periods (id, store_id, period_key, status) VALUES (?, ?, ?, 'open')",
    ).run(uuidv7(), input.storeId, period);
  }

  db.prepare(
    `INSERT INTO journal_entries
       (id, store_id, entry_no, entry_date, period_key, source_type, source_id, description, status, created_by, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)`,
  ).run(
    entryId,
    input.storeId,
    entryNo,
    input.entryDate,
    period,
    input.sourceType,
    input.sourceId,
    input.description,
    input.userId ?? null,
    nowIso(),
  );

  const insertLine = db.prepare(
    `INSERT INTO journal_lines
       (id, store_id, journal_entry_id, line_no, account_id, debit, credit, memo, customer_id, supplier_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  lines.forEach((line, index) => {
    insertLine.run(
      uuidv7(),
      input.storeId,
      entryId,
      index + 1,
      accountIdFor(db, input.storeId, line.mappingKey),
      line.debit,
      line.credit,
      line.memo ?? null,
      line.customerId ?? null,
      line.supplierId ?? null,
    );
  });

  return entryId;
}

export function trialBalance(db: Db, storeId: string, from: string, to: string) {
  return many<{
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    debit: number;
    credit: number;
    balance: number;
  }>(
    db,
    `SELECT a.code, a.name, a.type, a.normal_balance,
            COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) AS debit,
            COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) AS credit,
            COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) AS balance
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
       AND je.status = 'posted' AND je.entry_date BETWEEN ? AND ?
     WHERE a.store_id = ?
     GROUP BY a.id
     HAVING debit <> 0 OR credit <> 0
     ORDER BY a.code`,
    from,
    to,
    storeId,
  );
}
