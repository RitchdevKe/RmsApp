-- Fix: "cannot insert a non-DEFAULT value into column 'full_name'" when creating users
-- via admin_create_auth_user (trigger public.handle_new_user inserts into public.profiles).
--
-- Some projects (or Supabase UI/schema drift) define public.profiles.full_name as
-- GENERATED ALWAYS ... STORED. Inserts must omit that column or use DEFAULT only.
-- This migration replaces a generated full_name with a normal nullable text column
-- so auth signup and the handle_new_user trigger can set names explicitly.

do $migration$
begin
  -- GENERATED columns report is_generated = 'ALWAYS' in information_schema (PG12+).
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
      and is_generated = 'ALWAYS'
  ) then
    alter table public.profiles drop column full_name;
    alter table public.profiles add column full_name text;

    update public.profiles p
    set full_name = coalesce(
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.email
    )
    where p.full_name is null;
  end if;
end;
$migration$;
