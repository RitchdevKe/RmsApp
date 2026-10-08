-- 0123_multi_occupancy_and_revenue_split_persistence.sql
-- Run this in Supabase to persist:
--   1) Tenant application multi-occupancy sub-unit drafts in Full + Partial RMS.
--   2) Partial RMS property revenue split choices after reload.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenant application multi-occupancy persistence
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tenant_applications
  add column if not exists occupancy_type text,
  add column if not exists main_tenant_id text,
  add column if not exists sub_unit_drafts jsonb,
  add column if not exists tenant_onboarding_type text,
  add column if not exists existing_tenant_setup jsonb,
  add column if not exists alternative_phone text,
  add column if not exists next_of_kin_name text,
  add column if not exists next_of_kin_phone text,
  add column if not exists next_of_kin_relationship text;

alter table public.partial_tenant_applications
  add column if not exists occupancy_type text,
  add column if not exists main_tenant_id text,
  add column if not exists sub_unit_drafts jsonb,
  add column if not exists tenant_onboarding_type text,
  add column if not exists existing_tenant_setup jsonb,
  add column if not exists alternative_phone text,
  add column if not exists next_of_kin_name text,
  add column if not exists next_of_kin_phone text,
  add column if not exists next_of_kin_relationship text;

grant select, insert, update, delete on public.tenant_applications to authenticated;
grant all on public.tenant_applications to service_role;
grant select, insert, update, delete on public.partial_tenant_applications to authenticated;
grant all on public.partial_tenant_applications to service_role;

create or replace function app.load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'name', a.name, 'phone', a.phone, 'email', a.email,
    'idNumber', a.id_number, 'kraPin', a.kra_pin,
    'property', a.property, 'propertyId', a.property_id, 'propertyName', a.property_name,
    'unit', a.unit, 'unitId', a.unit_id, 'status', a.status,
    'submittedDate', a.submitted_date, 'source', a.source,
    'rentStartDate', a.rent_start_date, 'rentAmount', a.rent_amount,
    'rentDueDate', a.rent_due_date, 'rentGraceDays', a.rent_grace_days,
    'depositPaid', a.deposit_paid, 'leaseSigned', a.lease_signed,
    'leaseStartDate', a.lease_start_date, 'leaseEnd', a.lease_end,
    'authUserId', a.auth_user_id, 'documents', a.documents,
    'recurringBills', a.recurring_bills, 'avatar', a.avatar,
    'profilePicture', a.profile_picture, 'referrerId', a.referrer_id,
    'depositExempt', a.deposit_exempt, 'depositMonths', a.deposit_months,
    'proratedDeposit', a.prorated_deposit, 'rentExtension', a.rent_extension,
    'waterDeposit', a.water_deposit, 'electricityDeposit', a.electricity_deposit,
    'occupancyType', a.occupancy_type, 'mainTenantId', a.main_tenant_id,
    '_subUnitDrafts', coalesce(a.sub_unit_drafts, '[]'::jsonb),
    'tenantOnboardingType', a.tenant_onboarding_type,
    'existingTenantSetup', a.existing_tenant_setup,
    'alternativePhone', a.alternative_phone,
    'nextOfKinName', a.next_of_kin_name,
    'nextOfKinPhone', a.next_of_kin_phone,
    'nextOfKinRelationship', a.next_of_kin_relationship
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.tenant_applications a;
$$;
grant execute on function app.load_tenant_applications() to authenticated, service_role;

