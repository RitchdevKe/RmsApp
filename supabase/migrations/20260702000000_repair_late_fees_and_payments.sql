-- Migration: 20260702000000_repair_late_fees_and_payments.sql
-- Description: Ensures permanent deletion of late fees and payments by correcting 
-- column type casting of 'notes' inside tenant upsert functions and unifying standard/partial payment deletions.

-- -----------------------------------------------------------------------------
-- 1. Correct and Recreate app.upsert_tenant(jsonb)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.upsert_tenant(p_tenant jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_id          text := p_tenant->>'id';
  v_phone       text := p_tenant->>'phone';
  v_alt_phone   text := p_tenant->>'alternativePhone';
  v_nok_phone   text := p_tenant->>'nextOfKinPhone';
BEGIN
  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'tenant.id is required';
  END IF;

  INSERT INTO public.tenants (
    id, created_by, name, username, email, phone, phone_canonical,
    alternative_phone, alternative_phone_canonical,
    next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
    id_number, status, property_id, property_name, unit_id, unit,
    rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, deposit_exempt, deposit_expected, deposit_months,
    prorated_deposit, rent_extension, activation_date,
    next_due_date, onboarding_date, rent_start_date,
    lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines, waived_late_fee_months,
    maintenance_requests, notes, notices, requests,
    date_registered, house_status, collection_history, recurring_bills,
    avatar, profile_picture, kra_pin, arrears, role,
    referrer_id, referral_config, auth_user_id,
    updated_at
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
    COALESCE(p_tenant->>'onboardingDate', p_tenant->>'rentStartDate'),
    COALESCE(NULLIF(p_tenant->>'rentStartDate', ''), p_tenant->>'onboardingDate', p_tenant->>'activationDate'),
    COALESCE((p_tenant->>'leaseSigned')::boolean, false),
    p_tenant->>'leaseStartDate',
    p_tenant->>'leaseEnd',
    p_tenant->>'leaseType',
    COALESCE(p_tenant->'paymentHistory', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingBills', '[]'::jsonb),
    COALESCE(p_tenant->'outstandingFines', '[]'::jsonb),
    COALESCE(p_tenant->'waivedLateFeeMonths', '[]'::jsonb),
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
    NOW()
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
    activation_date = COALESCE(public.tenants.activation_date, EXCLUDED.activation_date),
    next_due_date = EXCLUDED.next_due_date,
    onboarding_date = EXCLUDED.onboarding_date,
    rent_start_date = COALESCE(NULLIF(p_tenant->>'rentStartDate', ''), EXCLUDED.rent_start_date, EXCLUDED.onboarding_date, EXCLUDED.activation_date),
    lease_signed = EXCLUDED.lease_signed,
    lease_start_date = EXCLUDED.lease_start_date,
    lease_end = EXCLUDED.lease_end,
    lease_type = EXCLUDED.lease_type,
    payment_history = CASE
      WHEN p_tenant ? 'paymentHistory'       THEN EXCLUDED.payment_history
      ELSE public.tenants.payment_history
    END,
    outstanding_bills = CASE
      WHEN p_tenant ? 'outstandingBills'    THEN EXCLUDED.outstanding_bills
      ELSE public.tenants.outstanding_bills
    END,
    outstanding_fines = CASE
      WHEN p_tenant ? 'outstandingFines'    THEN EXCLUDED.outstanding_fines
      ELSE public.tenants.outstanding_fines
    END,
    waived_late_fee_months = CASE
      WHEN p_tenant ? 'waivedLateFeeMonths' THEN EXCLUDED.waived_late_fee_months
      ELSE public.tenants.waived_late_fee_months
    END,
    maintenance_requests = CASE
      WHEN p_tenant ? 'maintenanceRequests' THEN EXCLUDED.maintenance_requests
      ELSE public.tenants.maintenance_requests
    END,
    notes = CASE
      WHEN p_tenant ? 'notes'               THEN EXCLUDED.notes
      ELSE public.tenants.notes
    END,
    notices = CASE
      WHEN p_tenant ? 'notices'             THEN EXCLUDED.notices
      ELSE public.tenants.notices
    END,
    requests = CASE
      WHEN p_tenant ? 'requests'            THEN EXCLUDED.requests
      ELSE public.tenants.requests
    END,
    collection_history = CASE
      WHEN p_tenant ? 'collectionHistory'   THEN EXCLUDED.collection_history
      ELSE public.tenants.collection_history
    END,
    date_registered = EXCLUDED.date_registered,
    house_status = EXCLUDED.house_status,
    recurring_bills = EXCLUDED.recurring_bills,
    avatar = EXCLUDED.avatar,
    profile_picture = EXCLUDED.profile_picture,
    kra_pin = EXCLUDED.kra_pin,
    arrears = EXCLUDED.arrears,
    role = EXCLUDED.role,
    referrer_id = EXCLUDED.referrer_id,
    referral_config = EXCLUDED.referral_config,
    auth_user_id = EXCLUDED.auth_user_id,
    updated_at = NOW();

  RETURN p_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION app.upsert_tenant(jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Correct and Recreate app.partial_upsert_tenant(jsonb)
-- -----------------------------------------------------------------------------
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
    next_due_date, onboarding_date, rent_start_date,
    lease_signed, lease_start_date, lease_end, lease_type,
    payment_history, outstanding_bills, outstanding_fines,
    maintenance_requests, notes, notices, requests,
    date_registered, house_status, collection_history, recurring_bills,
    avatar, profile_picture, kra_pin, arrears, role,
    referrer_id, referral_config, auth_user_id,
    occupancy_type, main_tenant_id,
    updated_at
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
    COALESCE(p_tenant->>'onboardingDate', p_tenant->>'rentStartDate'),
    COALESCE(NULLIF(p_tenant->>'rentStartDate', ''), p_tenant->>'onboardingDate', p_tenant->>'activationDate'),
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
    NOW()
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
    activation_date = COALESCE(public.partial_tenants.activation_date, EXCLUDED.activation_date),
    next_due_date = EXCLUDED.next_due_date,
    onboarding_date = EXCLUDED.onboarding_date,
    rent_start_date = COALESCE(NULLIF(p_tenant->>'rentStartDate', ''), EXCLUDED.rent_start_date, EXCLUDED.onboarding_date, EXCLUDED.activation_date),
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
    date_registered = EXCLUDED.date_registered,
    house_status = EXCLUDED.house_status,
    collection_history = EXCLUDED.collection_history,
    recurring_bills = EXCLUDED.recurring_bills,
    avatar = EXCLUDED.avatar,
    profile_picture = EXCLUDED.profile_picture,
    kra_pin = EXCLUDED.kra_pin,
    arrears = EXCLUDED.arrears,
    role = EXCLUDED.role,
    referrer_id = EXCLUDED.referrer_id,
    referral_config = EXCLUDED.referral_config,
    auth_user_id = EXCLUDED.auth_user_id,
    occupancy_type = EXCLUDED.occupancy_type,
    main_tenant_id = EXCLUDED.main_tenant_id,
    updated_at = NOW();

  RETURN p_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant(jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Unified and Correct public.delete_tenant_payment(text, text)
-- -----------------------------------------------------------------------------
-- Drops old signatures to prevent ambiguity conflicts
DROP FUNCTION IF EXISTS public.delete_tenant_payment(uuid, text);
DROP FUNCTION IF EXISTS public.delete_tenant_payment(text, text);
DROP FUNCTION IF EXISTS public.delete_partial_tenant_payment(uuid, text);
DROP FUNCTION IF EXISTS public.delete_partial_tenant_payment(text, text);

CREATE OR REPLACE FUNCTION public.delete_tenant_payment(
  p_tenant_id text,
  p_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_ref text := btrim(coalesce(p_reference, ''));
  v_new_history jsonb;
  v_new_partial_history jsonb;
BEGIN
  -- Security / role validation
  IF NOT (
    app.is_staff_admin(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('Super Admin', 'Assistant Admin', 'Finance Manager', 'Branch Manager')
    )
  ) THEN
    RAISE EXCEPTION 'Only admins can delete payments';
  END IF;

  IF v_ref = '' THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  -- 1) Deletion logic for Standard Tenants (public.tenants)
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    -- Aggregate history without the deleted reference
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    INTO v_new_history
    FROM public.tenants t,
         jsonb_array_elements(t.payment_history) elem
    WHERE t.id = p_tenant_id
      AND btrim(lower(coalesce(elem->>'reference', ''))) <> lower(v_ref);

    -- Update history in public.tenants
    UPDATE public.tenants
    SET payment_history = coalesce(v_new_history, '[]'::jsonb),
        updated_at = now()
    WHERE id = p_tenant_id;

    -- Permanently delete the ledger row from public.payments table
    DELETE FROM public.payments
     WHERE btrim(lower(transaction_id)) = lower(v_ref)
       AND matched_tenant_id = p_tenant_id;
  END IF;

  -- 2) Deletion logic for Partial RMS Tenants (public.partial_tenants)
  IF EXISTS (SELECT 1 FROM public.partial_tenants WHERE id = p_tenant_id) THEN
    -- Aggregate history without the deleted reference
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    INTO v_new_partial_history
    FROM public.partial_tenants t,
         jsonb_array_elements(t.payment_history) elem
    WHERE t.id = p_tenant_id
      AND btrim(lower(coalesce(elem->>'reference', ''))) <> lower(v_ref);

    -- Update history in public.partial_tenants
    UPDATE public.partial_tenants
    SET payment_history = coalesce(v_new_partial_history, '[]'::jsonb),
        updated_at = now()
    WHERE id = p_tenant_id;

    -- Permanently delete the ledger row from public.partial_rms_payments table
    DELETE FROM public.partial_rms_payments
     WHERE btrim(lower(transaction_id)) = lower(v_ref)
       AND matched_tenant_id = p_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_payment(text, text) TO authenticated;

-- Create an alias function for partial scope to prevent any frontend-backend mismatch
CREATE OR REPLACE FUNCTION public.delete_partial_tenant_payment(
  p_tenant_id text,
  p_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  PERFORM public.delete_tenant_payment(p_tenant_id, p_reference);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_partial_tenant_payment(text, text) TO authenticated;
