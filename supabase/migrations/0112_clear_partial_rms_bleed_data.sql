-- supabase/migrations/0112_clear_partial_rms_bleed_data.sql
-- Safely scrubs historical and transactional data out of the Partial RMS tables.
-- The underlying cloned configuration properties and tenants are retained, but their financial
-- and operational histories are completely wiped to prevent "bleeding" of Full RMS data into Partial Dashboards.

BEGIN;

-- 1. Reset embedded ledger tracking arrays on Partial Tenants so no old Full RMS arrears/payments show up.
UPDATE public.partial_tenants
SET payment_history = '[]'::jsonb,
    collection_history = '[]'::jsonb,
    recurring_bills = '[]'::jsonb,
    house_status = '[]'::jsonb,
    arrears = 0,
    deposit_paid = 0,
    updated_at = now();

-- 2. Wipe explicit transactional and operational Partial RMS tables
-- Leaving properties, units, and landlords intact as dimensional data
TRUNCATE TABLE 
    public.partial_tasks,                   -- Clears Tasks widget
    public.partial_invoices,                -- Clears Old Invoices
    public.partial_bills,                   -- Clears Old Bills
    public.partial_quotations,              -- Clears Quotations
    public.partial_overpayments,            -- Clears Overpayments
    public.partial_external_transactions,   -- Clears External C2B/STK records
    public.partial_audit_logs,              -- Clears past audits
    public.partial_messages,
    public.partial_notifications,
    public.partial_rf_transactions,
    public.partial_fundi_jobs,
    public.partial_leads,
    public.partial_payments,                -- The old generic payments table
    public.partial_partial_payments,
    public.partial_rms_payments,
    public.partial_landlord_applications,
    public.partial_tenant_applications,
    public.partial_offboarding_records,
    public.partial_landlord_offboarding_records
RESTART IDENTITY CASCADE;

COMMIT;
