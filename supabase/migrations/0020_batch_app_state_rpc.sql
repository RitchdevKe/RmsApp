-- supabase/migrations/0020_batch_app_state_rpc.sql
--
-- Performance: Replace 38+ individual app_state queries with a single RPC
-- that returns all keys at once as a JSON object.
--
-- The client calls app.load_all_app_state() once on startup and populates
-- all individual React Query caches from the result, reducing initial load
-- from ~38 network round-trips to 1.

create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from app.app_state;
$$;

-- Allow all authenticated users to call this function.
-- Write access is still gated by the app_state_write_admin RLS policy.
grant execute on function app.load_all_app_state() to authenticated;
