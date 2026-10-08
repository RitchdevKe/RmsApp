-- 1. Add app_source to ALL tables just in case (0104 missed staff_profiles)
ALTER TABLE app.staff_profiles ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';
ALTER TABLE app.partial_staff_profiles ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';
ALTER TABLE public.partial_landlords ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';
ALTER TABLE public.partial_vendors ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';
ALTER TABLE public.partial_renovation_investors ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';
ALTER TABLE public.partial_tenants ADD COLUMN IF NOT EXISTS app_source VARCHAR DEFAULT 'full';

-- LANDLORDS
CREATE OR REPLACE function app.partial_load_landlords()
returns jsonb
language sql stable security definer set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',             l.id, 'name',           l.name, 'username',       l.username, 'email',          l.email,
      'phone',          l.phone, 'idNumber',       l.id_number, 'kraPin',         l.kra_pin, 'role',           l.role,
      'status',         l.status, 'branch',         l.branch, 'avatarUrl',      l.avatar_url, 'referrerId',     l.referrer_id,
      'referralConfig', l.referral_config, 'appScope', l.app_source
    )) as row
    from public.partial_landlords l
    order by l.created_at asc
  ) sub;
$$;
CREATE OR REPLACE function app.partial_upsert_landlord(p_landlord jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_landlord->>'id';
begin
  if v_id is null then raise exception 'landlord.id is required'; end if;
  insert into public.partial_landlords (
    id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_source, updated_at
  ) values (
    v_id, auth.uid(), coalesce(p_landlord->>'name', '(unnamed)'), p_landlord->>'username', coalesce(p_landlord->>'email', ''),
    p_landlord->>'phone', p_landlord->>'idNumber', p_landlord->>'kraPin', p_landlord->>'role', coalesce(p_landlord->>'status', 'Active'),
    p_landlord->>'branch', p_landlord->>'avatarUrl', p_landlord->>'referrerId', p_landlord->'referralConfig', coalesce(p_landlord->>'appScope', 'full'), now()
  ) on conflict (id) do update set
    name = excluded.name, username = excluded.username, email = excluded.email, phone = excluded.phone, id_number = excluded.id_number,
    kra_pin = excluded.kra_pin, role = excluded.role, status = excluded.status, branch = excluded.branch, avatar_url = excluded.avatar_url,
    referrer_id = excluded.referrer_id, referral_config = excluded.referral_config, app_source = excluded.app_source, updated_at = now();
  return p_landlord;
end;
$$;

-- STAFF
CREATE OR REPLACE function app.partial_load_staff()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', s.id::text, 'name', s.name, 'username', s.username, 'role', s.role, 'email', s.email, 'phone', s.phone,
      'branch', s.branch, 'status', s.status, 'avatar', s.avatar, 'department', s.department, 'salaryConfig', s.salary_config,
      'bankDetails', s.bank_details, 'payrollInfo', s.payroll_info, 'leaveBalance', s.leave_balance, 'commissions', s.commissions,
      'deductions', s.deductions, 'attendanceRecord', s.attendance_record, 'leaveRequests', s.leave_requests,
      'businessUnitAssignment', s.business_unit_assignment, 'assignedPropertyId', s.assigned_property_id,
      'referralConfig', s.referral_config, 'appScope', s.app_source
    )) as row
    from app.partial_staff_profiles s order by s.created_at asc
  ) sub;
$$;

