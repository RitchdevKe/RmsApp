-- 0117_tenant_apps_multi_occupancy.sql
--
-- Persist multi-occupancy data on tenant applications so that sub-units
-- added on an applicant's Property & Units > Multiple Occupancy form
-- survive a page reload.
--
-- Adds columns + updates load/upsert RPCs for BOTH:
--   - public.tenant_applications        (Full RMS)
--   - public.partial_tenant_applications (Partial RMS)
--
-- Idempotent.

------------------------------------------------------------------------
-- FULL RMS
------------------------------------------------------------------------
alter table public.tenant_applications
    add column if not exists occupancy_type           text,
    add column if not exists main_tenant_id           text,
    add column if not exists sub_unit_drafts          jsonb,
    add column if not exists tenant_onboarding_type   text,
    add column if not exists existing_tenant_setup    jsonb,
    add column if not exists alternative_phone        text,
    add column if not exists next_of_kin_name         text,
    add column if not exists next_of_kin_phone        text,
    add column if not exists next_of_kin_relationship text;

create or replace function app.load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                     a.id,
    'name',                   a.name,
    'phone',                  a.phone,
    'email',                  a.email,
    'idNumber',               a.id_number,
    'kraPin',                 a.kra_pin,
    'property',               a.property,
    'propertyId',             a.property_id,
    'propertyName',           a.property_name,
    'unit',                   a.unit,
    'unitId',                 a.unit_id,
    'status',                 a.status,
    'submittedDate',          a.submitted_date,
    'source',                 a.source,
    'rentStartDate',          a.rent_start_date,
    'rentAmount',             a.rent_amount,
    'rentDueDate',            a.rent_due_date,
    'rentGraceDays',          a.rent_grace_days,
    'depositPaid',            a.deposit_paid,
    'leaseSigned',            a.lease_signed,
    'leaseStartDate',         a.lease_start_date,
    'leaseEnd',               a.lease_end,
    'authUserId',             a.auth_user_id,
    'documents',              a.documents,
    'recurringBills',         a.recurring_bills,
    'avatar',                 a.avatar,
    'profilePicture',         a.profile_picture,
    'referrerId',             a.referrer_id,
    'depositExempt',          a.deposit_exempt,
    'depositMonths',          a.deposit_months,
    'proratedDeposit',        a.prorated_deposit,
    'rentExtension',          a.rent_extension,
    'waterDeposit',           a.water_deposit,
    'electricityDeposit',     a.electricity_deposit,
    'occupancyType',          a.occupancy_type,
    'mainTenantId',           a.main_tenant_id,
    '_subUnitDrafts',         a.sub_unit_drafts,
    'tenantOnboardingType',   a.tenant_onboarding_type,
    'existingTenantSetup',    a.existing_tenant_setup,
    'alternativePhone',       a.alternative_phone,
    'nextOfKinName',          a.next_of_kin_name,
    'nextOfKinPhone',         a.next_of_kin_phone,
    'nextOfKinRelationship',  a.next_of_kin_relationship
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.tenant_applications a;
$$;
grant execute on function app.load_tenant_applications() to authenticated;

