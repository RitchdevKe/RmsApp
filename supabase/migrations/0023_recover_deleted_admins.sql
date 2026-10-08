-- supabase/migrations/0023_recover_deleted_admins.sql
--
-- EMERGENCY RECOVERY: Re-create auth users that were accidentally deleted
-- by the login-side cleanup code calling admin_delete_auth_user on themselves.
--
-- Root cause: handleLogin in Auth.tsx called deleteLandlord/deleteTenant/etc.
-- with the logged-in admin's own UUID. Those functions (after the 0022 migration)
-- called admin_delete_auth_user, which deleted the admin from auth.users.
--
-- HOW TO USE:
-- 1. Run STEP 1 below in Supabase SQL Editor to create the recovery function.
-- 2. For each deleted admin, run STEP 2 with their email and new password.
-- 3. After recovery, tell the admin to log in and immediately change their password.
-- 4. Run STEP 3 to drop the temporary recovery function.
--
-- This function has NO is_admin check — it is only safe to run from the SQL Editor
-- (service-role context). Drop it immediately after use (STEP 3).

-- ─── STEP 1: Create temporary recovery function ───────────────────────────────
create or replace function app.recover_admin_user(
  p_email    text,
  p_password text,
  p_name     text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, auth, public
as $$
declare
  v_user_id       uuid := gen_random_uuid();
  v_encrypted_pw  text;
  v_role_id       uuid;
  v_existing      uuid;
begin
  -- Check if the user already exists (perhaps partially recovered)
  select id into v_existing from auth.users where email = p_email limit 1;
  if v_existing is not null then
    raise notice 'User % already exists with id %. Skipping insert.', p_email, v_existing;
    v_user_id := v_existing;
  else
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p_email,
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object(
        'role',      'Super Admin',
        'full_name', coalesce(p_name, split_part(p_email, '@', 1))
      ),
      now(), now(), '', '', '', ''
    );

    -- Ensure auth.identities row exists (required for email/password login)
    insert into auth.identities (
      id, user_id, provider_id, provider,
      identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      p_email,
      'email',
      jsonb_build_object('sub', v_user_id::text, 'email', p_email),
      now(), now(), now()
    ) on conflict do nothing;
  end if;

  -- Ensure the Super Admin role is assigned
  select id into v_role_id from app.roles where name = 'Super Admin' limit 1;
  if v_role_id is not null then
    insert into app.user_roles (user_id, role_id)
    values (v_user_id, v_role_id)
    on conflict (user_id, role_id) do nothing;
  end if;

  -- Ensure staff_profiles row exists
  insert into app.staff_profiles (id, name, role, email, status)
  values (
    v_user_id,
    coalesce(p_name, split_part(p_email, '@', 1)),
    'Super Admin',
    p_email,
    'Active'
  )
  on conflict (id) do update
    set name   = excluded.name,
        role   = excluded.role,
        email  = excluded.email,
        status = excluded.status;

  raise notice 'Recovered admin: % (id: %)', p_email, v_user_id;
  return v_user_id;
end;
$$;

-- ─── STEP 2: Recover each deleted admin (run once per account) ────────────────
-- Replace the email, password, and name with the real values.
-- Example:
--   select app.recover_admin_user('jose.mfavour@gmail.com', 'NewPassword123!', 'Jose Favour');
--   select app.recover_admin_user('admin@task-me.ke', 'NewPassword123!', 'Admin Name');

-- ─── STEP 3: Drop the function when done (SECURITY — run immediately after) ───
-- drop function if exists app.recover_admin_user(text, text, text);
