-- supabase/migrations/0074_tenant_count_audit.sql
--
-- Diagnostic: counts tenants across all possible sources to find the gap
-- between the normalized table and the blob.
-- Output is via RAISE NOTICE — visible in supabase db push output.
-- This migration makes NO data changes.

do $$
declare
  v_normalized_count      int;
  v_blob_count            int;
  v_blob_row_count        int;
  v_blob_in_table         int;
  v_blob_missing_in_table int;
  v_skipped_phone         int;
  v_skipped_id            int;
  v_offboard_missing      int;
  v_r                     record;
begin
  -- 1. Count in normalized table
  select count(*) into v_normalized_count from public.tenants;

  -- 2. Count of blob rows with key tm_tenants_v11
  select count(*) into v_blob_row_count from app.app_state where key = 'tm_tenants_v11';

  -- 3. Total items in the blob(s)
  select coalesce(sum(jsonb_array_length(value)), 0)
    into v_blob_count
    from app.app_state
   where key = 'tm_tenants_v11'
     and jsonb_typeof(value) = 'array';

  raise notice '=== TENANT COUNT AUDIT ===';
  raise notice 'public.tenants rows          : %', v_normalized_count;
  raise notice 'app_state rows (tm_tenants)  : %', v_blob_row_count;
  raise notice 'Total items in blob(s)       : %', v_blob_count;
  raise notice 'GAP (blob - normalized)      : %', v_blob_count - v_normalized_count;

  -- 4. How many blob IDs are present in public.tenants
  select count(*) into v_blob_in_table
  from (
    select elem->>'id' as tid
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and elem->>'id' is not null
  ) sub
  where exists (select 1 from public.tenants t where t.id = sub.tid);

  v_blob_missing_in_table := v_blob_count - v_blob_in_table;
  raise notice 'Blob IDs found in table      : %', v_blob_in_table;
  raise notice 'Blob IDs MISSING from table  : %', v_blob_missing_in_table;

  -- 5. Count duplicate phone_canonical conflicts in the blob (would cause skips)
  select count(*) into v_skipped_phone
  from (
    select app.canonicalize_phone(elem->>'phone') as cp, count(*) as cnt
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and elem->>'phone' is not null
    group by 1
    having count(*) > 1
  ) dups;
  raise notice 'Duplicate phone_canonical in blob : %', v_skipped_phone;

  -- 6. Count duplicate id_number conflicts in the blob
  select count(*) into v_skipped_id
  from (
    select elem->>'idNumber' as idn, count(*) as cnt
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and elem->>'idNumber' is not null
      and elem->>'idNumber' <> ''
    group by 1
    having count(*) > 1
  ) dups;
  raise notice 'Duplicate idNumber in blob        : %', v_skipped_id;

  -- 7. Tenant IDs in offboarding_records not in public.tenants
  select count(distinct tenant_id) into v_offboard_missing
  from public.offboarding_records
  where not exists (select 1 from public.tenants t where t.id = tenant_id);
  raise notice 'Tenant IDs in offboarding missing from table : %', v_offboard_missing;

  -- 8. Show the IDs in the blob that are NOT in public.tenants (first 20)
  raise notice '--- First 20 blob IDs missing from public.tenants ---';
  for v_r in
    select elem->>'id' as tid, elem->>'name' as tname, elem->>'phone' as tphone,
           elem->>'status' as tstatus, elem->>'idNumber' as tidnum
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and elem->>'id' is not null
      and not exists (select 1 from public.tenants tt where tt.id = elem->>'id')
    limit 20
  loop
    raise notice '  MISSING id=% name=% phone=% status=% idNumber=%',
      v_r.tid, v_r.tname, v_r.tphone, v_r.tstatus, v_r.tidnum;
  end loop;

  raise notice '=== END AUDIT ===';
end $$;
