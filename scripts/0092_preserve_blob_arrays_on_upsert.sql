-- 0092_preserve_blob_arrays_on_upsert.sql
--
-- Fix data loss caused by `app.upsert_tenant` overwriting `payment_history`
-- (and sibling blob arrays) with `'[]'` whenever the client omits those fields.
--
-- Background:
--   The frontend (context/DataContext.tsx ~line 265) strips paymentHistory,
--   maintenanceRequests, notes, notices, requests, and collectionHistory from
--   the JSON payload sent to `app.upsert_tenants_bulk` to keep payload sizes
--   small. The 0029 implementation did:
--       payment_history = excluded.payment_history
--   where excluded.payment_history = COALESCE(p_tenant->'paymentHistory','[]').
--   Result: every tenant update wiped the column to [], destroying history
--   written server-side by record_manual_payment, record_c2b_payment, and
--   STK callbacks. Migration 0090 partially backfilled, hiding the symptom.
--
-- Fix:
--   Only overwrite each blob-array column when the caller actually provided
--   the key. Detect "provided" with `p_tenant ? 'paymentHistory'` (jsonb key
--   existence) so we distinguish "client sent []" (replace) from "client
--   stripped the field" (preserve).
--
-- Idempotent: safe to run multiple times.

create or replace function app.upsert_tenant(p_tenant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id          text := p_tenant->>'id';
  v_phone       text := p_tenant->>'phone';
  v_alt_phone   text := p_tenant->>'alternativePhone';
  v_nok_phone   text := p_tenant->>'nextOfKinPhone';
begin
  if v_id is null or v_id = '' then
    raise exception 'tenant.id is required';
  end if;

  insert into public.tenants (
    id, created_by, name, username, email, phone, phone_canonical,
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
    -- ── Blob-array fields: preserve existing column when the key is absent ──
    -- The frontend strips these keys to reduce payload size. Use `?` (jsonb
    -- key existence) so "client sent []" still overwrites, but "key absent"
    -- preserves whatever record_manual_payment / record_c2b_payment wrote.
    payment_history = case
      when p_tenant ? 'paymentHistory'      then excluded.payment_history
      else public.tenants.payment_history
    end,
    outstanding_bills = case
      when p_tenant ? 'outstandingBills'    then excluded.outstanding_bills
      else public.tenants.outstanding_bills
    end,
    outstanding_fines = case
      when p_tenant ? 'outstandingFines'    then excluded.outstanding_fines
      else public.tenants.outstanding_fines
    end,
    maintenance_requests = case
      when p_tenant ? 'maintenanceRequests' then excluded.maintenance_requests
      else public.tenants.maintenance_requests
    end,
    notes = case
      when p_tenant ? 'notes'               then excluded.notes
      else public.tenants.notes
    end,
    notices = case
      when p_tenant ? 'notices'             then excluded.notices
      else public.tenants.notices
    end,
    requests = case
      when p_tenant ? 'requests'            then excluded.requests
      else public.tenants.requests
    end,
    collection_history = case
      when p_tenant ? 'collectionHistory'   then excluded.collection_history
      else public.tenants.collection_history
    end,
    -- ────────────────────────────────────────────────────────────────────────
    date_registered = excluded.date_registered,
    house_status = excluded.house_status,
    recurring_bills = excluded.recurring_bills,
    avatar = excluded.avatar,
    profile_picture = excluded.profile_picture,
    kra_pin = excluded.kra_pin,
    arrears = excluded.arrears,
    role = excluded.role,
    referrer_id = excluded.referrer_id,
    referral_config = excluded.referral_config,
    auth_user_id = excluded.auth_user_id,
    updated_at = now();

  return p_tenant;
end;
$$;

grant execute on function app.upsert_tenant(jsonb) to authenticated, service_role;
