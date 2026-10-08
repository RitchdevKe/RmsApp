-- supabase/migrations/0009_admin_create_auth_user.sql
-- Allow Super Admin to create Auth users from the app (RPC).
-- This enables "Registration -> User Management" to create a user who can actually log in.

create extension if not exists "pgcrypto";

create or replace function app.admin_create_auth_user(
  p_email text,
  p_password text,
  p_role text,
  p_full_name text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_id_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_encrypted_pw text;
  v_role_id uuid;
  v_existing uuid;
begin
  if not app.is_admin(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select id into v_existing from auth.users where email = p_email limit 1;
  if v_existing is not null then
    raise exception 'User with this email already exists';
  end if;

  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

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
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    v_user_id,
    now(),
    now(),
    now()
  );

  -- Assign role in app.user_roles if the role exists
  select id into v_role_id from app.roles where name = coalesce(p_role, 'Tenant') limit 1;
  if v_role_id is not null then
    insert into app.user_roles (user_id, role_id)
    values (v_user_id, v_role_id)
    on conflict (user_id) do update set role_id = excluded.role_id;
  end if;

  -- Seed staff profile for staff roles (keeps existing app behavior that reads staff_profiles for non-tenant/caretaker)
  if coalesce(p_role, '') not in ('Tenant', 'Landlord', 'Investor', 'Affiliate', 'Contractor') then
    insert into app.staff_profiles (id, name, role, email, phone, branch, status)
    values (
      v_user_id,
      coalesce(p_full_name, p_email),
      coalesce(p_role, 'Staff'),
      p_email,
      coalesce(p_phone, ''),
      'Headquarters',
      'Active'
    )
    on conflict (id) do update set
      name = excluded.name,
      role = excluded.role,
      email = excluded.email,
      phone = excluded.phone,
      updated_at = now();
  end if;

  return v_user_id;
end;
$$;

