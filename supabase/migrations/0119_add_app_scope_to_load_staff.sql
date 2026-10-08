-- Migration to update load_staff function so that it returns s.app_scope or s.app_source as appScope
-- This ensures that staff members loaded under Full RMS have their appScope field populated for strict filtering.

CREATE OR REPLACE FUNCTION app.load_staff()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb)
  FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
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
      'referralConfig',         s.referral_config,
      'appScope',               COALESCE(s.app_scope, s.app_source)
    )) as row
    FROM app.staff_profiles s
    ORDER BY s.created_at ASC
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.load_staff() TO authenticated;
