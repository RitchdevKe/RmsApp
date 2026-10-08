-- supabase/migrations/0045_overpayments_normalization.sql
--
-- Overpayment: { id, tenantName, unit, amount, reference,
--               dateReceived, appliedMonth, status('Held'|'Applied') }
-- Idempotent.

create table if not exists public.overpayments (
  id             text primary key,
  tenant_name    text not null default '',
  unit           text not null default '',
  amount         numeric not null default 0,
  reference      text not null default '',
  date_received  text not null default '',
  applied_month  text not null default '',
  status         text not null default 'Held',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists overpayments_status_idx on public.overpayments (status);

alter table public.overpayments enable row level security;

drop policy if exists overpayments_select_admin on public.overpayments;
create policy overpayments_select_admin
on public.overpayments for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists overpayments_write_admin on public.overpayments;
create policy overpayments_write_admin
on public.overpayments for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.overpayments_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_overpayments_updated_at on public.overpayments;
create trigger trg_overpayments_updated_at
before update on public.overpayments
for each row execute function public.overpayments_set_updated_at();

-- Load RPC
create or replace function app.load_overpayments()
returns jsonb
language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            o.id,
    'tenantName',    o.tenant_name,
    'unit',          o.unit,
    'amount',        o.amount,
    'reference',     o.reference,
    'dateReceived',  o.date_received,
    'appliedMonth',  o.applied_month,
    'status',        o.status
  ) order by o.created_at desc), '[]'::jsonb)
  from public.overpayments o;
$$;
grant execute on function app.load_overpayments() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_overpayment(p_op jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_op->>'id';
begin
  if v_id is null then raise exception 'overpayment.id is required'; end if;
  insert into public.overpayments (
    id, tenant_name, unit, amount, reference,
    date_received, applied_month, status, updated_at
  ) values (
    v_id,
    coalesce(p_op->>'tenantName', ''),
    coalesce(p_op->>'unit', ''),
    coalesce(nullif(p_op->>'amount','')::numeric, 0),
    coalesce(p_op->>'reference', ''),
    coalesce(p_op->>'dateReceived', ''),
    coalesce(p_op->>'appliedMonth', ''),
    coalesce(p_op->>'status', 'Held'),
    now()
  )
  on conflict (id) do update set
    tenant_name   = excluded.tenant_name,
    unit          = excluded.unit,
    amount        = excluded.amount,
    reference     = excluded.reference,
    date_received = excluded.date_received,
    applied_month = excluded.applied_month,
    status        = excluded.status,
    updated_at    = now();
  return p_op;
end;
$$;
grant execute on function app.upsert_overpayment(jsonb) to authenticated, service_role;

create or replace function app.upsert_overpayments_bulk(p_ops jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'p_ops must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_ops)
  loop perform app.upsert_overpayment(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_overpayments_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_ops jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_overpayments_v11'
  loop
    v_ops := r.value;
    if v_ops is null or jsonb_typeof(v_ops) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_ops)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.overpayments (
          id, tenant_name, unit, amount, reference,
          date_received, applied_month, status, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'tenantName', ''),
          coalesce(v_item->>'unit', ''),
          coalesce(nullif(v_item->>'amount','')::numeric, 0),
          coalesce(v_item->>'reference', ''),
          coalesce(v_item->>'dateReceived', ''),
          coalesce(v_item->>'appliedMonth', ''),
          coalesce(v_item->>'status', 'Held'),
          now()
        )
        on conflict (id) do update set
          tenant_name   = excluded.tenant_name,
          unit          = excluded.unit,
          amount        = excluded.amount,
          reference     = excluded.reference,
          date_received = excluded.date_received,
          applied_month = excluded.applied_month,
          status        = excluded.status,
          updated_at    = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped overpayment id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Overpayments backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;

-- load_all_app_state
create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in (
        'tm_tenants_v11','tm_properties_v11','tm_landlords_v11',
        'tm_staff_v11','tm_vendors_v11','tm_external_transactions_v11',
        'tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
        'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11'
      )
    ), '{}'::jsonb
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
    'tm_invoices_v11',              app.load_invoices(),
    'tm_fines_v11',                 app.load_fine_rules(),
    'tm_overpayments_v11',          app.load_overpayments()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
