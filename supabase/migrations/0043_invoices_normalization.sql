-- supabase/migrations/0043_invoices_normalization.sql
--
-- Migration Step 10: Invoices — normalize public.invoices as source of truth.
--
-- Invoice fields: id, invoiceNumber, category, tenantName, unit?,
--   amount, dueDate, status, items[]?, email?, phone?,
--   billingAddress?, attachmentUrl?
--
-- Idempotent: safe to re-run.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              text primary key,
  invoice_number  text not null default '',
  category        text not null default 'Outbound',
  tenant_name     text not null default '',
  unit            text,
  amount          numeric not null default 0,
  due_date        text not null default '',
  status          text not null default 'Due',
  items           jsonb default '[]'::jsonb,
  email           text,
  phone           text,
  billing_address text,
  attachment_url  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists invoices_status_idx    on public.invoices (status);
create index if not exists invoices_due_date_idx  on public.invoices (due_date);

alter table public.invoices enable row level security;

drop policy if exists invoices_select_authenticated on public.invoices;
create policy invoices_select_authenticated
on public.invoices for select to authenticated using (true);

drop policy if exists invoices_write_admin on public.invoices;
create policy invoices_write_admin
on public.invoices for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.invoices_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.invoices_set_updated_at();

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_invoices()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',             i.id,
      'invoiceNumber',  i.invoice_number,
      'category',       i.category,
      'tenantName',     i.tenant_name,
      'unit',           i.unit,
      'amount',         i.amount,
      'dueDate',        i.due_date,
      'status',         i.status,
      'items',          i.items,
      'email',          i.email,
      'phone',          i.phone,
      'billingAddress', i.billing_address,
      'attachmentUrl',  i.attachment_url
    )) as row
    from public.invoices i
    order by i.created_at asc
  ) sub;
$$;

grant execute on function app.load_invoices() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_invoice(p_invoice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_invoice->>'id';
begin
  if v_id is null then raise exception 'invoice.id is required'; end if;

  insert into public.invoices (
    id, invoice_number, category, tenant_name, unit,
    amount, due_date, status, items,
    email, phone, billing_address, attachment_url, updated_at
  ) values (
    v_id,
    coalesce(p_invoice->>'invoiceNumber', ''),
    coalesce(p_invoice->>'category', 'Outbound'),
    coalesce(p_invoice->>'tenantName', ''),
    p_invoice->>'unit',
    coalesce(nullif(p_invoice->>'amount','')::numeric, 0),
    coalesce(p_invoice->>'dueDate', ''),
    coalesce(p_invoice->>'status', 'Due'),
    coalesce(p_invoice->'items', '[]'::jsonb),
    p_invoice->>'email',
    p_invoice->>'phone',
    p_invoice->>'billingAddress',
    p_invoice->>'attachmentUrl',
    now()
  )
  on conflict (id) do update set
    invoice_number  = excluded.invoice_number,
    category        = excluded.category,
    tenant_name     = excluded.tenant_name,
    unit            = excluded.unit,
    amount          = excluded.amount,
    due_date        = excluded.due_date,
    status          = excluded.status,
    items           = excluded.items,
    email           = excluded.email,
    phone           = excluded.phone,
    billing_address = excluded.billing_address,
    attachment_url  = excluded.attachment_url,
    updated_at      = now();

  return p_invoice;
end;
$$;

grant execute on function app.upsert_invoice(jsonb) to authenticated, service_role;

create or replace function app.upsert_invoices_bulk(p_invoices jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_invoices) <> 'array' then
    raise exception 'p_invoices must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_invoices)
  loop
    perform app.upsert_invoice(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_invoices_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_invoices jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_invoices_v11'
  loop
    v_invoices := r.value;
    if v_invoices is null or jsonb_typeof(v_invoices) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_invoices)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.invoices (
          id, invoice_number, category, tenant_name, unit,
          amount, due_date, status, items,
          email, phone, billing_address, attachment_url, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'invoiceNumber', ''),
          coalesce(v_item->>'category', 'Outbound'),
          coalesce(v_item->>'tenantName', ''),
          v_item->>'unit',
          coalesce(nullif(v_item->>'amount','')::numeric, 0),
          coalesce(v_item->>'dueDate', ''),
          coalesce(v_item->>'status', 'Due'),
          coalesce(v_item->'items', '[]'::jsonb),
          v_item->>'email',
          v_item->>'phone',
          v_item->>'billingAddress',
          v_item->>'attachmentUrl',
          now()
        )
        on conflict (id) do update set
          invoice_number  = excluded.invoice_number,
          category        = excluded.category,
          tenant_name     = excluded.tenant_name,
          unit            = excluded.unit,
          amount          = excluded.amount,
          due_date        = excluded.due_date,
          status          = excluded.status,
          items           = excluded.items,
          email           = excluded.email,
          phone           = excluded.phone,
          billing_address = excluded.billing_address,
          attachment_url  = excluded.attachment_url,
          updated_at      = now();

        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped invoice id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Invoices backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_tasks_v11', 'tm_bills_v11', 'tm_invoices_v11'
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
      'tm_bills_v11',                 app.load_bills(),
      'tm_invoices_v11',              app.load_invoices()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
