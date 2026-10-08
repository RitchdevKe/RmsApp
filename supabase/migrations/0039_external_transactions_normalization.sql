-- supabase/migrations/0039_external_transactions_normalization.sql
--
-- Migration Step 6: External Transactions — normalize as source of truth.
--
-- NOTE: This is SEPARATE from public.payments (STK push / M-Pesa API).
-- public.external_transactions holds manually-imported inbound payment
-- records (bank statements, M-Pesa C2B) used for reconciliation.
--
-- Changes:
--   1. Create public.external_transactions table
--   2. Create app.load_external_transactions() RPC
--   3. Create app.upsert_external_transaction(jsonb) and bulk variant
--   4. Backfill from tm_external_transactions_v11 blob
--   5. Update load_all_app_state() to serve tm_external_transactions_v11
--
-- Idempotent: safe to re-run.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.external_transactions (
  id                text primary key,
  date              text not null,
  reference         text not null,
  transaction_code  text,
  amount            numeric not null default 0,
  name              text not null default '',
  account           text not null default '',
  type              text not null default 'M-Pesa'
                    check (type in ('M-Pesa', 'Bank')),
  matched           boolean not null default false,
  matched_tenant_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists external_transactions_matched_idx
  on public.external_transactions (matched);

create index if not exists external_transactions_date_idx
  on public.external_transactions (date);

alter table public.external_transactions enable row level security;

drop policy if exists ext_tx_select_admin on public.external_transactions;
create policy ext_tx_select_admin
on public.external_transactions for select
to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists ext_tx_write_admin on public.external_transactions;
create policy ext_tx_write_admin
on public.external_transactions for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- updated_at trigger
create or replace function public.ext_tx_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ext_tx_set_updated_at on public.external_transactions;
create trigger trg_ext_tx_set_updated_at
before update on public.external_transactions
for each row execute function public.ext_tx_set_updated_at();

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_external_transactions()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',              t.id,
      'date',            t.date,
      'reference',       t.reference,
      'transactionCode', t.transaction_code,
      'amount',          t.amount,
      'name',            t.name,
      'account',         t.account,
      'type',            t.type,
      'matched',         t.matched,
      'matchedTenantId', t.matched_tenant_id
    )) as row
    from public.external_transactions t
    order by t.date desc
  ) sub;
$$;

grant execute on function app.load_external_transactions() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_external_transaction(p_tx jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_tx->>'id';
begin
  if v_id is null then
    raise exception 'external_transaction.id is required';
  end if;

  insert into public.external_transactions (
    id, date, reference, transaction_code,
    amount, name, account, type, matched, matched_tenant_id,
    updated_at
  ) values (
    v_id,
    coalesce(p_tx->>'date', ''),
    coalesce(p_tx->>'reference', ''),
    p_tx->>'transactionCode',
    coalesce(nullif(p_tx->>'amount','')::numeric, 0),
    coalesce(p_tx->>'name', ''),
    coalesce(p_tx->>'account', ''),
    coalesce(p_tx->>'type', 'M-Pesa'),
    coalesce((p_tx->>'matched')::boolean, false),
    p_tx->>'matchedTenantId',
    now()
  )
  on conflict (id) do update set
    date              = excluded.date,
    reference         = excluded.reference,
    transaction_code  = excluded.transaction_code,
    amount            = excluded.amount,
    name              = excluded.name,
    account           = excluded.account,
    type              = excluded.type,
    matched           = excluded.matched,
    matched_tenant_id = excluded.matched_tenant_id,
    updated_at        = now();

  return p_tx;
end;
$$;

grant execute on function app.upsert_external_transaction(jsonb) to authenticated, service_role;

create or replace function app.upsert_external_transactions_bulk(p_txs jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_txs) <> 'array' then
    raise exception 'p_txs must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_txs)
  loop
    perform app.upsert_external_transaction(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_external_transactions_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_txs      jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_external_transactions_v11'
  loop
    v_txs := r.value;
    if v_txs is null or jsonb_typeof(v_txs) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_txs)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        insert into public.external_transactions (
          id, date, reference, transaction_code,
          amount, name, account, type, matched, matched_tenant_id,
          updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'date', ''),
          coalesce(v_item->>'reference', ''),
          v_item->>'transactionCode',
          coalesce(nullif(v_item->>'amount','')::numeric, 0),
          coalesce(v_item->>'name', ''),
          coalesce(v_item->>'account', ''),
          coalesce(v_item->>'type', 'M-Pesa'),
          coalesce((v_item->>'matched')::boolean, false),
          v_item->>'matchedTenantId',
          now()
        )
        on conflict (id) do update set
          date              = excluded.date,
          reference         = excluded.reference,
          transaction_code  = excluded.transaction_code,
          amount            = excluded.amount,
          name              = excluded.name,
          account           = excluded.account,
          type              = excluded.type,
          matched           = excluded.matched,
          matched_tenant_id = excluded.matched_tenant_id,
          updated_at        = now();

        v_upserted := v_upserted + 1;

      exception when others then
        raise notice 'Skipped ext_tx id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'External transactions backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;

-- ── 5. Wire into load_all_app_state ───────────────────────────────────────
create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in (
        'tm_tenants_v11', 'tm_properties_v11',
        'tm_landlords_v11', 'tm_staff_v11', 'tm_vendors_v11',
        'tm_external_transactions_v11'
      )
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',               app.load_tenants(),
      'tm_properties_v11',            app.load_properties(),
      'tm_landlords_v11',             app.load_landlords(),
      'tm_staff_v11',                 app.load_staff(),
      'tm_vendors_v11',               app.load_vendors(),
      'tm_external_transactions_v11', app.load_external_transactions()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