CREATE OR REPLACE function app.partial_upsert_staff_profile(p_staff jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id uuid;
begin
  begin v_id := (p_staff->>'id')::uuid; exception when others then raise exception 'staff.id invalid'; end;
  insert into app.partial_staff_profiles (
    id, name, username, role, email, phone, branch, status, avatar, department, salary_config, bank_details, payroll_info, leave_balance,
    commissions, deductions, attendance_record, leave_requests, business_unit_assignment, assigned_property_id, referral_config, app_source, updated_at
  ) values (
    v_id, coalesce(p_staff->>'name', '(unnamed)'), p_staff->>'username', coalesce(p_staff->>'role', 'Staff'), coalesce(p_staff->>'email', ''),
    coalesce(p_staff->>'phone', ''), coalesce(p_staff->>'branch', 'Headquarters'), coalesce(p_staff->>'status', 'Active'), p_staff->>'avatar',
    p_staff->>'department', p_staff->'salaryConfig', p_staff->'bankDetails', p_staff->'payrollInfo', p_staff->'leaveBalance', p_staff->'commissions',
    p_staff->'deductions', p_staff->'attendanceRecord', p_staff->'leaveRequests', p_staff->>'businessUnitAssignment', p_staff->>'assignedPropertyId',
    p_staff->'referralConfig', coalesce(p_staff->>'appScope', 'full'), now()
  ) on conflict (id) do update set
    name = excluded.name, username = excluded.username, role = excluded.role, email = excluded.email, phone = excluded.phone, branch = excluded.branch,
    status = excluded.status, avatar = excluded.avatar, department = excluded.department, salary_config = excluded.salary_config, bank_details = excluded.bank_details,
    payroll_info = excluded.payroll_info, leave_balance = excluded.leave_balance, commissions = excluded.commissions, deductions = excluded.deductions,
    attendance_record = excluded.attendance_record, leave_requests = excluded.leave_requests, business_unit_assignment = excluded.business_unit_assignment,
    assigned_property_id = excluded.assigned_property_id, referral_config = excluded.referral_config, app_source = excluded.app_source, updated_at = now();
  return p_staff;
end;
$$;

-- VENDORS
CREATE OR REPLACE function app.partial_load_vendors()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', v.id, 'name', v.name, 'username', v.username, 'specialty', v.specialty, 'rating', v.rating, 'email', v.email,
      'phone', v.phone, 'location', v.location, 'dailyRate', v.daily_rate, 'verified', v.verified, 'completedJobs', v.completed_jobs,
      'avatarUrl', v.avatar_url, 'summary', v.summary, 'certifications', v.certifications, 'eta', v.eta, 'available', v.available,
      'portfolioImages', v.portfolio_images, 'appScope', v.app_source
    )) as row from public.partial_vendors v order by v.created_at asc
  ) sub;
$$;
CREATE OR REPLACE function app.partial_upsert_vendor(p_vendor jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_vendor->>'id';
begin
  if v_id is null then raise exception 'vendor.id required'; end if;
  insert into public.partial_vendors (
    id, created_by, name, username, specialty, rating, email, phone, location, daily_rate, verified, completed_jobs, avatar_url, summary, certifications, eta, available, portfolio_images, app_source, updated_at
  ) values (
    v_id, auth.uid(), coalesce(p_vendor->>'name', '(unnamed)'), p_vendor->>'username', coalesce(p_vendor->>'specialty', 'General'), coalesce(nullif(p_vendor->>'rating','')::numeric, 5),
    p_vendor->>'email', p_vendor->>'phone', p_vendor->>'location', nullif(p_vendor->>'dailyRate','')::numeric, coalesce((p_vendor->>'verified')::boolean, false),
    coalesce(nullif(p_vendor->>'completedJobs','')::int, 0), p_vendor->>'avatarUrl', p_vendor->>'summary', coalesce(p_vendor->'certifications', '[]'::jsonb),
    p_vendor->>'eta', coalesce((p_vendor->>'available')::boolean, true), coalesce(p_vendor->'portfolioImages', '[]'::jsonb), coalesce(p_vendor->>'appScope', 'full'), now()
  ) on conflict (id) do update set
    name = excluded.name, username = excluded.username, specialty = excluded.specialty, rating = excluded.rating, email = excluded.email, phone = excluded.phone, location = excluded.location,
    daily_rate = excluded.daily_rate, verified = excluded.verified, completed_jobs = excluded.completed_jobs, avatar_url = excluded.avatar_url, summary = excluded.summary,
    certifications = excluded.certifications, eta = excluded.eta, available = excluded.available, portfolio_images = excluded.portfolio_images, app_source = excluded.app_source, updated_at = now();
  return p_vendor;
end;
$$;

-- RENOVATION INVESTORS
CREATE OR REPLACE function app.partial_load_renovation_investors()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'name', r.name, 'username', r.username, 'email', r.email, 'phone', r.phone, 'idNumber', r.id_number, 'status', r.status, 'joinDate', r.join_date,
      'nextOfKin', r.next_of_kin, 'paymentDetails', r.payment_details, 'investorType', r.investor_type, 'groupMembersCount', r.group_members_count,
      'residency', r.residency, 'kraPin', r.kra_pin, 'authorizedRep', r.authorized_rep, 'referrerId', r.referrer_id,
      'referrerType', r.referrer_type, 'passwordHash', r.password_hash, 'appScope', r.app_source
    )) as row from public.partial_renovation_investors r order by r.created_at asc
  ) sub;
