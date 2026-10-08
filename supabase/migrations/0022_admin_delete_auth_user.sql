-- supabase/migrations/0022_admin_delete_auth_user.sql
--
-- RPC: admin_delete_auth_user(p_user_id uuid)
--
-- Deletes a user entirely from the system:
--   1. Removes the auth.users record (Supabase identity, sessions, MFA)
--   2. All related rows cascade-delete automatically via FK ON DELETE CASCADE:
--        app.user_roles, app.staff_profiles, public.profiles,
--        auth.identities, auth.sessions, auth.mfa_factors
--
-- The app_state JSONB entries (tm_staff_v11, tm_landlords_v11, etc.) are
-- filtered out client-side before this RPC is called.
--
-- Only Super Admins / admins may invoke this function.

create or replace function app.admin_delete_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  -- Enforce admin-only access.
  if not app.is_admin(auth.uid()) then
    raise exception 'Unauthorized: admin role required';
  end if;

  -- Deleting from auth.users cascades to:
  --   auth.identities, auth.sessions, auth.mfa_factors
  --   app.user_roles       (references auth.users ON DELETE CASCADE)
  --   app.staff_profiles   (references auth.users ON DELETE CASCADE)
  --   public.profiles      (references auth.users ON DELETE CASCADE)
  delete from auth.users where id = p_user_id;
end;
$$;

-- Allow any authenticated user to call this function.
-- The function body enforces admin-only access internally.
grant execute on function app.admin_delete_auth_user(uuid) to authenticated;
