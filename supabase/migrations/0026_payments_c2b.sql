-- supabase/migrations/0026_payments_c2b.sql
--
-- Extend payments table to support C2B (Paybill account) and Manual
-- (Bank / Cash) payment sources alongside the existing STK flow.
--
-- Design:
--   * `source` — which channel the payment came through (stk | c2b | manual).
--   * `bill_ref_number` — account number the customer typed at Paybill; we
--     match it to a unit by `unitTag` (e.g. "MSK/05").
--   * `matched_tenant_id` / `matched_unit_id` — resolution of the bill ref
--     to an active tenant; null means the payment needs manual matching on
--     the External Unmatched queue.
--   * `transaction_id` is the idempotency key for C2B (there is no
--     checkout_request_id on C2B). Safaricom retries confirmation up to 5x,
--     so a UNIQUE partial index + ON CONFLICT DO NOTHING prevents duplicates.
--
-- Back-compat:
--   * Existing STK rows continue to work unchanged (`source` defaults to 'stk').
--   * user_id / phone / checkout_request_id are made nullable because C2B
--     does not always carry a user context at insert time.

alter table public.payments
  add column if not exists source text not null default 'stk'
    check (source in ('stk','c2b','manual')),
  add column if not exists bill_ref_number text,
  add column if not exists msisdn text,
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists business_short_code text,
  add column if not exists org_account_balance numeric,
  add column if not exists matched_tenant_id text
    references public.tenants(id) on delete set null,
  add column if not exists matched_unit_id text,
  add column if not exists raw_payload jsonb;

-- Relax NOT NULLs that were STK-specific.
alter table public.payments alter column user_id drop not null;
alter table public.payments alter column phone drop not null;
alter table public.payments alter column checkout_request_id drop not null;

-- Idempotency key for C2B (MpesaReceiptNumber). Partial — NULL allowed for
-- pending STK rows that have no transaction_id yet.
create unique index if not exists payments_transaction_id_unique
  on public.payments(transaction_id)
  where transaction_id is not null;

-- Fast lookup indexes for the Inbound / Reconciliation pages.
create index if not exists payments_source_idx on public.payments(source);
create index if not exists payments_matched_tenant_idx
  on public.payments(matched_tenant_id)
  where matched_tenant_id is not null;
create index if not exists payments_unmatched_c2b_idx
  on public.payments(created_at desc)
  where source = 'c2b' and matched_tenant_id is null;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Existing policies only allow user_id = auth.uid(). C2B rows are inserted by
-- the service role (edge function) with NULL user_id, so add admin-wide read
-- and matched-tenant read.

drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin"
on public.payments
for select
to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists "payments_update_admin" on public.payments;
create policy "payments_update_admin"
on public.payments
for update
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

drop policy if exists "payments_insert_admin" on public.payments;
create policy "payments_insert_admin"
on public.payments
for insert
to authenticated
with check (app.is_admin(auth.uid()));
