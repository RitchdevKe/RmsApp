-- supabase/migrations/0037_staff_normalization.sql
--
-- Migration Step 4: Staff — normalize app.staff_profiles as source of truth.
--
-- app.staff_profiles exists but only has: id, name, role, email, phone, branch, status.
-- StaffProfile has many more fields. This migration:
--   1. Adds missing columns to app.staff_profiles
--   2. Creates app.load_staff() RPC — returns StaffProfile[]-shaped JSONB
--   3. Creates app.upsert_staff_profile(jsonb) and app.upsert_staff_bulk(jsonb)
--   4. Backfills app.staff_profiles from tm_staff_v11 blob
--   5. Updates load_all_app_state() to serve tm_staff_v11 from the table
--
-- Idempotent: safe to re-run.

-- ── 1. Add missing columns ─────────────────────────────────────────────────
alter table app.staff_profiles
  add column if not exists username               text,
  add column if not exists avatar                 text,
  add column if not exists department             text,
  add column if not exists salary_config          jsonb,
  add column if not exists bank_details           jsonb,
  add column if not exists payroll_info           jsonb,
  add column if not exists leave_balance          jsonb,
  add column if not exists commissions            jsonb,
  add column if not exists deductions             jsonb,
  add column if not exists attendance_record      jsonb,
  add column if not exists leave_requests         jsonb,
  add column if not exists business_unit_assignment text,
  add column if not exists assigned_property_id  text,
  add column if not exists referral_config        jsonb;

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_staff()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                     s.id::text,
      'name',                   s.name,
      'username',               s.username,
      'role',                   s.role,
      'email',                  s.email,
      'phone',                  s.phone,
      'branch',                 s.branch,
      'status',                 s.status,
      'avatar',                 s.avatar,
      'department',             s.department,
      'salaryConfig',           s.salary_config,
      'bankDetails',            s.bank_details,
      'payrollInfo',            s.payroll_info,
      'leaveBalance',           s.leave_balance,
      'commissions',            s.commissions,
      'deductions',             s.deductions,
      'attendanceRecord',       s.attendance_record,
      'leaveRequests',          s.leave_requests,
      'businessUnitAssignment', s.business_unit_assignment,
      'assignedPropertyId',     s.assigned_property_id,
      'referralConfig',         s.referral_config
    )) as row
    from app.staff_profiles s
    order by s.created_at asc
  ) sub;
$$;