$$;

CREATE OR REPLACE function app.partial_upsert_renovation_investor(p_i jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_i->>'id';
begin
  if v_id is null then raise exception 'renovation_investor.id is required'; end if;
  insert into public.partial_renovation_investors (
    id,name,username,email,phone,id_number,status,join_date,
    next_of_kin,payment_details,investor_type,group_members_count,
    residency,kra_pin,authorized_rep,referrer_id,referrer_type,password_hash, app_source, updated_at
  ) values (
    v_id, coalesce(p_i->>'name',''), p_i->>'username',
    coalesce(p_i->>'email',''), coalesce(p_i->>'phone',''), coalesce(p_i->>'idNumber',''),
    coalesce(p_i->>'status','Pending'), coalesce(p_i->>'joinDate',''),
    p_i->'nextOfKin', p_i->'paymentDetails', p_i->>'investorType',
    nullif(p_i->>'groupMembersCount','')::int,
    p_i->>'residency', p_i->>'kraPin', p_i->'authorizedRep',
    p_i->>'referrerId', p_i->>'referrerType', p_i->>'passwordHash', coalesce(p_i->>'appScope', 'full'), now()
  )
  on conflict (id) do update set
    name=excluded.name, username=excluded.username, email=excluded.email,
    phone=excluded.phone, id_number=excluded.id_number, status=excluded.status,
    join_date=excluded.join_date, next_of_kin=excluded.next_of_kin,
    payment_details=excluded.payment_details, investor_type=excluded.investor_type,
    group_members_count=excluded.group_members_count, residency=excluded.residency,
    kra_pin=excluded.kra_pin, authorized_rep=excluded.authorized_rep,
    referrer_id=excluded.referrer_id, referrer_type=excluded.referrer_type,
    password_hash=excluded.password_hash, app_source=excluded.app_source, updated_at=now();
  return p_i;
end;
$$;

-- TENANTS
CREATE OR REPLACE function app.partial_load_tenants()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', t.id, 'name', t.name, 'username', t.username, 'email', t.email, 'phone', t.phone, 'alternativePhone', t.alternative_phone, 'nextOfKinName', t.next_of_kin_name,
      'nextOfKinPhone', t.next_of_kin_phone, 'nextOfKinRelationship', t.next_of_kin_relationship, 'idNumber', t.id_number, 'status', t.status, 'propertyId', t.property_id,
      'propertyName', t.property_name, 'unitId', t.unit_id, 'unit', t.unit, 'rentAmount', t.rent_amount, 'rentDueDate', t.rent_due_date, 'rentGraceDays', t.rent_grace_days,
      'depositPaid', t.deposit_paid, 'depositExempt', t.deposit_exempt, 'depositExpected', t.deposit_expected, 'depositMonths', t.deposit_months, 'proratedDeposit', t.prorated_deposit,
      'rentExtension', t.rent_extension, 'activationDate', t.activation_date, 'nextDueDate', t.next_due_date, 'rentStartDate', t.rent_start_date
    ) || jsonb_build_object(
      'onboardingDate', t.onboarding_date, 'leaseSigned', t.lease_signed, 'leaseStartDate', t.lease_start_date, 'leaseEnd', t.lease_end, 'leaseType', t.lease_type,
      'paymentHistory', coalesce(t.payment_history, '[]'::jsonb), 'outstandingBills', coalesce(t.outstanding_bills, '[]'::jsonb), 'outstandingFines', coalesce(t.outstanding_fines, '[]'::jsonb),
      'maintenanceRequests', coalesce(t.maintenance_requests, '[]'::jsonb), 'notes', coalesce(t.notes, '[]'::jsonb), 'notices', coalesce(t.notices, '[]'::jsonb), 'requests', coalesce(t.requests, '[]'::jsonb),
      'dateRegistered', t.date_registered, 'houseStatus', coalesce(t.house_status, '[]'::jsonb), 'collectionHistory', coalesce(t.collection_history, '[]'::jsonb), 'recurringBills', t.recurring_bills,
      'avatar', t.avatar, 'profilePicture', t.profile_picture, 'kraPin', t.kra_pin, 'arrears', t.arrears, 'role', t.role, 'referrerId', t.referrer_id, 'referralConfig', t.referral_config,
      'authUserId', t.auth_user_id, 'occupancyType', t.occupancy_type, 'mainTenantId', t.main_tenant_id, 'appScope', t.app_source
    )) as row from public.partial_tenants t order by t.created_at desc
  ) sub;
