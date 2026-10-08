-- supabase/migrations/0054_preventive_tasks_normalization.sql
--
-- PreventiveTask: { id, title, asset, frequency, nextDueDate }
-- Idempotent.

create table if not exists public.preventive_tasks (
  id            text primary key,
  title         text not null default '',
  asset         text not null default '',
  frequency     text not null default 'Monthly',
  next_due_date text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists preventive_tasks_due_idx on public.preventive_tasks (next_due_date);

alter table public.preventive_tasks enable row level security;

drop policy if exists preventive_tasks_select_authenticated on public.preventive_tasks;
create policy preventive_tasks_select_authenticated
on public.preventive_tasks for select to authenticated using (true);

drop policy if exists preventive_tasks_write_admin on public.preventive_tasks;
create policy preventive_tasks_write_admin
on public.preventive_tasks for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.preventive_tasks_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_preventive_tasks_updated_at on public.preventive_tasks;
create trigger trg_preventive_tasks_updated_at
before update on public.preventive_tasks
for each row execute function public.preventive_tasks_set_updated_at();

-- Load RPC
create or replace function app.load_preventive_tasks()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          t.id,
    'title',       t.title,
    'asset',       t.asset,
    'frequency',   t.frequency,
    'nextDueDate', t.next_due_date
  ) order by t.next_due_date asc), '[]'::jsonb)
  from public.preventive_tasks t;
$$;
grant execute on function app.load_preventive_tasks() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_preventive_task(p_t jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'preventive_task.id is required'; end if;
  insert into public.preventive_tasks (id, title, asset, frequency, next_due_date, updated_at)
  values (
    v_id,
    coalesce(p_t->>'title', ''),
    coalesce(p_t->>'asset', ''),
    coalesce(p_t->>'frequency', 'Monthly'),
    coalesce(p_t->>'nextDueDate', ''),
    now()
  )
  on conflict (id) do update set
    title         = excluded.title,
    asset         = excluded.asset,
    frequency     = excluded.frequency,
    next_due_date = excluded.next_due_date,
    updated_at    = now();
  return p_t;
end;
$$;
grant execute on function app.upsert_preventive_task(jsonb) to authenticated, service_role;

create or replace function app.upsert_preventive_tasks_bulk(p_tasks jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_tasks) <> 'array' then raise exception 'p_tasks must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_tasks)
  loop perform app.upsert_preventive_task(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_preventive_tasks_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_tasks jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_preventive_tasks_v11'
  loop
    v_tasks := r.value;
    if v_tasks is null or jsonb_typeof(v_tasks) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_tasks)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.preventive_tasks (id, title, asset, frequency, next_due_date, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'title', ''),
          coalesce(v_item->>'asset', ''),
          coalesce(v_item->>'frequency', 'Monthly'),
          coalesce(v_item->>'nextDueDate', ''),
          now()
        )
        on conflict (id) do update set
          title         = excluded.title,
          asset         = excluded.asset,
          frequency     = excluded.frequency,
          next_due_date = excluded.next_due_date,
          updated_at    = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped preventive_task id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Preventive tasks backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_deductions_v11','tm_income_sources_v11',
        'tm_preventive_tasks_v11'
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
    'tm_income_sources_v11',        app.load_income_sources(),
    'tm_preventive_tasks_v11',      app.load_preventive_tasks()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
