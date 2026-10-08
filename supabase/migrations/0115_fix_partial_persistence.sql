-- 0115_fix_partial_persistence.sql
-- Fixes visibility and persistence issues for partial RMS data.
-- Removes restrictive RLS that hid data pulled from Full RMS, drops constraints that caused insert failures, and ensures columns are up to date.

BEGIN;

-- 1. Ensure all partial tables have RLS disabled or permissive for authenticated users
DO $$ 
DECLARE
  rec RECORD;
BEGIN
  -- Handle public schema partial tables
  FOR rec IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'partial_%'
  LOOP
    -- Disable RLS to allow full visibility of Partial data and pulled Full RMS data
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', rec.tablename);
    
    -- Drop existing restrictive policies created by 0113 or earlier
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "%I_select_own" ON public.%I;', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%I_all_own" ON public.%I;', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%I_select_org" ON public.%I;', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%I_all_org" ON public.%I;', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%I_select_user" ON public.%I;', rec.tablename, rec.tablename);
      EXECUTE format('DROP POLICY IF EXISTS "%I_all_user" ON public.%I;', rec.tablename, rec.tablename);
    EXCEPTION WHEN OTHERS THEN 
      NULL;
    END;

    -- Grant full access to authenticated role
    EXECUTE format('GRANT ALL ON public.%I TO authenticated, service_role;', rec.tablename);
    
    -- Relax strict foreign keys or NOT NULLs that cause silent persistence failures
    -- For Properties
    IF rec.tablename = 'partial_properties' THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.partial_properties ALTER COLUMN landlord_id DROP NOT NULL;';
            EXECUTE 'ALTER TABLE public.partial_properties ALTER COLUMN org_id DROP NOT NULL;';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- For Landlords
    IF rec.tablename = 'partial_landlords' THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.partial_landlords ALTER COLUMN email DROP NOT NULL;';
            EXECUTE 'ALTER TABLE public.partial_landlords ALTER COLUMN date DROP NOT NULL;';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- For Tenants
    IF rec.tablename = 'partial_tenants' THEN
        BEGIN
            EXECUTE 'ALTER TABLE public.partial_tenants ALTER COLUMN email DROP NOT NULL;';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

  END LOOP;
END $$;

-- 2. Modify app schema partial tables (Staff)
ALTER TABLE IF EXISTS app.partial_staff_profiles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON app.partial_staff_profiles TO authenticated, service_role;
BEGIN
    DROP POLICY IF EXISTS "partial_staff_profiles_select_own" ON app.partial_staff_profiles;
    DROP POLICY IF EXISTS "partial_staff_profiles_all_own" ON app.partial_staff_profiles;
EXCEPTION WHEN OTHERS THEN NULL; END;

-- 3. Synchronize any missing columns from Full RMS
ALTER TABLE IF EXISTS public.partial_properties 
  ADD COLUMN IF NOT EXISTS monthly_rental_income_tax_percent numeric,
  ADD COLUMN IF NOT EXISTS commercial_vat_percent numeric,
  ADD COLUMN IF NOT EXISTS agency_commission_percent numeric,
  ADD COLUMN IF NOT EXISTS app_source varchar DEFAULT 'partial';

ALTER TABLE IF EXISTS public.partial_landlords 
  ADD COLUMN IF NOT EXISTS app_source varchar DEFAULT 'partial';

ALTER TABLE IF EXISTS public.partial_tenants
  ADD COLUMN IF NOT EXISTS app_source varchar DEFAULT 'partial';

ALTER TABLE IF EXISTS public.partial_vendors
  ADD COLUMN IF NOT EXISTS app_source varchar DEFAULT 'partial';

ALTER TABLE IF EXISTS app.partial_staff_profiles
  ADD COLUMN IF NOT EXISTS app_source varchar DEFAULT 'partial';

COMMIT;