$$;

CREATE OR REPLACE function app.partial_upsert_tenant(p_tenant jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare
  v_id text := p_tenant->>'id';
  v_phone text := p_tenant->>'phone';
  v_alt_phone text := p_tenant->>'alternativePhone';
  v_nok_phone text := p_tenant->>'nextOfKinPhone';
begin
  if v_id is null then raise exception 'tenant.id is required'; end if;
  insert into public.partial_tenants (
    id, created_by, name, username, email, phone, phone_canonical, alternative_phone, alternative_phone_canonical,
    next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship, id_number, status, property_id, property_name, unit_id, unit, rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, deposit_exempt, deposit_expected, deposit_months, prorated_deposit, rent_extension, activation_date, next_due_date, onboarding_date, lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines, maintenance_requests, notes, notices, requests, date_registered, house_status, collection_history, recurring_bills, avatar, profile_picture, kra_pin, arrears, role, referrer_id, referral_config, auth_user_id, occupancy_type, main_tenant_id, app_source, updated_at
  ) values (
    v_id, auth.uid(), p_tenant->>'name', p_tenant->>'username', coalesce(p_tenant->>'email', ''), v_phone, app.canonicalize_phone(v_phone), v_alt_phone, app.canonicalize_phone(v_alt_phone),
    p_tenant->>'nextOfKinName', v_nok_phone, app.canonicalize_phone(v_nok_phone), p_tenant->>'nextOfKinRelationship', p_tenant->>'idNumber', coalesce(p_tenant->>'status', 'PendingAllocation'), p_tenant->>'propertyId', p_tenant->>'propertyName', p_tenant->>'unitId', p_tenant->>'unit', nullif(p_tenant->>'rentAmount','')::numeric, nullif(p_tenant->>'rentDueDate','')::int, coalesce(nullif(p_tenant->>'rentGraceDays','')::int, 5),
    nullif(p_tenant->>'depositPaid','')::numeric, coalesce((p_tenant->>'depositExempt')::boolean, false), coalesce(nullif(p_tenant->>'depositExpected','')::numeric, 0), coalesce(nullif(p_tenant->>'depositMonths','')::int, 1), p_tenant->'proratedDeposit', p_tenant->'rentExtension', p_tenant->>'activationDate', p_tenant->>'nextDueDate', p_tenant->>'onboardingDate', coalesce((p_tenant->>'leaseSigned')::boolean, false), p_tenant->>'leaseStartDate', p_tenant->>'leaseEnd', p_tenant->>'leaseType',
    coalesce(p_tenant->'paymentHistory', '[]'::jsonb), coalesce(p_tenant->'outstandingBills', '[]'::jsonb), coalesce(p_tenant->'outstandingFines', '[]'::jsonb), coalesce(p_tenant->'maintenanceRequests', '[]'::jsonb), coalesce(p_tenant->'notes', '[]'::jsonb), coalesce(p_tenant->'notices', '[]'::jsonb), coalesce(p_tenant->'requests', '[]'::jsonb), p_tenant->>'dateRegistered', coalesce(p_tenant->'houseStatus', '[]'::jsonb), coalesce(p_tenant->'collectionHistory', '[]'::jsonb), p_tenant->'recurringBills', p_tenant->>'avatar', p_tenant->>'profilePicture', p_tenant->>'kraPin', nullif(p_tenant->>'arrears','')::numeric, p_tenant->>'role', p_tenant->>'referrerId', p_tenant->'referralConfig', p_tenant->>'authUserId', coalesce(p_tenant->>'occupancyType', 'Single'), p_tenant->>'mainTenantId', coalesce(p_tenant->>'appScope', 'full'), now()
  ) on conflict (id) do update set
    name = excluded.name, username = excluded.username, email = excluded.email, phone = excluded.phone, phone_canonical = excluded.phone_canonical, alternative_phone = excluded.alternative_phone, alternative_phone_canonical = excluded.alternative_phone_canonical,
    next_of_kin_name = excluded.next_of_kin_name, next_of_kin_phone = excluded.next_of_kin_phone, next_of_kin_phone_canonical = excluded.next_of_kin_phone_canonical, next_of_kin_relationship = excluded.next_of_kin_relationship, id_number = excluded.id_number, status = excluded.status, property_id = excluded.property_id, property_name = excluded.property_name, unit_id = excluded.unit_id, unit = excluded.unit, rent_amount = excluded.rent_amount, rent_due_date = excluded.rent_due_date, rent_grace_days = excluded.rent_grace_days,
    deposit_paid = excluded.deposit_paid, deposit_exempt = excluded.deposit_exempt, deposit_expected = excluded.deposit_expected, deposit_months = excluded.deposit_months, prorated_deposit = excluded.prorated_deposit, rent_extension = excluded.rent_extension, activation_date = coalesce(public.partial_tenants.activation_date, excluded.activation_date), next_due_date = excluded.next_due_date, onboarding_date = excluded.onboarding_date, lease_signed = excluded.lease_signed, lease_start_date = excluded.lease_start_date, lease_end = excluded.lease_end, lease_type = excluded.lease_type,
    payment_history = excluded.payment_history, outstanding_bills = excluded.outstanding_bills, outstanding_fines = excluded.outstanding_fines, maintenance_requests = excluded.maintenance_requests, notes = excluded.notes, notices = excluded.notices, requests = excluded.requests, date_registered = excluded.date_registered, house_status = excluded.house_status, collection_history = excluded.collection_history, recurring_bills = excluded.recurring_bills, avatar = excluded.avatar, profile_picture = excluded.profile_picture, kra_pin = excluded.kra_pin, arrears = excluded.arrears, role = excluded.role, referrer_id = excluded.referrer_id, referral_config = excluded.referral_config, auth_user_id = excluded.auth_user_id, occupancy_type = excluded.occupancy_type, main_tenant_id = excluded.main_tenant_id, app_source = excluded.app_source, updated_at = now();
  return p_tenant;
end;
$$;