create or replace function app.partial_load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'name', a.name, 'phone', a.phone, 'email', a.email,
    'idNumber', a.id_number, 'kraPin', a.kra_pin,
    'property', a.property, 'propertyId', a.property_id, 'propertyName', a.property_name,
    'unit', a.unit, 'unitId', a.unit_id, 'status', a.status,
    'submittedDate', a.submitted_date, 'source', a.source,
    'rentStartDate', a.rent_start_date, 'rentAmount', a.rent_amount,
    'rentDueDate', a.rent_due_date, 'rentGraceDays', a.rent_grace_days,
    'depositPaid', a.deposit_paid, 'leaseSigned', a.lease_signed,
    'leaseStartDate', a.lease_start_date, 'leaseEnd', a.lease_end,
    'authUserId', a.auth_user_id, 'documents', a.documents,
    'recurringBills', a.recurring_bills, 'avatar', a.avatar,
    'profilePicture', a.profile_picture, 'referrerId', a.referrer_id,
    'depositExempt', a.deposit_exempt, 'depositMonths', a.deposit_months,
    'proratedDeposit', a.prorated_deposit, 'rentExtension', a.rent_extension,
    'waterDeposit', a.water_deposit, 'electricityDeposit', a.electricity_deposit,
    'occupancyType', a.occupancy_type, 'mainTenantId', a.main_tenant_id,
    '_subUnitDrafts', coalesce(a.sub_unit_drafts, '[]'::jsonb),
    'tenantOnboardingType', a.tenant_onboarding_type,
    'existingTenantSetup', a.existing_tenant_setup,
    'alternativePhone', a.alternative_phone,
    'nextOfKinName', a.next_of_kin_name,
    'nextOfKinPhone', a.next_of_kin_phone,
    'nextOfKinRelationship', a.next_of_kin_relationship
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.partial_tenant_applications a;
$$;
grant execute on function app.partial_load_tenant_applications() to authenticated, service_role;

create or replace function app.upsert_tenant_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'tenant_application.id is required'; end if;
  insert into public.tenant_applications (
    id, name, phone, email, id_number, kra_pin, property, property_id, property_name, unit, unit_id,
    status, submitted_date, source, rent_start_date, rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, lease_signed, lease_start_date, lease_end, auth_user_id, documents, recurring_bills,
    avatar, profile_picture, referrer_id, deposit_exempt, deposit_months, prorated_deposit,
    rent_extension, water_deposit, electricity_deposit, occupancy_type, main_tenant_id, sub_unit_drafts,
    tenant_onboarding_type, existing_tenant_setup, alternative_phone, next_of_kin_name, next_of_kin_phone,
    next_of_kin_relationship, updated_at
  ) values (
    v_id, coalesce(p_app->>'name',''), coalesce(p_app->>'phone',''), coalesce(p_app->>'email',''),
    p_app->>'idNumber', p_app->>'kraPin', p_app->>'property', p_app->>'propertyId', p_app->>'propertyName',
    p_app->>'unit', p_app->>'unitId', coalesce(p_app->>'status','New'), coalesce(p_app->>'submittedDate',''),
    p_app->>'source', p_app->>'rentStartDate', nullif(p_app->>'rentAmount','')::numeric,
    nullif(p_app->>'rentDueDate','')::int, nullif(p_app->>'rentGraceDays','')::int,
    nullif(p_app->>'depositPaid','')::numeric, coalesce((p_app->>'leaseSigned')::boolean,false),
    p_app->>'leaseStartDate', p_app->>'leaseEnd', p_app->>'authUserId', coalesce(p_app->'documents','[]'::jsonb),
    p_app->'recurringBills', p_app->>'avatar', p_app->>'profilePicture', p_app->>'referrerId',
    coalesce((p_app->>'depositExempt')::boolean,false), nullif(p_app->>'depositMonths','')::int,
    p_app->'proratedDeposit', p_app->'rentExtension', p_app->'waterDeposit', p_app->'electricityDeposit',
    p_app->>'occupancyType', p_app->>'mainTenantId', coalesce(p_app->'_subUnitDrafts', p_app->'subUnitDrafts', '[]'::jsonb),
    p_app->>'tenantOnboardingType', p_app->'existingTenantSetup', p_app->>'alternativePhone',
    p_app->>'nextOfKinName', p_app->>'nextOfKinPhone', p_app->>'nextOfKinRelationship', now()
  ) on conflict (id) do update set
    name=excluded.name, phone=excluded.phone, email=excluded.email, id_number=excluded.id_number,
    kra_pin=excluded.kra_pin, property=excluded.property, property_id=excluded.property_id,
    property_name=excluded.property_name, unit=excluded.unit, unit_id=excluded.unit_id,
    status=excluded.status, submitted_date=excluded.submitted_date, source=excluded.source,
    rent_start_date=excluded.rent_start_date, rent_amount=excluded.rent_amount,
    rent_due_date=excluded.rent_due_date, rent_grace_days=excluded.rent_grace_days,
    deposit_paid=excluded.deposit_paid, lease_signed=excluded.lease_signed,
    lease_start_date=excluded.lease_start_date, lease_end=excluded.lease_end,
    auth_user_id=excluded.auth_user_id, documents=excluded.documents, recurring_bills=excluded.recurring_bills,
    avatar=excluded.avatar, profile_picture=excluded.profile_picture, referrer_id=excluded.referrer_id,
    deposit_exempt=excluded.deposit_exempt, deposit_months=excluded.deposit_months,
    prorated_deposit=excluded.prorated_deposit, rent_extension=excluded.rent_extension,
    water_deposit=excluded.water_deposit, electricity_deposit=excluded.electricity_deposit,
    occupancy_type=excluded.occupancy_type, main_tenant_id=excluded.main_tenant_id,
    sub_unit_drafts=excluded.sub_unit_drafts, tenant_onboarding_type=excluded.tenant_onboarding_type,
    existing_tenant_setup=excluded.existing_tenant_setup, alternative_phone=excluded.alternative_phone,
    next_of_kin_name=excluded.next_of_kin_name, next_of_kin_phone=excluded.next_of_kin_phone,
    next_of_kin_relationship=excluded.next_of_kin_relationship, updated_at=now();
  return p_app;
