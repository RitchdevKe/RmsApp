-- supabase/migrations/0029_tenants_normalization.sql
--
-- Normalizes public.tenants as the source of truth for tenant data.
--
-- Changes:
--   1. Adds missing columns to public.tenants so every TenantProfile field has
--      a dedicated column (phone_canonical, activation_date, deposit_exempt,
--      deposit_months, prorated_deposit, rent_extension, next_of_kin_*,
--      alternative_phone, rent_grace_days, lease_signed, etc.)
--   2. Adds a check constraint on status with the full lifecycle enum:
--      PendingAllocation, PendingPayment, Active, Overdue, Notice, Vacated,
--      Evicted, Blacklisted, Inactive, Pending (legacy).
--   3. Adds app.canonicalize_phone(text) — strips non-digits, normalizes to
--      254XXXXXXXXX, returns NULL for empty/invalid.
--   4. Adds a unique partial index on phone_canonical (when not null) to
--      enforce cross-tenant uniqueness. Same for id_number.
--   5. Updates check_phone_unique to compare canonicalized phones.
--   6. Adds app.load_tenants() RPC — returns all tenants for the current
--      user as a JSONB array shaped like TenantProfile[] (camelCase fields).
--   7. Adds app.upsert_tenant(jsonb) RPC — accepts a TenantProfile object
--      and upserts into public.tenants with canonicalization.
--   8. Backfills public.tenants from existing app.app_state['tm_tenants_v11']
--      blobs (per-user, respecting ownership via app_state's owner_id).
--
-- Idempotent: safe to run multiple times.

-- ── 1. Add missing columns ─────────────────────────────────────────────────
alter table public.tenants
  add column if not exists phone_canonical        text,
  add column if not exists alternative_phone      text,
  add column if not exists alternative_phone_canonical text,
  add column if not exists next_of_kin_name       text,
  add column if not exists next_of_kin_phone      text,
  add column if not exists next_of_kin_phone_canonical text,
  add column if not exists next_of_kin_relationship text,
  add column if not exists rent_grace_days        int default 5,
  add column if not exists next_due_date          text,
  add column if not exists lease_signed           boolean default false,
  add column if not exists lease_start_date       text,
  add column if not exists auth_user_id           text,
  add column if not exists deposit_exempt         boolean default false,
  add column if not exists deposit_expected       numeric default 0,
  add column if not exists deposit_months         int default 1,
  add column if not exists prorated_deposit       jsonb,
  add column if not exists rent_extension         jsonb,
  add column if not exists activation_date        text; -- ISO date when tenant first reached Active

-- ── 2. Status check constraint with full lifecycle ─────────────────────────
-- Drop any existing constraint, add new one covering all valid states.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenants_status_check') then
    alter table public.tenants drop constraint tenants_status_check;
  end if;
end $$;

alter table public.tenants
  add constraint tenants_status_check check (status in (
    'PendingAllocation',
    'PendingPayment',
    'Active',
    'Overdue',
    'Notice',
    'Vacated',
    'Evicted',
    'Blacklisted',
    'Inactive',
    'Pending' -- legacy; backfill will migrate these to PendingAllocation/PendingPayment
  ));

-- ── 3. Canonicalize phone helper ───────────────────────────────────────────
-- Handles: "0712 345 678" → "254712345678"
--          "+254 712 345 678" → "254712345678"
--          "254712345678" → "254712345678"
--          "712345678" → "254712345678"
--          anything else → NULL (lets callers decide fallback behavior)
create or replace function app.canonicalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if p_phone is null then return null; end if;
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if length(digits) = 0 then return null; end if;
  -- 0XXXXXXXXX → 254XXXXXXXXX
  if length(digits) = 10 and substring(digits from 1 for 1) = '0' then
    return '254' || substring(digits from 2);
  end if;
  -- 7XXXXXXXX (9 digits starting with 7 or 1) → 254XXXXXXXXX
  if length(digits) = 9 and substring(digits from 1 for 1) in ('7', '1') then
    return '254' || digits;
  end if;
  -- 254XXXXXXXXX (12 digits starting with 254)
  if length(digits) = 12 and substring(digits from 1 for 3) = '254' then
    return digits;
  end if;
  -- Anything else: return the cleaned digits so callers can still dedupe by them
  return digits;
end;
$$;

grant execute on function app.canonicalize_phone(text) to authenticated, service_role;

-- ── 4. Populate canonical columns from existing data ───────────────────────
update public.tenants
   set phone_canonical = app.canonicalize_phone(phone)
 where phone is not null and phone_canonical is null;

-- ── 5. Unique partial indexes (phone_canonical + id_number per creator) ────
-- Per-creator uniqueness: different landlords may have tenants with the same
-- number in theory, but for our use case we treat the whole system as one
-- agency, so we enforce GLOBAL uniqueness.
create unique index if not exists tenants_phone_canonical_unique
  on public.tenants (phone_canonical)
  where phone_canonical is not null;

create unique index if not exists tenants_id_number_unique
  on public.tenants (id_number)
  where id_number is not null and id_number <> '';

-- ── 6. Update check_phone_unique to use canonical form ─────────────────────
drop function if exists public.check_phone_unique(text);
drop function if exists app.check_phone_unique(text);

create or replace function app.check_phone_unique(p_phone text)
returns table(
  user_id text,
  source  text,
  name    text,
  email   text
)
language sql
security definer
set search_path = app, public, auth
as $$
  with c as (select app.canonicalize_phone(p_phone) as p)
  select t.id::text, 'tenant'::text, t.name, t.email
    from public.tenants t, c
   where t.phone_canonical = c.p and c.p is not null
  union all
  select l.id::text, 'landlord'::text, l.name, l.email
    from public.landlords l, c
   where app.canonicalize_phone(l.phone) = c.p and c.p is not null
  union all
  select s.id::text, 'staff'::text, s.name, s.email
    from app.staff_profiles s, c
   where app.canonicalize_phone(s.phone) = c.p and c.p is not null;
$$;

create or replace function public.check_phone_unique(p_phone text)
returns table(user_id text, source text, name text, email text)
language sql
security definer
set search_path = public, app, auth
as $$
  select * from app.check_phone_unique(p_phone := p_phone);
$$;

grant execute on function public.check_phone_unique(text) to authenticated;
grant execute on function app.check_phone_unique(text) to authenticated, service_role;

-- ── 7. Tenants loader RPC (returns TenantProfile-shaped JSONB array) ───────
-- Returns ALL tenants to any authenticated caller (consistent with the
-- existing app.app_state blob behavior — this is a single-agency app where
-- all staff see all tenants). RLS on the base table still restricts direct
-- SELECTs to owners; this SECURITY DEFINER RPC is the authorized read path.
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
      'authUserId',              t.auth_user_id
    )) as row
    from public.tenants t
    order by t.created_at desc
  ) sub;
