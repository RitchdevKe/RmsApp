-- 0117_fix_partial_persistence_and_isolate_payments.sql
-- 1. Drops inherited strict relational constraints (Foreign Keys and NOT NULLs) 
--    that block Partial RMS from saving locally-generated UI properties and users.
-- 2. Fully truncates the Partial RMS payments table to wipe out any Full RMS "bleed", 
--    creating a clean separation moving forward.

BEGIN;

-- ============================================================================
-- 1. FIX PERSISTENCE FOR PROPERTIES & USERS
-- ============================================================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Dynamically drop all inherited foreign keys on partial tier tables
    FOR r IN (
        SELECT tc.table_schema, tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema IN ('public', 'app')
          AND tc.table_name LIKE 'partial_%'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name) || ' CASCADE;';
    END LOOP;

    -- Drop NOT NULL constraints that break UI payload inserts for Properties
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN landlord_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN org_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN landlord_user_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN created_by DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN name DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Drop NOT NULL constraints that break UI payload inserts for Staff (Users)
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN role DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    
    -- Drop NOT NULL constraints for Landlords
    BEGIN ALTER TABLE public.partial_landlords ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_landlords ALTER COLUMN name DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Drop NOT NULL constraints for Tenants
    BEGIN ALTER TABLE public.partial_tenants ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    
    -- Ensure columns exist in properties to prevent missing column RPC errors
    BEGIN ALTER TABLE public.partial_properties ADD COLUMN org_id uuid; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ADD COLUMN landlord_user_id uuid; EXCEPTION WHEN OTHERS THEN NULL; END;
    
END $$;

-- Hardcoded fallback constraint drops for known keys
ALTER TABLE IF EXISTS public.partial_properties 
  DROP CONSTRAINT IF EXISTS partial_properties_created_by_fkey CASCADE,
  DROP CONSTRAINT IF EXISTS properties_org_id_fkey CASCADE;

ALTER TABLE IF EXISTS app.partial_staff_profiles 
  DROP CONSTRAINT IF EXISTS staff_profiles_id_fkey CASCADE,
  DROP CONSTRAINT IF EXISTS partial_staff_profiles_id_fkey CASCADE;


-- ============================================================================
-- 2. FIX PAYMENTS BLEEDING (ISOLATE PARTIAL PAYMENTS)
-- ============================================================================

-- Ensure the partial_rms_payments table is properly provisioned without strict user FKs
CREATE TABLE IF NOT EXISTS public.partial_rms_payments (
    LIKE public.payments INCLUDING ALL
);

-- Drop the FK to auth users/tenants if it copied over
ALTER TABLE public.partial_rms_payments 
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey CASCADE,
  DROP CONSTRAINT IF EXISTS payments_matched_tenant_id_fkey CASCADE;


-- Cleanse the partial_rms_payments ledger so NO Full RMS entries appear 
-- on Partial RMS's dashboard (Financial Health, MTD, Recent Acitivities)
TRUNCATE TABLE public.partial_rms_payments RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.partial_payments RESTART IDENTITY CASCADE;

-- If there are any stray references remaining, ensure they can flow cleanly
ALTER TABLE public.partial_rms_payments DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.partial_rms_payments TO authenticated, service_role;

COMMIT;
