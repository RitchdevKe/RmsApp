-- supabase/seed.sql
-- Seed a single Super Admin user for local development

-- Enable pgcrypto for password hashing (bcrypt)
create extension if not exists "pgcrypto";

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_encrypted_pw text := crypt('Admin123!', gen_salt('bf'));
begin
  -- Create user in auth.users
  -- Set token columns explicitly to empty string '' (prevents NULL scan errors in Auth queries)
  insert into auth.users (
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
  values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@taskme.local',
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"Super Admin","branch":"Headquarters"}',
    now(),
    now(),
    '',  -- confirmation_token
    '',  -- email_change
    '',  -- email_change_token_new
    ''   -- recovery_token
  )
  on conflict (id) do nothing;

  -- Corresponding identity row (required for email/password sign-in)
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_user_id,
    format('{"sub": "%s", "email": "admin@taskme.local"}', v_user_id)::jsonb,
    'email',
    v_user_id,
    now(),
    now(),
    now()
  )
  on conflict (id) do nothing;

  -- Seed matching staff profile in your app schema
  insert into app.staff_profiles (
    id,
    name,
    role,
    email,
    phone,
    branch,
    status
  )
  values (
    v_user_id,
    'Local Super Admin',
    'Super Admin',
    'admin@taskme.local',
    '0700000000',
    'Headquarters',
    'Active'
  )
  on conflict (id) do nothing;
end $$;
