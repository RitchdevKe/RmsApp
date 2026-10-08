-- supabase/migrations/0108_allow_staff_admin_user_management.sql
--
-- Updates user management operations (create, delete, password reset)
-- to allow Assistant Admin and other privileged staff admins to perform them.

-- 1. admin_create_auth_user
CREATE OR REPLACE FUNCTION app.admin_create_auth_user(
  p_email text,
  p_password text,
  p_role text,
  p_full_name text DEFAULT null,
  p_first_name text DEFAULT null,
  p_last_name text DEFAULT null,
  p_phone text DEFAULT null,
  p_id_number text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, auth
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_encrypted_pw text;
  v_role_id uuid;
  v_existing uuid;
BEGIN
  -- Change is_admin to is_staff_admin to authorize Assistant Admins etc.
  IF NOT app.is_staff_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT id INTO v_existing FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'User with this email already exists';
  END IF;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'::text));

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'role', coalesce(p_role, 'Tenant'),
      'full_name', coalesce(p_full_name, p_email),
      'first_name', p_first_name,
      'last_name', p_last_name,
      'phone', p_phone,
      'id_number', p_id_number
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    v_user_id,
    now(),
    now(),
    now()
  );

  SELECT id INTO v_role_id FROM app.roles WHERE name = coalesce(p_role, 'Tenant') LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO app.user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id) DO UPDATE SET role_id = excluded.role_id;
  END IF;

  IF coalesce(p_role, '') NOT IN ('Tenant', 'Landlord', 'Investor', 'Affiliate', 'Contractor') THEN
    INSERT INTO app.staff_profiles (id, name, role, email, phone, branch, status)
    VALUES (
      v_user_id,
      coalesce(p_full_name, p_email),
      coalesce(p_role, 'Staff'),
      p_email,
      coalesce(p_phone, ''),
      'Headquarters',
      'Active'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      email = excluded.email,
      phone = excluded.phone,
      updated_at = now();
  END IF;

  RETURN v_user_id;
END;
$$;


-- 2. admin_delete_auth_user
CREATE OR REPLACE FUNCTION app.admin_delete_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, auth, public
AS $$
DECLARE
  v_super_admin_count int;
BEGIN
  -- Change is_admin to is_staff_admin to authorize Assistant Admins etc.
  IF NOT app.is_staff_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Guard 2: never allow self-deletion
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  -- Guard 3: protect the last Super Admin
  SELECT count(*) INTO v_super_admin_count
  FROM app.user_roles ur
  JOIN app.roles r ON r.id = ur.role_id
  WHERE r.name = 'Super Admin';

  IF v_super_admin_count <= 1 THEN
    -- Only block if the target IS a Super Admin
    IF exists (
      SELECT 1 FROM app.user_roles ur
      JOIN app.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user_id AND r.name = 'Super Admin'
    ) THEN
      RAISE EXCEPTION 'Cannot delete the last Super Admin account';
    END IF;
  END IF;

  -- Safe to delete — cascades to user_roles, staff_profiles, profiles
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;


-- 3. admin_reset_password
CREATE OR REPLACE FUNCTION app.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, auth
AS $$
DECLARE
  v_encrypted_pw text;
BEGIN
  -- Change is_admin to is_staff_admin to authorize Assistant Admins etc.
  IF NOT app.is_staff_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'::text));

  UPDATE auth.users
     SET encrypted_password = v_encrypted_pw,
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT found THEN
    RAISE EXCEPTION 'User not found for password reset';
  END IF;
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION app.admin_create_auth_user(text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.admin_delete_auth_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.admin_reset_password(uuid, text) TO authenticated;


-- 4. public.admin_delete_auth_user wrapper
CREATE OR REPLACE FUNCTION public.admin_delete_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, auth
AS $$
  SELECT app.admin_delete_auth_user(p_user_id := p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO authenticated;

