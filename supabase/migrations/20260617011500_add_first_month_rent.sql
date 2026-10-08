-- Migration: Add firstMonthRent/first_month_rent field persistence
-- This alters public.tenants and public.partial_tenants to add the first_month_rent column,
-- and updates load_tenants(), upsert_tenant(), partial_load_tenants(), and partial_upsert_tenant() to support it.

-- 1. Add column to public.tenants
alter table public.tenants add column if not exists first_month_rent numeric;

-- 2. Add column to public.partial_tenants
alter table public.partial_tenants add column if not exists first_month_rent numeric;


-- 3. Update app.load_tenants()
create or replace function app.load_tenants()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                      t.id,
      'name',                    t.name,
      'username',                t.username,
      'email',                   t.email,
      'phone',                   t.phone,
      'alternativePhone',        t.alternative_phone,
      'nextOfKinName',           t.next_of_kin_name,
      'nextOfKinPhone',          t.next_of_kin_phone,
      'nextOfKinRelationship',   t.next_of_kin_relationship,
      'idNumber',                t.id_number,
      'status',                  t.status,
      'propertyId',              t.property_id,
      'propertyName',            t.property_name,
      'unitId',                  t.unit_id,
      'unit',                    t.unit,
      'rentAmount',              t.rent_amount,
      'rentDueDate',             t.rent_due_date,
      'rentGraceDays',           t.rent_grace_days,
      'depositPaid',             t.deposit_paid,
      'depositExempt',           t.deposit_exempt,
      'depositExpected',         t.deposit_expected,
      'depositMonths',           t.deposit_months,
      'proratedDeposit',         t.prorated_deposit,
      'rentExtension',           t.rent_extension,
      'activationDate',          t.activation_date,
      'nextDueDate',             t.next_due_date,
      'rentStartDate',           t.rent_start_date,
      'firstMonthRent',          t.first_month_rent
    ) || jsonb_build_object(
      'onboardingDate',          t.onboarding_date,
      'leaseSigned',             t.lease_signed,
      'leaseStartDate',          t.lease_start_date,
      'leaseEnd',                t.lease_end,
      'leaseType',               t.lease_type,
      'paymentHistory',          coalesce(t.payment_history, '[]'::jsonb),
      'outstandingBills',        coalesce(t.outstanding_bills, '[]'::jsonb),
      'outstandingFines',        coalesce(t.outstanding_fines, '[]'::jsonb),
      'maintenanceRequests',     coalesce(t.maintenance_requests, '[]'::jsonb),
      'notes',                   coalesce(t.notes, '[]'::jsonb),
      'notices',                 coalesce(t.notices, '[]'::jsonb),
      'requests',                coalesce(t.requests, '[]'::jsonb),
      'dateRegistered',          t.date_registered,
      'houseStatus',             coalesce(t.house_status, '[]'::jsonb),
      'collectionHistory',       coalesce(t.collection_history, '[]'::jsonb),
      'recurringBills',          t.recurring_bills,
      'avatar',                  t.avatar,
      'profilePicture',          t.profile_picture,
      'kraPin',                  t.kra_pin,
      'arrears',                 t.arrears,
      'role',                    t.role,
      'referrerId',              t.referrer_id,
      'referralConfig',          t.referral_config,
      'authUserId',              t.auth_user_id,
      'occupancyType',           t.occupancy_type,
      'mainTenantId',            t.main_tenant_id
    )) as row
    from public.tenants t
    order by t.created_at desc
  ) sub;
$$;

grant execute on function app.load_tenants() to authenticated, service_role;


