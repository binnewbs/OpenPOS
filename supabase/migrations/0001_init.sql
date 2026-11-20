-- =============================================================================
-- OpenPOS Supabase schema (PostgreSQL 15+)
-- Migration: 0001_init
-- Creates the optional cloud replica, RLS, change feed, and store claiming RPC.
-- Run once in the Supabase SQL Editor. Safe to re-run for schema objects;
-- it never drops tables or data.
-- =============================================================================
-- Notes:
--   * Local SQLite remains authoritative. This schema stores synced replicas.
--   * IDs are UUIDs generated on the device (UUIDv7) or by the database.
--   * Money is bigint rupiah; quantities numeric(14,3); costs numeric(14,4).
--   * `users.pin_hash`, printer profiles, and secrets are never uploaded.
--   * RLS isolates every row by store membership.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Stores and membership
-- -----------------------------------------------------------------------------
create table if not exists public.stores (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  legal_name         text,
  address            text,
  phone              text,
  email              text,
  npwp               text,
  currency           text not null default 'IDR' check (length(currency) = 3),
  timezone           text not null default 'Asia/Jakarta',
  tax_enabled        boolean not null default false,
  tax_rate           numeric(7,2) not null default 11.0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_inclusive      boolean not null default true,
  rounding_increment bigint not null default 100 check (rounding_increment >= 0),
  receipt_header     text,
  receipt_footer     text,
  logo_path          text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table if not exists public.store_members (
  user_id    uuid not null references auth.users(id) on delete cascade,
  store_id   uuid not null references public.stores(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create or replace function public.is_store_member(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members
    where user_id = auth.uid()
      and store_id = p_store
  );
$$;

revoke all on function public.is_store_member(uuid) from public;
grant execute on function public.is_store_member(uuid) to authenticated;

create or replace function public.claim_store(
  p_store_id uuid,
  p_name text,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if exists (select 1 from public.stores where id = p_store_id) then
    if not exists (
      select 1 from public.store_members
      where store_id = p_store_id and user_id = auth.uid()
    ) then
      raise exception 'STORE_ALREADY_CLAIMED';
    end if;
    return p_store_id;
  end if;

  insert into public.stores (id, name, address)
  values (p_store_id, p_name, p_address);

  insert into public.store_members (user_id, store_id, role)
  values (auth.uid(), p_store_id, 'owner');

  return p_store_id;
end;
$$;

revoke all on function public.claim_store(uuid, text, text) from public;
grant execute on function public.claim_store(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Access control and settings
-- -----------------------------------------------------------------------------
create table if not exists public.permissions (
  key         text primary key,
  group_name  text not null,
  description text
);

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, slug)
);

create table if not exists public.role_permissions (
  store_id       uuid not null references public.stores(id) on delete cascade,
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  name            text not null,
  username        text not null,
  role_id         uuid not null references public.roles(id) on delete restrict,
  phone           text,
  email           text,
  is_active       boolean not null default true,
  must_change_pin boolean not null default false,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (store_id, username)
);

create table if not exists public.app_settings (
  store_id    uuid not null references public.stores(id) on delete cascade,
  key         text not null,
  value_json  jsonb not null,
  scope       text not null default 'store' check (scope in ('device','store')),
  is_secret   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (store_id, key)
);

create table if not exists public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  action        text not null,
  entity_type   text,
  entity_id     text,
  before_json   jsonb,
  after_json    jsonb,
  reason        text,
  metadata_json jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.document_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  doc_type    text not null check (doc_type in (
                'sale','return','void','purchase','po',
                'credit_payment','supplier_payment','journal')),
  period_key  text not null,
  prefix      text not null,
  next_value  bigint not null default 1 check (next_value >= 1),
  padding     integer not null default 4 check (padding between 1 and 10),
  updated_at  timestamptz not null default now(),
  unique (store_id, doc_type, period_key, prefix)
);

-- -----------------------------------------------------------------------------
-- Catalog and pricing
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete restrict,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.units (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  code          text not null,
  name          text not null,
  allow_decimal boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  sku             text,
  name            text not null,
  category_id     uuid references public.categories(id) on delete restrict,
  base_unit_id    uuid not null references public.units(id) on delete restrict,
  brand           text,
  description     text,
  cost_price      numeric(14,4) not null default 0 check (cost_price >= 0),
  retail_price    bigint not null default 0 check (retail_price >= 0),
  min_stock_qty   numeric(14,3) not null default 0 check (min_stock_qty >= 0),
  track_stock     boolean not null default true,
  track_expiry    boolean not null default false,
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days >= 0),
  is_taxable      boolean not null default false,
  tax_rate        numeric(7,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  image_path      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table if not exists public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  sku             text,
  name            text not null,
  attributes_json jsonb not null default '{}'::jsonb,
  retail_price    bigint check (retail_price is null or retail_price >= 0),
  cost_price      numeric(14,4) check (cost_price is null or cost_price >= 0),
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table if not exists public.product_units (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete cascade,
  unit_id             uuid not null references public.units(id) on delete restrict,
  parent_unit_id      uuid references public.product_units(id) on delete set null,
  factor_to_parent    numeric(14,4) check (factor_to_parent is null or factor_to_parent > 0),
  factor_to_base      numeric(14,4) not null check (factor_to_base > 0),
  selling_price       bigint check (selling_price is null or selling_price >= 0),
  is_base             boolean not null default false,
  is_default_sale     boolean not null default false,
  is_default_purchase boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (product_id, unit_id)
);

create table if not exists public.product_barcodes (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  unit_id    uuid references public.units(id) on delete restrict,
  barcode    text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, barcode)
);

create table if not exists public.customer_groups (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores(id) on delete cascade,
  name                     text not null,
  price_tier               text not null default 'retail'
                             check (price_tier in ('retail','wholesale','member','custom')),
  default_discount_percent numeric(7,2) not null default 0
                             check (default_discount_percent >= 0 and default_discount_percent <= 100),
  is_default               boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  name              text not null,
  phone             text,
  phone_normalized  text,
  email             text,
  address           text,
  customer_group_id uuid references public.customer_groups(id) on delete set null,
  credit_limit      bigint not null default 0 check (credit_limit >= 0),
  credit_term_days  integer not null default 30 check (credit_term_days >= 0),
  credit_balance    bigint not null default 0,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.price_rules (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete cascade,
  name                 text not null,
  scope                text not null check (scope in ('product','variant','category')),
  product_id           uuid references public.products(id) on delete cascade,
  variant_id           uuid references public.product_variants(id) on delete cascade,
  category_id          uuid references public.categories(id) on delete cascade,
  customer_id          uuid references public.customers(id) on delete cascade,
  customer_group_id    uuid references public.customer_groups(id) on delete cascade,
  unit_id              uuid references public.units(id) on delete restrict,
  min_qty              numeric(14,3) not null default 1 check (min_qty > 0),
  price                bigint check (price is null or price >= 0),
  discount_percent     numeric(7,2) check (discount_percent is null or
                          (discount_percent >= 0 and discount_percent <= 100)),
  priority             integer not null default 0,
  starts_at            timestamptz,
  ends_at              timestamptz,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((product_id is not null)::int + (variant_id is not null)::int + (category_id is not null)::int = 1),
  check ((price is not null)::int + (discount_percent is not null)::int = 1)
);

create table if not exists public.suppliers (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  name              text not null,
  code              text,
  contact_name      text,
  phone             text,
  email             text,
  address           text,
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.product_suppliers (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  product_id       uuid not null references public.products(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete cascade,
  supplier_id      uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku     text,
  last_cost        numeric(14,4) check (last_cost is null or last_cost >= 0),
  last_purchase_at timestamptz,
  is_preferred     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique nulls not distinct (store_id, product_id, variant_id, supplier_id)
);

-- -----------------------------------------------------------------------------
-- Purchasing
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  po_no          text not null,
  supplier_id    uuid not null references public.suppliers(id) on delete restrict,
  status         text not null default 'draft'
                   check (status in ('draft','ordered','partially_received','received','cancelled')),
  order_date     date not null,
  expected_date  date,
  subtotal       bigint not null default 0 check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  tax_total      bigint not null default 0 check (tax_total >= 0),
  grand_total    bigint not null default 0 check (grand_total >= 0),
  notes          text,
  created_by     uuid not null references public.users(id) on delete restrict,
  approved_by    uuid references public.users(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (store_id, po_no)
);

create table if not exists public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  variant_id        uuid references public.product_variants(id) on delete restrict,
  unit_id           uuid not null references public.units(id) on delete restrict,
  qty               numeric(14,3) not null check (qty > 0),
  conversion_factor numeric(14,4) not null check (conversion_factor > 0),
  unit_cost         bigint not null default 0 check (unit_cost >= 0),
  line_total        bigint not null default 0 check (line_total >= 0),
  qty_received      numeric(14,3) not null default 0 check (qty_received >= 0)
);

create table if not exists public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  purchase_no         text not null,
  supplier_invoice_no text,
  purchase_order_id   uuid references public.purchase_orders(id) on delete set null,
  supplier_id         uuid not null references public.suppliers(id) on delete restrict,
  status              text not null default 'draft' check (status in ('draft','posted','voided')),
  invoice_date        date not null,
  due_date            date,
  subtotal            bigint not null default 0 check (subtotal >= 0),
  discount_total      bigint not null default 0 check (discount_total >= 0),
  tax_total           bigint not null default 0 check (tax_total >= 0),
  shipping_total      bigint not null default 0 check (shipping_total >= 0),
  grand_total         bigint not null default 0 check (grand_total >= 0),
  paid_total          bigint not null default 0 check (paid_total >= 0),
  due_total           bigint not null default 0 check (due_total >= 0),
  notes               text,
  created_by          uuid not null references public.users(id) on delete restrict,
  posted_by           uuid references public.users(id) on delete restrict,
  posted_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, purchase_no)
);

create table if not exists public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  purchase_id       uuid not null references public.purchases(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete restrict,
  variant_id        uuid references public.product_variants(id) on delete restrict,
  unit_id           uuid not null references public.units(id) on delete restrict,
  qty               numeric(14,3) not null check (qty > 0),
  conversion_factor numeric(14,4) not null check (conversion_factor > 0),
  qty_base          numeric(14,3) not null check (qty_base > 0),
  unit_cost         bigint not null default 0 check (unit_cost >= 0),
  unit_cost_base    numeric(14,4) not null default 0 check (unit_cost_base >= 0),
  discount_amount   bigint not null default 0 check (discount_amount >= 0),
  line_total        bigint not null default 0 check (line_total >= 0),
  expiry_date       date,
  batch_no          text,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Inventory
-- -----------------------------------------------------------------------------
create table if not exists public.stock_levels (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  variant_id   uuid references public.product_variants(id) on delete cascade,
  qty_on_hand  numeric(14,3) not null default 0,
  qty_reserved numeric(14,3) not null default 0,
  avg_cost     numeric(14,4) not null default 0 check (avg_cost >= 0),
  last_cost    numeric(14,4) not null default 0 check (last_cost >= 0),
  updated_at   timestamptz not null default now(),
  unique nulls not distinct (store_id, product_id, variant_id)
);

create table if not exists public.stock_batches (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  product_id       uuid not null references public.products(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete cascade,
  purchase_item_id uuid references public.purchase_items(id) on delete set null,
  batch_no         text,
  expiry_date      date,
  qty_received     numeric(14,3) not null default 0 check (qty_received >= 0),
  qty_remaining    numeric(14,3) not null default 0 check (qty_remaining >= 0),
  unit_cost        numeric(14,4) not null default 0 check (unit_cost >= 0),
  received_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  variant_id        uuid references public.product_variants(id) on delete cascade,
  batch_id          uuid references public.stock_batches(id) on delete restrict,
  movement_type     text not null check (movement_type in (
                      'opening','purchase','purchase_return','sale','sale_return',
                      'adjustment','opname','waste','expiry','transfer_in','transfer_out')),
  qty_delta         numeric(14,3) not null check (qty_delta <> 0),
  qty_input         numeric(14,3),
  unit_id           uuid references public.units(id) on delete restrict,
  conversion_factor numeric(14,4) not null default 1 check (conversion_factor > 0),
  unit_cost         numeric(14,4) not null default 0 check (unit_cost >= 0),
  total_cost        bigint not null default 0,
  reference_type    text,
  reference_id      uuid,
  reason            text,
  note              text,
  business_date     date not null,
  user_id           uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Shifts and cash
-- -----------------------------------------------------------------------------
create table if not exists public.shifts (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  register_name text not null,
  device_id     text not null,
  opened_by     uuid not null references public.users(id) on delete restrict,
  opened_at     timestamptz not null default now(),
  opening_cash  bigint not null default 0 check (opening_cash >= 0),
  closed_by     uuid references public.users(id) on delete restrict,
  closed_at     timestamptz,
  expected_cash bigint,
  counted_cash  bigint check (counted_cash is null or counted_cash >= 0),
  difference    bigint,
  status        text not null default 'open' check (status in ('open','closed','reconciled')),
  closing_note  text,
  business_date date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  shift_id       uuid not null references public.shifts(id) on delete restrict,
  type           text not null check (type in (
                   'sale','refund','credit_payment','supplier_payment','expense',
                   'cash_in','cash_out','adjustment')),
  amount         bigint not null check (amount <> 0),
  reference_type text,
  reference_id   uuid,
  note           text,
  business_date  date not null,
  user_id        uuid not null references public.users(id) on delete restrict,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references public.stores(id) on delete cascade,
  shift_id             uuid references public.shifts(id) on delete restrict,
  receipt_no           text,
  business_date        date not null,
  customer_id          uuid references public.customers(id) on delete restrict,
  cashier_id           uuid not null references public.users(id) on delete restrict,
  status               text not null default 'held' check (status in ('held','completed','voided')),
  payment_status       text not null default 'unpaid'
                         check (payment_status in ('unpaid','partial','paid','refunded')),
  price_tier           text not null default 'retail'
                         check (price_tier in ('retail','wholesale','member','custom')),
  hold_label           text,
  hold_note            text,
  hold_expires_at      timestamptz,
  subtotal             bigint not null default 0 check (subtotal >= 0),
  item_discount_total  bigint not null default 0 check (item_discount_total >= 0),
  order_discount_total bigint not null default 0 check (order_discount_total >= 0),
  tax_total            bigint not null default 0 check (tax_total >= 0),
  rounding_total       bigint not null default 0,
  grand_total          bigint not null default 0 check (grand_total >= 0),
  paid_total           bigint not null default 0 check (paid_total >= 0),
  change_total         bigint not null default 0 check (change_total >= 0),
  due_total            bigint not null default 0 check (due_total >= 0),
  cost_total           bigint not null default 0 check (cost_total >= 0),
  note                 text,
  held_at              timestamptz,
  completed_at         timestamptz,
  voided_at            timestamptz,
  voided_by            uuid references public.users(id) on delete restrict,
  void_reason          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (paid_total <= grand_total),
  check (paid_total + due_total <= grand_total)
);

create table if not exists public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  sale_id           uuid not null references public.sales(id) on delete cascade,
  line_no           integer not null check (line_no > 0),
  product_id        uuid not null references public.products(id) on delete restrict,
  variant_id        uuid references public.product_variants(id) on delete restrict,
  unit_id           uuid not null references public.units(id) on delete restrict,
  qty               numeric(14,3) not null check (qty > 0),
  conversion_factor numeric(14,4) not null check (conversion_factor > 0),
  qty_base          numeric(14,3) not null check (qty_base > 0),
  unit_price        bigint not null default 0 check (unit_price >= 0),
  price_source      text not null default 'product'
                      check (price_source in ('customer','group','wholesale','unit','variant','product','manual')),
  price_rule_id     uuid references public.price_rules(id) on delete set null,
  discount_percent  numeric(7,2) not null default 0
                      check (discount_percent >= 0 and discount_percent <= 100),
  discount_amount   bigint not null default 0 check (discount_amount >= 0),
  tax_rate          numeric(7,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount        bigint not null default 0 check (tax_amount >= 0),
  gross_amount      bigint not null default 0 check (gross_amount >= 0),
  line_total        bigint not null default 0 check (line_total >= 0),
  unit_cost_base    numeric(14,4) not null default 0 check (unit_cost_base >= 0),
  cost_total        bigint not null default 0 check (cost_total >= 0),
  note              text,
  unique (sale_id, line_no)
);

create table if not exists public.sale_item_batches (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  batch_id     uuid not null references public.stock_batches(id) on delete restrict,
  qty_base     numeric(14,3) not null check (qty_base > 0),
  unit_cost    numeric(14,4) not null default 0 check (unit_cost >= 0)
);

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  sale_id         uuid not null references public.sales(id) on delete cascade,
  shift_id        uuid references public.shifts(id) on delete restrict,
  method          text not null check (method in ('cash','bank_transfer','ewallet','qris','other')),
  amount          bigint not null check (amount > 0),
  tendered_amount bigint not null default 0 check (tendered_amount >= 0),
  change_amount   bigint not null default 0 check (change_amount >= 0),
  reference_no    text,
  provider        text,
  status          text not null default 'settled'
                    check (status in ('settled','pending','failed','voided')),
  paid_at         timestamptz not null default now(),
  received_by     uuid not null references public.users(id) on delete restrict,
  note            text,
  created_at      timestamptz not null default now(),
  check (tendered_amount = 0 or tendered_amount >= amount),
  check (change_amount = 0 or method = 'cash')
);

-- -----------------------------------------------------------------------------
-- Customers, credit, returns
-- -----------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  entry_type     text not null check (entry_type in (
                   'opening','charge','payment','adjustment','write_off','return_credit','void')),
  amount         bigint not null check (amount <> 0),
  balance_after  bigint not null,
  sale_id        uuid references public.sales(id) on delete restrict,
  due_date       date,
  reference_type text,
  reference_id   uuid,
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.credit_payments (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete restrict,
  shift_id     uuid references public.shifts(id) on delete restrict,
  amount       bigint not null check (amount > 0),
  method       text not null check (method in ('cash','bank_transfer','ewallet','qris','other')),
  reference_no text,
  note         text,
  paid_at      timestamptz not null default now(),
  received_by  uuid not null references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  void_reason  text
);

create table if not exists public.sale_returns (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  sale_id       uuid not null references public.sales(id) on delete restrict,
  return_no     text not null,
  business_date date not null,
  reason_code   text not null check (reason_code in (
                  'damaged','expired','wrong_item','changed_mind','other')),
  reason        text,
  refund_method text not null default 'original'
                  check (refund_method in ('original','cash','bank_transfer','ewallet','qris')),
  refund_amount bigint not null default 0 check (refund_amount >= 0),
  restock       boolean not null default true,
  status        text not null default 'posted' check (status in ('posted','voided')),
  processed_by  uuid not null references public.users(id) on delete restrict,
  shift_id      uuid references public.shifts(id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (store_id, return_no)
);

create table if not exists public.sale_return_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  return_id         uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id      uuid not null references public.sale_items(id) on delete restrict,
  product_id        uuid not null references public.products(id) on delete restrict,
  variant_id        uuid references public.product_variants(id) on delete restrict,
  unit_id           uuid not null references public.units(id) on delete restrict,
  qty               numeric(14,3) not null check (qty > 0),
  conversion_factor numeric(14,4) not null check (conversion_factor > 0),
  qty_base          numeric(14,3) not null check (qty_base > 0),
  unit_price        bigint not null default 0 check (unit_price >= 0),
  refund_amount     bigint not null default 0 check (refund_amount >= 0),
  restock           boolean not null default true
);

create table if not exists public.sale_voids (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  sale_id     uuid not null references public.sales(id) on delete restrict,
  reason      text not null,
  voided_by   uuid not null references public.users(id) on delete restrict,
  approved_by uuid references public.users(id) on delete restrict,
  shift_id    uuid references public.shifts(id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (sale_id)
);

create table if not exists public.purchase_returns (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  purchase_id   uuid not null references public.purchases(id) on delete restrict,
  supplier_id   uuid not null references public.suppliers(id) on delete restrict,
  return_no     text not null,
  business_date date not null,
  reason        text not null,
  total_amount  bigint not null default 0 check (total_amount >= 0),
  status        text not null default 'posted' check (status in ('posted','voided')),
  created_by    uuid not null references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (store_id, return_no)
);

create table if not exists public.purchase_return_items (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  return_id        uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_item_id uuid not null references public.purchase_items(id) on delete restrict,
  product_id       uuid not null references public.products(id) on delete restrict,
  variant_id       uuid references public.product_variants(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  qty              numeric(14,3) not null check (qty > 0),
  qty_base         numeric(14,3) not null check (qty_base > 0),
  unit_cost        numeric(14,4) not null default 0 check (unit_cost >= 0),
  line_total       bigint not null default 0 check (line_total >= 0)
);

create table if not exists public.supplier_payments (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete restrict,
  purchase_id  uuid references public.purchases(id) on delete set null,
  shift_id     uuid references public.shifts(id) on delete restrict,
  amount       bigint not null check (amount > 0),
  method       text not null check (method in ('cash','bank_transfer','ewallet','other')),
  reference_no text,
  note         text,
  paid_at      timestamptz not null default now(),
  status       text not null default 'posted' check (status in ('posted','voided')),
  created_by   uuid not null references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  void_reason  text
);

-- -----------------------------------------------------------------------------
-- Operating expenses
-- -----------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  shift_id      uuid references public.shifts(id) on delete restrict,
  category_id   uuid not null references public.expense_categories(id) on delete restrict,
  amount        bigint not null check (amount > 0),
  paid_from     text not null default 'cash_drawer'
                  check (paid_from in ('cash_drawer','bank','ewallet','other')),
  description   text not null,
  reference_no  text,
  business_date date not null,
  spent_at      timestamptz not null default now(),
  created_by    uuid not null references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  void_reason   text
);

-- -----------------------------------------------------------------------------
-- Accounting
-- -----------------------------------------------------------------------------
create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  code           text not null,
  name           text not null,
  type           text not null check (type in ('asset','liability','equity','revenue','expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  parent_id      uuid references public.accounts(id) on delete restrict,
  is_system      boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.account_mappings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  mapping_key text not null,
  account_id  uuid not null references public.accounts(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, mapping_key)
);

create table if not exists public.accounting_periods (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  period_key text not null,
  status     text not null default 'open' check (status in ('open','closed')),
  closed_by  uuid references public.users(id) on delete restrict,
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, period_key)
);

create table if not exists public.journal_entries (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  entry_no       text not null,
  entry_date     date not null,
  period_key     text not null,
  source_type    text not null check (source_type in (
                   'sale','sale_return','sale_void','purchase','purchase_return',
                   'supplier_payment','credit_payment','expense','stock_adjustment',
                   'opname','shift_close','opening_balance','manual')),
  source_id      uuid,
  description    text,
  status         text not null default 'posted' check (status in ('posted','voided')),
  reversal_of_id uuid references public.journal_entries(id) on delete restrict,
  created_by     uuid references public.users(id) on delete set null,
  posted_at      timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references public.users(id) on delete set null,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (store_id, entry_no),
  unique (store_id, source_type, source_id)
);

create table if not exists public.journal_lines (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_no          integer not null check (line_no > 0),
  account_id       uuid not null references public.accounts(id) on delete restrict,
  debit            bigint not null default 0 check (debit >= 0),
  credit           bigint not null default 0 check (credit >= 0),
  memo             text,
  customer_id      uuid references public.customers(id) on delete set null,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  created_at       timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

-- -----------------------------------------------------------------------------
-- Change feed (written by triggers)
-- -----------------------------------------------------------------------------
create table if not exists public.change_feed (
  server_seq bigint generated always as identity primary key,
  store_id   uuid not null references public.stores(id) on delete cascade,
  table_name text not null,
  row_id     text not null,
  op         text not null check (op in ('insert','update','delete')),
  payload    jsonb,
  changed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Stock opname (declared here to keep FK order simple)
-- -----------------------------------------------------------------------------
create table if not exists public.stock_opname_sessions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  scope_json   jsonb not null default '{"type":"all"}'::jsonb,
  status       text not null default 'draft'
                 check (status in ('draft','counting','finalized','cancelled')),
  started_by   uuid not null references public.users(id) on delete restrict,
  started_at   timestamptz not null default now(),
  finalized_by uuid references public.users(id) on delete restrict,
  finalized_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.stock_opname_items (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  session_id     uuid not null references public.stock_opname_sessions(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  variant_id     uuid references public.product_variants(id) on delete cascade,
  system_qty     numeric(14,3) not null default 0,
  counted_qty    numeric(14,3) check (counted_qty is null or counted_qty >= 0),
  difference_qty numeric(14,3),
  unit_cost      numeric(14,4) not null default 0 check (unit_cost >= 0),
  reason         text,
  created_at     timestamptz not null default now(),
  unique nulls not distinct (session_id, product_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists ix_roles_store on public.roles(store_id);
create index if not exists ix_users_store_active on public.users(store_id, is_active);
create index if not exists ix_users_role on public.users(role_id);
create index if not exists ix_activity_store_date on public.activity_logs(store_id, created_at);
create index if not exists ix_activity_entity on public.activity_logs(store_id, entity_type, entity_id);

create index if not exists ix_categories_store_parent on public.categories(store_id, parent_id, sort_order);
create index if not exists ix_units_store on public.units(store_id, is_active);
create index if not exists ix_products_store_name on public.products(store_id, lower(name));
create index if not exists ix_products_store_category on public.products(store_id, category_id, is_active);
create unique index if not exists ux_products_sku on public.products(store_id, sku) where sku is not null;
create index if not exists ix_variants_product on public.product_variants(product_id, sort_order);
create unique index if not exists ux_variants_sku on public.product_variants(store_id, sku) where sku is not null;
create index if not exists ix_product_units_product on public.product_units(product_id, sort_order);
create unique index if not exists ux_product_units_base on public.product_units(product_id) where is_base;
create index if not exists ix_barcodes_lookup on public.product_barcodes(store_id, barcode);
create index if not exists ix_barcodes_product on public.product_barcodes(product_id, variant_id);
create unique index if not exists ux_customer_groups_default on public.customer_groups(store_id) where is_default;
create index if not exists ix_price_rules_lookup on public.price_rules(
  store_id, scope, product_id, variant_id, category_id, customer_id, customer_group_id, min_qty
);
create index if not exists ix_price_rules_active on public.price_rules(store_id, is_active, starts_at, ends_at);
create unique index if not exists ux_product_suppliers_preferred on public.product_suppliers(
  store_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where is_preferred;

create index if not exists ix_stock_levels_product on public.stock_levels(store_id, product_id);
create index if not exists ix_batches_expiry on public.stock_batches(store_id, expiry_date, qty_remaining);
create index if not exists ix_batches_product on public.stock_batches(store_id, product_id, variant_id, expiry_date);
create index if not exists ix_movements_product_date on public.stock_movements(store_id, product_id, created_at);
create index if not exists ix_movements_reference on public.stock_movements(store_id, reference_type, reference_id);
create index if not exists ix_movements_date on public.stock_movements(store_id, business_date);
create index if not exists ix_opname_items_session on public.stock_opname_items(session_id);

create index if not exists ix_customers_store_name on public.customers(store_id, lower(name));
create index if not exists ix_customers_phone on public.customers(store_id, phone_normalized);
create index if not exists ix_credit_ledger_customer on public.credit_ledger(store_id, customer_id, created_at);
create index if not exists ix_credit_ledger_sale on public.credit_ledger(store_id, sale_id);
create index if not exists ix_credit_ledger_due on public.credit_ledger(store_id, due_date);
create index if not exists ix_credit_payments_customer on public.credit_payments(store_id, customer_id, paid_at);
create index if not exists ix_credit_payments_shift on public.credit_payments(shift_id);

create index if not exists ix_suppliers_store_name on public.suppliers(store_id, lower(name));
create unique index if not exists ux_suppliers_code on public.suppliers(store_id, code) where code is not null;
create index if not exists ix_po_supplier_status on public.purchase_orders(store_id, supplier_id, status);
create index if not exists ix_po_date on public.purchase_orders(store_id, order_date);
create index if not exists ix_po_items_po on public.purchase_order_items(purchase_order_id);
create index if not exists ix_purchases_supplier_status on public.purchases(store_id, supplier_id, status);
create index if not exists ix_purchases_due on public.purchases(store_id, due_total, due_date);
create index if not exists ix_purchases_date on public.purchases(store_id, invoice_date);
create index if not exists ix_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists ix_purchase_items_product on public.purchase_items(store_id, product_id, created_at);
create index if not exists ix_supplier_payments_supplier on public.supplier_payments(store_id, supplier_id, paid_at);
create index if not exists ix_supplier_payments_purchase on public.supplier_payments(purchase_id);
create index if not exists ix_purchase_returns_purchase on public.purchase_returns(purchase_id);
create index if not exists ix_purchase_return_items_return on public.purchase_return_items(return_id);

create index if not exists ix_expenses_date on public.expenses(store_id, business_date);
create index if not exists ix_expenses_category on public.expenses(store_id, category_id, business_date);
create index if not exists ix_expenses_shift on public.expenses(shift_id);

create index if not exists ix_accounts_store_type on public.accounts(store_id, type, code);
create index if not exists ix_journal_entries_date on public.journal_entries(store_id, entry_date);
create index if not exists ix_journal_entries_period on public.journal_entries(store_id, period_key, status);
create index if not exists ix_journal_entries_source on public.journal_entries(store_id, source_type, source_id);
create index if not exists ix_journal_lines_entry on public.journal_lines(journal_entry_id, line_no);
create index if not exists ix_journal_lines_account on public.journal_lines(store_id, account_id);

create unique index if not exists ux_shifts_open_device on public.shifts(store_id, device_id) where status = 'open';
create index if not exists ix_shifts_store_date on public.shifts(store_id, business_date);
create index if not exists ix_cash_movements_shift on public.cash_movements(shift_id, created_at);
create index if not exists ix_cash_movements_date on public.cash_movements(store_id, business_date);
create index if not exists ix_cash_movements_reference on public.cash_movements(reference_type, reference_id);
create unique index if not exists ux_sales_receipt on public.sales(store_id, receipt_no) where receipt_no is not null;
create index if not exists ix_sales_business_date on public.sales(store_id, business_date, status);
create index if not exists ix_sales_customer on public.sales(store_id, customer_id, business_date);
create index if not exists ix_sales_shift on public.sales(shift_id, status);
create index if not exists ix_sales_held on public.sales(store_id, hold_expires_at) where status = 'held';
create index if not exists ix_sale_items_sale on public.sale_items(sale_id, line_no);
create index if not exists ix_sale_items_product on public.sale_items(store_id, product_id);
create index if not exists ix_sale_item_batches_item on public.sale_item_batches(sale_item_id);
create index if not exists ix_sale_item_batches_batch on public.sale_item_batches(batch_id);
create index if not exists ix_payments_sale on public.payments(sale_id);
create index if not exists ix_payments_shift on public.payments(shift_id, method, status);
create index if not exists ix_payments_date on public.payments(store_id, paid_at);
create index if not exists ix_sale_returns_sale on public.sale_returns(sale_id, created_at);
create index if not exists ix_sale_returns_date on public.sale_returns(store_id, business_date);
create index if not exists ix_sale_return_items_return on public.sale_return_items(return_id);
create index if not exists ix_sale_return_items_sale_item on public.sale_return_items(sale_item_id);

create index if not exists ix_change_feed_store_seq on public.change_feed(store_id, server_seq);
create index if not exists ix_change_feed_changed_at on public.change_feed(changed_at);

-- -----------------------------------------------------------------------------
-- Change feed trigger
-- -----------------------------------------------------------------------------
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   jsonb;
  v_store uuid;
  v_id    text;
  v_op    text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_op := 'delete';
  else
    v_row := to_jsonb(new);
    v_op := lower(tg_op);
  end if;

  v_store := (v_row->>'store_id')::uuid;

  if tg_table_name = 'app_settings' then
    v_id := (v_row->>'store_id') || ':' || (v_row->>'key');
  elsif tg_table_name = 'role_permissions' then
    v_id := (v_row->>'role_id') || ':' || (v_row->>'permission_key');
  else
    v_id := v_row->>'id';
  end if;

  if v_store is not null and v_id is not null then
    insert into public.change_feed (store_id, table_name, row_id, op, payload)
    values (v_store, tg_table_name, v_id, v_op, v_row);
  end if;

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','roles','role_permissions','users','activity_logs','document_sequences',
    'categories','units','products','product_variants','product_units','product_barcodes',
    'customer_groups','customers','price_rules','suppliers','product_suppliers',
    'purchase_orders','purchase_order_items','purchases','purchase_items',
    'stock_levels','stock_batches','stock_movements',
    'stock_opname_sessions','stock_opname_items',
    'shifts','cash_movements','sales','sale_items','sale_item_batches','payments',
    'credit_ledger','credit_payments','sale_returns','sale_return_items','sale_voids',
    'purchase_returns','purchase_return_items','supplier_payments',
    'expense_categories','expenses',
    'accounts','account_mappings','accounting_periods','journal_entries','journal_lines'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_change', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()',
      t || '_change', t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','roles','role_permissions','users','document_sequences',
    'categories','units','products','product_variants','product_units','product_barcodes',
    'customer_groups','customers','price_rules','suppliers','product_suppliers',
    'purchase_orders','purchase_order_items','purchases','purchase_items',
    'stock_levels','stock_batches','stock_opname_sessions','stock_opname_items',
    'shifts','sales','sale_items','sale_item_batches','payments',
    'credit_payments','sale_returns','sale_return_items',
    'purchase_returns','purchase_return_items','supplier_payments',
    'expense_categories','expenses','accounts','account_mappings',
    'accounting_periods','journal_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_store_member(store_id))',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_store_member(store_id))',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_store_member(store_id)) with check (public.is_store_member(store_id))',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_store_member(store_id))',
      t || '_delete', t
    );
  end loop;
end $$;

-- Append-only tables: select + insert only
do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_logs','stock_movements','cash_movements','credit_ledger','sale_voids','journal_lines'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_store_member(store_id))',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_store_member(store_id))',
      t || '_insert', t
    );
  end loop;
end $$;

-- Special tables
alter table public.stores enable row level security;
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated using (public.is_store_member(id));
drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores
  for update to authenticated using (public.is_store_member(id))
  with check (public.is_store_member(id));

alter table public.store_members enable row level security;
drop policy if exists store_members_select on public.store_members;
create policy store_members_select on public.store_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_store_member(store_id));

alter table public.permissions enable row level security;
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated using (true);

alter table public.change_feed enable row level security;
drop policy if exists change_feed_select on public.change_feed;
create policy change_feed_select on public.change_feed
  for select to authenticated using (public.is_store_member(store_id));

-- -----------------------------------------------------------------------------
-- Grants (RLS still restricts row access)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- -----------------------------------------------------------------------------
-- Permission seed
-- -----------------------------------------------------------------------------
insert into public.permissions (key, group_name, description) values
  ('sales.create',            'Sales',      'Create and complete sales'),
  ('sales.hold',              'Sales',      'Hold and resume own carts'),
  ('sales.resume_any',        'Sales',      'Resume any cashier held cart'),
  ('sales.discount',          'Sales',      'Apply manual line/order discounts'),
  ('sales.price_override',    'Sales',      'Override a line price'),
  ('sales.void',              'Sales',      'Void a completed sale'),
  ('sales.void_cross_shift',  'Sales',      'Void a sale from a closed shift'),
  ('sales.return',            'Sales',      'Process sale returns'),
  ('products.view',           'Products',   'View products and stock'),
  ('products.create',         'Products',   'Create products'),
  ('products.edit',           'Products',   'Edit products and units'),
  ('products.edit_price',     'Products',   'Change selling prices and price rules'),
  ('products.delete',         'Products',   'Deactivate/delete products'),
  ('inventory.view',          'Inventory',  'View stock, batches, and stock card'),
  ('inventory.adjust',        'Inventory',  'Adjust stock manually'),
  ('inventory.opname',        'Inventory',  'Run and finalize stock opname'),
  ('inventory.receive',       'Inventory',  'Receive goods and post purchases'),
  ('purchases.view',          'Purchasing', 'View suppliers, POs, and purchases'),
  ('purchases.create',        'Purchasing', 'Create POs and purchase receipts'),
  ('purchases.pay',           'Purchasing', 'Pay supplier invoices'),
  ('purchases.void',          'Purchasing', 'Void a posted purchase'),
  ('customers.view',          'Customers',  'View customers and receivables'),
  ('customers.create',        'Customers',  'Create customers'),
  ('customers.edit',          'Customers',  'Edit customer details'),
  ('credit.grant',            'Credit',     'Sell on credit'),
  ('credit.limit',            'Credit',     'Change customer credit limits'),
  ('credit.payment',          'Credit',     'Record credit repayments'),
  ('expenses.create',         'Expenses',   'Record operating expenses'),
  ('shifts.open',             'Shifts',     'Open a shift'),
  ('shifts.close',            'Shifts',     'Close a shift'),
  ('cash.in_out',             'Shifts',     'Record cash in/out and owner drawings'),
  ('reports.sales',           'Reports',    'View sales reports'),
  ('reports.profit',          'Reports',    'View profit and margin reports'),
  ('reports.inventory',       'Reports',    'View inventory and valuation reports'),
  ('reports.finance',         'Reports',    'View financial reports'),
  ('accounting.view',         'Accounting', 'View chart of accounts and journals'),
  ('accounting.post',         'Accounting', 'Post manual journal entries'),
  ('accounting.close_period', 'Accounting', 'Close or reopen accounting periods'),
  ('users.manage',            'Admin',      'Manage users and roles'),
  ('settings.manage',         'Admin',      'Manage store settings'),
  ('sync.manage',             'Admin',      'Configure cloud sync and resolve conflicts'),
  ('backup.manage',           'Admin',      'Backup, restore, and diagnostics'),
  ('audit.view',              'Admin',      'View activity logs')
on conflict (key) do update
set group_name = excluded.group_name,
    description = excluded.description;

-- -----------------------------------------------------------------------------
-- Optional: Storage bucket for product images
-- Uncomment if you want to sync product images to Supabase Storage.
-- -----------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values ('product-images', 'product-images', false)
-- on conflict (id) do nothing;
--
-- drop policy if exists product_images_read on storage.objects;
-- create policy product_images_read on storage.objects
--   for select to authenticated
--   using (bucket_id = 'product-images'
--          and public.is_store_member((storage.foldername(name))[1]::uuid));
--
-- drop policy if exists product_images_write on storage.objects;
-- create policy product_images_write on storage.objects
--   for insert to authenticated
--   with check (bucket_id = 'product-images'
--          and public.is_store_member((storage.foldername(name))[1]::uuid));

-- =============================================================================
-- End of migration 0001_init
-- =============================================================================