create or replace function app.upsert_tenant_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'tenant_application.id is required'; end if;
  insert into public.tenant_applications (
    id, name, phone, email, id_number, kra_pin,
    property, property_id, property_name, unit, unit_id,
    status, submitted_date, source,
    rent_start_date, rent_amount, rent_due_date, rent_grace_days, deposit_paid,
    lease_signed, lease_start_date, lease_end, auth_user_id,
    documents, recurring_bills, avatar, profile_picture, referrer_id,
    deposit_exempt, deposit_months, prorated_deposit, rent_extension,
    water_deposit, electricity_deposit,
    occupancy_type, main_tenant_id, sub_unit_drafts,
    tenant_onboarding_type, existing_tenant_setup,
    alternative_phone, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
    updated_at
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
    p_app->>'occupancyType',
    p_app->>'mainTenantId',
    p_app->'_subUnitDrafts',
    p_app->>'tenantOnboardingType',
    p_app->'existingTenantSetup',
    p_app->>'alternativePhone',
    p_app->>'nextOfKinName',
    p_app->>'nextOfKinPhone',
    p_app->>'nextOfKinRelationship',
    now()
  )
  on conflict (id) do update set
    name                      = excluded.name,
    phone                     = excluded.phone,
    email                     = excluded.email,
    id_number                 = excluded.id_number,
    kra_pin                   = excluded.kra_pin,
    property                  = excluded.property,
    property_id               = excluded.property_id,
    property_name             = excluded.property_name,
    unit                      = excluded.unit,
    unit_id                   = excluded.unit_id,
    status                    = excluded.status,
    submitted_date            = excluded.submitted_date,
    source                    = excluded.source,
    rent_start_date           = excluded.rent_start_date,
    rent_amount               = excluded.rent_amount,
    rent_due_date             = excluded.rent_due_date,
    rent_grace_days           = excluded.rent_grace_days,
    deposit_paid              = excluded.deposit_paid,
    lease_signed              = excluded.lease_signed,
    lease_start_date          = excluded.lease_start_date,
    lease_end                 = excluded.lease_end,
    auth_user_id              = excluded.auth_user_id,
    documents                 = excluded.documents,
    recurring_bills           = excluded.recurring_bills,
    avatar                    = excluded.avatar,
    profile_picture           = excluded.profile_picture,
    referrer_id               = excluded.referrer_id,
    deposit_exempt            = excluded.deposit_exempt,
    deposit_months            = excluded.deposit_months,
    prorated_deposit          = excluded.prorated_deposit,
    rent_extension            = excluded.rent_extension,
    water_deposit             = excluded.water_deposit,
    electricity_deposit       = excluded.electricity_deposit,
    occupancy_type            = excluded.occupancy_type,
    main_tenant_id            = excluded.main_tenant_id,
    sub_unit_drafts           = excluded.sub_unit_drafts,
    tenant_onboarding_type    = excluded.tenant_onboarding_type,
    existing_tenant_setup     = excluded.existing_tenant_setup,
    alternative_phone         = excluded.alternative_phone,
    next_of_kin_name          = excluded.next_of_kin_name,
    next_of_kin_phone         = excluded.next_of_kin_phone,
    next_of_kin_relationship  = excluded.next_of_kin_relationship,
    updated_at                = now();
  return p_app;
end;
$$;
grant execute on function app.upsert_tenant_application(jsonb) to authenticated, service_role;

------------------------------------------------------------------------
-- PARTIAL RMS
------------------------------------------------------------------------
alter table public.partial_tenant_applications
    add column if not exists occupancy_type           text,
    add column if not exists main_tenant_id           text,
    add column if not exists sub_unit_drafts          jsonb,
    add column if not exists tenant_onboarding_type   text,
    add column if not exists existing_tenant_setup    jsonb,
    add column if not exists alternative_phone        text,
    add column if not exists next_of_kin_name         text,
    add column if not exists next_of_kin_phone        text,
    add column if not exists next_of_kin_relationship text;

