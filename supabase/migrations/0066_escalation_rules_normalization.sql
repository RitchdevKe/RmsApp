-- supabase/migrations/0066_escalation_rules_normalization.sql
--
-- EscalationRule: { id, condition, action, assignedTo? }
-- Idempotent.

create table if not exists public.escalation_rules (
  id          text primary key,
  condition   text not null default '',
  action      text not null default '',
  assigned_to text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.escalation_rules enable row level security;

drop policy if exists escalation_rules_select_admin on public.escalation_rules;
create policy escalation_rules_select_admin
on public.escalation_rules for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists escalation_rules_write_admin on public.escalation_rules;
create policy escalation_rules_write_admin
on public.escalation_rules for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.escalation_rules_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_escalation_rules_updated_at on public.escalation_rules;
create trigger trg_escalation_rules_updated_at
before update on public.escalation_rules
for each row execute function public.escalation_rules_set_updated_at();

-- Load RPC
create or replace function app.load_escalation_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',         e.id,
    'condition',  e.condition,
    'action',     e.action,
    'assignedTo', e.assigned_to
  )) order by e.created_at asc), '[]'::jsonb)
  from public.escalation_rules e;
$$;
grant execute on function app.load_escalation_rules() to authenticated;

-- Upsert single
create or replace function app.upsert_escalation_rule(p_e jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_e->>'id';
begin
  if v_id is null then raise exception 'escalation_rule.id is required'; end if;
  insert into public.escalation_rules (id, condition, action, assigned_to, updated_at)
  values (
    v_id,
    coalesce(p_e->>'condition', ''),
    coalesce(p_e->>'action', ''),
    p_e->>'assignedTo',
    now()
  )
  on conflict (id) do update set
    condition   = excluded.condition,
    action      = excluded.action,
    assigned_to = excluded.assigned_to,
    updated_at  = now();
  return p_e;
end;
$$;
grant execute on function app.upsert_escalation_rule(jsonb) to authenticated, service_role;

-- Bulk upsert
create or replace function app.upsert_escalation_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.upsert_escalation_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_escalation_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_arr jsonb; v_item jsonb;
  v_up int := 0; v_sk int := 0;
begin
  for r in select value from app.app_state where key = 'tm_escalation_rules_v11'
  loop
    v_arr := r.value;
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.escalation_rules (id, condition, action, assigned_to, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'condition', ''),
          coalesce(v_item->>'action', ''),
          v_item->>'assignedTo',
          now()
        )
        on conflict (id) do update set
          condition   = excluded.condition,
          action      = excluded.action,
          assigned_to = excluded.assigned_to,
          updated_at  = now();
        v_up := v_up + 1;
      exception when others then
        raise notice 'Skipped escalation_rule id=% reason=%', v_item->>'id', sqlerrm;
        v_sk := v_sk + 1;
      end;
    end loop;
  end loop;
  raise notice 'Escalation rules backfill complete: upserted=%, skipped=%', v_up, v_sk;
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
      'tm_messages_v11','tm_notifications_v11','tm_templates_v11',
      'tm_workflows_v11','tm_automation_rules_v11','tm_escalation_rules_v11'
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
    'tm_workflows_v11',                 app.load_workflows(),
    'tm_automation_rules_v11',          app.load_automation_rules(),
    'tm_escalation_rules_v11',          app.load_escalation_rules()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
