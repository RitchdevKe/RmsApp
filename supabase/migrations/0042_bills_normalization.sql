-- supabase/migrations/0042_bills_normalization.sql
--
-- Migration Step 9: Bills — normalize public.bills as source of truth.
--
-- Bill fields: id, vendor, category, amount, invoiceDate, dueDate,
--   status, propertyId, description?, metadata?
--
-- Idempotent: safe to re-run.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.bills (
  id           text primary key,
  vendor       text not null default '',
  category     text not null default '',
  amount       numeric not null default 0,
  invoice_date text not null default '',
  due_date     text not null default '',
  status       text not null default 'Unpaid',
  property_id  text not null default '',
  description  text,
  metadata     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bills_status_idx     on public.bills (status);
create index if not exists bills_property_idx   on public.bills (property_id);
create index if not exists bills_due_date_idx   on public.bills (due_date);

alter table public.bills enable row level security;

drop policy if exists bills_select_authenticated on public.bills;
create policy bills_select_authenticated
on public.bills for select to authenticated using (true);

drop policy if exists bills_write_admin on public.bills;
create policy bills_write_admin
on public.bills for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.bills_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at
before update on public.bills
for each row execute function public.bills_set_updated_at();

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_bills()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',          b.id,
      'vendor',      b.vendor,
      'category',    b.category,
      'amount',      b.amount,
      'invoiceDate', b.invoice_date,
      'dueDate',     b.due_date,
      'status',      b.status,
      'propertyId',  b.property_id,
      'description', b.description,
      'metadata',    b.metadata
    )) as row
    from public.bills b
    order by b.created_at asc
  ) sub;
$$;

grant execute on function app.load_bills() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_bill(p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_bill->>'id';
begin
  if v_id is null then raise exception 'bill.id is required'; end if;

  insert into public.bills (
    id, vendor, category, amount, invoice_date, due_date,
    status, property_id, description, metadata, updated_at
  ) values (
    v_id,
    coalesce(p_bill->>'vendor', ''),
    coalesce(p_bill->>'category', ''),
    coalesce(nullif(p_bill->>'amount','')::numeric, 0),
    coalesce(p_bill->>'invoiceDate', ''),
    coalesce(p_bill->>'dueDate', ''),
    coalesce(p_bill->>'status', 'Unpaid'),
    coalesce(p_bill->>'propertyId', ''),
    p_bill->>'description',
    p_bill->'metadata',
    now()
  )
  on conflict (id) do update set
    vendor       = excluded.vendor,
    category     = excluded.category,
    amount       = excluded.amount,
    invoice_date = excluded.invoice_date,
    due_date     = excluded.due_date,
    status       = excluded.status,
    property_id  = excluded.property_id,
    description  = excluded.description,
    metadata     = excluded.metadata,
    updated_at   = now();

  return p_bill;
end;
$$;

grant execute on function app.upsert_bill(jsonb) to authenticated, service_role;

create or replace function app.upsert_bills_bulk(p_bills jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_bills) <> 'array' then
    raise exception 'p_bills must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_bills)
  loop
    perform app.upsert_bill(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_bills_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_bills    jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_bills_v11'
  loop
    v_bills := r.value;
    if v_bills is null or jsonb_typeof(v_bills) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_bills)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.bills (
          id, vendor, category, amount, invoice_date, due_date,
          status, property_id, description, metadata, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'vendor', ''),
          coalesce(v_item->>'category', ''),
          coalesce(nullif(v_item->>'amount','')::numeric, 0),
          coalesce(v_item->>'invoiceDate', ''),
          coalesce(v_item->>'dueDate', ''),
          coalesce(v_item->>'status', 'Unpaid'),
          coalesce(v_item->>'propertyId', ''),
          v_item->>'description',
          v_item->'metadata',
          now()
        )
        on conflict (id) do update set
          vendor       = excluded.vendor,
          category     = excluded.category,
          amount       = excluded.amount,
          invoice_date = excluded.invoice_date,
          due_date     = excluded.due_date,
          status       = excluded.status,
          property_id  = excluded.property_id,
          description  = excluded.description,
          metadata     = excluded.metadata,
          updated_at   = now();

        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped bill id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Bills backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_external_transactions_v11', 'tm_audit_logs_v11',
        'tm_tasks_v11', 'tm_bills_v11'
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
      'tm_external_transactions_v11', app.load_external_transactions(),
      'tm_audit_logs_v11',            app.load_audit_logs(),
      'tm_tasks_v11',                 app.load_tasks(),
      'tm_bills_v11',                 app.load_bills()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
