-- supabase/migrations/0024_harden_admin_delete_auth_user.sql
--
-- Hardens admin_delete_auth_user with two permanent safety guards:
--
--   1. SELF-DELETION BLOCK: An admin can never delete their own account.
--      This is the root cause of the "admins deleted at login" incident —
--      app code accidentally called this RPC with the logged-in user's own UUID.
--      The database now rejects that unconditionally, regardless of app code.
--
--   2. LAST SUPER ADMIN BLOCK: If the target is the only remaining Super Admin,
--      deletion is rejected. Prevents locking out the entire system.

create or replace function app.admin_delete_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app, auth, public
as $$
declare
  v_super_admin_count int;
begin
  -- Guard 1: admin-only
  if not app.is_admin(auth.uid()) then
    raise exception 'Unauthorized: admin role required';
  end if;

  -- Guard 2: never allow self-deletion
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  -- Guard 3: protect the last Super Admin
  select count(*) into v_super_admin_count
  from app.user_roles ur
  join app.roles r on r.id = ur.role_id
  where r.name = 'Super Admin';

  if v_super_admin_count <= 1 then
    -- Only block if the target IS a Super Admin
    if exists (
      select 1 from app.user_roles ur
      join app.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id and r.name = 'Super Admin'
    ) then
      raise exception 'Cannot delete the last Super Admin account';
    end if;
  end if;

  -- Safe to delete — cascades to user_roles, staff_profiles, profiles
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function app.admin_delete_auth_user(uuid) to authenticated;