create or replace function app.partial_load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                     a.id,
    'name',                   a.name,
    'phone',                  a.phone,
    'email',                  a.email,
    'idNumber',               a.id_number,
    'kraPin',                 a.kra_pin,
    'property',               a.property,
    'propertyId',             a.property_id,
    'propertyName',           a.property_name,
    'unit',                   a.unit,
    'unitId',                 a.unit_id,
    'status',                 a.status,
    'submittedDate',          a.submitted_date,
    'source',                 a.source,
    'rentStartDate',          a.rent_start_date,
    'rentAmount',             a.rent_amount,
    'rentDueDate',            a.rent_due_date,
    'rentGraceDays',          a.rent_grace_days,
    'depositPaid',            a.deposit_paid,
    'leaseSigned',            a.lease_signed,
    'leaseStartDate',         a.lease_start_date,
    'leaseEnd',               a.lease_end,
    'authUserId',             a.auth_user_id,
    'documents',              a.documents,
    'recurringBills',         a.recurring_bills,
    'avatar',                 a.avatar,
    'profilePicture',         a.profile_picture,
    'referrerId',             a.referrer_id,
    'depositExempt',          a.deposit_exempt,
    'depositMonths',          a.deposit_months,
    'proratedDeposit',        a.prorated_deposit,
    'rentExtension',          a.rent_extension,
    'waterDeposit',           a.water_deposit,
    'electricityDeposit',     a.electricity_deposit,
    'occupancyType',          a.occupancy_type,
    'mainTenantId',           a.main_tenant_id,
    '_subUnitDrafts',         a.sub_unit_drafts,
    'tenantOnboardingType',   a.tenant_onboarding_type,
    'existingTenantSetup',    a.existing_tenant_setup,
    'alternativePhone',       a.alternative_phone,
    'nextOfKinName',          a.next_of_kin_name,
    'nextOfKinPhone',         a.next_of_kin_phone,
    'nextOfKinRelationship',  a.next_of_kin_relationship
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.partial_tenant_applications a;
$$;
grant execute on function app.partial_load_tenant_applications() to authenticated, service_role;

create or replace function app.partial_upsert_tenant_application(p_app jsonb)
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
    water_deposit, electricity_deposit,
    occupancy_type, main_tenant_id, sub_unit_drafts,
    tenant_onboarding_type, existing_tenant_setup,
    alternative_phone, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
    updated_at
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
    p_app->>'occupancyType',
    p_app->>'mainTenantId',
    p_app->'_subUnitDrafts',
    p_app->>'tenantOnboardingType',
    p_app->'existingTenantSetup',
    p_app->>'alternativePhone',
    p_app->>'nextOfKinName',
    p_app->>'nextOfKinPhone',
    p_app->>'nextOfKinRelationship',
    now()
  )
  on conflict (id) do update set
    name                      = excluded.name,
    phone                     = excluded.phone,
    email                     = excluded.email,
    id_number                 = excluded.id_number,
    kra_pin                   = excluded.kra_pin,
    property                  = excluded.property,
    property_id               = excluded.property_id,
    property_name             = excluded.property_name,
    unit                      = excluded.unit,
    unit_id                   = excluded.unit_id,
    status                    = excluded.status,
    submitted_date            = excluded.submitted_date,
    source                    = excluded.source,
    rent_start_date           = excluded.rent_start_date,
    rent_amount               = excluded.rent_amount,
    rent_due_date             = excluded.rent_due_date,
    rent_grace_days           = excluded.rent_grace_days,
    deposit_paid              = excluded.deposit_paid,
    lease_signed              = excluded.lease_signed,
    lease_start_date          = excluded.lease_start_date,
    lease_end                 = excluded.lease_end,
    auth_user_id              = excluded.auth_user_id,
    documents                 = excluded.documents,
    recurring_bills           = excluded.recurring_bills,
    avatar                    = excluded.avatar,
    profile_picture           = excluded.profile_picture,
    referrer_id               = excluded.referrer_id,
    deposit_exempt            = excluded.deposit_exempt,
    deposit_months            = excluded.deposit_months,
    prorated_deposit          = excluded.prorated_deposit,
    rent_extension            = excluded.rent_extension,
    water_deposit             = excluded.water_deposit,
    electricity_deposit       = excluded.electricity_deposit,
    occupancy_type            = excluded.occupancy_type,
    main_tenant_id            = excluded.main_tenant_id,
    sub_unit_drafts           = excluded.sub_unit_drafts,
    tenant_onboarding_type    = excluded.tenant_onboarding_type,
    existing_tenant_setup     = excluded.existing_tenant_setup,
    alternative_phone         = excluded.alternative_phone,
    next_of_kin_name          = excluded.next_of_kin_name,
    next_of_kin_phone         = excluded.next_of_kin_phone,
    next_of_kin_relationship  = excluded.next_of_kin_relationship,
    updated_at                = now();
  return p_app;
end;
$$;
grant execute on function app.partial_upsert_tenant_application(jsonb) to authenticated, service_role;