grant execute on function app.load_staff() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_staff_profile(p_staff jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id uuid;
begin
  begin
    v_id := (p_staff->>'id')::uuid;
  exception when others then
    raise exception 'staff.id must be a valid UUID, got: %', p_staff->>'id';
  end;

  insert into app.staff_profiles (
    id, name, username, role, email, phone, branch, status,
    avatar, department, salary_config, bank_details,
    payroll_info, leave_balance, commissions, deductions,
    attendance_record, leave_requests,
    business_unit_assignment, assigned_property_id, referral_config,
    updated_at
  ) values (
    v_id,
    coalesce(p_staff->>'name', '(unnamed)'),
    p_staff->>'username',
    coalesce(p_staff->>'role', 'Staff'),
    coalesce(p_staff->>'email', ''),
    coalesce(p_staff->>'phone', ''),
    coalesce(p_staff->>'branch', 'Headquarters'),
    coalesce(p_staff->>'status', 'Active'),
    p_staff->>'avatar',
    p_staff->>'department',
    p_staff->'salaryConfig',
    p_staff->'bankDetails',
    p_staff->'payrollInfo',
    p_staff->'leaveBalance',
    p_staff->'commissions',
    p_staff->'deductions',
    p_staff->'attendanceRecord',
    p_staff->'leaveRequests',
    p_staff->>'businessUnitAssignment',
    p_staff->>'assignedPropertyId',
    p_staff->'referralConfig',
    now()
  )
  on conflict (id) do update set
    name                      = excluded.name,
    username                  = excluded.username,
    role                      = excluded.role,
    email                     = excluded.email,
    phone                     = excluded.phone,
    branch                    = excluded.branch,
    status                    = excluded.status,
    avatar                    = excluded.avatar,
    department                = excluded.department,
    salary_config             = excluded.salary_config,
    bank_details              = excluded.bank_details,
    payroll_info              = excluded.payroll_info,
    leave_balance             = excluded.leave_balance,
    commissions               = excluded.commissions,
    deductions                = excluded.deductions,
    attendance_record         = excluded.attendance_record,
    leave_requests            = excluded.leave_requests,
    business_unit_assignment  = excluded.business_unit_assignment,
    assigned_property_id      = excluded.assigned_property_id,
    referral_config           = excluded.referral_config,
    updated_at                = now();

  return p_staff;
end;
$$;

grant execute on function app.upsert_staff_profile(jsonb) to authenticated, service_role;

create or replace function app.upsert_staff_bulk(p_staff jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_staff) <> 'array' then
    raise exception 'p_staff must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_staff)
  loop
    perform app.upsert_staff_profile(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_staff_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_staff    jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
  v_id       uuid;
begin
  for r in select value from app.app_state where key = 'tm_staff_v11'
  loop
    v_staff := r.value;
    if v_staff is null or jsonb_typeof(v_staff) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_staff)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        v_id := (v_item->>'id')::uuid;

        insert into app.staff_profiles (
          id, name, username, role, email, phone, branch, status,
          avatar, department, salary_config, bank_details,
          payroll_info, leave_balance, commissions, deductions,
          attendance_record, leave_requests,
          business_unit_assignment, assigned_property_id, referral_config,
          updated_at
        ) values (
          v_id,
          coalesce(v_item->>'name', '(unnamed)'),
          v_item->>'username',
          coalesce(v_item->>'role', 'Staff'),
          coalesce(v_item->>'email', ''),
          coalesce(v_item->>'phone', ''),
          coalesce(v_item->>'branch', 'Headquarters'),
          coalesce(v_item->>'status', 'Active'),
          v_item->>'avatar',
          v_item->>'department',
          v_item->'salaryConfig',
          v_item->'bankDetails',
          v_item->'payrollInfo',
          v_item->'leaveBalance',
          v_item->'commissions',
          v_item->'deductions',
          v_item->'attendanceRecord',
          v_item->'leaveRequests',
          v_item->>'businessUnitAssignment',
          v_item->>'assignedPropertyId',
          v_item->'referralConfig',
          now()
        )
        on conflict (id) do update set
          name                      = excluded.name,
          username                  = excluded.username,
          role                      = excluded.role,
          email                     = excluded.email,
          phone                     = excluded.phone,
          branch                    = excluded.branch,
          status                    = excluded.status,
          avatar                    = excluded.avatar,
          department                = excluded.department,
          salary_config             = excluded.salary_config,
          bank_details              = excluded.bank_details,
          payroll_info              = excluded.payroll_info,
          leave_balance             = excluded.leave_balance,
          commissions               = excluded.commissions,
          deductions                = excluded.deductions,
          attendance_record         = excluded.attendance_record,
          leave_requests            = excluded.leave_requests,
          business_unit_assignment  = excluded.business_unit_assignment,
          assigned_property_id      = excluded.assigned_property_id,
          referral_config           = excluded.referral_config,
          updated_at                = now();

        v_upserted := v_upserted + 1;

      exception when others then
        raise notice 'Skipped staff id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Staff backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;

-- ── 5. Wire into load_all_app_state ───────────────────────────────────────
create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in (
        'tm_tenants_v11', 'tm_properties_v11',
        'tm_landlords_v11', 'tm_staff_v11'
      )
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',    app.load_tenants(),
      'tm_properties_v11', app.load_properties(),
      'tm_landlords_v11',  app.load_landlords(),
      'tm_staff_v11',      app.load_staff()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
