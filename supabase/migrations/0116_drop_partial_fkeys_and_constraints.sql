-- 0116_drop_partial_fkeys_and_constraints.sql
-- Forcefully removes foreign key constraints, default required columns, and NOT NULLs
-- from all partial_* tables so local UI IDs (custom UUIDs or missing auth.users links) 
-- do not prevent rows from saving to the Partial RMS backend tables.

BEGIN;

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- 1. Drop ALL foreign key constraints on ALL partial tables in public schema
    FOR r IN (
        SELECT tc.table_schema, tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema IN ('public', 'app')
          AND tc.table_name LIKE 'partial_%'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name) || ' CASCADE;';
    END LOOP;

    -- 2. Drop NOT NULL constraint on critical columns that might fail from UI local generation
    -- partial_properties
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN landlord_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN org_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN landlord_user_id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_properties ALTER COLUMN created_by DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    
    -- partial_staff_profiles
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN id DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE app.partial_staff_profiles ALTER COLUMN role DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    
    -- partial_landlords
    BEGIN ALTER TABLE public.partial_landlords ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.partial_landlords ALTER COLUMN date DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- partial_tenants
    BEGIN ALTER TABLE public.partial_tenants ALTER COLUMN email DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;

END $$;

-- Drop constraints manually if the dynamic drop didn't catch them due to case/quotes
ALTER TABLE IF EXISTS public.partial_properties
    DROP CONSTRAINT IF EXISTS partial_properties_created_by_fkey;

ALTER TABLE IF EXISTS app.partial_staff_profiles
    DROP CONSTRAINT IF EXISTS partial_staff_profiles_id_fkey;

COMMIT;