end;
$$;
grant execute on function app.upsert_tenant_application(jsonb) to authenticated, service_role;

create or replace function app.partial_upsert_tenant_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'tenant_application.id is required'; end if;
  insert into public.partial_tenant_applications (
    id, name, phone, email, id_number, kra_pin, property, property_id, property_name, unit, unit_id,
    status, submitted_date, source, rent_start_date, rent_amount, rent_due_date, rent_grace_days,
    deposit_paid, lease_signed, lease_start_date, lease_end, auth_user_id, documents, recurring_bills,
    avatar, profile_picture, referrer_id, deposit_exempt, deposit_months, prorated_deposit,
    rent_extension, water_deposit, electricity_deposit, occupancy_type, main_tenant_id, sub_unit_drafts,
    tenant_onboarding_type, existing_tenant_setup, alternative_phone, next_of_kin_name, next_of_kin_phone,
    next_of_kin_relationship, updated_at
  ) values (
    v_id, coalesce(p_app->>'name',''), coalesce(p_app->>'phone',''), coalesce(p_app->>'email',''),
    p_app->>'idNumber', p_app->>'kraPin', p_app->>'property', p_app->>'propertyId', p_app->>'propertyName',
    p_app->>'unit', p_app->>'unitId', coalesce(p_app->>'status','New'), coalesce(p_app->>'submittedDate',''),
    p_app->>'source', p_app->>'rentStartDate', nullif(p_app->>'rentAmount','')::numeric,
    nullif(p_app->>'rentDueDate','')::int, nullif(p_app->>'rentGraceDays','')::int,
    nullif(p_app->>'depositPaid','')::numeric, coalesce((p_app->>'leaseSigned')::boolean,false),
    p_app->>'leaseStartDate', p_app->>'leaseEnd', p_app->>'authUserId', coalesce(p_app->'documents','[]'::jsonb),
    p_app->'recurringBills', p_app->>'avatar', p_app->>'profilePicture', p_app->>'referrerId',
    coalesce((p_app->>'depositExempt')::boolean,false), nullif(p_app->>'depositMonths','')::int,
    p_app->'proratedDeposit', p_app->'rentExtension', p_app->'waterDeposit', p_app->'electricityDeposit',
    p_app->>'occupancyType', p_app->>'mainTenantId', coalesce(p_app->'_subUnitDrafts', p_app->'subUnitDrafts', '[]'::jsonb),
    p_app->>'tenantOnboardingType', p_app->'existingTenantSetup', p_app->>'alternativePhone',
    p_app->>'nextOfKinName', p_app->>'nextOfKinPhone', p_app->>'nextOfKinRelationship', now()
  ) on conflict (id) do update set
    name=excluded.name, phone=excluded.phone, email=excluded.email, id_number=excluded.id_number,
    kra_pin=excluded.kra_pin, property=excluded.property, property_id=excluded.property_id,
    property_name=excluded.property_name, unit=excluded.unit, unit_id=excluded.unit_id,
    status=excluded.status, submitted_date=excluded.submitted_date, source=excluded.source,
    rent_start_date=excluded.rent_start_date, rent_amount=excluded.rent_amount,
    rent_due_date=excluded.rent_due_date, rent_grace_days=excluded.rent_grace_days,
    deposit_paid=excluded.deposit_paid, lease_signed=excluded.lease_signed,
    lease_start_date=excluded.lease_start_date, lease_end=excluded.lease_end,
    auth_user_id=excluded.auth_user_id, documents=excluded.documents, recurring_bills=excluded.recurring_bills,
    avatar=excluded.avatar, profile_picture=excluded.profile_picture, referrer_id=excluded.referrer_id,
    deposit_exempt=excluded.deposit_exempt, deposit_months=excluded.deposit_months,
    prorated_deposit=excluded.prorated_deposit, rent_extension=excluded.rent_extension,
    water_deposit=excluded.water_deposit, electricity_deposit=excluded.electricity_deposit,
    occupancy_type=excluded.occupancy_type, main_tenant_id=excluded.main_tenant_id,
    sub_unit_drafts=excluded.sub_unit_drafts, tenant_onboarding_type=excluded.tenant_onboarding_type,
    existing_tenant_setup=excluded.existing_tenant_setup, alternative_phone=excluded.alternative_phone,
    next_of_kin_name=excluded.next_of_kin_name, next_of_kin_phone=excluded.next_of_kin_phone,
    next_of_kin_relationship=excluded.next_of_kin_relationship, updated_at=now();
  return p_app;
