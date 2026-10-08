-- Migration to fix 100-argument issue in load_tenants and partial_load_tenants
-- while properly accommodating occupancy_type, main_tenant_id, and other fields

CREATE OR REPLACE FUNCTION app.load_tenants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
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
      'referralConfig',          t.referral_config
    ) || jsonb_build_object(
      'authUserId',              t.auth_user_id,
      'occupancyType',           t.occupancy_type,
      'mainTenantId',            t.main_tenant_id
    )) AS row
    FROM public.tenants t
    ORDER BY t.created_at DESC
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.load_tenants() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION app.upsert_tenant(p_tenant jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_id text := p_tenant->>'id';
  v_phone text := p_tenant->>'phone';
  v_alt_phone text := p_tenant->>'alternativePhone';
  v_nok_phone text := p_tenant->>'nextOfKinPhone';
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant.id is required';
  END IF;

  INSERT INTO public.tenants (
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
    occupancy_type, main_tenant_id, updated_at
  ) VALUES (
    v_id,
    auth.uid(),
    p_tenant->>'name',
    p_tenant->>'username',
    COALESCE(p_tenant->>'email', ''),
    v_phone,
    app.canonicalize_phone(v_phone),
    v_alt_phone,
    app.canonicalize_phone(v_alt_phone),
    p_tenant->>'nextOfKinName',
    v_nok_phone,
    app.canonicalize_phone(v_nok_phone),
    p_tenant->>'nextOfKinRelationship',
    p_tenant->>'idNumber',
    COALESCE(p_tenant->>'status', 'PendingAllocation'),
    p_tenant->>'propertyId',
    p_tenant->>'propertyName',
    p_tenant->>'unitId',
    p_tenant->>'unit',
    NULLIF(p_tenant->>'rentAmount','')::numeric,
    NULLIF(p_tenant->>'rentDueDate','')::int,
    COALESCE(NULLIF(p_tenant->>'rentGraceDays','')::int, 5),
    NULLIF(p_tenant->>'depositPaid','')::numeric,
    COALESCE((p_tenant->>'depositExempt')::boolean, false),
    COALESCE(NULLIF(p_tenant->>'depositExpected','')::numeric, 0),
    COALESCE(NULLIF(p_tenant->>'depositMonths','')::int, 1),
    p_tenant->'proratedDeposit',
    p_tenant->'rentExtension',
    p_tenant->>'activationDate',
    p_tenant->>'nextDueDate',
    p_tenant->>'onboardingDate',
    COALESCE((p_tenant->>'leaseSigned')::boolean, false),
    p_tenant->>'leaseStartDate',
    p_tenant->>'leaseEnd',
    p_tenant->>'leaseType',
    COALESCE(p_tenant->'paymentHistory', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingBills', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingFines', '[]'::jsonb),
    COALESCE(p_tenant->'maintenanceRequests', '[]'::jsonb),
    COALESCE(p_tenant->'notes', '[]'::jsonb),
    COALESCE(p_tenant->'notices', '[]'::jsonb),
    COALESCE(p_tenant->'requests', '[]'::jsonb),
    p_tenant->>'dateRegistered',
    COALESCE(p_tenant->'houseStatus', '[]'::jsonb),
    COALESCE(p_tenant->'collectionHistory', '[]'::jsonb),
    p_tenant->'recurringBills',
    p_tenant->>'avatar',
    p_tenant->>'profilePicture',
    p_tenant->>'kraPin',
    NULLIF(p_tenant->>'arrears','')::numeric,
    p_tenant->>'role',
    p_tenant->>'referrerId',
    p_tenant->'referralConfig',
    p_tenant->>'authUserId',
    COALESCE(p_tenant->>'occupancyType', 'Single'),
    p_tenant->>'mainTenantId',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    phone_canonical = EXCLUDED.phone_canonical,
    alternative_phone = EXCLUDED.alternative_phone,
    alternative_phone_canonical = EXCLUDED.alternative_phone_canonical,
    next_of_kin_name = EXCLUDED.next_of_kin_name,
    next_of_kin_phone = EXCLUDED.next_of_kin_phone,
    next_of_kin_phone_canonical = EXCLUDED.next_of_kin_phone_canonical,
    next_of_kin_relationship = EXCLUDED.next_of_kin_relationship,
    id_number = EXCLUDED.id_number,
    status = EXCLUDED.status,
    property_id = EXCLUDED.property_id,
    property_name = EXCLUDED.property_name,
    unit_id = EXCLUDED.unit_id,
    unit = EXCLUDED.unit,
    rent_amount = EXCLUDED.rent_amount,
    rent_due_date = EXCLUDED.rent_due_date,
    rent_grace_days = EXCLUDED.rent_grace_days,
    deposit_paid = EXCLUDED.deposit_paid,
    deposit_exempt = EXCLUDED.deposit_exempt,
    deposit_expected = EXCLUDED.deposit_expected,
    deposit_months = EXCLUDED.deposit_months,
    prorated_deposit = EXCLUDED.prorated_deposit,
    rent_extension = EXCLUDED.rent_extension,
    activation_date = EXCLUDED.activation_date,
    next_due_date = EXCLUDED.next_due_date,
    onboarding_date = EXCLUDED.onboarding_date,
    lease_signed = EXCLUDED.lease_signed,
    lease_start_date = EXCLUDED.lease_start_date,
    lease_end = EXCLUDED.lease_end,
    lease_type = EXCLUDED.lease_type,
    payment_history = EXCLUDED.payment_history,
    outstanding_bills = EXCLUDED.outstanding_bills,
    outstanding_fines = EXCLUDED.outstanding_fines,
    maintenance_requests = EXCLUDED.maintenance_requests,
    notes = EXCLUDED.notes,
    notices = EXCLUDED.notices,
    requests = EXCLUDED.requests,
    house_status = EXCLUDED.house_status,
    collection_history = EXCLUDED.collection_history,
    recurring_bills = EXCLUDED.recurring_bills,
    avatar = EXCLUDED.avatar,
    profile_picture = EXCLUDED.profile_picture,
    kra_pin = EXCLUDED.kra_pin,
    arrears = EXCLUDED.arrears,
    role = EXCLUDED.role,
    referrer_id = COALESCE(public.tenants.referrer_id, EXCLUDED.referrer_id),
    referral_config = EXCLUDED.referral_config,
    auth_user_id = COALESCE(public.tenants.auth_user_id, EXCLUDED.auth_user_id),
    occupancy_type = EXCLUDED.occupancy_type,
    main_tenant_id = EXCLUDED.main_tenant_id,
    updated_at = now();

  RETURN p_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION app.upsert_tenant(jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION app.partial_load_tenants()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
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
      'referralConfig',          t.referral_config
    ) || jsonb_build_object(
      'authUserId',              t.auth_user_id,
      'occupancyType',           t.occupancy_type,
      'mainTenantId',            t.main_tenant_id
    )) AS row
    FROM public.partial_tenants t
    ORDER BY t.created_at DESC
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.partial_load_tenants() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION app.partial_upsert_tenant(p_tenant jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_id text := p_tenant->>'id';
  v_phone text := p_tenant->>'phone';
  v_alt_phone text := p_tenant->>'alternativePhone';
  v_nok_phone text := p_tenant->>'nextOfKinPhone';
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant.id is required';
  END IF;

  INSERT INTO public.partial_tenants (
    id, created_by, name, username, email,
    phone, phone_canonical,
    alternative_phone, alternative_phone_canonical,
    next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
    id_number, status, property_id, property_name, unit_id, unit,
    rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, deposit_exempt, deposit_expected, deposit_months,
    prorated_deposit, rent_extension, activation_date,
    next_due_date, rent_start_date, onboarding_date,
    lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines,
    maintenance_requests, notes, notices, requests,
    date_registered, house_status, collection_history, recurring_bills,
    avatar, profile_picture, kra_pin, arrears, role,
    referrer_id, referral_config, auth_user_id,
    occupancy_type, main_tenant_id, updated_at
  ) VALUES (
    v_id,
    auth.uid(),
    p_tenant->>'name',
    p_tenant->>'username',
    COALESCE(p_tenant->>'email', ''),
    v_phone,
    app.canonicalize_phone(v_phone),
    v_alt_phone,
    app.canonicalize_phone(v_alt_phone),
    p_tenant->>'nextOfKinName',
    v_nok_phone,
    app.canonicalize_phone(v_nok_phone),
    p_tenant->>'nextOfKinRelationship',
    p_tenant->>'idNumber',
    COALESCE(p_tenant->>'status', 'PendingAllocation'),
    p_tenant->>'propertyId',
    p_tenant->>'propertyName',
    p_tenant->>'unitId',
    p_tenant->>'unit',
    NULLIF(p_tenant->>'rentAmount','')::numeric,
    NULLIF(p_tenant->>'rentDueDate','')::int,
    COALESCE(NULLIF(p_tenant->>'rentGraceDays','')::int, 5),
    NULLIF(p_tenant->>'depositPaid','')::numeric,
    COALESCE((p_tenant->>'depositExempt')::boolean, false),
    COALESCE(NULLIF(p_tenant->>'depositExpected','')::numeric, 0),
    COALESCE(NULLIF(p_tenant->>'depositMonths','')::int, 1),
    p_tenant->'proratedDeposit',
    p_tenant->'rentExtension',
    p_tenant->>'activationDate',
    p_tenant->>'nextDueDate',
    p_tenant->>'rentStartDate',
    p_tenant->>'onboardingDate',
    COALESCE((p_tenant->>'leaseSigned')::boolean, false),
    p_tenant->>'leaseStartDate',
    p_tenant->>'leaseEnd',
    p_tenant->>'leaseType',
    COALESCE(p_tenant->'paymentHistory', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingBills', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingFines', '[]'::jsonb),
    COALESCE(p_tenant->'maintenanceRequests', '[]'::jsonb),
    COALESCE(p_tenant->'notes', '[]'::jsonb),
    COALESCE(p_tenant->'notices', '[]'::jsonb),
    COALESCE(p_tenant->'requests', '[]'::jsonb),
    p_tenant->>'dateRegistered',
    COALESCE(p_tenant->'houseStatus', '[]'::jsonb),
    COALESCE(p_tenant->'collectionHistory', '[]'::jsonb),
    p_tenant->'recurringBills',
    p_tenant->>'avatar',
    p_tenant->>'profilePicture',
    p_tenant->>'kraPin',
    NULLIF(p_tenant->>'arrears','')::numeric,
    p_tenant->>'role',
    p_tenant->>'referrerId',
    p_tenant->'referralConfig',
    p_tenant->>'authUserId',
    COALESCE(p_tenant->>'occupancyType', 'Single'),
    p_tenant->>'mainTenantId',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    phone_canonical = EXCLUDED.phone_canonical,
    alternative_phone = EXCLUDED.alternative_phone,
    alternative_phone_canonical = EXCLUDED.alternative_phone_canonical,
    next_of_kin_name = EXCLUDED.next_of_kin_name,
    next_of_kin_phone = EXCLUDED.next_of_kin_phone,
    next_of_kin_phone_canonical = EXCLUDED.next_of_kin_phone_canonical,
    next_of_kin_relationship = EXCLUDED.next_of_kin_relationship,
    id_number = EXCLUDED.id_number,
    status = EXCLUDED.status,
    property_id = EXCLUDED.property_id,
    property_name = EXCLUDED.property_name,
    unit_id = EXCLUDED.unit_id,
    unit = EXCLUDED.unit,
    rent_amount = EXCLUDED.rent_amount,
    rent_due_date = EXCLUDED.rent_due_date,
    rent_grace_days = EXCLUDED.rent_grace_days,
    deposit_paid = EXCLUDED.deposit_paid,
    deposit_exempt = EXCLUDED.deposit_exempt,
    deposit_expected = EXCLUDED.deposit_expected,
    deposit_months = EXCLUDED.deposit_months,
    prorated_deposit = EXCLUDED.prorated_deposit,
    rent_extension = EXCLUDED.rent_extension,
    activation_date = EXCLUDED.activation_date,
    next_due_date = EXCLUDED.next_due_date,
    rent_start_date = EXCLUDED.rent_start_date,
    onboarding_date = EXCLUDED.onboarding_date,
    lease_signed = EXCLUDED.lease_signed,
    lease_start_date = EXCLUDED.lease_start_date,
    lease_end = EXCLUDED.lease_end,
    lease_type = EXCLUDED.lease_type,
    payment_history = EXCLUDED.payment_history,
    outstanding_bills = EXCLUDED.outstanding_bills,
    outstanding_fines = EXCLUDED.outstanding_fines,
    maintenance_requests = EXCLUDED.maintenance_requests,
    notes = EXCLUDED.notes,
    notices = EXCLUDED.notices,
    requests = EXCLUDED.requests,
    house_status = EXCLUDED.house_status,
    collection_history = EXCLUDED.collection_history,
    recurring_bills = EXCLUDED.recurring_bills,
    avatar = EXCLUDED.avatar,
    profile_picture = EXCLUDED.profile_picture,
    kra_pin = EXCLUDED.kra_pin,
    arrears = EXCLUDED.arrears,
    role = EXCLUDED.role,
    referrer_id = COALESCE(public.partial_tenants.referrer_id, EXCLUDED.referrer_id),
    referral_config = EXCLUDED.referral_config,
    auth_user_id = COALESCE(public.partial_tenants.auth_user_id, EXCLUDED.auth_user_id),
    occupancy_type = EXCLUDED.occupancy_type,
    main_tenant_id = EXCLUDED.main_tenant_id,
    updated_at = now();

  RETURN p_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant(jsonb) TO authenticated, service_role;
