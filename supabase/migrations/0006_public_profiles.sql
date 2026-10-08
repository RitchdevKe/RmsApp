-- supabase/migrations/0006_public_profiles.sql
-- Profiles table for standardized name display (first_name, full_name, etc.)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  id_number text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can read only their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

-- Users can update only their own profile
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Allow insert for own row (trigger will do this, but service role / trigger runs as definer)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

-- Trigger to set updated_at
create or replace function public.profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.profiles_set_updated_at();

-- Handle new user: create profile row from auth.users metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
    last_name = coalesce(excluded.last_name, profiles.last_name),
    full_name = coalesce(excluded.full_name, profiles.full_name),
    role = coalesce(excluded.role, profiles.role),
    phone = coalesce(excluded.phone, profiles.phone),
    id_number = coalesce(excluded.id_number, profiles.id_number),
    email = coalesce(excluded.email, profiles.email),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