end;
$$;
grant execute on function app.partial_upsert_tenant_application(jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Property revenue split persistence
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.properties add column if not exists collection_split jsonb;
alter table public.partial_properties add column if not exists collection_split jsonb;

grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;
grant select, insert, update, delete on public.partial_properties to authenticated;
grant all on public.partial_properties to service_role;

create or replace function app.load_properties()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'name', p.name, 'type', p.type, 'ownership', p.ownership, 'branch', p.branch,
      'status', p.status, 'landlordId', p.landlord_id, 'assignedAgentId', p.assigned_agent_id,
      'location', p.location, 'defaultMonthlyRent', p.default_monthly_rent, 'floors', p.floors,
      'units', coalesce(p.units, '[]'::jsonb), 'assets', coalesce(p.assets, '[]'::jsonb),
      'defaultUnitType', p.default_unit_type, 'rentIsUniform', p.rent_is_uniform, 'rentType', p.rent_type,
      'deposit', p.deposit, 'utilityDeposit', p.utility_deposit, 'placementFee', p.placement_fee,
      'managementType', p.management_type, 'landlordPaybill', p.landlord_paybill,
      'collectionSplit', p.collection_split, 'bills', p.bills, 'remittanceType', p.remittance_type,
      'remittanceCutoffDay', p.remittance_cutoff_day, 'nearestLandmark', p.nearest_landmark,
      'county', p.county, 'subCounty', p.sub_county, 'zone', p.zone, 'subLocation', p.sub_location,
      'pinLocationUrl', p.pin_location_url, 'websiteListingUrl', p.website_listing_url,
      'profilePictureUrl', p.profile_picture_url, 'rentByType', p.rent_by_type,
      'floorplan', coalesce(p.floorplan, '[]'::jsonb),
      'monthlyRentalIncomeTaxPercent', p.monthly_rental_income_tax_percent,
      'commercialVatPercent', p.commercial_vat_percent,
      'agencyCommissionPercent', p.agency_commission_percent
    )) as row
    from public.properties p
    order by p.created_at asc
  ) sub;
$$;
grant execute on function app.load_properties() to authenticated, service_role;

create or replace function app.partial_load_properties()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'name', p.name, 'type', p.type, 'ownership', p.ownership, 'branch', p.branch,
      'status', p.status, 'landlordId', p.landlord_id, 'assignedAgentId', p.assigned_agent_id,
      'location', p.location, 'defaultMonthlyRent', p.default_monthly_rent, 'floors', p.floors,
      'units', coalesce(p.units, '[]'::jsonb), 'assets', coalesce(p.assets, '[]'::jsonb),
      'defaultUnitType', p.default_unit_type, 'rentIsUniform', p.rent_is_uniform, 'rentType', p.rent_type,
      'deposit', p.deposit, 'utilityDeposit', p.utility_deposit, 'placementFee', p.placement_fee,
      'managementType', p.management_type, 'landlordPaybill', p.landlord_paybill,
      'collectionSplit', p.collection_split, 'bills', p.bills, 'remittanceType', p.remittance_type,
      'remittanceCutoffDay', p.remittance_cutoff_day, 'nearestLandmark', p.nearest_landmark,
      'county', p.county, 'subCounty', p.sub_county, 'zone', p.zone, 'subLocation', p.sub_location,
      'pinLocationUrl', p.pin_location_url, 'websiteListingUrl', p.website_listing_url,
      'profilePictureUrl', p.profile_picture_url, 'rentByType', p.rent_by_type,
      'floorplan', coalesce(p.floorplan, '[]'::jsonb),
      'monthlyRentalIncomeTaxPercent', p.monthly_rental_income_tax_percent,
      'commercialVatPercent', p.commercial_vat_percent,
      'agencyCommissionPercent', p.agency_commission_percent,
      'appScope', p.app_source
    )) as row
    from public.partial_properties p
    order by p.created_at asc
  ) sub;
