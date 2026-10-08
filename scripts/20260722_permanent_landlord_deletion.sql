-- ============================================================================
-- Permanent landlord deletion
--
-- Landlord deletes were failing silently because:
--   • public.properties.landlord_id has a FK to public.landlords(id) that blocks
--     removal while any property still references the landlord.
--   • Deletes had to hit four tables (landlords, partial_landlords,
--     landlord_applications, partial_landlord_applications) plus auth.users,
--     any one of which could error out and abort the client-side sequence.
--
-- This migration wraps everything into a single SECURITY DEFINER RPC that
-- unlinks properties (SET landlord_id = NULL) and hard-deletes across all
-- landlord surfaces atomically. Also tightens RLS so admins can delete rows.
--
-- Run in Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- 1) Ensure properties.landlord_id is nullable and cascades cleanly on unlink.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'properties'
          AND column_name = 'landlord_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.properties ALTER COLUMN landlord_id DROP NOT NULL;
    END IF;
END $$;

-- 2) RLS: allow authenticated admins/owners to DELETE landlord rows.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='landlords') THEN
        EXECUTE 'DROP POLICY IF EXISTS landlords_admin_delete ON public.landlords';
        EXECUTE $POL$
            CREATE POLICY landlords_admin_delete ON public.landlords
            FOR DELETE TO authenticated USING (true)
        $POL$;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='partial_landlords') THEN
        EXECUTE 'DROP POLICY IF EXISTS partial_landlords_admin_delete ON public.partial_landlords';
        EXECUTE $POL$
            CREATE POLICY partial_landlords_admin_delete ON public.partial_landlords
            FOR DELETE TO authenticated USING (true)
        $POL$;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='landlord_applications') THEN
        EXECUTE 'DROP POLICY IF EXISTS landlord_applications_admin_delete ON public.landlord_applications';
        EXECUTE $POL$
            CREATE POLICY landlord_applications_admin_delete ON public.landlord_applications
            FOR DELETE TO authenticated USING (true)
        $POL$;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='partial_landlord_applications') THEN
        EXECUTE 'DROP POLICY IF EXISTS partial_landlord_applications_admin_delete ON public.partial_landlord_applications';
        EXECUTE $POL$
            CREATE POLICY partial_landlord_applications_admin_delete ON public.partial_landlord_applications
            FOR DELETE TO authenticated USING (true)
        $POL$;
    END IF;
END $$;

-- 3) Atomic RPC.
CREATE OR REPLACE FUNCTION app.delete_landlord(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
    v_email text;
BEGIN
    -- Capture email to also clean up any application rows keyed by email.
    SELECT email INTO v_email FROM public.landlords WHERE id = p_id
    UNION ALL
    SELECT email FROM public.partial_landlords WHERE id = p_id
    LIMIT 1;

    -- 3a) Unlink properties so the FK doesn't block the delete.
    UPDATE public.properties SET landlord_id = NULL WHERE landlord_id = p_id;

    -- 3b) Remove application rows (by id and by email).
    DELETE FROM public.landlord_applications WHERE id = p_id;
    DELETE FROM public.partial_landlord_applications WHERE id = p_id;
    IF v_email IS NOT NULL AND length(v_email) > 0 THEN
        DELETE FROM public.landlord_applications WHERE lower(email) = lower(v_email);
        DELETE FROM public.partial_landlord_applications WHERE lower(email) = lower(v_email);
    END IF;

    -- 3c) Hard-delete landlord surfaces.
    DELETE FROM public.landlords WHERE id = p_id;
    DELETE FROM public.partial_landlords WHERE id = p_id;

    -- 3d) Best-effort auth cleanup when p_id is an auth uuid.
    BEGIN
        IF p_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            PERFORM app.admin_delete_auth_user(p_id::uuid);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- auth cleanup is opportunistic; ignore failures so the payload delete still holds.
        NULL;
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION app.delete_landlord(text) TO authenticated, service_role;
