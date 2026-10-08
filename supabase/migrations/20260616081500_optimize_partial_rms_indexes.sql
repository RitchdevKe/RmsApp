-- Optimization: Create indexes on Partial RMS tables on frequently filtered and joined columns.
-- This dramatically speeds up dashboard loads, list filters, and parallelized queries.
-- Using robust conditional blocks to prevent column-not-found errors regardless of schema state.

DO $$
BEGIN
  -- partial_properties
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_properties' AND column_name='landlord_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_properties_landlord ON public.partial_properties(landlord_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_properties' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_properties_created_at ON public.partial_properties(created_at DESC);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_properties' AND column_name='app_source') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_properties_app_source ON public.partial_properties(app_source);
  END IF;

  -- partial_units
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_units' AND column_name='org_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_units_org ON public.partial_units(org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_units' AND column_name='property_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_units_property ON public.partial_units(property_id);
  END IF;

  -- partial_leases
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_leases' AND column_name='org_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_leases_org ON public.partial_leases(org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_leases' AND column_name='unit_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_leases_unit ON public.partial_leases(unit_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_leases' AND column_name='tenant_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_leases_tenant_user ON public.partial_leases(tenant_user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_leases' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_leases_status ON public.partial_leases(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_leases' AND column_name='start_date') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_leases_start_date ON public.partial_leases(start_date DESC);
  END IF;

  -- partial_partial_payments
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_partial_payments' AND column_name='org_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_partial_payments_org ON public.partial_partial_payments(org_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_partial_payments' AND column_name='lease_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_partial_payments_lease ON public.partial_partial_payments(lease_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_partial_payments' AND column_name='paid_at') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_partial_payments_paid_at ON public.partial_partial_payments(paid_at DESC);
  END IF;

  -- partial_tenants
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tenants' AND column_name='property_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tenants_property ON public.partial_tenants(property_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tenants' AND column_name='created_by') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tenants_created_by ON public.partial_tenants(created_by);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tenants' AND column_name='app_source') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tenants_app_source ON public.partial_tenants(app_source);
  END IF;

  -- partial_bills
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_bills' AND column_name='property_id') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_bills_property ON public.partial_bills(property_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_bills' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_bills_status ON public.partial_bills(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_bills' AND column_name='due_date') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_bills_due_date ON public.partial_bills(due_date);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_bills' AND column_name='app_source') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_bills_app_source ON public.partial_bills(app_source);
  END IF;

  -- partial_invoices
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_invoices' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_invoices_status ON public.partial_invoices(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_invoices' AND column_name='due_date') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_invoices_due_date ON public.partial_invoices(due_date);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_invoices' AND column_name='app_source') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_invoices_app_source ON public.partial_invoices(app_source);
  END IF;

  -- partial_tasks
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tasks' AND column_name='status') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tasks_status ON public.partial_tasks(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tasks' AND column_name='due_date') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tasks_due_date ON public.partial_tasks(due_date);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partial_tasks' AND column_name='app_source') THEN
    CREATE INDEX IF NOT EXISTS idx_partial_tasks_app_source ON public.partial_tasks(app_source);
  END IF;
END $$;

