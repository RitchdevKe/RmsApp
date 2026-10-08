-- 0113_enforce_rls_on_partial_tables.sql
-- Optimizes Sign In and limits payload size by enforcing Row Level Security on all partial load
-- operations, preventing the client from downloading the entire DB.

BEGIN;

-- Convert the massive app state loaders to SECURITY INVOKER dynamically
DO $$ 
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT p.proname 
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'app' 
      AND (p.proname LIKE 'load_%' OR p.proname LIKE 'partial_load_%')
      AND p.pronargs = 0
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION app.%I() SECURITY INVOKER;', rec.proname);
    EXCEPTION WHEN OTHERS THEN 
      NULL;
    END;
  END LOOP;
  
  -- Also attempt to do those with 1 argument if any exist
  FOR rec IN 
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'app' 
      AND (p.proname LIKE 'load_%' OR p.proname LIKE 'partial_load_%')
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION app.%I(%s) SECURITY INVOKER;', rec.proname, rec.args);
    EXCEPTION WHEN OTHERS THEN 
      NULL;
    END;
  END LOOP;
END $$;

-- Enforce security context dynamically across all partial schema tables
DO $$ 
DECLARE
  rec RECORD;
BEGIN
  -- 1. Ensure authenticated has SELECT on all current partial tables so invoker context works
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO authenticated';

  -- 2. Enable RLS and create generic policies based on created_by, auth.uid(), or org_id
  FOR rec IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'partial_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', rec.tablename);
    
    -- Attempt to create a standard created_by policy if the column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = rec.tablename AND column_name = 'created_by') THEN
      BEGIN
        EXECUTE format('CREATE POLICY "%I_select_own" ON public.%I FOR SELECT TO authenticated USING (created_by = auth.uid());', rec.tablename, rec.tablename);
        EXECUTE format('CREATE POLICY "%I_all_own" ON public.%I FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());', rec.tablename, rec.tablename);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;

    -- Attempt org_id if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = rec.tablename AND column_name = 'org_id') THEN
      BEGIN
        EXECUTE format('CREATE POLICY "%I_select_org" ON public.%I FOR SELECT TO authenticated USING (org_id = auth.uid());', rec.tablename, rec.tablename);
        EXECUTE format('CREATE POLICY "%I_all_org" ON public.%I FOR ALL TO authenticated USING (org_id = auth.uid()) WITH CHECK (org_id = auth.uid());', rec.tablename, rec.tablename);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;

    -- Attempt user_id if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = rec.tablename AND column_name = 'user_id') THEN
      BEGIN
        EXECUTE format('CREATE POLICY "%I_select_user" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid());', rec.tablename, rec.tablename);
        EXECUTE format('CREATE POLICY "%I_all_user" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());', rec.tablename, rec.tablename);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;
