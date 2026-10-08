-- fix-field-agent-login.sql
-- Run this in the Supabase SQL Editor as the project owner.
-- It does NOT auto-apply (lives under scripts/, not supabase/migrations/).
--
-- Use when a staff user keeps getting "Invalid login credentials" on sign-in
-- even after the admin "Set Password" flow was run from the app.
--
-- "Invalid login credentials" from Supabase Auth means one of:
--   (a) the stored encrypted_password does not match the typed password, or
--   (b) email_confirmed_at is NULL and "Confirm email" is required, or
--   (c) the user has banned_until set in the future.
--
-- The block below diagnoses and repairs all three for a single user.

-- 1. Inspect current state
select id,
       email,
       email_confirmed_at,
       banned_until,
       last_sign_in_at,
       raw_user_meta_data->>'role' as meta_role,
       created_at,
       updated_at
  from auth.users
 where email = 'zablon@task-me.ke';

-- 2. Reset password, confirm email, lift any ban — in ONE transaction.
--    Change 'TempPass#2026' to a strong temporary password and tell the
--    user to change it after they log in.
do $$
declare
  v_user_id uuid;
  v_new_pw  text := 'TempPass#2026';
begin
  select id into v_user_id
    from auth.users
   where email = 'zablon@task-me.ke'
   limit 1;

  if v_user_id is null then
    raise notice 'No auth.users row for zablon@task-me.ke — they need to sign up first.';
    return;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(v_new_pw, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         confirmed_at       = coalesce(confirmed_at, now()),
         banned_until       = null,
         updated_at         = now()
   where id = v_user_id;

  -- Ensure they have an identities row (older accounts sometimes miss this,
  -- which also surfaces as "Invalid login credentials").
  insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                               last_sign_in_at, created_at, updated_at)
  values (v_user_id, v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', 'zablon@task-me.ke'),
          'email', v_user_id, now(), now(), now())
  on conflict (provider, provider_id) do nothing;

  raise notice 'Password reset for % (id=%). Temp password: %', 'zablon@task-me.ke', v_user_id, v_new_pw;
end $$;

-- 3. Verify
select id, email, email_confirmed_at, banned_until, updated_at
  from auth.users
 where email = 'zablon@task-me.ke';