-- 4. Update app.upsert_tenant()
create or replace function app.upsert_tenant(p_tenant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_tenant->>'id';
  v_phone text := p_tenant->>'phone';
  v_alt_phone text := p_tenant->>'alternativePhone';
  v_nok_phone text := p_tenant->>'nextOfKinPhone';
begin
  if v_id is null then
    raise exception 'tenant.id is required';
  end if;

  insert into public.tenants (
    id, created_by, name, username, email,
    phone, phone_canonical,
    alternative_phone, alternative_phone_canonical,
    next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
    id_number, status, property_id, property_name, unit_id, unit,
    rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, deposit_exempt, deposit_expected, deposit_months,
    prorated_deposit, rent_extension, activation_date,
    next_due_date, onboarding_date,
    lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines,
    maintenance_requests, notes, notices, requests,
    date_registered, house_status, collection_history, recurring_bills,
    avatar, profile_picture, kra_pin, arrears, role,
    referrer_id, referral_config, auth_user_id,
    occupancy_type, main_tenant_id,
    first_month_rent,
    updated_at
  ) values (
    v_id,
    auth.uid(),
    p_tenant->>'name',
    p_tenant->>'username',
    coalesce(p_tenant->>'email', ''),
    v_phone,
    app.canonicalize_phone(v_phone),
    v_alt_phone,
    app.canonicalize_phone(v_alt_phone),
    p_tenant->>'nextOfKinName',
    v_nok_phone,
    app.canonicalize_phone(v_nok_phone),
    p_tenant->>'nextOfKinRelationship',
    p_tenant->>'idNumber',
    coalesce(p_tenant->>'status', 'PendingAllocation'),
    p_tenant->>'propertyId',
    p_tenant->>'propertyName',
    p_tenant->>'unitId',
    p_tenant->>'unit',
    nullif(p_tenant->>'rentAmount','')::numeric,
    nullif(p_tenant->>'rentDueDate','')::int,
    coalesce(nullif(p_tenant->>'rentGraceDays','')::int, 5),
    nullif(p_tenant->>'depositPaid','')::numeric,
    coalesce((p_tenant->>'depositExempt')::boolean, false),
    coalesce(nullif(p_tenant->>'depositExpected','')::numeric, 0),
    coalesce(nullif(p_tenant->>'depositMonths','')::int, 1),
    p_tenant->'proratedDeposit',
    p_tenant->'rentExtension',
    p_tenant->>'activationDate',
    p_tenant->>'nextDueDate',
    p_tenant->>'onboardingDate',
    coalesce((p_tenant->>'leaseSigned')::boolean, false),
    p_tenant->>'leaseStartDate',
    p_tenant->>'leaseEnd',
    p_tenant->>'leaseType',
    coalesce(p_tenant->'paymentHistory', '[]'::jsonb),
    coalesce(p_tenant->'outstandingBills', '[]'::jsonb),
    coalesce(p_tenant->'outstandingFines', '[]'::jsonb),
    coalesce(p_tenant->'maintenanceRequests', '[]'::jsonb),
    coalesce(p_tenant->'notes', '[]'::jsonb),
    coalesce(p_tenant->'notices', '[]'::jsonb),
    coalesce(p_tenant->'requests', '[]'::jsonb),
    p_tenant->>'dateRegistered',
    coalesce(p_tenant->'houseStatus', '[]'::jsonb),
    coalesce(p_tenant->'collectionHistory', '[]'::jsonb),
    p_tenant->'recurringBills',
    p_tenant->>'avatar',
    p_tenant->>'profilePicture',
    p_tenant->>'kraPin',
    nullif(p_tenant->>'arrears','')::numeric,
    p_tenant->>'role',
    p_tenant->>'referrerId',
    p_tenant->'referralConfig',
    p_tenant->>'authUserId',
    coalesce(p_tenant->>'occupancyType', 'Single'),
    p_tenant->>'mainTenantId',
    nullif(p_tenant->>'firstMonthRent','')::numeric,
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    username = excluded.username,
    email = excluded.email,
    phone = excluded.phone,
    phone_canonical = excluded.phone_canonical,
    alternative_phone = excluded.alternative_phone,
    alternative_phone_canonical = excluded.alternative_phone_canonical,
    next_of_kin_name = excluded.next_of_kin_name,
    next_of_kin_phone = excluded.next_of_kin_phone,
    next_of_kin_phone_canonical = excluded.next_of_kin_phone_canonical,
    next_of_kin_relationship = excluded.next_of_kin_relationship,
    id_number = excluded.id_number,
    status = excluded.status,
    property_id = excluded.property_id,
    property_name = excluded.property_name,
    unit_id = excluded.unit_id,
    unit = excluded.unit,
    rent_amount = excluded.rent_amount,
    rent_due_date = excluded.rent_due_date,
    rent_grace_days = excluded.rent_grace_days,
    deposit_paid = excluded.deposit_paid,
    deposit_exempt = excluded.deposit_exempt,
    deposit_expected = excluded.deposit_expected,
    deposit_months = excluded.deposit_months,
    prorated_deposit = excluded.prorated_deposit,
    rent_extension = excluded.rent_extension,
    activation_date = coalesce(public.tenants.activation_date, excluded.activation_date),
    next_due_date = excluded.next_due_date,
    onboarding_date = excluded.onboarding_date,
    lease_signed = excluded.lease_signed,
    lease_start_date = excluded.lease_start_date,
    lease_end = excluded.lease_end,
    lease_type = excluded.lease_type,
    payment_history = excluded.payment_history,
    outstanding_bills = excluded.outstanding_bills,
    outstanding_fines = excluded.outstanding_fines,
    maintenance_requests = excluded.maintenance_requests,
    notes = excluded.notes,
    notices = excluded.notices,
    requests = excluded.requests,
    date_registered = excluded.date_registered,
    house_status = excluded.house_status,
    collection_history = excluded.collection_history,
    recurring_bills = excluded.recurring_bills,
    avatar = excluded.avatar,
    profile_picture = excluded.profile_picture,
    kra_pin = excluded.kra_pin,
    arrears = excluded.arrears,
    role = excluded.role,
    referrer_id = excluded.referrer_id,
    referral_config = excluded.referral_config,
    auth_user_id = excluded.auth_user_id,
    occupancy_type = excluded.occupancy_type,
    main_tenant_id = excluded.main_tenant_id,
    first_month_rent = excluded.first_month_rent,
    updated_at = now();

  return p_tenant;
end;
$$;

grant execute on function app.upsert_tenant(jsonb) to authenticated, service_role;


-- 5. Update app.partial_load_tenants()
create or replace function app.partial_load_tenants()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                      t.id,
      'name',                    t.name,
      'username',                t.username,
      'email',                   t.email,
      'phone',                   t.phone,
      'alternativePhone',        t.alternative_phone,
      'nextOfKinName',           t.next_of_kin_name,
      'nextOfKinPhone',          t.next_of_kin_phone,
      'nextOfKinRelationship',   t.next_of_kin_relationship,
      'idNumber',                t.id_number,
      'status',                  t.status,
      'propertyId',              t.property_id,
      'propertyName',            t.property_name,
      'unitId',                  t.unit_id,
      'unit',                    t.unit,
      'rentAmount',              t.rent_amount,
      'rentDueDate',             t.rent_due_date,
      'rentGraceDays',           t.rent_grace_days,
      'depositPaid',             t.deposit_paid,
      'depositExempt',           t.deposit_exempt,
      'depositExpected',         t.deposit_expected,
      'depositMonths',           t.deposit_months,
      'proratedDeposit',         t.prorated_deposit,
      'rentExtension',           t.rent_extension,
      'activationDate',          t.activation_date,
      'nextDueDate',             t.next_due_date,
      'rentStartDate',           t.rent_start_date,
      'firstMonthRent',          t.first_month_rent
    ) || jsonb_build_object(
      'onboardingDate',          t.onboarding_date,
      'leaseSigned',             t.lease_signed,
      'leaseStartDate',          t.lease_start_date,
      'leaseEnd',                t.lease_end,
      'leaseType',               t.lease_type,
      'paymentHistory',          coalesce(t.payment_history, '[]'::jsonb),
      'outstandingBills',        coalesce(t.outstanding_bills, '[]'::jsonb),
      'outstandingFines',        coalesce(t.outstanding_fines, '[]'::jsonb),
      'maintenanceRequests',     coalesce(t.maintenance_requests, '[]'::jsonb),
      'notes',                   coalesce(t.notes, '[]'::jsonb),
      'notices',                 coalesce(t.notices, '[]'::jsonb),
      'requests',                coalesce(t.requests, '[]'::jsonb),
      'dateRegistered',          t.date_registered,
      'houseStatus',             coalesce(t.house_status, '[]'::jsonb),
      'collectionHistory',       coalesce(t.collection_history, '[]'::jsonb),
      'recurringBills',          t.recurring_bills,
      'avatar',                  t.avatar,
      'profilePicture',          t.profile_picture,
      'kraPin',                  t.kra_pin,
      'arrears',                 t.arrears,
      'role',                    t.role,
      'referrerId',              t.referrer_id,
      'referralConfig',          t.referral_config,
      'authUserId',              t.auth_user_id,
      'occupancyType',           t.occupancy_type,
      'mainTenantId',            t.main_tenant_id,
      'appScope',                t.app_source
    )) as row
    from public.partial_tenants t
    order by t.created_at desc
  ) sub;
