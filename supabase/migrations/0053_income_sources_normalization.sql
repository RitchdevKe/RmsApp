-- supabase/migrations/0053_income_sources_normalization.sql
--
-- IncomeSource: { id, name, type } — simplest type.
-- Idempotent.

create table if not exists public.income_sources (
  id         text primary key,
  name       text not null default '',
  type       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.income_sources enable row level security;

drop policy if exists income_sources_select_admin on public.income_sources;
create policy income_sources_select_admin
on public.income_sources for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists income_sources_write_admin on public.income_sources;
create policy income_sources_write_admin
on public.income_sources for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.income_sources_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_income_sources_updated_at on public.income_sources;
create trigger trg_income_sources_updated_at
before update on public.income_sources
for each row execute function public.income_sources_set_updated_at();

-- Load RPC
create or replace function app.load_income_sources()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',   s.id,
    'name', s.name,
    'type', s.type
  ) order by s.created_at asc), '[]'::jsonb)
  from public.income_sources s;
$$;
grant execute on function app.load_income_sources() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_income_source(p_s jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_s->>'id';
begin
  if v_id is null then raise exception 'income_source.id is required'; end if;
  insert into public.income_sources (id, name, type, updated_at)
  values (
    v_id,
    coalesce(p_s->>'name', ''),
    coalesce(p_s->>'type', ''),
    now()
  )
  on conflict (id) do update set
    name = excluded.name, type = excluded.type, updated_at = now();
  return p_s;
end;
$$;
grant execute on function app.upsert_income_source(jsonb) to authenticated, service_role;

create or replace function app.upsert_income_sources_bulk(p_sources jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_sources) <> 'array' then raise exception 'p_sources must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_sources)
  loop perform app.upsert_income_source(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_income_sources_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_sources jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_income_sources_v11'
  loop
    v_sources := r.value;
    if v_sources is null or jsonb_typeof(v_sources) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_sources)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.income_sources (id, name, type, updated_at)
        values (v_item->>'id', coalesce(v_item->>'name',''), coalesce(v_item->>'type',''), now())
        on conflict (id) do update set
          name = excluded.name, type = excluded.type, updated_at = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped income_source id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Income sources backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11',
        'tm_quotations_v11','tm_landlord_applications_v11',
        'tm_applications_v11','tm_offboarding_v11',
        'tm_landlord_offboarding_v11','tm_commissions_v11',
        'tm_deductions_v11','tm_income_sources_v11'
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
    'tm_overpayments_v11',          app.load_overpayments(),
    'tm_quotations_v11',            app.load_quotations(),
    'tm_landlord_applications_v11', app.load_landlord_applications(),
    'tm_applications_v11',          app.load_tenant_applications(),
    'tm_offboarding_v11',           app.load_offboarding_records(),
    'tm_landlord_offboarding_v11',  app.load_landlord_offboarding_records(),
    'tm_commissions_v11',           app.load_commission_rules(),
    'tm_deductions_v11',            app.load_deduction_rules(),
    'tm_income_sources_v11',        app.load_income_sources()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
