-- supabase/migrations/0076_drop_app_state.sql
--
-- Phase 1: Rewrite load_all_app_state() to read exclusively from normalized tables.
--          No more FROM app.app_state — every key is served by its own load RPC.
--
-- Phase 2: Drop the app.app_state table. All data is in normalized tables.
--          All blob writes were disabled in DataContext.tsx (PR: stop blob writes).
--          The client-side fallback queryFn was updated to call individual load RPCs
--          (PR: drop app_state) before this migration is pushed.

-- ── 1. Replace load_all_app_state() — no longer reads from app.app_state ──────
create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select jsonb_build_object(
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
    'tm_applications_v11',             app.load_tenant_applications(),
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
    'tm_geospatial_v11',                app.load_geospatial_data(),
    'tm_listings_v11',                  '[]'::jsonb
  );
$$;

grant execute on function app.load_all_app_state() to authenticated;

-- ── 2. Drop the app.app_state table ─────────────────────────────────────────
-- CASCADE drops dependent objects (RLS policies, triggers, indexes).
-- No other permanent functions reference this table after step 1 above.
drop table if exists app.app_state cascade;
