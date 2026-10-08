-- supabase/migrations/0072_system_settings_normalization.sql
--
-- SystemSettings singleton: { companyName, logo, profilePic, address?,
--   phone?, shortcode?, agencyPaybill?, agencyAirtelPartnerId?,
--   softwareConstants? }
-- Single row, id = 'singleton'. Idempotent.

create table if not exists public.system_settings (
  id                      text primary key default 'singleton',
  company_name            text not null default 'TaskMe Realty',
  logo                    text,
  profile_pic             text,
  address                 text,
  phone                   text,
  shortcode               text,
  agency_paybill          text,
  agency_airtel_partner_id text,
  software_constants      jsonb not null default '{}'::jsonb,
  updated_at              timestamptz not null default now(),
  constraint system_settings_singleton check (id = 'singleton')
);

alter table public.system_settings enable row level security;

drop policy if exists system_settings_select_admin on public.system_settings;
create policy system_settings_select_admin
on public.system_settings for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists system_settings_write_admin on public.system_settings;
create policy system_settings_write_admin
on public.system_settings for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- Load RPC — returns the singleton as a JSON object (not array)
create or replace function app.load_system_settings()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_strip_nulls(jsonb_build_object(
      'companyName',             s.company_name,
      'logo',                    s.logo,
      'profilePic',              s.profile_pic,
      'address',                 s.address,
      'phone',                   s.phone,
      'shortcode',               s.shortcode,
      'agencyPaybill',           s.agency_paybill,
      'agencyAirtelPartnerId',   s.agency_airtel_partner_id,
      'softwareConstants',       case when s.software_constants = '{}'::jsonb then null else s.software_constants end
    )),
    jsonb_build_object('companyName', 'TaskMe Realty')
  )
  from public.system_settings s
  where s.id = 'singleton';
$$;
grant execute on function app.load_system_settings() to authenticated;

-- Upsert RPC — merges incoming JSON into the singleton row
create or replace function app.upsert_system_settings(p_s jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
begin
  insert into public.system_settings
    (id, company_name, logo, profile_pic, address, phone, shortcode,
     agency_paybill, agency_airtel_partner_id, software_constants, updated_at)
  values (
    'singleton',
    coalesce(p_s->>'companyName', 'TaskMe Realty'),
    p_s->>'logo',
    p_s->>'profilePic',
    p_s->>'address',
    p_s->>'phone',
    p_s->>'shortcode',
    p_s->>'agencyPaybill',
    p_s->>'agencyAirtelPartnerId',
    coalesce(p_s->'softwareConstants', '{}'::jsonb),
    now()
  )
  on conflict (id) do update set
    company_name             = coalesce(excluded.company_name, 'TaskMe Realty'),
    logo                     = excluded.logo,
    profile_pic              = excluded.profile_pic,
    address                  = excluded.address,
    phone                    = excluded.phone,
    shortcode                = excluded.shortcode,
    agency_paybill           = excluded.agency_paybill,
    agency_airtel_partner_id = excluded.agency_airtel_partner_id,
    software_constants       = excluded.software_constants,
    updated_at               = now();
  return p_s;
end;
$$;
grant execute on function app.upsert_system_settings(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare r record;
begin
  for r in select value from app.app_state where key = 'tm_system_settings_v11'
  loop
    if r.value is null or jsonb_typeof(r.value) <> 'object' then continue; end if;
    begin
      insert into public.system_settings
        (id, company_name, logo, profile_pic, address, phone, shortcode,
         agency_paybill, agency_airtel_partner_id, software_constants, updated_at)
      values (
        'singleton',
        coalesce(r.value->>'companyName', 'TaskMe Realty'),
        r.value->>'logo',
        r.value->>'profilePic',
        r.value->>'address',
        r.value->>'phone',
        r.value->>'shortcode',
        r.value->>'agencyPaybill',
        r.value->>'agencyAirtelPartnerId',
        coalesce(r.value->'softwareConstants', '{}'::jsonb),
        now()
      )
      on conflict (id) do update set
        company_name             = coalesce(excluded.company_name, 'TaskMe Realty'),
        logo                     = excluded.logo,
        profile_pic              = excluded.profile_pic,
        address                  = excluded.address,
        phone                    = excluded.phone,
        shortcode                = excluded.shortcode,
        agency_paybill           = excluded.agency_paybill,
        agency_airtel_partner_id = excluded.agency_airtel_partner_id,
        software_constants       = excluded.software_constants,
        updated_at               = now();
      raise notice 'System settings backfill complete';
    exception when others then
      raise notice 'System settings backfill failed: %', sqlerrm;
    end;
  end loop;
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
      'tm_workflows_v11','tm_automation_rules_v11','tm_escalation_rules_v11',
      'tm_scheduled_reports_v11','tm_tax_records_v11','tm_leads_v11',
      'tm_fundi_jobs_v11','tm_marketing_banners_v11','tm_system_settings_v11'
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
    'tm_system_settings_v11',           app.load_system_settings()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