$$;
grant execute on function app.partial_load_properties() to authenticated, service_role;

create or replace function app.upsert_property(p_property jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_property->>'id';
begin
  if v_id is null then raise exception 'property.id is required'; end if;
  insert into public.properties (
    id, created_by, name, type, ownership, branch, status, landlord_id, assigned_agent_id, location,
    default_monthly_rent, floors, units, assets, default_unit_type, rent_is_uniform, rent_type,
    deposit, utility_deposit, placement_fee, management_type, landlord_paybill, collection_split,
    bills, remittance_type, remittance_cutoff_day, nearest_landmark, county, sub_county, zone, sub_location,
    pin_location_url, website_listing_url, profile_picture_url, rent_by_type, floorplan,
    monthly_rental_income_tax_percent, commercial_vat_percent, agency_commission_percent, updated_at
  ) values (
    v_id, auth.uid(), p_property->>'name', p_property->>'type', p_property->>'ownership', p_property->>'branch',
    coalesce(p_property->>'status','Active'), p_property->>'landlordId', p_property->>'assignedAgentId',
    p_property->>'location', nullif(p_property->>'defaultMonthlyRent','')::numeric,
    nullif(p_property->>'floors','')::int, coalesce(p_property->'units','[]'::jsonb),
    coalesce(p_property->'assets','[]'::jsonb), p_property->>'defaultUnitType',
    (p_property->>'rentIsUniform')::boolean, p_property->>'rentType', p_property->'deposit',
    p_property->'utilityDeposit', (p_property->>'placementFee')::boolean, p_property->>'managementType',
    p_property->>'landlordPaybill', p_property->'collectionSplit', p_property->'bills', p_property->>'remittanceType',
    nullif(p_property->>'remittanceCutoffDay','')::int, p_property->>'nearestLandmark', p_property->>'county',
    p_property->>'subCounty', p_property->>'zone', p_property->>'subLocation', p_property->>'pinLocationUrl',
    p_property->>'websiteListingUrl', p_property->>'profilePictureUrl', p_property->'rentByType',
    coalesce(p_property->'floorplan','[]'::jsonb), nullif(p_property->>'monthlyRentalIncomeTaxPercent','')::numeric,
    nullif(p_property->>'commercialVatPercent','')::numeric, nullif(p_property->>'agencyCommissionPercent','')::numeric, now()
  ) on conflict (id) do update set
    name=excluded.name, type=excluded.type, ownership=excluded.ownership, branch=excluded.branch,
    status=excluded.status, landlord_id=excluded.landlord_id, assigned_agent_id=excluded.assigned_agent_id,
    location=excluded.location, default_monthly_rent=excluded.default_monthly_rent, floors=excluded.floors,
    units=excluded.units, assets=excluded.assets, default_unit_type=excluded.default_unit_type,
    rent_is_uniform=excluded.rent_is_uniform, rent_type=excluded.rent_type, deposit=excluded.deposit,
    utility_deposit=excluded.utility_deposit, placement_fee=excluded.placement_fee,
    management_type=excluded.management_type, landlord_paybill=excluded.landlord_paybill,
    collection_split=excluded.collection_split, bills=excluded.bills, remittance_type=excluded.remittance_type,
    remittance_cutoff_day=excluded.remittance_cutoff_day, nearest_landmark=excluded.nearest_landmark,
    county=excluded.county, sub_county=excluded.sub_county, zone=excluded.zone, sub_location=excluded.sub_location,
    pin_location_url=excluded.pin_location_url, website_listing_url=excluded.website_listing_url,
    profile_picture_url=excluded.profile_picture_url, rent_by_type=excluded.rent_by_type, floorplan=excluded.floorplan,
    monthly_rental_income_tax_percent=excluded.monthly_rental_income_tax_percent,
    commercial_vat_percent=excluded.commercial_vat_percent,
    agency_commission_percent=excluded.agency_commission_percent, updated_at=now();
  return p_property;
end;
$$;
grant execute on function app.upsert_property(jsonb) to authenticated, service_role;

create or replace function app.partial_upsert_property(p_property jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare
  v_id text := p_property->>'id';
  v_app_scope text := coalesce(p_property->>'appScope', 'Partial');
begin
  if v_id is null then raise exception 'property.id is required'; end if;
  insert into public.partial_properties (
    id, created_by, name, type, ownership, branch, status, landlord_id, assigned_agent_id, location,
    default_monthly_rent, floors, units, assets, default_unit_type, rent_is_uniform, rent_type,
    deposit, utility_deposit, placement_fee, management_type, landlord_paybill, collection_split,
    bills, remittance_type, remittance_cutoff_day, nearest_landmark, county, sub_county, zone, sub_location,
    pin_location_url, website_listing_url, profile_picture_url, rent_by_type, floorplan,
    monthly_rental_income_tax_percent, commercial_vat_percent, agency_commission_percent, app_source, updated_at
  ) values (
    v_id, auth.uid(), p_property->>'name', p_property->>'type', p_property->>'ownership', p_property->>'branch',
    coalesce(p_property->>'status','Active'), p_property->>'landlordId', p_property->>'assignedAgentId',
    p_property->>'location', nullif(p_property->>'defaultMonthlyRent','')::numeric,
    nullif(p_property->>'floors','')::int, coalesce(p_property->'units','[]'::jsonb),
    coalesce(p_property->'assets','[]'::jsonb), p_property->>'defaultUnitType',
    (p_property->>'rentIsUniform')::boolean, p_property->>'rentType', p_property->'deposit',
    p_property->'utilityDeposit', (p_property->>'placementFee')::boolean, coalesce(p_property->>'managementType','Partial'),
    p_property->>'landlordPaybill', p_property->'collectionSplit', p_property->'bills', p_property->>'remittanceType',
    nullif(p_property->>'remittanceCutoffDay','')::int, p_property->>'nearestLandmark', p_property->>'county',
    p_property->>'subCounty', p_property->>'zone', p_property->>'subLocation', p_property->>'pinLocationUrl',
    p_property->>'websiteListingUrl', p_property->>'profilePictureUrl', p_property->'rentByType',
    coalesce(p_property->'floorplan','[]'::jsonb), nullif(p_property->>'monthlyRentalIncomeTaxPercent','')::numeric,
    nullif(p_property->>'commercialVatPercent','')::numeric, nullif(p_property->>'agencyCommissionPercent','')::numeric,
    v_app_scope, now()
  ) on conflict (id) do update set
    name=excluded.name, type=excluded.type, ownership=excluded.ownership, branch=excluded.branch,
    status=excluded.status, landlord_id=excluded.landlord_id, assigned_agent_id=excluded.assigned_agent_id,
    location=excluded.location, default_monthly_rent=excluded.default_monthly_rent, floors=excluded.floors,
    units=excluded.units, assets=excluded.assets, default_unit_type=excluded.default_unit_type,
    rent_is_uniform=excluded.rent_is_uniform, rent_type=excluded.rent_type, deposit=excluded.deposit,
    utility_deposit=excluded.utility_deposit, placement_fee=excluded.placement_fee,
    management_type=excluded.management_type, landlord_paybill=excluded.landlord_paybill,
    collection_split=excluded.collection_split, bills=excluded.bills, remittance_type=excluded.remittance_type,
    remittance_cutoff_day=excluded.remittance_cutoff_day, nearest_landmark=excluded.nearest_landmark,
    county=excluded.county, sub_county=excluded.sub_county, zone=excluded.zone, sub_location=excluded.sub_location,
    pin_location_url=excluded.pin_location_url, website_listing_url=excluded.website_listing_url,
    profile_picture_url=excluded.profile_picture_url, rent_by_type=excluded.rent_by_type, floorplan=excluded.floorplan,
    monthly_rental_income_tax_percent=excluded.monthly_rental_income_tax_percent,
    commercial_vat_percent=excluded.commercial_vat_percent,
    agency_commission_percent=excluded.agency_commission_percent, app_source=excluded.app_source, updated_at=now();
  return p_property;
end;
$$;
grant execute on function app.partial_upsert_property(jsonb) to authenticated, service_role;