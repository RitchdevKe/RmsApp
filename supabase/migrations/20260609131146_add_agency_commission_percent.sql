-- Persist per-property agency commission percentage so it doesn't revert
-- to the global default after a reload.

alter table public.properties
  add column if not exists agency_commission_percent numeric;

-- Replace upsert_property to include agency_commission_percent.
create or replace function app.upsert_property(p_property jsonb)
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

  insert into public.properties (
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

grant execute on function app.upsert_property(jsonb) to authenticated, service_role;

-- Replace load_properties to include agencyCommissionPercent.
create or replace function app.load_properties()
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
    from public.properties p
    order by p.created_at asc
  ) sub;
$$;

grant execute on function app.load_properties() to authenticated;
