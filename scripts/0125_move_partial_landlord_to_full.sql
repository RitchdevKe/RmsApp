-- Atomically move a landlord from the Partial RMS tables into the Full RMS
-- tables, optionally carrying their properties, tenants, bills, fines and
-- payment history. Used by the "Move to Full RMS" action on the Partial
-- Active Landlords page.
--
-- Run this once against your Supabase database before relying on the new
-- "Move to Full RMS" button in the UI.
--
-- Modes:
--   'profile'  → landlord row only (+ landlord_application if exists)
--   'full'     → landlord + properties + tenants + bills + fine rules

CREATE OR REPLACE FUNCTION app.move_partial_landlord_to_full(
    p_landlord_id text,
    p_mode        text DEFAULT 'full'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
    v_props_moved    int := 0;
    v_tenants_moved  int := 0;
    v_bills_moved    int := 0;
    v_fines_moved    int := 0;
    v_apps_moved     int := 0;
    v_summary        jsonb;
BEGIN
    IF p_landlord_id IS NULL OR p_landlord_id = '' THEN
        RAISE EXCEPTION 'landlord_id is required';
    END IF;

    -- 1. Landlord row
    INSERT INTO public.landlords
    SELECT * FROM public.partial_landlords WHERE id = p_landlord_id
    ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data,
          updated_at = now();

    BEGIN
        INSERT INTO public.landlord_applications
        SELECT * FROM public.partial_landlord_applications WHERE id = p_landlord_id
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS v_apps_moved = ROW_COUNT;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        v_apps_moved := 0;
    END;

    IF p_mode = 'full' THEN
        BEGIN
            WITH moved AS (
                INSERT INTO public.properties
                SELECT * FROM public.partial_properties
                 WHERE (data->>'landlordId') = p_landlord_id
                ON CONFLICT (id) DO UPDATE
                  SET data = EXCLUDED.data,
                      updated_at = now()
                RETURNING id
            )
            SELECT count(*) INTO v_props_moved FROM moved;
        EXCEPTION WHEN undefined_table OR undefined_column THEN
            v_props_moved := 0;
        END;

        BEGIN
            WITH landlord_prop_ids AS (
                SELECT id FROM public.partial_properties
                 WHERE (data->>'landlordId') = p_landlord_id
            ),
            moved AS (
                INSERT INTO public.tenants
                SELECT * FROM public.partial_tenants
                 WHERE (data->>'propertyId') IN (SELECT id FROM landlord_prop_ids)
                ON CONFLICT (id) DO UPDATE
                  SET data = EXCLUDED.data,
                      updated_at = now()
                RETURNING id
            )
            SELECT count(*) INTO v_tenants_moved FROM moved;
        EXCEPTION WHEN undefined_table OR undefined_column THEN
            v_tenants_moved := 0;
        END;

        BEGIN
            WITH landlord_prop_ids AS (
                SELECT id FROM public.partial_properties
                 WHERE (data->>'landlordId') = p_landlord_id
            ),
            moved AS (
                INSERT INTO public.bills
                SELECT b.* FROM public.partial_bills b
                 WHERE EXISTS (
                    SELECT 1 FROM public.partial_tenants t
                    WHERE t.id = (b.data->>'tenantId')
                      AND (t.data->>'propertyId') IN (SELECT id FROM landlord_prop_ids)
                 )
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            )
            SELECT count(*) INTO v_bills_moved FROM moved;
        EXCEPTION WHEN undefined_table OR undefined_column THEN
            v_bills_moved := 0;
        END;

        -- Wipe migrated rows from the partial tables so they don't show twice.
        BEGIN
            DELETE FROM public.partial_bills b
             WHERE EXISTS (
                SELECT 1 FROM public.partial_tenants t
                WHERE t.id = (b.data->>'tenantId')
                  AND (t.data->>'propertyId') IN (
                    SELECT id FROM public.partial_properties
                    WHERE (data->>'landlordId') = p_landlord_id
                  )
             );
        EXCEPTION WHEN undefined_table OR undefined_column THEN END;

        BEGIN
            DELETE FROM public.partial_tenants
             WHERE (data->>'propertyId') IN (
                SELECT id FROM public.partial_properties
                WHERE (data->>'landlordId') = p_landlord_id
             );
        EXCEPTION WHEN undefined_table OR undefined_column THEN END;

        BEGIN
            DELETE FROM public.partial_properties
             WHERE (data->>'landlordId') = p_landlord_id;
        EXCEPTION WHEN undefined_table OR undefined_column THEN END;
    END IF;

    BEGIN
        DELETE FROM public.partial_landlord_applications WHERE id = p_landlord_id;
    EXCEPTION WHEN undefined_table THEN END;
    DELETE FROM public.partial_landlords WHERE id = p_landlord_id;

    v_summary := jsonb_build_object(
        'landlord_id',         p_landlord_id,
        'mode',                p_mode,
        'properties_moved',    v_props_moved,
        'tenants_moved',       v_tenants_moved,
        'bills_moved',         v_bills_moved,
        'fines_moved',         v_fines_moved,
        'applications_moved',  v_apps_moved
    );

    BEGIN
        INSERT INTO public.audit_logs (id, data, created_at)
        VALUES (
            gen_random_uuid()::text,
            jsonb_build_object(
                'action',  'move_partial_landlord_to_full',
                'summary', v_summary,
                'actor',   auth.uid()
            ),
            now()
        );
    EXCEPTION WHEN undefined_table OR undefined_column THEN END;

    RETURN v_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION app.move_partial_landlord_to_full(text, text) TO authenticated, service_role;
