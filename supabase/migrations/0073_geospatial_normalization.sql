-- supabase/migrations/0073_geospatial_normalization.sql
--
-- GeospatialData: deeply nested { [county]: { [subCounty]: { [location]: { [zone]: string[] } } } }
-- Stored as a single JSONB blob in a singleton row. Idempotent.

create table if not exists public.geospatial_data (
  id         text primary key default 'singleton',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint geospatial_data_singleton check (id = 'singleton')
);

alter table public.geospatial_data enable row level security;

drop policy if exists geospatial_select_admin on public.geospatial_data;
create policy geospatial_select_admin
on public.geospatial_data for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists geospatial_write_admin on public.geospatial_data;
create policy geospatial_write_admin
on public.geospatial_data for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- Load RPC — returns the JSONB object directly (not wrapped in an array)
create or replace function app.load_geospatial_data()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(g.data, '{}'::jsonb)
  from public.geospatial_data g
  where g.id = 'singleton';
$$;
grant execute on function app.load_geospatial_data() to authenticated;

-- Upsert RPC
create or replace function app.upsert_geospatial_data(p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
begin
  insert into public.geospatial_data (id, data, updated_at)
  values ('singleton', coalesce(p_data, '{}'::jsonb), now())
  on conflict (id) do update set
    data       = excluded.data,
    updated_at = now();
  return p_data;
end;
$$;
grant execute on function app.upsert_geospatial_data(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare r record;
begin
  for r in select value from app.app_state where key = 'tm_geospatial_v11'
  loop
    if r.value is null or jsonb_typeof(r.value) <> 'object' then continue; end if;
    begin
      insert into public.geospatial_data (id, data, updated_at)
      values ('singleton', r.value, now())
      on conflict (id) do update set
        data       = excluded.data,
        updated_at = now();
      raise notice 'Geospatial data backfill complete';
    exception when others then
      raise notice 'Geospatial data backfill failed: %', sqlerrm;
    end;
  end loop;
end $$;

-- load_all_app_state — final version with all blobs normalized
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
      'tm_workflows_v11','tm_automation_rules_v11','tm_escalation_rules_v11',
      'tm_scheduled_reports_v11','tm_tax_records_v11','tm_leads_v11',
      'tm_fundi_jobs_v11','tm_marketing_banners_v11',
      'tm_system_settings_v11','tm_geospatial_v11'
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
    'tm_escalation_rules_v11',          app.load_escalation_rules(),
    'tm_scheduled_reports_v11',         app.load_scheduled_reports(),
    'tm_tax_records_v11',               app.load_tax_records(),
    'tm_leads_v11',                     app.load_leads(),
    'tm_fundi_jobs_v11',                app.load_fundi_jobs(),
    'tm_marketing_banners_v11',         app.load_marketing_banners(),
    'tm_system_settings_v11',           app.load_system_settings(),
    'tm_geospatial_v11',                app.load_geospatial_data()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
