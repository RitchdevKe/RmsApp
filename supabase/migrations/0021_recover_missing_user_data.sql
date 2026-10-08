-- Recovery script: populate app.app_state from auth.users + app.user_roles
--
-- Root cause: when a Supabase JWT expires during a registration session, the
-- auth user is created successfully (service-level call) but the app_state
-- upsert silently fails (user JWT rejected by RLS). Result: user exists in
-- auth.users with a role assignment but has no profile record in app.app_state.
--
-- This script reads auth.users + app.user_roles and inserts the missing records
-- into the correct app_state keys. Existing records are KEPT (not overwritten).
-- Names fall back to the email prefix if no metadata name is available.
-- Users can update their full details through the app UI after recovery.

DO $$
DECLARE
  v_existing_landlords  jsonb;
  v_existing_investors  jsonb;
  v_existing_vendors    jsonb;
  v_new_landlords       jsonb;
  v_new_investors       jsonb;
  v_new_vendors         jsonb;
BEGIN

  -- ── Load existing data from app_state ───────────────────────────────────
  SELECT COALESCE(value, '[]'::jsonb)
    INTO v_existing_landlords
    FROM app.app_state WHERE key = 'tm_landlords_v11';
  v_existing_landlords := COALESCE(v_existing_landlords, '[]'::jsonb);

  SELECT COALESCE(value, '[]'::jsonb)
    INTO v_existing_investors
    FROM app.app_state WHERE key = 'tm_renovation_investors_v11';
  v_existing_investors := COALESCE(v_existing_investors, '[]'::jsonb);

  SELECT COALESCE(value, '[]'::jsonb)
    INTO v_existing_vendors
    FROM app.app_state WHERE key = 'tm_vendors_v11';
  v_existing_vendors := COALESCE(v_existing_vendors, '[]'::jsonb);

  -- ── Landlords + Affiliates → tm_landlords_v11 ──────────────────────────
  -- Only users whose ID is not already in app_state are added.
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           au.id::text,
      'name',         COALESCE(
                        NULLIF(p.full_name, ''),
                        NULLIF(p.first_name || ' ' || p.last_name, ' '),
                        NULLIF(au.raw_user_meta_data->>'full_name', ''),
                        NULLIF(au.raw_user_meta_data->>'name', ''),
                        initcap(split_part(au.email, '@', 1))
                      ),
      'username',     split_part(au.email, '@', 1),
      'email',        au.email,
      'phone',        COALESCE(NULLIF(p.phone, ''), NULLIF(au.raw_user_meta_data->>'phone', ''), ''),
      'idNumber',     COALESCE(NULLIF(p.id_number, ''), ''),
      'role',         r.name,
      'status',       'Active',
      'passwordHash', '',
      'branch',       'Headquarters'
    )
  )
  INTO v_new_landlords
  FROM auth.users au
  JOIN app.user_roles ur ON ur.user_id = au.id
  JOIN app.roles r ON r.id = ur.role_id
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE r.name IN ('Landlord', 'Affiliate')
    -- Skip IDs already present in the existing array
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_existing_landlords) existing
      WHERE (existing->>'id') = au.id::text
    );

  -- ── Investors → tm_renovation_investors_v11 ────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           au.id::text,
      'name',         COALESCE(
                        NULLIF(p.full_name, ''),
                        NULLIF(p.first_name || ' ' || p.last_name, ' '),
                        NULLIF(au.raw_user_meta_data->>'full_name', ''),
                        NULLIF(au.raw_user_meta_data->>'name', ''),
                        initcap(split_part(au.email, '@', 1))
                      ),
      'username',     split_part(au.email, '@', 1),
      'email',        au.email,
      'phone',        COALESCE(NULLIF(p.phone, ''), NULLIF(au.raw_user_meta_data->>'phone', ''), ''),
      'idNumber',     COALESCE(NULLIF(p.id_number, ''), ''),
      'status',       'Active',
      'joinDate',     to_char(au.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'investorType', 'Individual'
    )
  )
  INTO v_new_investors
  FROM auth.users au
  JOIN app.user_roles ur ON ur.user_id = au.id
  JOIN app.roles r ON r.id = ur.role_id
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE r.name = 'Investor'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_existing_investors) existing
      WHERE (existing->>'id') = au.id::text
    );

  -- ── Contractors → tm_vendors_v11 ───────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',        au.id::text,
      'name',      COALESCE(
                     NULLIF(p.full_name, ''),
                     NULLIF(p.first_name || ' ' || p.last_name, ' '),
                     NULLIF(au.raw_user_meta_data->>'full_name', ''),
                     NULLIF(au.raw_user_meta_data->>'name', ''),
                     initcap(split_part(au.email, '@', 1))
                   ),
      'username',  split_part(au.email, '@', 1),
      'email',     au.email,
      'phone',     COALESCE(NULLIF(p.phone, ''), NULLIF(au.raw_user_meta_data->>'phone', ''), ''),
      'specialty', 'General',
      'rating',    0,
      'verified',  false,
      'available', true
    )
  )
  INTO v_new_vendors
  FROM auth.users au
  JOIN app.user_roles ur ON ur.user_id = au.id
  JOIN app.roles r ON r.id = ur.role_id
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE r.name = 'Contractor'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_existing_vendors) existing
      WHERE (existing->>'id') = au.id::text
    );

  -- ── Write back to app_state ─────────────────────────────────────────────
  IF v_new_landlords IS NOT NULL THEN
    INSERT INTO app.app_state (key, value)
      VALUES ('tm_landlords_v11', v_existing_landlords || v_new_landlords)
      ON CONFLICT (key) DO UPDATE SET value = v_existing_landlords || v_new_landlords;
    RAISE NOTICE 'Landlords/Affiliates recovered: %', jsonb_array_length(v_new_landlords);
  ELSE
    RAISE NOTICE 'Landlords/Affiliates: 0 new records (all already present or none in auth)';
  END IF;

  IF v_new_investors IS NOT NULL THEN
    INSERT INTO app.app_state (key, value)
      VALUES ('tm_renovation_investors_v11', v_existing_investors || v_new_investors)
      ON CONFLICT (key) DO UPDATE SET value = v_existing_investors || v_new_investors;
    RAISE NOTICE 'Investors recovered: %', jsonb_array_length(v_new_investors);
  ELSE
    RAISE NOTICE 'Investors: 0 new records (all already present or none in auth)';
  END IF;

  IF v_new_vendors IS NOT NULL THEN
    INSERT INTO app.app_state (key, value)
      VALUES ('tm_vendors_v11', v_existing_vendors || v_new_vendors)
      ON CONFLICT (key) DO UPDATE SET value = v_existing_vendors || v_new_vendors;
    RAISE NOTICE 'Contractors recovered: %', jsonb_array_length(v_new_vendors);
  ELSE
    RAISE NOTICE 'Contractors: 0 new records (all already present or none in auth)';
  END IF;

END $$;
