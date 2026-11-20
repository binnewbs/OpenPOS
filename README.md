# OpenPOS

Offline-first point-of-sale and bookkeeping app for Indonesian corner stores (warung / toko kelontong). Built with Next.js 16, TypeScript, Tailwind CSS 4, and SQLite (`node:sqlite`).

This repository implements the first working vertical slice of `PLAN.md`: local catalog, multi-unit pricing, checkout, inventory ledger, customer credit, purchasing, shifts and cash, reporting, and automatic double-entry journals.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The database and demo data are created on first access in `data/openpos.sqlite`.

### Demo accounts

| Role | Username | PIN |
|---|---|---|
| Owner (all permissions) | `owner` | `1234` |
| Cashier | `kasir` | `1111` |

The demo store ("Warung Berkah") is seeded with 20 products, multi-unit conversions, opening stock, suppliers, customers with credit, two posted purchases, an open shift, and 14 days of sales so the dashboard and reports have real content.

## Scripts

```bash
npm run dev        # start the app
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # TypeScript strict check
npm run lint       # alias for typecheck
npm run db:reset   # delete the local SQLite database (re-seeds on next request)
npm test           # run the domain integration tests
```

## What works

- **PIN login & roles** — owner/cashier permission matrix enforced in server actions.
- **Checkout** — keyboard-first search, barcode/SKU match, multi-unit switching, per-line quantity, cash rounding, split payment methods (cash, QRIS, transfer, e-wallet, kasbon), change calculation, receipt preview and printing.
- **Catalog** — product create/edit, categories, base units and selling-unit conversions, opening stock.
- **Inventory** — cached stock levels backed by an immutable movement ledger, low-stock views, manual adjustments with a reason and journal entry, movement history.
- **Customers & credit** — credit limits, ledger, repayments (cash or non-cash), overdue visibility.
- **Purchasing** — suppliers, goods receipt, moving-average cost, supplier payables.
- **Shifts & cash** — open/close shift, expected vs counted cash, variance journal, operating expenses, cash movement history.
- **Reporting** — daily sales/laba chart, payment mix, category and product performance, CSV export.
- **Accounting** — automatic balanced journals for every operational event, trial balance, P&L summary, journal listing.
- **Settings** — store identity, tax/rounding, receipt preview, user PIN reset, local SQLite backup download, activity log.
- **Local backups** — `Settings → Unduh backup` produces a consistent `VACUUM INTO` snapshot.

## Tests

`npm test` runs an in-memory SQLite suite covering multi-unit price resolution, cash rounding, atomic sale completion, stock-ledger invariants, balanced journals, and void reversals.

## Architecture

```text
src/
├─ app/
│  ├─ (app)/            # authenticated screens (dashboard, kasir, produk, …)
│  ├─ login/
│  └─ api/              # CSV export + SQLite backup
├─ components/          # design system, shell, charts, modal
├─ lib/                 # shared types, plain-object normalizer
└─ server/
   ├─ db.ts             # SQLite bootstrap, transaction helper
   ├─ seed.ts           # demo store bootstrap
   ├─ auth.ts           # signed cookie sessions, permissions
   ├─ queries.ts        # read models
   ├─ actions/          # server actions (mutations)
   └─ services/         # domain services: sales, inventory, credit, shifts, accounting
db/sqlite/0001_init.sql # canonical schema (pre-existing)
```

All money is integer rupiah; quantities are decimal base units; historical sale lines snapshot price, factor, tax, and cost. Sale completion, stock movements, payments, cash movements, credit charges, and journals are written in a single SQLite transaction.

## Not yet implemented

The remaining plan slices are intentionally out of this first pass: the Electron main/preload shell, thermal ESC/POS printing via native drivers, Supabase sync engine and RLS wizard, holds/resume, returns, stock opname sessions, accounting period close, PDF exports, and multi-device conflict resolution. The data model and UI are structured so those can be added without reworking the core.

See `PLAN.md` for the full product specification and `DATABASE_SCHEME.md` for the data model.