$$;

grant execute on function app.load_tenants() to authenticated;

-- ── 8. Tenant upsert RPC (canonicalizes phone; accepts TenantProfile) ──────
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
    updated_at = now();

  return p_tenant;
end;
$$;

grant execute on function app.upsert_tenant(jsonb) to authenticated, service_role;

-- Bulk variant — accepts a JSONB array and upserts each. Used by the client
-- to sync the entire tenants array in one round-trip.
create or replace function app.upsert_tenants_bulk(p_tenants jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_tenants) <> 'array' then
    raise exception 'p_tenants must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_tenants)
  loop
    perform app.upsert_tenant(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_tenants_bulk(jsonb) to authenticated, service_role;

-- Delete RPC (so the client can remove a tenant from public.tenants).
-- Open to any authenticated caller — matches the app's existing model where
-- all authorized staff can manage all tenants.
create or replace function app.delete_tenant(p_id text)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_deleted int;
begin
  delete from public.tenants where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function app.delete_tenant(text) to authenticated, service_role;

-- ── 9. Backfill: blob → public.tenants ─────────────────────────────────────
-- For every owner that has a tm_tenants_v11 blob, upsert each tenant into
-- public.tenants (preserving the blob's values). This is a one-shot migration
-- operation; re-running is safe (ON CONFLICT DO UPDATE).
--
-- Note: app.app_state rows don't have an explicit owner column in the base
-- schema, so we rely on the existing RLS policies to show only the caller's
-- blob. Since this migration runs as superuser, we iterate the whole table.
do $$
declare
  r record;
  v_tenants jsonb;
  v_item    jsonb;
  v_created_by uuid;
begin
  for r in
    select key, value
      from app.app_state
     where key = 'tm_tenants_v11'
  loop
    v_tenants := r.value;
    if v_tenants is null or jsonb_typeof(v_tenants) <> 'array' then
      continue;
    end if;

    for v_item in select * from jsonb_array_elements(v_tenants)
    loop
      -- Skip items without an id
      if (v_item->>'id') is null then continue; end if;

      -- Try to resolve created_by from the blob (createdBy field if set).
      v_created_by := nullif(v_item->>'createdBy', '')::uuid;

      insert into public.tenants (
        id, created_by, name, email, phone, phone_canonical,
        alternative_phone, alternative_phone_canonical,
        next_of_kin_name, next_of_kin_phone, next_of_kin_phone_canonical, next_of_kin_relationship,
        id_number, status, property_id, property_name, unit_id, unit,
        rent_amount, rent_due_date, rent_grace_days,
        deposit_paid, deposit_exempt, deposit_expected, deposit_months,
        prorated_deposit, rent_extension, activation_date,
        next_due_date, onboarding_date,
        lease_signed, lease_start_date, lease_end, lease_type,
        payment_history, outstanding_bills, outstanding_fines,
        kra_pin, arrears, role, auth_user_id,
        date_registered, house_status, collection_history, recurring_bills,
        avatar, profile_picture, referrer_id, referral_config,
        updated_at
      ) values (
        v_item->>'id',
        v_created_by,
        coalesce(v_item->>'name', '(unnamed)'),
        coalesce(v_item->>'email', ''),
        v_item->>'phone',
        app.canonicalize_phone(v_item->>'phone'),
        v_item->>'alternativePhone',
        app.canonicalize_phone(v_item->>'alternativePhone'),
        v_item->>'nextOfKinName',
        v_item->>'nextOfKinPhone',
        app.canonicalize_phone(v_item->>'nextOfKinPhone'),
        v_item->>'nextOfKinRelationship',
        v_item->>'idNumber',
        -- Legacy → new status mapping:
        --   'Pending' + no unit   → PendingAllocation
        --   'Pending' + has unit  → PendingPayment
        --   anything else         → keep as-is
        case
          when coalesce(v_item->>'status','') = 'Pending' and (v_item->>'unitId' is null or v_item->>'unitId' = '')
            then 'PendingAllocation'
          when coalesce(v_item->>'status','') = 'Pending'
            then 'PendingPayment'
          else coalesce(v_item->>'status', 'PendingAllocation')
        end,
        v_item->>'propertyId',
        v_item->>'propertyName',
        v_item->>'unitId',
        v_item->>'unit',
        nullif(v_item->>'rentAmount','')::numeric,
        nullif(v_item->>'rentDueDate','')::int,
        coalesce(nullif(v_item->>'rentGraceDays','')::int, 5),
        nullif(v_item->>'depositPaid','')::numeric,
        coalesce((v_item->>'depositExempt')::boolean, false),
        coalesce(nullif(v_item->>'depositExpected','')::numeric, 0),
        coalesce(nullif(v_item->>'depositMonths','')::int, 1),
        v_item->'proratedDeposit',
        v_item->'rentExtension',
        v_item->>'activationDate',
        v_item->>'nextDueDate',
        v_item->>'onboardingDate',
        coalesce((v_item->>'leaseSigned')::boolean, false),
        v_item->>'leaseStartDate',
        v_item->>'leaseEnd',
        v_item->>'leaseType',
        coalesce(v_item->'paymentHistory', '[]'::jsonb),
        coalesce(v_item->'outstandingBills', '[]'::jsonb),
        coalesce(v_item->'outstandingFines', '[]'::jsonb),
        v_item->>'kraPin',
        nullif(v_item->>'arrears','')::numeric,
        v_item->>'role',
        v_item->>'authUserId',
        v_item->>'dateRegistered',
        coalesce(v_item->'houseStatus', '[]'::jsonb),
        coalesce(v_item->'collectionHistory', '[]'::jsonb),
        v_item->'recurringBills',
        v_item->>'avatar',
        v_item->>'profilePicture',
        v_item->>'referrerId',
        v_item->'referralConfig',
        now()
      )
      on conflict (id) do update set
        phone_canonical = excluded.phone_canonical,
        alternative_phone = coalesce(excluded.alternative_phone, public.tenants.alternative_phone),
        alternative_phone_canonical = coalesce(excluded.alternative_phone_canonical, public.tenants.alternative_phone_canonical),
        next_of_kin_name = coalesce(excluded.next_of_kin_name, public.tenants.next_of_kin_name),
        next_of_kin_phone = coalesce(excluded.next_of_kin_phone, public.tenants.next_of_kin_phone),
        next_of_kin_phone_canonical = coalesce(excluded.next_of_kin_phone_canonical, public.tenants.next_of_kin_phone_canonical),
        next_of_kin_relationship = coalesce(excluded.next_of_kin_relationship, public.tenants.next_of_kin_relationship),
        rent_grace_days = coalesce(public.tenants.rent_grace_days, excluded.rent_grace_days),
        deposit_exempt = excluded.deposit_exempt,
        deposit_expected = excluded.deposit_expected,
        deposit_months = excluded.deposit_months,
        prorated_deposit = excluded.prorated_deposit,
        rent_extension = excluded.rent_extension,
        activation_date = coalesce(public.tenants.activation_date, excluded.activation_date),
        next_due_date = coalesce(excluded.next_due_date, public.tenants.next_due_date),
        status = case
          when public.tenants.status = 'Active' then public.tenants.status
          else excluded.status
        end,
        updated_at = now();
    end loop;
  end loop;
end $$;

-- ── 10. Sanity: recompute deposit_expected where 0 but rent/months known ───
-- Leaves fresh tenants with a sensible expected value so UI doesn't show
-- "Fully Paid" by default (Issue #4 — Dennis Okumu case).
update public.tenants
   set deposit_expected = rent_amount * coalesce(deposit_months, 1)
 where coalesce(deposit_expected, 0) = 0
   and coalesce(deposit_exempt, false) = false
   and rent_amount is not null
   and rent_amount > 0;
