-- supabase/migrations/0075_tenant_gap_deep_audit.sql
--
-- Deep audit for the tenant count discrepancy.
-- Fixes the "column value is ambiguous" error from 0074 by using explicit aliases.
-- No data changes — diagnostic only.

do $$
declare
  v_r              record;
  v_blob_in_table  int;
  v_table_not_blob int;
  v_dup_phone      int;
  v_dup_id         int;
  v_offboard_miss  int;
  v_status_dist    text := '';
begin
  -- 1. How many blob IDs are actually in public.tenants
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

  raise notice 'Blob IDs confirmed in public.tenants  : %', v_blob_in_table;

  -- 2. How many rows in public.tenants are NOT in the current blob
  --    (these would be tenants deleted from UI but orphaned in the table)
  select count(*) into v_table_not_blob
  from public.tenants pt
  where not exists (
    select 1
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and elem->>'id' = pt.id
  );
  raise notice 'public.tenants rows NOT in blob        : % (orphaned / deleted from UI)', v_table_not_blob;

  -- 3. Duplicate phone_canonical in blob (these would have been skipped in backfill)
  select count(*) into v_dup_phone
  from (
    select app.canonicalize_phone(elem->>'phone') as cp
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and (elem->>'phone') is not null
    group by 1
    having count(*) > 1
  ) dups;
  raise notice 'Duplicate phone groups in current blob  : %', v_dup_phone;

  -- 4. Duplicate idNumber in blob
  select count(*) into v_dup_id
  from (
    select elem->>'idNumber' as idn
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
      and (elem->>'idNumber') is not null
      and (elem->>'idNumber') <> ''
    group by 1
    having count(*) > 1
  ) dups;
  raise notice 'Duplicate idNumber groups in current blob: %', v_dup_id;

  -- 5. Offboarding records referencing tenant IDs not in public.tenants
  select count(distinct tenant_id) into v_offboard_miss
  from public.offboarding_records
  where not exists (select 1 from public.tenants t where t.id = tenant_id);
  raise notice 'Offboarding tenant IDs missing from table: %', v_offboard_miss;

  -- 6. Status distribution in public.tenants
  raise notice '--- Status distribution in public.tenants ---';
  for v_r in
    select status, count(*) as cnt
    from public.tenants
    group by status
    order by cnt desc
  loop
    raise notice '  status=%-25s count=%', v_r.status, v_r.cnt;
  end loop;

  -- 7. Status distribution in the blob
  raise notice '--- Status distribution in blob ---';
  for v_r in
    select elem->>'status' as status, count(*) as cnt
    from app.app_state a,
         jsonb_array_elements(a.value) as elem
    where a.key = 'tm_tenants_v11'
      and jsonb_typeof(a.value) = 'array'
    group by 1
    order by cnt desc
  loop
    raise notice '  status=%-25s count=%', v_r.status, v_r.cnt;
  end loop;

  -- 8. Any orphaned tenants in public.tenants (not in blob) — show first 10
  raise notice '--- First 10 public.tenants rows NOT in current blob ---';
  for v_r in
    select pt.id, pt.name, pt.phone, pt.status, pt.unit, pt.property_name, pt.updated_at
    from public.tenants pt
    where not exists (
      select 1
      from app.app_state a,
           jsonb_array_elements(a.value) as elem
      where a.key = 'tm_tenants_v11'
        and jsonb_typeof(a.value) = 'array'
        and elem->>'id' = pt.id
    )
    order by pt.updated_at desc
    limit 10
  loop
    raise notice '  ORPHAN id=% name=% phone=% status=% unit=% updated=%',
      v_r.id, v_r.name, v_r.phone, v_r.status, v_r.unit, v_r.updated_at;
  end loop;

  raise notice '=== END DEEP AUDIT ===';
end $$;
