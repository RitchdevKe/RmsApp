-- Create partial tables

CREATE TABLE IF NOT EXISTS public.partial_system_settings (LIKE public.system_settings INCLUDING ALL);
CREATE TABLE IF NOT EXISTS app.partial_staff_profiles (LIKE app.staff_profiles INCLUDING ALL);
CREATE TABLE IF NOT EXISTS app.partial_roles (LIKE app.roles INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.partial_tenants (LIKE public.tenants INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_landlords (LIKE public.landlords INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_properties (LIKE public.properties INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_vendors (LIKE public.vendors INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_tasks (LIKE public.tasks INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_bills (LIKE public.bills INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_invoices (LIKE public.invoices INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_fine_rules (LIKE public.fine_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_overpayments (LIKE public.overpayments INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_quotations (LIKE public.quotations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_landlord_applications (LIKE public.landlord_applications INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_tenant_applications (LIKE public.tenant_applications INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_offboarding_records (LIKE public.offboarding_records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_landlord_offboarding_records (LIKE public.landlord_offboarding_records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_commission_rules (LIKE public.commission_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_deduction_rules (LIKE public.deduction_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_income_sources (LIKE public.income_sources INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_preventive_tasks (LIKE public.preventive_tasks INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_messages (LIKE public.messages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_notifications (LIKE public.notifications INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_communication_templates (LIKE public.communication_templates INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_workflows (LIKE public.workflows INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_automation_rules (LIKE public.automation_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_escalation_rules (LIKE public.escalation_rules INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_scheduled_reports (LIKE public.scheduled_reports INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_tax_records (LIKE public.tax_records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_leads (LIKE public.leads INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_fundi_jobs (LIKE public.fundi_jobs INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_marketing_banners (LIKE public.marketing_banners INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_geospatial_data (LIKE public.geospatial_data INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_units (LIKE public.units INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_leases (LIKE public.leases INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_partial_payments (LIKE public.partial_payments INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_external_transactions (LIKE public.external_transactions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_audit_logs (LIKE public.audit_logs INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.partial_payments (LIKE public.payments INCLUDING ALL);

-- Cloned functions

CREATE OR REPLACE function app.partial_load_tenants()
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
      'rentStartDate',           t.rent_start_date
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
    from public.partial_tenants t
    order by t.created_at desc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_tenants TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tenant(p_tenant jsonb)
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
    occupancy_type, main_tenant_id,
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
    updated_at = now();

  return p_tenant;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tenants_bulk(p_tenants jsonb)
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
    perform app.partial_upsert_tenant(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenants_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_delete_tenant(p_id text)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_deleted int;
begin
  delete from public.partial_tenants where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function app.partial_delete_tenant(text) to authenticated, service_role;

-- ── 9. Backfill: blob → public.partial_tenants ─────────────────────────────────────
-- For every owner that has a tm_tenants_v11 blob, upsert each tenant into
-- public.partial_tenants (preserving the blob's values). This is a one-shot migration
-- operation; re-running is safe (ON CONFLICT DO UPDATE).
--
-- Note: app.app_state rows don't have an explicit owner column in the base
-- schema, so we rely on the existing RLS policies to show only the caller's
-- blob. Since this migration runs as superuser, we iterate the whole table.
-- removed backfill block

-- ── 10. Sanity: recompute deposit_expected where 0 but rent/months known ───
-- Leaves fresh tenants with a sensible expected value so UI doesn't show
-- "Fully Paid" by default (Issue #4 — Dennis Okumu case).
update public.partial_tenants
   set deposit_expected = rent_amount * coalesce(deposit_months, 1)
 where coalesce(deposit_expected, 0) = 0
   and coalesce(deposit_exempt, false) = false
   and rent_amount is not null
   and rent_amount > 0;


GRANT EXECUTE ON FUNCTION app.partial_delete_tenant TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_properties()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                             p.id,
      'name',                           p.name,
      'type',                           p.type,
      'ownership',                      p.ownership,
      'branch',                         p.branch,
      'status',                         p.status,
      'landlordId',                     p.landlord_id,
      'assignedAgentId',                p.assigned_agent_id,
      'location',                       p.location,
      'defaultMonthlyRent',             p.default_monthly_rent,
      'floors',                         p.floors,
      'units',                          coalesce(p.units, '[]'::jsonb),
      'assets',                         coalesce(p.assets, '[]'::jsonb),
      'defaultUnitType',                p.default_unit_type,
      'rentIsUniform',                  p.rent_is_uniform,
      'rentType',                       p.rent_type,
      'deposit',                        p.deposit,
      'utilityDeposit',                 p.utility_deposit,
      'placementFee',                   p.placement_fee,
      'managementType',                 p.management_type,
      'landlordPaybill',                p.landlord_paybill,
      'bills',                          p.bills,
      'remittanceType',                 p.remittance_type,
      'remittanceCutoffDay',            p.remittance_cutoff_day,
      'nearestLandmark',                p.nearest_landmark,
      'county',                         p.county,
      'subCounty',                      p.sub_county,
      'zone',                           p.zone,
      'subLocation',                    p.sub_location,
      'pinLocationUrl',                 p.pin_location_url,
      'websiteListingUrl',              p.website_listing_url,
      'profilePictureUrl',              p.profile_picture_url,
      'rentByType',                     p.rent_by_type,
      'floorplan',                      coalesce(p.floorplan, '[]'::jsonb),
      'monthlyRentalIncomeTaxPercent',  p.monthly_rental_income_tax_percent,
      'commercialVatPercent',           p.commercial_vat_percent,
      'agencyCommissionPercent',        p.agency_commission_percent
    )) as row
    from public.partial_properties p
    order by p.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_properties TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_property(p_property jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_property->>'id';
begin
  if v_id is null then
    raise exception 'property.id is required';
  end if;

  insert into public.partial_properties (
    id, created_by, name, type, ownership, branch, status,
    landlord_id, assigned_agent_id, location,
    default_monthly_rent, floors,
    units, assets, default_unit_type, rent_is_uniform, rent_type,
    deposit, utility_deposit, placement_fee,
    management_type, landlord_paybill,
    bills, remittance_type, remittance_cutoff_day,
    nearest_landmark, county, sub_county, zone, sub_location,
    pin_location_url, website_listing_url, profile_picture_url,
    rent_by_type, floorplan,
    monthly_rental_income_tax_percent, commercial_vat_percent,
    agency_commission_percent,
    updated_at
  ) values (
    v_id,
    auth.uid(),
    p_property->>'name',
    p_property->>'type',
    p_property->>'ownership',
    p_property->>'branch',
    coalesce(p_property->>'status', 'Active'),
    p_property->>'landlordId',
    p_property->>'assignedAgentId',
    p_property->>'location',
    nullif(p_property->>'defaultMonthlyRent','')::numeric,
    nullif(p_property->>'floors','')::int,
    coalesce(p_property->'units', '[]'::jsonb),
    coalesce(p_property->'assets', '[]'::jsonb),
    p_property->>'defaultUnitType',
    (p_property->>'rentIsUniform')::boolean,
    p_property->>'rentType',
    p_property->'deposit',
    p_property->'utilityDeposit',
    (p_property->>'placementFee')::boolean,
    p_property->>'managementType',
    p_property->>'landlordPaybill',
    p_property->'bills',
    p_property->>'remittanceType',
    nullif(p_property->>'remittanceCutoffDay','')::int,
    p_property->>'nearestLandmark',
    p_property->>'county',
    p_property->>'subCounty',
    p_property->>'zone',
    p_property->>'subLocation',
    p_property->>'pinLocationUrl',
    p_property->>'websiteListingUrl',
    p_property->>'profilePictureUrl',
    p_property->'rentByType',
    coalesce(p_property->'floorplan', '[]'::jsonb),
    nullif(p_property->>'monthlyRentalIncomeTaxPercent','')::numeric,
    nullif(p_property->>'commercialVatPercent','')::numeric,
    nullif(p_property->>'agencyCommissionPercent','')::numeric,
    now()
  )
  on conflict (id) do update set
    name                              = excluded.name,
    type                              = excluded.type,
    ownership                         = excluded.ownership,
    branch                            = excluded.branch,
    status                            = excluded.status,
    landlord_id                       = excluded.landlord_id,
    assigned_agent_id                 = excluded.assigned_agent_id,
    location                          = excluded.location,
    default_monthly_rent              = excluded.default_monthly_rent,
    floors                            = excluded.floors,
    units                             = excluded.units,
    assets                            = excluded.assets,
    default_unit_type                 = excluded.default_unit_type,
    rent_is_uniform                   = excluded.rent_is_uniform,
    rent_type                         = excluded.rent_type,
    deposit                           = excluded.deposit,
    utility_deposit                   = excluded.utility_deposit,
    placement_fee                     = excluded.placement_fee,
    management_type                   = excluded.management_type,
    landlord_paybill                  = excluded.landlord_paybill,
    bills                             = excluded.bills,
    remittance_type                   = excluded.remittance_type,
    remittance_cutoff_day             = excluded.remittance_cutoff_day,
    nearest_landmark                  = excluded.nearest_landmark,
    county                            = excluded.county,
    sub_county                        = excluded.sub_county,
    zone                              = excluded.zone,
    sub_location                      = excluded.sub_location,
    pin_location_url                  = excluded.pin_location_url,
    website_listing_url               = excluded.website_listing_url,
    profile_picture_url               = excluded.profile_picture_url,
    rent_by_type                      = excluded.rent_by_type,
    floorplan                         = excluded.floorplan,
    monthly_rental_income_tax_percent = excluded.monthly_rental_income_tax_percent,
    commercial_vat_percent            = excluded.commercial_vat_percent,
    agency_commission_percent         = excluded.agency_commission_percent,
    updated_at                        = now();

  return p_property;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_property TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_properties_bulk(p_properties jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_properties) <> 'array' then
    raise exception 'p_properties must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_properties)
  loop
    perform app.partial_upsert_property(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_properties_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_properties_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_landlords()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',             l.id,
      'name',           l.name,
      'username',       l.username,
      'email',          l.email,
      'phone',          l.phone,
      'idNumber',       l.id_number,
      'kraPin',         l.kra_pin,
      'role',           l.role,
      'status',         l.status,
      'branch',         l.branch,
      'avatarUrl',      l.avatar_url,
      'referrerId',     l.referrer_id,
      'referralConfig', l.referral_config
    )) as row
    from public.partial_landlords l
    order by l.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_landlords TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlord(p_landlord jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_landlord->>'id';
begin
  if v_id is null then
    raise exception 'landlord.id is required';
  end if;

  insert into public.partial_landlords (
    id, created_by, name, username, email, phone, id_number,
    kra_pin, role, status, branch, avatar_url,
    referrer_id, referral_config, updated_at
  ) values (
    v_id,
    auth.uid(),
    coalesce(p_landlord->>'name', '(unnamed)'),
    p_landlord->>'username',
    coalesce(p_landlord->>'email', ''),
    p_landlord->>'phone',
    p_landlord->>'idNumber',
    p_landlord->>'kraPin',
    p_landlord->>'role',
    coalesce(p_landlord->>'status', 'Active'),
    p_landlord->>'branch',
    p_landlord->>'avatarUrl',
    p_landlord->>'referrerId',
    p_landlord->'referralConfig',
    now()
  )
  on conflict (id) do update set
    name             = excluded.name,
    username         = excluded.username,
    email            = excluded.email,
    phone            = excluded.phone,
    id_number        = excluded.id_number,
    kra_pin          = excluded.kra_pin,
    role             = excluded.role,
    status           = excluded.status,
    branch           = excluded.branch,
    avatar_url       = excluded.avatar_url,
    referrer_id      = excluded.referrer_id,
    referral_config  = excluded.referral_config,
    updated_at       = now();

  return p_landlord;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlords_bulk(p_landlords jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_landlords) <> 'array' then
    raise exception 'p_landlords must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_landlords)
  loop
    perform app.partial_upsert_landlord(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_landlords_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlords_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_staff()
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
    from app.partial_staff_profiles s
    order by s.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_staff TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_staff_profile(p_staff jsonb)
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

  insert into app.partial_staff_profiles (
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
GRANT EXECUTE ON FUNCTION app.partial_upsert_staff_profile TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_staff_bulk(p_staff jsonb)
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
    perform app.partial_upsert_staff_profile(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_staff_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_staff_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_vendors()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',              v.id,
      'name',            v.name,
      'username',        v.username,
      'specialty',       v.specialty,
      'rating',          v.rating,
      'email',           v.email,
      'phone',           v.phone,
      'location',        v.location,
      'dailyRate',       v.daily_rate,
      'verified',        v.verified,
      'completedJobs',   v.completed_jobs,
      'avatarUrl',       v.avatar_url,
      'summary',         v.summary,
      'certifications',  v.certifications,
      'eta',             v.eta,
      'available',       v.available,
      'portfolioImages', v.portfolio_images
    )) as row
    from public.partial_vendors v
    order by v.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_vendors TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_vendor(p_vendor jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_vendor->>'id';
begin
  if v_id is null then
    raise exception 'vendor.id is required';
  end if;

  insert into public.partial_vendors (
    id, created_by, name, username, specialty, rating,
    email, phone, location, daily_rate, verified,
    completed_jobs, avatar_url, summary,
    certifications, eta, available, portfolio_images,
    updated_at
  ) values (
    v_id,
    auth.uid(),
    coalesce(p_vendor->>'name', '(unnamed)'),
    p_vendor->>'username',
    coalesce(p_vendor->>'specialty', 'General'),
    coalesce(nullif(p_vendor->>'rating','')::numeric, 5),
    p_vendor->>'email',
    p_vendor->>'phone',
    p_vendor->>'location',
    nullif(p_vendor->>'dailyRate','')::numeric,
    coalesce((p_vendor->>'verified')::boolean, false),
    coalesce(nullif(p_vendor->>'completedJobs','')::int, 0),
    p_vendor->>'avatarUrl',
    p_vendor->>'summary',
    coalesce(p_vendor->'certifications', '[]'::jsonb),
    p_vendor->>'eta',
    coalesce((p_vendor->>'available')::boolean, true),
    coalesce(p_vendor->'portfolioImages', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    name             = excluded.name,
    username         = excluded.username,
    specialty        = excluded.specialty,
    rating           = excluded.rating,
    email            = excluded.email,
    phone            = excluded.phone,
    location         = excluded.location,
    daily_rate       = excluded.daily_rate,
    verified         = excluded.verified,
    completed_jobs   = excluded.completed_jobs,
    avatar_url       = excluded.avatar_url,
    summary          = excluded.summary,
    certifications   = excluded.certifications,
    eta              = excluded.eta,
    available        = excluded.available,
    portfolio_images = excluded.portfolio_images,
    updated_at       = now();

  return p_vendor;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_vendor TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_vendors_bulk(p_vendors jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_vendors) <> 'array' then
    raise exception 'p_vendors must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_vendors)
  loop
    perform app.partial_upsert_vendor(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_vendors_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_vendors_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_external_transactions()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',              t.id,
      'date',            t.date,
      'reference',       t.reference,
      'transactionCode', t.transaction_code,
      'amount',          t.amount,
      'name',            t.name,
      'account',         t.account,
      'type',            t.type,
      'matched',         t.matched,
      'matchedTenantId', t.matched_tenant_id
    )) as row
    from public.partial_external_transactions t
    order by t.date desc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_external_transactions TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_external_transaction(p_tx jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_tx->>'id';
begin
  if v_id is null then
    raise exception 'external_transaction.id is required';
  end if;

  insert into public.partial_external_transactions (
    id, date, reference, transaction_code,
    amount, name, account, type, matched, matched_tenant_id,
    updated_at
  ) values (
    v_id,
    coalesce(p_tx->>'date', ''),
    coalesce(p_tx->>'reference', ''),
    p_tx->>'transactionCode',
    coalesce(nullif(p_tx->>'amount','')::numeric, 0),
    coalesce(p_tx->>'name', ''),
    coalesce(p_tx->>'account', ''),
    coalesce(p_tx->>'type', 'M-Pesa'),
    coalesce((p_tx->>'matched')::boolean, false),
    p_tx->>'matchedTenantId',
    now()
  )
  on conflict (id) do update set
    date              = excluded.date,
    reference         = excluded.reference,
    transaction_code  = excluded.transaction_code,
    amount            = excluded.amount,
    name              = excluded.name,
    account           = excluded.account,
    type              = excluded.type,
    matched           = excluded.matched,
    matched_tenant_id = excluded.matched_tenant_id,
    updated_at        = now();

  return p_tx;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_external_transaction TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_external_transactions_bulk(p_txs jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_txs) <> 'array' then
    raise exception 'p_txs must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_txs)
  loop
    perform app.partial_upsert_external_transaction(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_external_transactions_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_external_transactions_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_audit_logs()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',        l.id,
      'timestamp', l.timestamp,
      'action',    l.action,
      'user',      l.actor
    ) as row
    from public.partial_audit_logs l
    order by l.timestamp desc
    limit 500
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_audit_logs TO authenticated, service_role;

CREATE OR REPLACE function app.partial_insert_audit_log(p_log jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_log->>'id';
begin
  if v_id is null then return; end if;

  insert into public.partial_audit_logs (id, timestamp, action, actor)
  values (
    v_id,
    coalesce(p_log->>'timestamp', now()::text),
    coalesce(p_log->>'action', ''),
    coalesce(p_log->>'user', '')
  )
  on conflict (id) do nothing;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_insert_audit_log TO authenticated, service_role;

CREATE OR REPLACE function app.partial_insert_audit_logs_bulk(p_logs jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_logs) <> 'array' then
    raise exception 'p_logs must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_logs)
  loop
    perform app.partial_insert_audit_log(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_insert_audit_logs_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_insert_audit_logs_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_tasks()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                    t.id,
      'title',                 t.title,
      'description',           t.description,
      'status',                t.status,
      'priority',              t.priority,
      'dueDate',               t.due_date,
      'sla',                   t.sla,
      'assignedTo',            t.assigned_to,
      'tenant',                t.tenant,
      'property',              t.property,
      'comments',              t.comments,
      'history',               t.history,
      'attachments',           t.attachments,
      'source',                t.source,
      'costs',                 t.costs,
      'completionAttachments', t.completion_attachments
    )) as row
    from public.partial_tasks t
    order by t.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_tasks TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_task(p_task jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_task->>'id';
begin
  if v_id is null then raise exception 'task.id is required'; end if;

  insert into public.partial_tasks (
    id, title, description, status, priority, due_date, sla,
    assigned_to, tenant, property, comments, history,
    attachments, source, costs, completion_attachments, updated_at
  ) values (
    v_id,
    coalesce(p_task->>'title', ''),
    coalesce(p_task->>'description', ''),
    coalesce(p_task->>'status', 'Open'),
    coalesce(p_task->>'priority', 'Medium'),
    coalesce(p_task->>'dueDate', ''),
    nullif(p_task->>'sla', '')::int,
    p_task->>'assignedTo',
    p_task->'tenant',
    coalesce(p_task->>'property', ''),
    coalesce(p_task->'comments', '[]'::jsonb),
    coalesce(p_task->'history', '[]'::jsonb),
    coalesce(p_task->'attachments', '[]'::jsonb),
    p_task->>'source',
    p_task->'costs',
    coalesce(p_task->'completionAttachments', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    title                  = excluded.title,
    description            = excluded.description,
    status                 = excluded.status,
    priority               = excluded.priority,
    due_date               = excluded.due_date,
    sla                    = excluded.sla,
    assigned_to            = excluded.assigned_to,
    tenant                 = excluded.tenant,
    property               = excluded.property,
    comments               = excluded.comments,
    history                = excluded.history,
    attachments            = excluded.attachments,
    source                 = excluded.source,
    costs                  = excluded.costs,
    completion_attachments = excluded.completion_attachments,
    updated_at             = now();

  return p_task;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_task TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tasks_bulk(p_tasks jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'p_tasks must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_tasks)
  loop
    perform app.partial_upsert_task(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_tasks_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_tasks_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_bills()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',          b.id,
      'vendor',      b.vendor,
      'category',    b.category,
      'amount',      b.amount,
      'invoiceDate', b.invoice_date,
      'dueDate',     b.due_date,
      'status',      b.status,
      'propertyId',  b.property_id,
      'description', b.description,
      'metadata',    b.metadata
    )) as row
    from public.partial_bills b
    order by b.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_bills TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_bill(p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_bill->>'id';
begin
  if v_id is null then raise exception 'bill.id is required'; end if;

  insert into public.partial_bills (
    id, vendor, category, amount, invoice_date, due_date,
    status, property_id, description, metadata, updated_at
  ) values (
    v_id,
    coalesce(p_bill->>'vendor', ''),
    coalesce(p_bill->>'category', ''),
    coalesce(nullif(p_bill->>'amount','')::numeric, 0),
    coalesce(p_bill->>'invoiceDate', ''),
    coalesce(p_bill->>'dueDate', ''),
    coalesce(p_bill->>'status', 'Unpaid'),
    coalesce(p_bill->>'propertyId', ''),
    p_bill->>'description',
    p_bill->'metadata',
    now()
  )
  on conflict (id) do update set
    vendor       = excluded.vendor,
    category     = excluded.category,
    amount       = excluded.amount,
    invoice_date = excluded.invoice_date,
    due_date     = excluded.due_date,
    status       = excluded.status,
    property_id  = excluded.property_id,
    description  = excluded.description,
    metadata     = excluded.metadata,
    updated_at   = now();

  return p_bill;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_bill TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_bills_bulk(p_bills jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_bills) <> 'array' then
    raise exception 'p_bills must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_bills)
  loop
    perform app.partial_upsert_bill(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_bills_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_bills_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_invoices()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',             i.id,
      'invoiceNumber',  i.invoice_number,
      'category',       i.category,
      'tenantName',     i.tenant_name,
      'unit',           i.unit,
      'amount',         i.amount,
      'dueDate',        i.due_date,
      'status',         i.status,
      'items',          i.items,
      'email',          i.email,
      'phone',          i.phone,
      'billingAddress', i.billing_address,
      'attachmentUrl',  i.attachment_url
    )) as row
    from public.partial_invoices i
    order by i.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_invoices TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_invoice(p_invoice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_invoice->>'id';
begin
  if v_id is null then raise exception 'invoice.id is required'; end if;

  insert into public.partial_invoices (
    id, invoice_number, category, tenant_name, unit,
    amount, due_date, status, items,
    email, phone, billing_address, attachment_url, updated_at
  ) values (
    v_id,
    coalesce(p_invoice->>'invoiceNumber', ''),
    coalesce(p_invoice->>'category', 'Outbound'),
    coalesce(p_invoice->>'tenantName', ''),
    p_invoice->>'unit',
    coalesce(nullif(p_invoice->>'amount','')::numeric, 0),
    coalesce(p_invoice->>'dueDate', ''),
    coalesce(p_invoice->>'status', 'Due'),
    coalesce(p_invoice->'items', '[]'::jsonb),
    p_invoice->>'email',
    p_invoice->>'phone',
    p_invoice->>'billingAddress',
    p_invoice->>'attachmentUrl',
    now()
  )
  on conflict (id) do update set
    invoice_number  = excluded.invoice_number,
    category        = excluded.category,
    tenant_name     = excluded.tenant_name,
    unit            = excluded.unit,
    amount          = excluded.amount,
    due_date        = excluded.due_date,
    status          = excluded.status,
    items           = excluded.items,
    email           = excluded.email,
    phone           = excluded.phone,
    billing_address = excluded.billing_address,
    attachment_url  = excluded.attachment_url,
    updated_at      = now();

  return p_invoice;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_invoice TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_invoices_bulk(p_invoices jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_invoices) <> 'array' then
    raise exception 'p_invoices must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_invoices)
  loop
    perform app.partial_upsert_invoice(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.partial_upsert_invoices_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_invoices_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_fine_rules()
returns jsonb
language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          f.id,
    'type',        f.type,
    'basis',       f.basis,
    'value',       f.value,
    'description', f.description,
    'appliesTo',   f.applies_to
  ) order by f.created_at asc), '[]'::jsonb)
  from public.partial_fine_rules f;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_fine_rules TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_fine_rule(p_fine jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_fine->>'id';
begin
  if v_id is null then raise exception 'fine_rule.id is required'; end if;
  insert into public.partial_fine_rules (id, type, basis, value, description, applies_to, updated_at)
  values (
    v_id,
    coalesce(p_fine->>'type', ''),
    coalesce(p_fine->>'basis', 'Fixed Fee'),
    coalesce(nullif(p_fine->>'value','')::numeric, 0),
    coalesce(p_fine->>'description', ''),
    coalesce(p_fine->>'appliesTo', ''),
    now()
  )
  on conflict (id) do update set
    type = excluded.type, basis = excluded.basis,
    value = excluded.value, description = excluded.description,
    applies_to = excluded.applies_to, updated_at = now();
  return p_fine;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_fine_rule TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_fine_rules_bulk(p_fines jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_fines) <> 'array' then raise exception 'p_fines must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_fines)
  loop perform app.partial_upsert_fine_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_fine_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_fine_rules_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_overpayments()
returns jsonb
language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            o.id,
    'tenantName',    o.tenant_name,
    'unit',          o.unit,
    'amount',        o.amount,
    'reference',     o.reference,
    'dateReceived',  o.date_received,
    'appliedMonth',  o.applied_month,
    'status',        o.status
  ) order by o.created_at desc), '[]'::jsonb)
  from public.partial_overpayments o;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_overpayments TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_overpayment(p_op jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_op->>'id';
begin
  if v_id is null then raise exception 'overpayment.id is required'; end if;
  insert into public.partial_overpayments (
    id, tenant_name, unit, amount, reference,
    date_received, applied_month, status, updated_at
  ) values (
    v_id,
    coalesce(p_op->>'tenantName', ''),
    coalesce(p_op->>'unit', ''),
    coalesce(nullif(p_op->>'amount','')::numeric, 0),
    coalesce(p_op->>'reference', ''),
    coalesce(p_op->>'dateReceived', ''),
    coalesce(p_op->>'appliedMonth', ''),
    coalesce(p_op->>'status', 'Held'),
    now()
  )
  on conflict (id) do update set
    tenant_name   = excluded.tenant_name,
    unit          = excluded.unit,
    amount        = excluded.amount,
    reference     = excluded.reference,
    date_received = excluded.date_received,
    applied_month = excluded.applied_month,
    status        = excluded.status,
    updated_at    = now();
  return p_op;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_overpayment TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_overpayments_bulk(p_ops jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'p_ops must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_ops)
  loop perform app.partial_upsert_overpayment(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_overpayments_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_overpayments_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_quotations()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',              q.id,
    'taskId',          q.task_id,
    'contractorName',  q.contractor_name,
    'totalAmount',     q.total_amount,
    'items',           q.items,
    'status',          q.status,
    'notes',           q.notes,
    'submittedDate',   q.submitted_date
  )) order by q.created_at asc), '[]'::jsonb)
  from public.partial_quotations q;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_quotations TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_quotation(p_q jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_q->>'id';
begin
  if v_id is null then raise exception 'quotation.id is required'; end if;
  insert into public.partial_quotations (
    id, task_id, contractor_name, total_amount,
    items, status, notes, submitted_date, updated_at
  ) values (
    v_id,
    coalesce(p_q->>'taskId', ''),
    coalesce(p_q->>'contractorName', ''),
    coalesce(nullif(p_q->>'totalAmount','')::numeric, 0),
    coalesce(p_q->'items', '[]'::jsonb),
    coalesce(p_q->>'status', 'Pending'),
    p_q->>'notes',
    coalesce(p_q->>'submittedDate', ''),
    now()
  )
  on conflict (id) do update set
    task_id         = excluded.task_id,
    contractor_name = excluded.contractor_name,
    total_amount    = excluded.total_amount,
    items           = excluded.items,
    status          = excluded.status,
    notes           = excluded.notes,
    submitted_date  = excluded.submitted_date,
    updated_at      = now();
  return p_q;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_quotation TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_quotations_bulk(p_quotations jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_quotations) <> 'array' then raise exception 'p_quotations must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_quotations)
  loop perform app.partial_upsert_quotation(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_quotations_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_quotations_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_landlord_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                 a.id,
    'name',               a.name,
    'email',              a.email,
    'phone',              a.phone,
    'idNumber',           a.id_number,
    'status',             a.status,
    'date',               a.date,
    'proposedProperties', a.proposed_properties,
    'notes',              a.notes,
    'location',           a.location,
    'propertyIds',        a.property_ids,
    'paymentConfig',      a.payment_config
  )) order by a.created_at asc), '[]'::jsonb)
  from public.partial_landlord_applications a;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_landlord_applications TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlord_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'landlord_application.id is required'; end if;
  insert into public.partial_landlord_applications (
    id, name, email, phone, id_number, status, date,
    proposed_properties, notes, location, property_ids, payment_config, updated_at
  ) values (
    v_id,
    coalesce(p_app->>'name', ''),
    coalesce(p_app->>'email', ''),
    p_app->>'phone',
    p_app->>'idNumber',
    coalesce(p_app->>'status', 'Pending'),
    coalesce(p_app->>'date', ''),
    coalesce(p_app->'proposedProperties', '[]'::jsonb),
    p_app->>'notes',
    p_app->>'location',
    coalesce(p_app->'propertyIds', '[]'::jsonb),
    p_app->'paymentConfig',
    now()
  )
  on conflict (id) do update set
    name                = excluded.name,
    email               = excluded.email,
    phone               = excluded.phone,
    id_number           = excluded.id_number,
    status              = excluded.status,
    date                = excluded.date,
    proposed_properties = excluded.proposed_properties,
    notes               = excluded.notes,
    location            = excluded.location,
    property_ids        = excluded.property_ids,
    payment_config      = excluded.payment_config,
    updated_at          = now();
  return p_app;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord_application TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlord_applications_bulk(p_apps jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_apps) <> 'array' then raise exception 'p_apps must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_apps)
  loop perform app.partial_upsert_landlord_application(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_landlord_applications_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord_applications_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                 a.id,
    'name',               a.name,
    'phone',              a.phone,
    'email',              a.email,
    'idNumber',           a.id_number,
    'kraPin',             a.kra_pin,
    'property',           a.property,
    'propertyId',         a.property_id,
    'propertyName',       a.property_name,
    'unit',               a.unit,
    'unitId',             a.unit_id,
    'status',             a.status,
    'submittedDate',      a.submitted_date,
    'source',             a.source,
    'rentStartDate',      a.rent_start_date,
    'rentAmount',         a.rent_amount,
    'rentDueDate',        a.rent_due_date,
    'rentGraceDays',      a.rent_grace_days,
    'depositPaid',        a.deposit_paid,
    'leaseSigned',        a.lease_signed,
    'leaseStartDate',     a.lease_start_date,
    'leaseEnd',           a.lease_end,
    'authUserId',         a.auth_user_id,
    'documents',          a.documents,
    'recurringBills',     a.recurring_bills,
    'avatar',             a.avatar,
    'profilePicture',     a.profile_picture,
    'referrerId',         a.referrer_id,
    'depositExempt',      a.deposit_exempt,
    'depositMonths',      a.deposit_months,
    'proratedDeposit',    a.prorated_deposit,
    'rentExtension',      a.rent_extension,
    'waterDeposit',       a.water_deposit,
    'electricityDeposit', a.electricity_deposit
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.partial_tenant_applications a;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_tenant_applications TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tenant_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'tenant_application.id is required'; end if;
  insert into public.partial_tenant_applications (
    id, name, phone, email, id_number, kra_pin,
    property, property_id, property_name, unit, unit_id,
    status, submitted_date, source,
    rent_start_date, rent_amount, rent_due_date, rent_grace_days, deposit_paid,
    lease_signed, lease_start_date, lease_end, auth_user_id,
    documents, recurring_bills, avatar, profile_picture, referrer_id,
    deposit_exempt, deposit_months, prorated_deposit, rent_extension,
    water_deposit, electricity_deposit, updated_at
  ) values (
    v_id,
    coalesce(p_app->>'name', ''),
    coalesce(p_app->>'phone', ''),
    coalesce(p_app->>'email', ''),
    p_app->>'idNumber',
    p_app->>'kraPin',
    p_app->>'property',
    p_app->>'propertyId',
    p_app->>'propertyName',
    p_app->>'unit',
    p_app->>'unitId',
    coalesce(p_app->>'status', 'New'),
    coalesce(p_app->>'submittedDate', ''),
    p_app->>'source',
    p_app->>'rentStartDate',
    nullif(p_app->>'rentAmount','')::numeric,
    nullif(p_app->>'rentDueDate','')::int,
    nullif(p_app->>'rentGraceDays','')::int,
    nullif(p_app->>'depositPaid','')::numeric,
    coalesce((p_app->>'leaseSigned')::boolean, false),
    p_app->>'leaseStartDate',
    p_app->>'leaseEnd',
    p_app->>'authUserId',
    coalesce(p_app->'documents', '[]'::jsonb),
    p_app->'recurringBills',
    p_app->>'avatar',
    p_app->>'profilePicture',
    p_app->>'referrerId',
    coalesce((p_app->>'depositExempt')::boolean, false),
    nullif(p_app->>'depositMonths','')::int,
    p_app->'proratedDeposit',
    p_app->'rentExtension',
    p_app->'waterDeposit',
    p_app->'electricityDeposit',
    now()
  )
  on conflict (id) do update set
    name                = excluded.name,
    phone               = excluded.phone,
    email               = excluded.email,
    id_number           = excluded.id_number,
    kra_pin             = excluded.kra_pin,
    property            = excluded.property,
    property_id         = excluded.property_id,
    property_name       = excluded.property_name,
    unit                = excluded.unit,
    unit_id             = excluded.unit_id,
    status              = excluded.status,
    submitted_date      = excluded.submitted_date,
    source              = excluded.source,
    rent_start_date     = excluded.rent_start_date,
    rent_amount         = excluded.rent_amount,
    rent_due_date       = excluded.rent_due_date,
    rent_grace_days     = excluded.rent_grace_days,
    deposit_paid        = excluded.deposit_paid,
    lease_signed        = excluded.lease_signed,
    lease_start_date    = excluded.lease_start_date,
    lease_end           = excluded.lease_end,
    auth_user_id        = excluded.auth_user_id,
    documents           = excluded.documents,
    recurring_bills     = excluded.recurring_bills,
    avatar              = excluded.avatar,
    profile_picture     = excluded.profile_picture,
    referrer_id         = excluded.referrer_id,
    deposit_exempt      = excluded.deposit_exempt,
    deposit_months      = excluded.deposit_months,
    prorated_deposit    = excluded.prorated_deposit,
    rent_extension      = excluded.rent_extension,
    water_deposit       = excluded.water_deposit,
    electricity_deposit = excluded.electricity_deposit,
    updated_at          = now();
  return p_app;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant_application TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tenant_applications_bulk(p_apps jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_apps) <> 'array' then raise exception 'p_apps must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_apps)
  loop perform app.partial_upsert_tenant_application(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_tenant_applications_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant_applications_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_offboarding_records()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',               r.id,
    'tenantId',         r.tenant_id,
    'tenantName',       r.tenant_name,
    'unit',             r.unit,
    'noticeDate',       r.notice_date,
    'moveOutDate',      r.move_out_date,
    'status',           r.status,
    'inspectionStatus', r.inspection_status,
    'utilityClearance', r.utility_clearance,
    'depositRefunded',  r.deposit_refunded,
    'keysReturned',     r.keys_returned,
    'finalBillAmount',  r.final_bill_amount
  )) order by r.created_at desc), '[]'::jsonb)
  from public.partial_offboarding_records r;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_offboarding_records TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_offboarding_record(p_r jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_r->>'id';
begin
  if v_id is null then raise exception 'offboarding_record.id is required'; end if;
  insert into public.partial_offboarding_records (
    id, tenant_id, tenant_name, unit, notice_date, move_out_date,
    status, inspection_status, utility_clearance, deposit_refunded,
    keys_returned, final_bill_amount, updated_at
  ) values (
    v_id,
    coalesce(p_r->>'tenantId', ''),
    coalesce(p_r->>'tenantName', ''),
    coalesce(p_r->>'unit', ''),
    coalesce(p_r->>'noticeDate', ''),
    coalesce(p_r->>'moveOutDate', ''),
    coalesce(p_r->>'status', 'Notice Given'),
    coalesce(p_r->>'inspectionStatus', 'Pending'),
    coalesce((p_r->>'utilityClearance')::boolean, false),
    coalesce((p_r->>'depositRefunded')::boolean, false),
    coalesce((p_r->>'keysReturned')::boolean, false),
    nullif(p_r->>'finalBillAmount','')::numeric,
    now()
  )
  on conflict (id) do update set
    tenant_id         = excluded.tenant_id,
    tenant_name       = excluded.tenant_name,
    unit              = excluded.unit,
    notice_date       = excluded.notice_date,
    move_out_date     = excluded.move_out_date,
    status            = excluded.status,
    inspection_status = excluded.inspection_status,
    utility_clearance = excluded.utility_clearance,
    deposit_refunded  = excluded.deposit_refunded,
    keys_returned     = excluded.keys_returned,
    final_bill_amount = excluded.final_bill_amount,
    updated_at        = now();
  return p_r;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_offboarding_record TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_offboarding_records_bulk(p_records jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_records)
  loop perform app.partial_upsert_offboarding_record(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_offboarding_records_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_offboarding_records_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_landlord_offboarding_records()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',               r.id,
    'landlordId',       r.landlord_id,
    'landlordName',     r.landlord_name,
    'propertyCount',    r.property_count,
    'reason',           r.reason,
    'status',           r.status,
    'terminationDate',  r.termination_date,
    'checklist',        r.checklist,
    'financials',       r.financials,
    'documents',        r.documents
  )) order by r.created_at desc), '[]'::jsonb)
  from public.partial_landlord_offboarding_records r;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_landlord_offboarding_records TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlord_offboarding_record(p_r jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_r->>'id';
begin
  if v_id is null then raise exception 'landlord_offboarding_record.id is required'; end if;
  insert into public.partial_landlord_offboarding_records (
    id, landlord_id, landlord_name, property_count, reason,
    status, termination_date, checklist, financials, documents, updated_at
  ) values (
    v_id,
    coalesce(p_r->>'landlordId', ''),
    coalesce(p_r->>'landlordName', ''),
    coalesce(nullif(p_r->>'propertyCount','')::int, 0),
    coalesce(p_r->>'reason', ''),
    coalesce(p_r->>'status', 'Notice Served'),
    coalesce(p_r->>'terminationDate', ''),
    p_r->'checklist',
    p_r->'financials',
    coalesce(p_r->'documents', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    landlord_id      = excluded.landlord_id,
    landlord_name    = excluded.landlord_name,
    property_count   = excluded.property_count,
    reason           = excluded.reason,
    status           = excluded.status,
    termination_date = excluded.termination_date,
    checklist        = excluded.checklist,
    financials       = excluded.financials,
    documents        = excluded.documents,
    updated_at       = now();
  return p_r;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord_offboarding_record TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_landlord_offboarding_bulk(p_records jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_records)
  loop perform app.partial_upsert_landlord_offboarding_record(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_landlord_offboarding_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord_offboarding_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_commission_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          c.id,
    'trigger',     c.trigger,
    'rateType',    c.rate_type,
    'rateValue',   c.rate_value,
    'description', c.description,
    'appliesTo',   c.applies_to,
    'deadlineDay', c.deadline_day
  )) order by c.created_at asc), '[]'::jsonb)
  from public.partial_commission_rules c;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_commission_rules TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_commission_rule(p_c jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_c->>'id';
begin
  if v_id is null then raise exception 'commission_rule.id is required'; end if;
  insert into public.partial_commission_rules (
    id, trigger, rate_type, rate_value, description, applies_to, deadline_day, updated_at
  ) values (
    v_id,
    coalesce(p_c->>'trigger', ''),
    coalesce(p_c->>'rateType', '%'),
    coalesce(nullif(p_c->>'rateValue','')::numeric, 0),
    coalesce(p_c->>'description', ''),
    coalesce(p_c->>'appliesTo', ''),
    nullif(p_c->>'deadlineDay','')::int,
    now()
  )
  on conflict (id) do update set
    trigger      = excluded.trigger,
    rate_type    = excluded.rate_type,
    rate_value   = excluded.rate_value,
    description  = excluded.description,
    applies_to   = excluded.applies_to,
    deadline_day = excluded.deadline_day,
    updated_at   = now();
  return p_c;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_commission_rule TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_commission_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.partial_upsert_commission_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_commission_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_commission_rules_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_deduction_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',            d.id,
    'name',          d.name,
    'type',          d.type,
    'value',         d.value,
    'frequency',     d.frequency,
    'applicability', d.applicability,
    'targetId',      d.target_id,
    'status',        d.status,
    'description',   d.description
  )) order by d.created_at asc), '[]'::jsonb)
  from public.partial_deduction_rules d;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_deduction_rules TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_deduction_rule(p_d jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_d->>'id';
begin
  if v_id is null then raise exception 'deduction_rule.id is required'; end if;
  insert into public.partial_deduction_rules (
    id, name, type, value, frequency, applicability,
    target_id, status, description, updated_at
  ) values (
    v_id,
    coalesce(p_d->>'name', ''),
    coalesce(p_d->>'type', 'Fixed'),
    coalesce(nullif(p_d->>'value','')::numeric, 0),
    coalesce(p_d->>'frequency', 'Monthly'),
    coalesce(p_d->>'applicability', 'Global'),
    p_d->>'targetId',
    coalesce(p_d->>'status', 'Active'),
    p_d->>'description',
    now()
  )
  on conflict (id) do update set
    name          = excluded.name,
    type          = excluded.type,
    value         = excluded.value,
    frequency     = excluded.frequency,
    applicability = excluded.applicability,
    target_id     = excluded.target_id,
    status        = excluded.status,
    description   = excluded.description,
    updated_at    = now();
  return p_d;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_deduction_rule TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_deduction_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.partial_upsert_deduction_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_deduction_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_deduction_rules_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_income_sources()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',   s.id,
    'name', s.name,
    'type', s.type
  ) order by s.created_at asc), '[]'::jsonb)
  from public.partial_income_sources s;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_income_sources TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_income_source(p_s jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_s->>'id';
begin
  if v_id is null then raise exception 'income_source.id is required'; end if;
  insert into public.partial_income_sources (id, name, type, updated_at)
  values (
    v_id,
    coalesce(p_s->>'name', ''),
    coalesce(p_s->>'type', ''),
    now()
  )
  on conflict (id) do update set
    name = excluded.name, type = excluded.type, updated_at = now();
  return p_s;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_income_source TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_income_sources_bulk(p_sources jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_sources) <> 'array' then raise exception 'p_sources must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_sources)
  loop perform app.partial_upsert_income_source(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_income_sources_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_income_sources_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_preventive_tasks()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          t.id,
    'title',       t.title,
    'asset',       t.asset,
    'frequency',   t.frequency,
    'nextDueDate', t.next_due_date
  ) order by t.next_due_date asc), '[]'::jsonb)
  from public.partial_preventive_tasks t;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_preventive_tasks TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_preventive_task(p_t jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'preventive_task.id is required'; end if;
  insert into public.partial_preventive_tasks (id, title, asset, frequency, next_due_date, updated_at)
  values (
    v_id,
    coalesce(p_t->>'title', ''),
    coalesce(p_t->>'asset', ''),
    coalesce(p_t->>'frequency', 'Monthly'),
    coalesce(p_t->>'nextDueDate', ''),
    now()
  )
  on conflict (id) do update set
    title         = excluded.title,
    asset         = excluded.asset,
    frequency     = excluded.frequency,
    next_due_date = excluded.next_due_date,
    updated_at    = now();
  return p_t;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_preventive_task TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_preventive_tasks_bulk(p_tasks jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_tasks) <> 'array' then raise exception 'p_tasks must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_tasks)
  loop perform app.partial_upsert_preventive_task(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_preventive_tasks_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_preventive_tasks_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_funds()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                   f.id,
    'name',                 f.name,
    'description',          f.description,
    'targetApy',            f.target_apy,
    'capitalRaised',        f.capital_raised,
    'targetCapital',        f.target_capital,
    'investors',            f.investors,
    'status',               f.status,
    'riskProfile',          f.risk_profile,
    'projectedCompletion',  f.projected_completion,
    'landlordType',         f.landlord_type,
    'landlordName',         f.landlord_name,
    'landlordId',           f.landlord_id,
    'landlordContact',      f.landlord_contact,
    'landlordPic',          f.landlord_pic,
    'propertyType',         f.property_type,
    'clientInterestRate',   f.client_interest_rate,
    'projectPic',           f.project_pic,
    'renovationStartDate',  f.renovation_start_date,
    'renovationEndDate',    f.renovation_end_date,
    'boq',                  f.boq,
    'documents',            f.documents,
    'progressUpdates',      f.progress_updates
  )) order by f.created_at asc), '[]'::jsonb)
  from public.partial_funds f;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_funds TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_fund(p_f jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_f->>'id';
begin
  if v_id is null then raise exception 'fund.id is required'; end if;
  insert into public.partial_funds (
    id, name, description, target_apy, capital_raised, target_capital,
    investors, status, risk_profile, projected_completion,
    landlord_type, landlord_name, landlord_id, landlord_contact, landlord_pic,
    property_type, client_interest_rate, project_pic,
    renovation_start_date, renovation_end_date,
    boq, documents, progress_updates, updated_at
  ) values (
    v_id,
    coalesce(p_f->>'name', ''),
    coalesce(p_f->>'description', ''),
    coalesce(p_f->>'targetApy', ''),
    coalesce(nullif(p_f->>'capitalRaised','')::numeric, 0),
    coalesce(nullif(p_f->>'targetCapital','')::numeric, 0),
    coalesce(nullif(p_f->>'investors','')::int, 0),
    coalesce(p_f->>'status', 'Active'),
    coalesce(p_f->>'riskProfile', 'Medium'),
    p_f->>'projectedCompletion',
    p_f->>'landlordType', p_f->>'landlordName', p_f->>'landlordId',
    p_f->>'landlordContact', p_f->>'landlordPic',
    p_f->>'propertyType',
    nullif(p_f->>'clientInterestRate','')::numeric,
    p_f->>'projectPic',
    p_f->>'renovationStartDate', p_f->>'renovationEndDate',
    coalesce(p_f->'boq', '[]'::jsonb),
    coalesce(p_f->'documents', '[]'::jsonb),
    coalesce(p_f->'progressUpdates', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    name                  = excluded.name,
    description           = excluded.description,
    target_apy            = excluded.target_apy,
    capital_raised        = excluded.capital_raised,
    target_capital        = excluded.target_capital,
    investors             = excluded.investors,
    status                = excluded.status,
    risk_profile          = excluded.risk_profile,
    projected_completion  = excluded.projected_completion,
    landlord_type         = excluded.landlord_type,
    landlord_name         = excluded.landlord_name,
    landlord_id           = excluded.landlord_id,
    landlord_contact      = excluded.landlord_contact,
    landlord_pic          = excluded.landlord_pic,
    property_type         = excluded.property_type,
    client_interest_rate  = excluded.client_interest_rate,
    project_pic           = excluded.project_pic,
    renovation_start_date = excluded.renovation_start_date,
    renovation_end_date   = excluded.renovation_end_date,
    boq                   = excluded.boq,
    documents             = excluded.documents,
    progress_updates      = excluded.progress_updates,
    updated_at            = now();
  return p_f;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_fund TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_funds_bulk(p_funds jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_funds) <> 'array' then raise exception 'p_funds must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_funds)
  loop perform app.partial_upsert_fund(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_funds_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_funds_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_investments()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',              i.id,
    'fundId',          i.fund_id,
    'fundName',        i.fund_name,
    'amount',          i.amount,
    'date',            i.date,
    'strategy',        i.strategy,
    'status',          i.status,
    'accruedInterest', i.accrued_interest,
    'investorId',      i.investor_id
  )) order by i.date desc), '[]'::jsonb) from public.partial_investments i;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_investments TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_investment(p_i jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_i->>'id';
begin
  if v_id is null then raise exception 'investment.id is required'; end if;
  insert into public.partial_investments (id,fund_id,fund_name,amount,date,strategy,status,accrued_interest,investor_id,updated_at)
  values (v_id, coalesce(p_i->>'fundId',''), coalesce(p_i->>'fundName',''),
    coalesce(nullif(p_i->>'amount','')::numeric,0), coalesce(p_i->>'date',''),
    coalesce(p_i->>'strategy','Monthly Payout'), coalesce(p_i->>'status','Active'),
    coalesce(nullif(p_i->>'accruedInterest','')::numeric,0), p_i->>'investorId', now())
  on conflict (id) do update set
    fund_id=excluded.fund_id, fund_name=excluded.fund_name, amount=excluded.amount,
    date=excluded.date, strategy=excluded.strategy, status=excluded.status,
    accrued_interest=excluded.accrued_interest, investor_id=excluded.investor_id, updated_at=now();
  return p_i;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_investment TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_investments_bulk(p_investments jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_investments) <> 'array' then raise exception 'p_investments must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_investments)
  loop perform app.partial_upsert_investment(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_investments_bulk(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_investments_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_withdrawal_requests()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',w.id,'investorName',w.investor_name,'amount',w.amount,
    'requestDate',w.request_date,'type',w.type,'method',w.method,
    'status',w.status,'destinationAccount',w.destination_account,'notes',w.notes
  )) order by w.request_date desc), '[]'::jsonb) from public.partial_withdrawal_requests w;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_withdrawal_requests TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_withdrawal_request(p_w jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_w->>'id';
begin
  if v_id is null then raise exception 'withdrawal_request.id is required'; end if;
  insert into public.partial_withdrawal_requests (id,investor_name,amount,request_date,type,method,status,destination_account,notes,updated_at)
  values (v_id, coalesce(p_w->>'investorName',''),
    coalesce(nullif(p_w->>'amount','')::numeric,0), coalesce(p_w->>'requestDate',''),
    coalesce(p_w->>'type','Interest'), coalesce(p_w->>'method','M-Pesa'),
    coalesce(p_w->>'status','Pending Approval'), p_w->>'destinationAccount', p_w->>'notes', now())
  on conflict (id) do update set
    investor_name=excluded.investor_name, amount=excluded.amount, request_date=excluded.request_date,
    type=excluded.type, method=excluded.method, status=excluded.status,
    destination_account=excluded.destination_account, notes=excluded.notes, updated_at=now();
  return p_w;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_withdrawal_request TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_withdrawals_bulk(p_withdrawals jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_withdrawals)<>'array' then raise exception 'p_withdrawals must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_withdrawals)
  loop perform app.partial_upsert_withdrawal_request(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_withdrawals_bulk(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_withdrawals_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_renovation_investors()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',i.id,'name',i.name,'username',i.username,'email',i.email,'phone',i.phone,
    'idNumber',i.id_number,'status',i.status,'joinDate',i.join_date,
    'nextOfKin',i.next_of_kin,'paymentDetails',i.payment_details,
    'investorType',i.investor_type,'groupMembersCount',i.group_members_count,
    'residency',i.residency,'kraPin',i.kra_pin,'authorizedRep',i.authorized_rep,
    'referrerId',i.referrer_id,'referrerType',i.referrer_type,'passwordHash',i.password_hash
  )) order by i.join_date desc), '[]'::jsonb) from public.partial_renovation_investors i;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_renovation_investors TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_renovation_investor(p_i jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_i->>'id';
begin
  if v_id is null then raise exception 'renovation_investor.id is required'; end if;
  insert into public.partial_renovation_investors (
    id,name,username,email,phone,id_number,status,join_date,
    next_of_kin,payment_details,investor_type,group_members_count,
    residency,kra_pin,authorized_rep,referrer_id,referrer_type,password_hash,updated_at
  ) values (
    v_id, coalesce(p_i->>'name',''), p_i->>'username',
    coalesce(p_i->>'email',''), coalesce(p_i->>'phone',''), coalesce(p_i->>'idNumber',''),
    coalesce(p_i->>'status','Pending'), coalesce(p_i->>'joinDate',''),
    p_i->'nextOfKin', p_i->'paymentDetails', p_i->>'investorType',
    nullif(p_i->>'groupMembersCount','')::int,
    p_i->>'residency', p_i->>'kraPin', p_i->'authorizedRep',
    p_i->>'referrerId', p_i->>'referrerType', p_i->>'passwordHash', now()
  )
  on conflict (id) do update set
    name=excluded.name, username=excluded.username, email=excluded.email,
    phone=excluded.phone, id_number=excluded.id_number, status=excluded.status,
    join_date=excluded.join_date, next_of_kin=excluded.next_of_kin,
    payment_details=excluded.payment_details, investor_type=excluded.investor_type,
    group_members_count=excluded.group_members_count, residency=excluded.residency,
    kra_pin=excluded.kra_pin, authorized_rep=excluded.authorized_rep,
    referrer_id=excluded.referrer_id, referrer_type=excluded.referrer_type,
    password_hash=excluded.password_hash, updated_at=now();
  return p_i;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_renovation_investor TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_renovation_investors_bulk(p_investors jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_investors)<>'array' then raise exception 'p_investors must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_investors)
  loop perform app.partial_upsert_renovation_investor(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_renovation_investors_bulk(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_renovation_investors_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_rf_transactions()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',t.id,'date',t.date,'type',t.type,'category',t.category,
    'amount',t.amount,'partyName',t.party_name,'reference',t.reference,
    'status',t.status,'description',t.description
  )) order by t.date desc), '[]'::jsonb) from public.partial_rf_transactions t;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_rf_transactions TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_rf_transaction(p_t jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'rf_transaction.id is required'; end if;
  insert into public.partial_rf_transactions (id,date,type,category,amount,party_name,reference,status,description,updated_at)
  values (v_id, coalesce(p_t->>'date',''), coalesce(p_t->>'type',''),
    coalesce(p_t->>'category','Inbound'), coalesce(nullif(p_t->>'amount','')::numeric,0),
    coalesce(p_t->>'partyName',''), coalesce(p_t->>'reference',''),
    coalesce(p_t->>'status','Completed'), p_t->>'description', now())
  on conflict (id) do update set
    date=excluded.date, type=excluded.type, category=excluded.category,
    amount=excluded.amount, party_name=excluded.party_name, reference=excluded.reference,
    status=excluded.status, description=excluded.description, updated_at=now();
  return p_t;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_rf_transaction TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_rf_transactions_bulk(p_txs jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_txs)<>'array' then raise exception 'p_txs must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_txs)
  loop perform app.partial_upsert_rf_transaction(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_rf_transactions_bulk(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_rf_transactions_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_renovation_project_bills()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'projectId',b.project_id,'vendor',b.vendor,
    'description',b.description,'amount',b.amount,'date',b.date,
    'status',b.status,'category',b.category
  ) order by b.date desc), '[]'::jsonb) from public.partial_renovation_project_bills b;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_renovation_project_bills TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_renovation_project_bill(p_b jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_b->>'id';
begin
  if v_id is null then raise exception 'renovation_project_bill.id is required'; end if;
  insert into public.partial_renovation_project_bills (id,project_id,vendor,description,amount,date,status,category,updated_at)
  values (v_id, coalesce(p_b->>'projectId',''), coalesce(p_b->>'vendor',''),
    coalesce(p_b->>'description',''), coalesce(nullif(p_b->>'amount','')::numeric,0),
    coalesce(p_b->>'date',''), coalesce(p_b->>'status','Pending'),
    coalesce(p_b->>'category','Other'), now())
  on conflict (id) do update set
    project_id=excluded.project_id, vendor=excluded.vendor, description=excluded.description,
    amount=excluded.amount, date=excluded.date, status=excluded.status,
    category=excluded.category, updated_at=now();
  return p_b;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_renovation_project_bill TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_renovation_project_bills_bulk(p_bills jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_bills)<>'array' then raise exception 'p_bills must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_bills)
  loop perform app.partial_upsert_renovation_project_bill(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_renovation_project_bills_bulk(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_renovation_project_bills_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_messages()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          m.id,
    'recipient',   m.recipient,
    'content',     m.content,
    'channel',     m.channel,
    'status',      m.status,
    'timestamp',   m.timestamp,
    'priority',    m.priority,
    'isIncoming',  case when m.is_incoming then true else null end
  )) order by m.timestamp desc), '[]'::jsonb)
  from public.partial_messages m;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_messages TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_message(p_m jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_m->>'id';
begin
  if v_id is null then raise exception 'message.id is required'; end if;
  insert into public.partial_messages (id, recipient, content, channel, status, timestamp, priority, is_incoming, updated_at)
  values (
    v_id,
    coalesce(p_m->'recipient', '{}'::jsonb),
    coalesce(p_m->>'content', ''),
    coalesce(p_m->>'channel', 'SMS'),
    coalesce(p_m->>'status', 'Sent'),
    coalesce(p_m->>'timestamp', ''),
    coalesce(p_m->>'priority', 'Normal'),
    coalesce((p_m->>'isIncoming')::boolean, false),
    now()
  )
  on conflict (id) do update set
    recipient   = excluded.recipient,
    content     = excluded.content,
    channel     = excluded.channel,
    status      = excluded.status,
    timestamp   = excluded.timestamp,
    priority    = excluded.priority,
    is_incoming = excluded.is_incoming,
    updated_at  = now();
  return p_m;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_message TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_messages_bulk(p_messages jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_messages) <> 'array' then raise exception 'p_messages must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_messages)
  loop perform app.partial_upsert_message(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_messages_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_messages_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_notifications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            n.id,
    'title',         n.title,
    'message',       n.message,
    'date',          n.date,
    'read',          n.read,
    'type',          n.type,
    'recipientRole', n.recipient_role
  ) order by n.date desc), '[]'::jsonb)
  from public.partial_notifications n;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_notifications TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_notification(p_n jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_n->>'id';
begin
  if v_id is null then raise exception 'notification.id is required'; end if;
  insert into public.partial_notifications (id, title, message, date, read, type, recipient_role, updated_at)
  values (
    v_id,
    coalesce(p_n->>'title', ''),
    coalesce(p_n->>'message', ''),
    coalesce(p_n->>'date', ''),
    coalesce((p_n->>'read')::boolean, false),
    coalesce(p_n->>'type', 'Info'),
    coalesce(p_n->>'recipientRole', ''),
    now()
  )
  on conflict (id) do update set
    title          = excluded.title,
    message        = excluded.message,
    date           = excluded.date,
    read           = excluded.read,
    type           = excluded.type,
    recipient_role = excluded.recipient_role,
    updated_at     = now();
  return p_n;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_notification TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_notifications_bulk(p_notifications jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_notifications) <> 'array' then raise exception 'p_notifications must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_notifications)
  loop perform app.partial_upsert_notification(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_notifications_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_notifications_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_communication_templates()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',      t.id,
    'name',    t.name,
    'type',    t.type,
    'content', t.content
  ) order by t.name asc), '[]'::jsonb)
  from public.partial_communication_templates t;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_communication_templates TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_communication_template(p_t jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'communication_template.id is required'; end if;
  insert into public.partial_communication_templates (id, name, type, content, updated_at)
  values (
    v_id,
    coalesce(p_t->>'name', ''),
    coalesce(p_t->>'type', 'SMS'),
    coalesce(p_t->>'content', ''),
    now()
  )
  on conflict (id) do update set
    name       = excluded.name,
    type       = excluded.type,
    content    = excluded.content,
    updated_at = now();
  return p_t;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_communication_template TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_communication_templates_bulk(p_templates jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_templates) <> 'array' then raise exception 'p_templates must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_templates)
  loop perform app.partial_upsert_communication_template(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_communication_templates_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_communication_templates_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_workflows()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',      w.id,
    'name',    w.name,
    'trigger', w.trigger,
    'steps',   w.steps
  ) order by w.name asc), '[]'::jsonb)
  from public.partial_workflows w;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_workflows TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_workflow(p_w jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_w->>'id';
begin
  if v_id is null then raise exception 'workflow.id is required'; end if;
  insert into public.partial_workflows (id, name, trigger, steps, updated_at)
  values (
    v_id,
    coalesce(p_w->>'name', ''),
    coalesce(p_w->>'trigger', ''),
    coalesce(p_w->'steps', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    name       = excluded.name,
    trigger    = excluded.trigger,
    steps      = excluded.steps,
    updated_at = now();
  return p_w;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_workflow TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_workflows_bulk(p_workflows jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_workflows) <> 'array' then raise exception 'p_workflows must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_workflows)
  loop perform app.partial_upsert_workflow(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_workflows_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_workflows_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_automation_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           a.id,
    'name',         a.name,
    'trigger',      a.trigger,
    'templateName', a.template_name,
    'channels',     a.channels,
    'enabled',      a.enabled
  ) order by a.name asc), '[]'::jsonb)
  from public.partial_automation_rules a;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_automation_rules TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_automation_rule(p_a jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_a->>'id';
begin
  if v_id is null then raise exception 'automation_rule.id is required'; end if;
  insert into public.partial_automation_rules (id, name, trigger, template_name, channels, enabled, updated_at)
  values (
    v_id,
    coalesce(p_a->>'name', ''),
    coalesce(p_a->>'trigger', ''),
    coalesce(p_a->>'templateName', ''),
    coalesce(p_a->'channels', '[]'::jsonb),
    coalesce((p_a->>'enabled')::boolean, true),
    now()
  )
  on conflict (id) do update set
    name          = excluded.name,
    trigger       = excluded.trigger,
    template_name = excluded.template_name,
    channels      = excluded.channels,
    enabled       = excluded.enabled,
    updated_at    = now();
  return p_a;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_automation_rule TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_automation_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.partial_upsert_automation_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_automation_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_automation_rules_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_escalation_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',         e.id,
    'condition',  e.condition,
    'action',     e.action,
    'assignedTo', e.assigned_to
  )) order by e.created_at asc), '[]'::jsonb)
  from public.partial_escalation_rules e;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_escalation_rules TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_escalation_rule(p_e jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_e->>'id';
begin
  if v_id is null then raise exception 'escalation_rule.id is required'; end if;
  insert into public.partial_escalation_rules (id, condition, action, assigned_to, updated_at)
  values (
    v_id,
    coalesce(p_e->>'condition', ''),
    coalesce(p_e->>'action', ''),
    p_e->>'assignedTo',
    now()
  )
  on conflict (id) do update set
    condition   = excluded.condition,
    action      = excluded.action,
    assigned_to = excluded.assigned_to,
    updated_at  = now();
  return p_e;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_escalation_rule TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_escalation_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.partial_upsert_escalation_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_escalation_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_escalation_rules_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_scheduled_reports()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',        r.id,
    'name',      r.name,
    'frequency', r.frequency
  ) order by r.name asc), '[]'::jsonb)
  from public.partial_scheduled_reports r;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_scheduled_reports TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_scheduled_report(p_r jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_r->>'id';
begin
  if v_id is null then raise exception 'scheduled_report.id is required'; end if;
  insert into public.partial_scheduled_reports (id, name, frequency, updated_at)
  values (
    v_id,
    coalesce(p_r->>'name', ''),
    coalesce(p_r->>'frequency', 'Monthly'),
    now()
  )
  on conflict (id) do update set
    name      = excluded.name,
    frequency = excluded.frequency,
    updated_at = now();
  return p_r;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_scheduled_report TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_scheduled_reports_bulk(p_reports jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_reports) <> 'array' then raise exception 'p_reports must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_reports)
  loop perform app.partial_upsert_scheduled_report(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_scheduled_reports_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_scheduled_reports_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_tax_records()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          t.id,
    'type',        t.type,
    'description', t.description,
    'amount',      t.amount,
    'date',        t.date,
    'status',      t.status
  ) order by t.date desc), '[]'::jsonb)
  from public.partial_tax_records t;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_tax_records TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tax_record(p_t jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'tax_record.id is required'; end if;
  insert into public.partial_tax_records (id, type, description, amount, date, status, updated_at)
  values (
    v_id,
    coalesce(p_t->>'type', ''),
    coalesce(p_t->>'description', ''),
    coalesce(nullif(p_t->>'amount', '')::numeric, 0),
    coalesce(p_t->>'date', ''),
    coalesce(p_t->>'status', 'Due'),
    now()
  )
  on conflict (id) do update set
    type        = excluded.type,
    description = excluded.description,
    amount      = excluded.amount,
    date        = excluded.date,
    status      = excluded.status,
    updated_at  = now();
  return p_t;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tax_record TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_tax_records_bulk(p_records jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_records)
  loop perform app.partial_upsert_tax_record(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_tax_records_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_tax_records_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_leads()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',            l.id,
    'tenantName',    l.tenant_name,
    'status',        l.status,
    'assignedAgent', l.assigned_agent,
    'listingTitle',  l.listing_title,
    'contact',       l.contact,
    'email',         l.email,
    'interest',      l.interest,
    'date',          l.date,
    'source',        l.source,
    'notes',         l.notes,
    'referrerId',    l.referrer_id
  )) order by l.date desc nulls last), '[]'::jsonb)
  from public.partial_leads l;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_leads TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_lead(p_l jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_l->>'id';
begin
  if v_id is null then raise exception 'lead.id is required'; end if;
  insert into public.partial_leads (id, tenant_name, status, assigned_agent, listing_title,
    contact, email, interest, date, source, notes, referrer_id, updated_at)
  values (
    v_id,
    coalesce(p_l->>'tenantName', ''),
    coalesce(p_l->>'status', 'New'),
    coalesce(p_l->>'assignedAgent', ''),
    coalesce(p_l->>'listingTitle', ''),
    p_l->>'contact',
    p_l->>'email',
    p_l->>'interest',
    p_l->>'date',
    p_l->>'source',
    p_l->>'notes',
    p_l->>'referrerId',
    now()
  )
  on conflict (id) do update set
    tenant_name    = excluded.tenant_name,
    status         = excluded.status,
    assigned_agent = excluded.assigned_agent,
    listing_title  = excluded.listing_title,
    contact        = excluded.contact,
    email          = excluded.email,
    interest       = excluded.interest,
    date           = excluded.date,
    source         = excluded.source,
    notes          = excluded.notes,
    referrer_id    = excluded.referrer_id,
    updated_at     = now();
  return p_l;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_lead TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_leads_bulk(p_leads jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_leads) <> 'array' then raise exception 'p_leads must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_leads)
  loop perform app.partial_upsert_lead(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_leads_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_leads_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_fundi_jobs()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          j.id,
    'fundiId',     j.fundi_id,
    'fundiName',   j.fundi_name,
    'clientName',  j.client_name,
    'clientPhone', j.client_phone,
    'location',    j.location,
    'description', j.description,
    'status',      j.status,
    'date',        j.date,
    'amount',      j.amount,
    'source',      j.source
  )) order by j.date desc), '[]'::jsonb)
  from public.partial_fundi_jobs j;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_fundi_jobs TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_fundi_job(p_j jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_j->>'id';
begin
  if v_id is null then raise exception 'fundi_job.id is required'; end if;
  insert into public.partial_fundi_jobs (id, fundi_id, fundi_name, client_name, client_phone,
    location, description, status, date, amount, source, updated_at)
  values (
    v_id,
    coalesce(p_j->>'fundiId', ''),
    coalesce(p_j->>'fundiName', ''),
    coalesce(p_j->>'clientName', ''),
    coalesce(p_j->>'clientPhone', ''),
    coalesce(p_j->>'location', ''),
    coalesce(p_j->>'description', ''),
    coalesce(p_j->>'status', 'Pending'),
    coalesce(p_j->>'date', ''),
    nullif(p_j->>'amount', '')::numeric,
    coalesce(p_j->>'source', 'App'),
    now()
  )
  on conflict (id) do update set
    fundi_id     = excluded.fundi_id,
    fundi_name   = excluded.fundi_name,
    client_name  = excluded.client_name,
    client_phone = excluded.client_phone,
    location     = excluded.location,
    description  = excluded.description,
    status       = excluded.status,
    date         = excluded.date,
    amount       = excluded.amount,
    source       = excluded.source,
    updated_at   = now();
  return p_j;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_fundi_job TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_fundi_jobs_bulk(p_jobs jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_jobs) <> 'array' then raise exception 'p_jobs must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_jobs)
  loop perform app.partial_upsert_fundi_job(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_fundi_jobs_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_fundi_jobs_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_marketing_banners()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          b.id,
    'title',       b.title,
    'type',        b.type,
    'imageUrl',    b.image_url,
    'description', b.description
  ) order by b.title asc), '[]'::jsonb)
  from public.partial_marketing_banners b;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_marketing_banners TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_marketing_banner(p_b jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_b->>'id';
begin
  if v_id is null then raise exception 'marketing_banner.id is required'; end if;
  insert into public.partial_marketing_banners (id, title, type, image_url, description, updated_at)
  values (
    v_id,
    coalesce(p_b->>'title', ''),
    coalesce(p_b->>'type', 'General'),
    coalesce(p_b->>'imageUrl', ''),
    coalesce(p_b->>'description', ''),
    now()
  )
  on conflict (id) do update set
    title       = excluded.title,
    type        = excluded.type,
    image_url   = excluded.image_url,
    description = excluded.description,
    updated_at  = now();
  return p_b;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_marketing_banner TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_marketing_banners_bulk(p_banners jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_banners) <> 'array' then raise exception 'p_banners must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_banners)
  loop perform app.partial_upsert_marketing_banner(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.partial_upsert_marketing_banners_bulk(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_marketing_banners_bulk TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_system_settings()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_strip_nulls(jsonb_build_object(
      'companyName',             s.company_name,
      'logo',                    s.logo,
      'profilePic',              s.profile_pic,
      'address',                 s.address,
      'phone',                   s.phone,
      'shortcode',               s.shortcode,
      'agencyPaybill',           s.agency_paybill,
      'agencyAirtelPartnerId',   s.agency_airtel_partner_id,
      'softwareConstants',       case when s.software_constants = '{}'::jsonb then null else s.software_constants end,
      'bulkSmsEnabled',          s.bulk_sms_enabled
    )),
    jsonb_build_object('companyName', 'TaskMe Realty', 'bulkSmsEnabled', false)
  )
  from public.partial_system_settings s
  where s.id = 'singleton';
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_system_settings TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_system_settings(p_s jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
begin
  insert into public.partial_system_settings
    (id, company_name, logo, profile_pic, address, phone, shortcode,
     agency_paybill, agency_airtel_partner_id, software_constants, bulk_sms_enabled, updated_at)
  values (
    'singleton',
    coalesce(p_s->>'companyName', 'TaskMe Realty'),
    p_s->>'logo',
    p_s->>'profilePic',
    p_s->>'address',
    p_s->>'phone',
    p_s->>'shortcode',
    p_s->>'agencyPaybill',
    p_s->>'agencyAirtelPartnerId',
    coalesce(p_s->'softwareConstants', '{}'::jsonb),
    coalesce((p_s->>'bulkSmsEnabled')::boolean, false),
    now()
  )
  on conflict (id) do update set
    company_name             = coalesce(excluded.company_name, 'TaskMe Realty'),
    logo                     = excluded.logo,
    profile_pic              = excluded.profile_pic,
    address                  = excluded.address,
    phone                    = excluded.phone,
    shortcode                = excluded.shortcode,
    agency_paybill           = excluded.agency_paybill,
    agency_airtel_partner_id = excluded.agency_airtel_partner_id,
    software_constants       = excluded.software_constants,
    bulk_sms_enabled         = case
                                 when p_s ? 'bulkSmsEnabled' then coalesce((p_s->>'bulkSmsEnabled')::boolean, false)
                                 else public.partial_system_settings.bulk_sms_enabled
                               end,
    updated_at               = now();
  return p_s;
end;
$$;

grant execute on function app.partial_upsert_system_settings(jsonb) to authenticated, service_role;

-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_system_settings TO authenticated, service_role;

CREATE OR REPLACE function app.partial_load_geospatial_data()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(g.data, '{}'::jsonb)
  from public.partial_geospatial_data g
  where g.id = 'singleton';
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_geospatial_data TO authenticated, service_role;

CREATE OR REPLACE function app.partial_upsert_geospatial_data(p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
begin
  insert into public.partial_geospatial_data (id, data, updated_at)
  values ('singleton', coalesce(p_data, '{}'::jsonb), now())
  on conflict (id) do update set
    data       = excluded.data,
    updated_at = now();
  return p_data;
end;
$$;
grant execute on function app.partial_upsert_geospatial_data(jsonb) to authenticated, service_role;

-- Backfill
-- removed backfill block
GRANT EXECUTE ON FUNCTION app.partial_upsert_geospatial_data TO authenticated, service_role;

CREATE OR REPLACE function app.partial_delete_tenant_application(p_id text)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from public.partial_tenant_applications where id = p_id;
  return found;
end;
$$;

grant execute on function app.partial_delete_tenant_application(text) to authenticated, service_role;


-- supabase/migrations/0081_assistant_admin_payments_access.sql
--
-- Ensures the Assistant Admin role has:
--   1. All Payments sub-module paths in accessible_submodules.
--   2. Full Financials action permissions (including pay) required for
--      payment matching and processing across Inbound, Outbound, Reconciliation.
--
-- Uses jsonb / array operations so only the targeted fields are touched;
-- all other role customisations are preserved.
-- Idempotent.

do $$
declare
  v_role_id uuid;
  v_current_subs text[];
  v_payment_subs text[] := array[
    'Payments',
    'Payments/Overview',
    'Payments/Inbound',
    'Payments/Outbound',
    'Payments/Invoices',
    'Payments/Reconciliation',
    'Payments/Landlord Payouts',
    'Payments/Overpayments',
    'Payments/Payment Processing'
  ];
  sub text;
begin
  select id into v_role_id from app.partial_roles where name = 'Assistant Admin' limit 1;
  if v_role_id is null then
    raise notice 'Assistant Admin role not found — skipping';
    return;
  end if;

  -- 1. Ensure all Payments/* paths are in accessible_submodules ----------
  select coalesce(accessible_submodules, '{}') into v_current_subs
    from app.partial_roles where id = v_role_id;

  foreach sub in array v_payment_subs loop
    if not (sub = any(v_current_subs)) then
      v_current_subs := v_current_subs || sub;
    end if;
  end loop;

  update app.partial_roles
     set accessible_submodules = v_current_subs,
         updated_at = now()
   where id = v_role_id;

  -- 2. Set full Financials action permissions (including pay) ----------
  update app.partial_roles
     set permissions = jsonb_set(
           permissions,
           '{Financials}',
           '{"create":true,"edit":true,"delete":true,"view":true,"approve":true,"import":true,"activate":true,"deactivate":true,"publish":true,"pay":true,"resolve":true,"cancel":true}'::jsonb
         ),
         updated_at = now()
   where id = v_role_id;

  raise notice 'Assistant Admin: Payments submodule access and Financials permissions updated.';
end $$;
GRANT EXECUTE ON FUNCTION app.partial_delete_tenant_application TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.partial_load_all_app_state() RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'tm_tenants_v11', app.partial_load_tenants(),
    'tm_properties_v11', app.partial_load_properties(),
    'tm_landlords_v11', app.partial_load_landlords(),
    'tm_staff_v11', app.partial_load_staff(),
    'tm_vendors_v11', app.partial_load_vendors(),
    'tm_external_transactions_v11', app.partial_load_external_transactions(),
    'tm_audit_logs_v11', app.partial_load_audit_logs(),
    'tm_tasks_v11', app.partial_load_tasks(),
    'tm_bills_v11', app.partial_load_bills(),
    'tm_invoices_v11', app.partial_load_invoices(),
    'tm_fines_v11', app.partial_load_fine_rules(),
    'tm_overpayments_v11', app.partial_load_overpayments(),
    'tm_quotations_v11', app.partial_load_quotations(),
    'tm_landlord_applications_v11', app.partial_load_landlord_applications(),
    'tm_applications_v11', app.partial_load_tenant_applications(),
    'tm_offboarding_v11', app.partial_load_offboarding_records(),
    'tm_landlord_offboarding_v11', app.partial_load_landlord_offboarding_records(),
    'tm_commissions_v11', app.partial_load_commission_rules(),
    'tm_deductions_v11', app.partial_load_deduction_rules(),
    'tm_income_sources_v11', app.partial_load_income_sources(),
    'tm_preventive_tasks_v11', app.partial_load_preventive_tasks(),
    
    
    
    
    
    
    'tm_messages_v11', app.partial_load_messages(),
    'tm_notifications_v11', app.partial_load_notifications(),
    'tm_templates_v11', app.partial_load_communication_templates(),
    'tm_workflows_v11', app.partial_load_workflows(),
    'tm_automation_rules_v11', app.partial_load_automation_rules(),
    'tm_escalation_rules_v11', app.partial_load_escalation_rules(),
    'tm_scheduled_reports_v11', app.partial_load_scheduled_reports(),
    'tm_tax_records_v11', app.partial_load_tax_records(),
    'tm_leads_v11', app.partial_load_leads(),
    'tm_fundi_jobs_v11', app.partial_load_fundi_jobs(),
    'tm_marketing_banners_v11', app.partial_load_marketing_banners(),
    'tm_system_settings_v11', app.partial_load_system_settings(),
    'tm_geospatial_v11', app.partial_load_geospatial_data()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
