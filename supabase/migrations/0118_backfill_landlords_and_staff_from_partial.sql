-- Migration to permanently copy Full/Both scope users from partial tables to full tables if missing
-- This ensures Landlords, Affiliates, Caretakers, and Field Agents of Both/Full scope are correctly loaded under Full RMS.

-- 1) Backfill public.landlords from public.partial_landlords
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
    LOWER(app_scope) IN ('both', 'full') 
    OR LOWER(app_source) IN ('both', 'full')
    OR app_scope IS NULL
  )
ON CONFLICT (id) DO NOTHING;

-- 2) Backfill app.staff_profiles from app.partial_staff_profiles
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
    LOWER(app_scope) IN ('both', 'full') 
    OR LOWER(app_source) IN ('both', 'full')
    OR app_scope IS NULL
  )
ON CONFLICT (id) DO NOTHING;
