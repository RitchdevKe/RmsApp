-- supabase/migrations/0019_fix_app_state_rls.sql
--
-- Problem: "app_state_admin_only" used FOR ALL with `using (app.is_admin(auth.uid()))`.
-- This blocks SELECT for every non-Super-Admin authenticated user.
-- When their JWT expires, auth.uid() returns null, is_admin returns false,
-- and every query silently returns 0 rows instead of an error.
--
-- Fix: split into two policies:
--   1. SELECT — all authenticated users can read app_state
--   2. INSERT/UPDATE/DELETE — only Super Admins can write

-- Drop the old catch-all policy
drop policy if exists "app_state_admin_only" on app.app_state;

-- All authenticated users can read
drop policy if exists "app_state_select_authenticated" on app.app_state;
create policy "app_state_select_authenticated"
on app.app_state
for select
to authenticated
using (true);

-- Only Super Admins can write (insert / update / delete)
drop policy if exists "app_state_write_admin" on app.app_state;
create policy "app_state_write_admin"
on app.app_state
for all
to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));
