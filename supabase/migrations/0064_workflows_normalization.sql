-- supabase/migrations/0064_workflows_normalization.sql
--
-- Workflow: { id, name, trigger, steps: string[] }
-- steps stored as JSONB array. Idempotent.

create table if not exists public.workflows (
  id         text primary key,
  name       text not null default '',
  trigger    text not null default '',
  steps      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workflows enable row level security;

drop policy if exists workflows_select_admin on public.workflows;
create policy workflows_select_admin
on public.workflows for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists workflows_write_admin on public.workflows;
create policy workflows_write_admin
on public.workflows for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.workflows_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_workflows_updated_at on public.workflows;
create trigger trg_workflows_updated_at
before update on public.workflows
for each row execute function public.workflows_set_updated_at();

-- Load RPC
create or replace function app.load_workflows()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',      w.id,
    'name',    w.name,
    'trigger', w.trigger,
    'steps',   w.steps
  ) order by w.name asc), '[]'::jsonb)
  from public.workflows w;
$$;
grant execute on function app.load_workflows() to authenticated;

-- Upsert single
create or replace function app.upsert_workflow(p_w jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_w->>'id';
begin
  if v_id is null then raise exception 'workflow.id is required'; end if;
  insert into public.workflows (id, name, trigger, steps, updated_at)
  values (
    v_id,
    coalesce(p_w->>'name', ''),
    coalesce(p_w->>'trigger', ''),
    coalesce(p_w->'steps', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    name       = excluded.name,
    trigger    = excluded.trigger,
    steps      = excluded.steps,
    updated_at = now();
  return p_w;
end;
$$;
grant execute on function app.upsert_workflow(jsonb) to authenticated, service_role;

-- Bulk upsert
create or replace function app.upsert_workflows_bulk(p_workflows jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_workflows) <> 'array' then raise exception 'p_workflows must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_workflows)
  loop perform app.upsert_workflow(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_workflows_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_arr jsonb; v_item jsonb;
  v_up int := 0; v_sk int := 0;
begin
  for r in select value from app.app_state where key = 'tm_workflows_v11'
  loop
    v_arr := r.value;
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.workflows (id, name, trigger, steps, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'name', ''),
          coalesce(v_item->>'trigger', ''),
          coalesce(v_item->'steps', '[]'::jsonb),
          now()
        )
        on conflict (id) do update set
          name    = excluded.name,
          trigger = excluded.trigger,
          steps   = excluded.steps,
          updated_at = now();
        v_up := v_up + 1;
      exception when others then
        raise notice 'Skipped workflow id=% reason=%', v_item->>'id', sqlerrm;
        v_sk := v_sk + 1;
      end;
    end loop;
  end loop;
  raise notice 'Workflows backfill complete: upserted=%, skipped=%', v_up, v_sk;
end $$;

-- load_all_app_state
create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (where key not in (
      'tm_tenants_v11','tm_properties_v11','tm_landlords_v11','tm_staff_v11','tm_vendors_v11',
      'tm_external_transactions_v11','tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
      'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11','tm_quotations_v11',
      'tm_landlord_applications_v11','tm_applications_v11','tm_offboarding_v11',
      'tm_landlord_offboarding_v11','tm_commissions_v11','tm_deductions_v11',
      'tm_income_sources_v11','tm_preventive_tasks_v11','tm_funds_v11',
      'tm_investments_v11','tm_withdrawals_v11','tm_renovation_investors_v11',
      'tm_rf_transactions_v11','tm_renovation_project_bills_v11',
      'tm_messages_v11','tm_notifications_v11','tm_templates_v11','tm_workflows_v11'
    )), '{}'::jsonb
  )
  || jsonb_build_object(
    'tm_tenants_v11',                   app.load_tenants(),
    'tm_properties_v11',                app.load_properties(),
    'tm_landlords_v11',                 app.load_landlords(),
    'tm_staff_v11',                     app.load_staff(),
    'tm_vendors_v11',                   app.load_vendors(),
    'tm_external_transactions_v11',     app.load_external_transactions(),
    'tm_audit_logs_v11',                app.load_audit_logs(),
    'tm_tasks_v11',                     app.load_tasks(),
    'tm_bills_v11',                     app.load_bills(),
    'tm_invoices_v11',                  app.load_invoices(),
    'tm_fines_v11',                     app.load_fine_rules(),
    'tm_overpayments_v11',              app.load_overpayments(),
    'tm_quotations_v11',                app.load_quotations(),
    'tm_landlord_applications_v11',     app.load_landlord_applications(),
    'tm_applications_v11',              app.load_tenant_applications(),
    'tm_offboarding_v11',               app.load_offboarding_records(),
    'tm_landlord_offboarding_v11',      app.load_landlord_offboarding_records(),
    'tm_commissions_v11',               app.load_commission_rules(),
    'tm_deductions_v11',                app.load_deduction_rules(),
    'tm_income_sources_v11',            app.load_income_sources(),
    'tm_preventive_tasks_v11',          app.load_preventive_tasks(),
    'tm_funds_v11',                     app.load_funds(),
    'tm_investments_v11',               app.load_investments(),
    'tm_withdrawals_v11',               app.load_withdrawal_requests(),
    'tm_renovation_investors_v11',      app.load_renovation_investors(),
    'tm_rf_transactions_v11',           app.load_rf_transactions(),
    'tm_renovation_project_bills_v11',  app.load_renovation_project_bills(),
    'tm_messages_v11',                  app.load_messages(),
    'tm_notifications_v11',             app.load_notifications(),
    'tm_templates_v11',                 app.load_communication_templates(),
    'tm_workflows_v11',                 app.load_workflows()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