$$;

grant execute on function app.partial_load_tenants() to authenticated, service_role;


-- 6. Update app.partial_upsert_tenant()
create or replace function app.partial_upsert_tenant(p_tenant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_tenant->>'id';
  v_phone text := p_tenant->>'phone';
  v_alt_phone text := p_tenant->>'alternativePhone';
  v_nok_phone text := p_tenant->>'nextOfKinPhone';
begin
  if v_id is null then
    raise exception 'tenant.id is required';
  end if;

  insert into public.partial_tenants (
    id, created_by, name, username, email,
    phone, phone_canonical,
    alternative_phone, alternative_phone_canonical,
    next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
    id_number, status, property_id, property_name, unit_id, unit,
    rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, deposit_exempt, deposit_expected, deposit_months,
    prorated_deposit, rent_extension, activation_date,
    next_due_date, onboarding_date,
    lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines,
    maintenance_requests, notes, notices, requests,
    date_registered, house_status, collection_history, recurring_bills,
    avatar, profile_picture, kra_pin, arrears, role,
    referrer_id, referral_config, auth_user_id,
    occupancy_type, main_tenant_id, app_source,
    first_month_rent,
    updated_at
  ) values (
    v_id,
    auth.uid(),
    p_tenant->>'name',
    p_tenant->>'username',
    coalesce(p_tenant->>'email', ''),
    v_phone,
    app.canonicalize_phone(v_phone),
    v_alt_phone,
    app.canonicalize_phone(v_alt_phone),
    p_tenant->>'nextOfKinName',
    v_nok_phone,
    app.canonicalize_phone(v_nok_phone),
    p_tenant->>'nextOfKinRelationship',
    p_tenant->>'idNumber',
    coalesce(p_tenant->>'status', 'PendingAllocation'),
    p_tenant->>'propertyId',
    p_tenant->>'propertyName',
    p_tenant->>'unitId',
    p_tenant->>'unit',
    nullif(p_tenant->>'rentAmount','')::numeric,
    nullif(p_tenant->>'rentDueDate','')::int,
    coalesce(nullif(p_tenant->>'rentGraceDays','')::int, 5),
    nullif(p_tenant->>'depositPaid','')::numeric,
    coalesce((p_tenant->>'depositExempt')::boolean, false),
    coalesce(nullif(p_tenant->>'depositExpected','')::numeric, 0),
    coalesce(nullif(p_tenant->>'depositMonths','')::int, 1),
    p_tenant->'proratedDeposit',
    p_tenant->'rentExtension',
    p_tenant->>'activationDate',
    p_tenant->>'nextDueDate',
    p_tenant->>'onboardingDate',
    coalesce((p_tenant->>'leaseSigned')::boolean, false),
    p_tenant->>'leaseStartDate',
    p_tenant->>'leaseEnd',
    p_tenant->>'leaseType',
    coalesce(p_tenant->'paymentHistory', '[]'::jsonb),
    coalesce(p_tenant->'outstandingBills', '[]'::jsonb),
    coalesce(p_tenant->'outstandingFines', '[]'::jsonb),
    coalesce(p_tenant->'maintenanceRequests', '[]'::jsonb),
    coalesce(p_tenant->'notes', '[]'::jsonb),
    coalesce(p_tenant->'notices', '[]'::jsonb),
    coalesce(p_tenant->'requests', '[]'::jsonb),
    p_tenant->>'dateRegistered',
    coalesce(p_tenant->'houseStatus', '[]'::jsonb),
    coalesce(p_tenant->'collectionHistory', '[]'::jsonb),
    p_tenant->'recurringBills',
    p_tenant->>'avatar',
    p_tenant->>'profilePicture',
    p_tenant->>'kraPin',
    nullif(p_tenant->>'arrears','')::numeric,
    p_tenant->>'role',
    p_tenant->>'referrerId',
    p_tenant->'referralConfig',
    p_tenant->>'authUserId',
    coalesce(p_tenant->>'occupancyType', 'Single'),
    p_tenant->>'mainTenantId',
    coalesce(p_tenant->>'appScope', 'full'),
    nullif(p_tenant->>'firstMonthRent','')::numeric,
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    username = excluded.username,
    email = excluded.email,
    phone = excluded.phone,
    phone_canonical = excluded.phone_canonical,
    alternative_phone = excluded.alternative_phone,
    alternative_phone_canonical = excluded.alternative_phone_canonical,
    next_of_kin_name = excluded.next_of_kin_name,
    next_of_kin_phone = excluded.next_of_kin_phone,
    next_of_kin_phone_canonical = excluded.next_of_kin_phone_canonical,
    next_of_kin_relationship = excluded.next_of_kin_relationship,
    id_number = excluded.id_number,
    status = excluded.status,
    property_id = excluded.property_id,
    property_name = excluded.property_name,
    unit_id = excluded.unit_id,
    unit = excluded.unit,
    rent_amount = excluded.rent_amount,
    rent_due_date = excluded.rent_due_date,
    rent_grace_days = excluded.rent_grace_days,
    deposit_paid = excluded.deposit_paid,
    deposit_exempt = excluded.deposit_exempt,
    deposit_expected = excluded.deposit_expected,
    deposit_months = excluded.deposit_months,
    prorated_deposit = excluded.prorated_deposit,
    rent_extension = excluded.rent_extension,
    activation_date = coalesce(public.partial_tenants.activation_date, excluded.activation_date),
    next_due_date = excluded.next_due_date,
    onboarding_date = excluded.onboarding_date,
    lease_signed = excluded.lease_signed,
    lease_start_date = excluded.lease_start_date,
    lease_end = excluded.lease_end,
    lease_type = excluded.lease_type,
    payment_history = excluded.payment_history,
    outstanding_bills = excluded.outstanding_bills,
    outstanding_fines = excluded.outstanding_fines,
    maintenance_requests = excluded.maintenance_requests,
    notes = excluded.notes,
    notices = excluded.notices,
    requests = excluded.requests,
    date_registered = excluded.date_registered,
    house_status = excluded.house_status,
    collection_history = excluded.collection_history,
    recurring_bills = excluded.recurring_bills,
    avatar = excluded.avatar,
    profile_picture = excluded.profile_picture,
    kra_pin = excluded.kra_pin,
    arrears = excluded.arrears,
    role = excluded.role,
    referrer_id = excluded.referrer_id,
    referral_config = excluded.referral_config,
    auth_user_id = excluded.auth_user_id,
    occupancy_type = excluded.occupancy_type,
    main_tenant_id = excluded.main_tenant_id,
    app_source = excluded.app_source,
    first_month_rent = excluded.first_month_rent,
    updated_at = now();

  return p_tenant;
end;
$$;

grant execute on function app.partial_upsert_tenant(jsonb) to authenticated, service_role;
