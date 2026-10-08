-- 0102_auth_signup_hardening.sql
-- Run in Supabase SQL Editor (matches the project pattern of 0092-0101).
--
-- Two-part hardening pass for self-registration + admin visibility.
--
-- (1) handle_new_user trigger: any exception inside the trigger aborts the
--     auth.signUp transaction and the user sees "Database error saving new
--     user" / a generic signup failure. Wrap the body so trigger failures
--     NEVER block account creation — the profile row is best-effort.
--
-- (2) public.tenants RLS had only owner-scoped policies
--     (created_by = auth.uid()). Self-registered tenant rows written by the
--     new user are invisible to admins/staff, so they never appear in the
--     Pending Approval queue. Add admin-visible policies (read + write) via
--     app.is_admin(), without removing the owner-scoped ones.
--
-- Idempotent: safe to re-run.

begin;

-- ── 1. Make handle_new_user fault-tolerant ────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, role, first_name, last_name, full_name, phone, id_number, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'role', 'Tenant'),
      coalesce(new.raw_user_meta_data->>'first_name', split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1)),
      coalesce(new.raw_user_meta_data->>'last_name', null),
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      coalesce(new.raw_user_meta_data->>'phone', null),
      coalesce(new.raw_user_meta_data->>'id_number', null),
      new.email
    )
    on conflict (id) do update set
      first_name = coalesce(excluded.first_name, profiles.first_name),
      last_name  = coalesce(excluded.last_name,  profiles.last_name),
      full_name  = coalesce(excluded.full_name,  profiles.full_name),
      role       = coalesce(excluded.role,       profiles.role),
      phone      = coalesce(excluded.phone,      profiles.phone),
      id_number  = coalesce(excluded.id_number,  profiles.id_number),
      email      = coalesce(excluded.email,      profiles.email),
      updated_at = now();
  exception when others then
    -- NEVER block auth signup on a profile insert failure.
    raise warning 'handle_new_user: profile insert failed for % (% / %)', new.id, sqlstate, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── 2. Admin visibility on public.tenants ─────────────────────────────────
drop policy if exists "tenants_select_admin" on public.tenants;
create policy "tenants_select_admin"
on public.tenants for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists "tenants_insert_admin" on public.tenants;
create policy "tenants_insert_admin"
on public.tenants for insert to authenticated
with check (app.is_admin(auth.uid()));

drop policy if exists "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin"
on public.tenants for update to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

drop policy if exists "tenants_delete_admin" on public.tenants;
create policy "tenants_delete_admin"
on public.tenants for delete to authenticated
using (app.is_admin(auth.uid()));

-- Self-registered rows need a non-null created_by so the owner can read them
-- back via tenants_select_own. Default to auth.uid() if the caller forgot.
create or replace function public.tenants_default_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.created_by is null then
    NEW.created_by := auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_tenants_default_created_by on public.tenants;
create trigger trg_tenants_default_created_by
before insert on public.tenants
for each row execute function public.tenants_default_created_by();

grant select, insert, update, delete on public.tenants to authenticated;
grant all on public.tenants to service_role;

commit;