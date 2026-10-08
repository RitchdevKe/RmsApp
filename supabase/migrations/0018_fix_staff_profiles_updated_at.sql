-- Fix: ensure app.staff_profiles has updated_at (required by admin_create_auth_user upsert).

-- This repo's admin_create_auth_user functions do:
--   on conflict (id) do update set ... updated_at = now();
-- but 0001_init.sql originally created only created_at.

create schema if not exists app;

create table if not exists app.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  email text not null unique,
  phone text,
  branch text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'staff_profiles'
      and column_name = 'updated_at'
  ) then
    alter table app.staff_profiles
      add column updated_at timestamptz not null default now();
  end if;
end;
$$;

-- Trigger to keep updated_at fresh
create or replace function app.staff_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_staff_profiles_set_updated_at on app.staff_profiles;
create trigger trg_staff_profiles_set_updated_at
before update on app.staff_profiles
for each row execute function app.staff_profiles_set_updated_at();

-- Keep RLS consistent if it was toggled off
alter table app.staff_profiles enable row level security;

-- Keep existing admin-only policy (recreate safely)
drop policy if exists "staff_profiles_admin_only" on app.staff_profiles;
create policy "staff_profiles_admin_only"
on app.staff_profiles
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

