-- Grant Super Admin role to jose.mfavour@gmail.com
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Step 1: Grant Super Admin to jose.mfavour@gmail.com (if user exists)
DO $$
DECLARE
  v_user_id uuid;
  v_role_id uuid;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'jose.mfavour@gmail.com' LIMIT 1;
  -- Find Super Admin role
  SELECT id INTO v_role_id FROM app.roles WHERE name = 'Super Admin' LIMIT 1;

  IF v_user_id IS NOT NULL AND v_role_id IS NOT NULL THEN
    INSERT INTO app.user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;
    RAISE NOTICE 'Super Admin role granted to jose.mfavour@gmail.com (user_id: %)', v_user_id;
  ELSE
    IF v_user_id IS NULL THEN
      RAISE NOTICE 'User jose.mfavour@gmail.com not found. Ensure they have signed up first.';
    END IF;
    IF v_role_id IS NULL THEN
      RAISE NOTICE 'Super Admin role not found in app.roles. Run migrations first.';
    END IF;
  END IF;
END $$;
