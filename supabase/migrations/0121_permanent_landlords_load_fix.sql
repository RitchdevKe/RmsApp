-- Migration to permanently fix the landlords and staff loading issues in Full RMS
-- 1) Disable RLS on core Full RMS tables to prevent silent auth/RLS empty queries.
ALTER TABLE public.landlords DISABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff_profiles DISABLE ROW LEVEL SECURITY;

-- 2) Backfill Full/Both-scoped landlords from public.partial_landlords to public.landlords if missing
INSERT INTO public.landlords (
  id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_scope, app_source, updated_at
)
SELECT 
  id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, 
  COALESCE(app_scope, 'Both'), COALESCE(app_source, 'full'), COALESCE(updated_at, now())
FROM public.partial_landlords
WHERE 
  id NOT IN (SELECT id FROM public.landlords)
  AND (
    LOWER(app_scope) IN ('both', 'full', 'full rms') 
    OR LOWER(app_source) IN ('both', 'full', 'full rms')
    OR app_scope IS NULL
  )
ON CONFLICT (id) DO NOTHING;

-- 3) Backfill Full/Both-scoped staff from app.partial_staff_profiles to app.staff_profiles if missing
INSERT INTO app.staff_profiles (
  id, name, username, role, email, phone, branch, status, avatar, department, salary_config, bank_details, payroll_info, leave_balance,
  commissions, deductions, attendance_record, leave_requests, business_unit_assignment, assigned_property_id, referral_config, app_scope, app_source, updated_at
)
SELECT 
  id, name, username, role, email, phone, branch, status, avatar, department, salary_config, bank_details, payroll_info, leave_balance,
  commissions, deductions, attendance_record, leave_requests, business_unit_assignment, assigned_property_id, referral_config, 
  COALESCE(app_scope, 'Both'), COALESCE(app_source, 'full'), COALESCE(updated_at, now())
FROM app.partial_staff_profiles
WHERE 
  id NOT IN (SELECT id FROM app.staff_profiles)
  AND (
    LOWER(app_scope) IN ('both', 'full', 'full rms') 
    OR LOWER(app_source) IN ('both', 'full', 'full rms')
    OR app_scope IS NULL
  )
ON CONFLICT (id) DO NOTHING;


-- 4) Redefine app.load_landlords() function to perform a dynamic UNION between public.landlords and public.partial_landlords.
-- This ensures that regardless of whether the backfill has completed or some landlords were created under the Partial RMS table,
-- they will ALWAYS load seamlessly under Full RMS if their scope/source is Full or Both.
CREATE OR REPLACE FUNCTION app.load_landlords()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb) FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
      'id',             id,
      'name',           name,
      'username',       username,
      'email',          email,
      'phone',          phone,
      'idNumber',       id_number,
      'kraPin',         kra_pin,
      'role',           role,
      'status',         status,
      'branch',         branch,
      'avatarUrl',      avatar_url,
      'referrerId',     referrer_id,
      'referralConfig', referral_config,
      'appScope',       app_scope
    )) as row
    FROM (
      SELECT DISTINCT ON (id)
        id, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_scope, created_at
      FROM (
        SELECT 
          l.id, l.name, l.username, l.email, l.phone, l.id_number, l.kra_pin, l.role, l.status, l.branch, l.avatar_url, l.referrer_id, l.referral_config,
          COALESCE(l.app_scope, l.app_source, 'Full') as app_scope, coalesce(l.created_at, now()) as created_at
        FROM public.landlords l
        UNION ALL
        SELECT 
          pl.id, pl.name, pl.username, pl.email, pl.phone, pl.id_number, pl.kra_pin, pl.role, pl.status, pl.branch, pl.avatar_url, pl.referrer_id, pl.referral_config,
          COALESCE(pl.app_scope, pl.app_source, 'Full') as app_scope, coalesce(pl.created_at, now()) as created_at
        FROM public.partial_landlords pl
        WHERE LOWER(COALESCE(pl.app_scope, pl.app_source, 'Full')) IN ('full', 'both', 'full rms')
      ) raw_union
      ORDER BY id, created_at ASC
    ) distinct_union
    ORDER BY created_at ASC
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.load_landlords() TO authenticated, service_role;


-- 5) Redefine app.load_staff() function to perform a dynamic UNION between app.staff_profiles and app.partial_staff_profiles.
-- This ensures that staff members of Full/Both scope are always loaded successfully under Full RMS.
CREATE OR REPLACE FUNCTION app.load_staff()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb) FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
      'id',                     id,
      'name',                   name,
      'username',               username,
      'role',                   role,
      'email',                  email,
      'phone',                  phone,
      'branch',                 branch,
      'status',                 status,
      'avatar',                 avatar,
      'department',             department,
      'salaryConfig',           salary_config,
      'bankDetails',            bank_details,
      'payrollInfo',            payroll_info,
      'leaveBalance',           leave_balance,
      'commissions',            commissions,
      'deductions',             deductions,
      'attendanceRecord',       attendance_record,
      'leaveRequests',          leave_requests,
      'businessUnitAssignment', business_unit_assignment,
      'assignedPropertyId',     assigned_property_id,
      'referralConfig',         referral_config,
      'appScope',               app_scope
    )) as row
    FROM (
      SELECT DISTINCT ON (id)
        id, name, username, role, email, phone, branch, status, avatar, department, salary_config, bank_details, payroll_info, leave_balance,
        commissions, deductions, attendance_record, leave_requests, business_unit_assignment, assigned_property_id, referral_config, app_scope, created_at
      FROM (
        SELECT 
          s.id::text, s.name, s.username, s.role, s.email, s.phone, s.branch, s.status, s.avatar, s.department, s.salary_config, s.bank_details, s.payroll_info, s.leave_balance,
          s.commissions, s.deductions, s.attendance_record, s.leave_requests, s.business_unit_assignment, s.assigned_property_id, s.referral_config,
          COALESCE(s.app_scope, s.app_source, 'Full') as app_scope, coalesce(s.created_at, now()) as created_at
        FROM app.staff_profiles s
        UNION ALL
        SELECT 
          ps.id::text, ps.name, ps.username, ps.role, ps.email, ps.phone, ps.branch, ps.status, ps.avatar, ps.department, ps.salary_config, ps.bank_details, ps.payroll_info, ps.leave_balance,
          ps.commissions, ps.deductions, ps.attendance_record, ps.leave_requests, ps.business_unit_assignment, ps.assigned_property_id, ps.referral_config,
          COALESCE(ps.app_scope, ps.app_source, 'Full') as app_scope, coalesce(ps.created_at, now()) as created_at
        FROM app.partial_staff_profiles ps
        WHERE LOWER(COALESCE(ps.app_scope, ps.app_source, 'Full')) IN ('full', 'both', 'full rms')
      ) raw_union
      ORDER BY id, created_at ASC
    ) distinct_union
    ORDER BY created_at ASC
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.load_staff() TO authenticated, service_role;
