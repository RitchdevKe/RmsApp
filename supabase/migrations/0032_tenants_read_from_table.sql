-- supabase/migrations/0032_tenants_read_from_table.sql
--
-- Migration Step 1: Tenants — switch read path from blob to public.tenants
--
-- Context:
--   public.tenants is already the write-side source of truth:
--     - DataContext dual-writes every setTenants() call via app.upsert_tenants_bulk
--     - 0029 backfilled all tenants from the blob into the table
--   app.load_tenants() already returns TenantProfile-shaped JSONB from the table.
--
-- Change:
--   Update load_all_app_state() to serve tm_tenants_v11 from app.load_tenants()
--   instead of from the app_state blob row. All other keys are unchanged.
--
-- The blob row for tm_tenants_v11 is excluded from the aggregation and replaced
-- with the live table data. The blob row itself is NOT deleted yet — kept as a
-- safe fallback until the write path is also migrated (next step).
--
-- Idempotent: safe to run multiple times (CREATE OR REPLACE).

create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    -- All blob keys EXCEPT tm_tenants_v11 (now served from public.tenants)
    jsonb_object_agg(key, value) filter (where key <> 'tm_tenants_v11'),
    '{}'::jsonb
  )
  -- Overlay tenants from the normalized table
  || jsonb_build_object('tm_tenants_v11', app.load_tenants())
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
