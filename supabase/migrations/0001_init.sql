-- supabase/migrations/0001_init.sql

-- Create an application schema
create schema if not exists app;

-- Staff profiles table linked to Supabase auth.users
create table if not exists app.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  email text not null unique,
  phone text,
  branch text,
  status text default 'Active',
  created_at timestamptz default now()
);

