-- supabase/migrations/0034_investigate_tenant_counts.sql
-- Diagnostic only — no schema changes. Outputs tenant/record counts via NOTICE.

do $$
declare
  v_tenants_blob      int;
  v_tenants_table     int;
  v_offboarding       int;
  v_applications      int;
  v_landlord_offboard int;
  v_status_counts     text;
begin
  -- Blob counts
  select coalesce(jsonb_array_length(value), 0) into v_tenants_blob
    from app.app_state where key = 'tm_tenants_v11';

  select coalesce(jsonb_array_length(value), 0) into v_offboarding
    from app.app_state where key = 'tm_offboarding_v11';

  select coalesce(jsonb_array_length(value), 0) into v_applications
    from app.app_state where key = 'tm_applications_v11';

  select coalesce(jsonb_array_length(value), 0) into v_landlord_offboard
    from app.app_state where key = 'tm_landlord_offboarding_v11';

  -- Table count
  select count(*) into v_tenants_table from public.tenants;

  -- Status breakdown from public.tenants
  select string_agg(status || '=' || cnt::text, ', ' order by cnt desc)
    into v_status_counts
    from (select status, count(*) as cnt from public.tenants group by status) s;

  raise notice '=== TENANT COUNT INVESTIGATION ===';
  raise notice 'Blob tm_tenants_v11        : %', v_tenants_blob;
  raise notice 'Table public.tenants       : %', v_tenants_table;
  raise notice 'Blob tm_offboarding_v11    : %', v_offboarding;
  raise notice 'Blob tm_applications_v11   : %', v_applications;
  raise notice 'Blob tm_landlord_offboarding_v11: %', v_landlord_offboard;
  raise notice 'Total all sources          : %', v_tenants_blob + v_offboarding + v_applications;
  raise notice 'Status breakdown (table)   : %', v_status_counts;
end $$;
