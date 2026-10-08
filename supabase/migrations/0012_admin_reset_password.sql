-- 0012_admin_reset_password.sql
-- Admin-only helper to reset Supabase auth passwords for any user.
-- Used by the backoffice "Set Pwd" flows so that manual password changes
-- actually update auth.users (and thus affect real login).

create or replace function app.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_encrypted_pw text;
begin
  if not app.is_admin(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  -- Reuse same hashing scheme as admin_create_auth_user
  v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'::text));

  update auth.users
     set encrypted_password = v_encrypted_pw,
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'User not found for password reset';
  end if;
end;
$$;

create or replace function public.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language sql
security definer
set search_path = public, app, auth
as $$
  select app.admin_reset_password(
    p_user_id := p_user_id,
    p_new_password := p_new_password
  );
$$;

grant execute on function public.admin_reset_password(uuid, text) to authenticated;

