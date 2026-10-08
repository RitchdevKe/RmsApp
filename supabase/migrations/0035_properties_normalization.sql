-- supabase/migrations/0035_properties_normalization.sql
--
-- Migration Step 2: Properties — normalize public.properties as source of truth.
--
-- Changes:
--   1. Add missing columns to public.properties (newer fields from types.ts)
--   2. Create app.load_properties() RPC — returns Property[]-shaped JSONB
--   3. Create app.upsert_property(jsonb) and app.upsert_properties_bulk(jsonb) RPCs
--   4. Backfill public.properties from tm_properties_v11 blob (with per-item exception handling)
--   5. Update load_all_app_state() to serve tm_properties_v11 from public.properties
--
-- Idempotent: safe to re-run.

-- ── 1. Add missing columns ─────────────────────────────────────────────────
alter table public.properties
  add column if not exists utility_deposit              jsonb,
  add column if not exists management_type              text,
  add column if not exists landlord_paybill             text,
  add column if not exists pin_location_url             text,
  add column if not exists website_listing_url          text,
  add column if not exists monthly_rental_income_tax_percent numeric,
  add column if not exists commercial_vat_percent       numeric;

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
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
      'commercialVatPercent',           p.commercial_vat_percent
    )) as row
    from public.properties p
    order by p.created_at asc
  ) sub;
$$;

grant execute on function app.load_properties() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
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
    updated_at                        = now();

  return p_property;
end;
$$;

grant execute on function app.upsert_property(jsonb) to authenticated, service_role;

create or replace function app.upsert_properties_bulk(p_properties jsonb)
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
    perform app.upsert_property(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_properties_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_props    jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in
    select value from app.app_state where key = 'tm_properties_v11'
  loop
    v_props := r.value;
    if v_props is null or jsonb_typeof(v_props) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_props)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        insert into public.properties (
          id, name, type, ownership, branch, status,
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
          updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', '(unnamed)'),
          v_item->>'type',
          v_item->>'ownership',
          v_item->>'branch',
          coalesce(v_item->>'status', 'Active'),
          v_item->>'landlordId',
          v_item->>'assignedAgentId',
          v_item->>'location',
          nullif(v_item->>'defaultMonthlyRent','')::numeric,
          nullif(v_item->>'floors','')::int,
          coalesce(v_item->'units', '[]'::jsonb),
          coalesce(v_item->'assets', '[]'::jsonb),
          v_item->>'defaultUnitType',
          (v_item->>'rentIsUniform')::boolean,
          v_item->>'rentType',
          v_item->'deposit',
          v_item->'utilityDeposit',
          (v_item->>'placementFee')::boolean,
          v_item->>'managementType',
          v_item->>'landlordPaybill',
          v_item->'bills',
          v_item->>'remittanceType',
          nullif(v_item->>'remittanceCutoffDay','')::int,
          v_item->>'nearestLandmark',
          v_item->>'county',
          v_item->>'subCounty',
          v_item->>'zone',
          v_item->>'subLocation',
          v_item->>'pinLocationUrl',
          v_item->>'websiteListingUrl',
          v_item->>'profilePictureUrl',
          v_item->'rentByType',
          coalesce(v_item->'floorplan', '[]'::jsonb),
          nullif(v_item->>'monthlyRentalIncomeTaxPercent','')::numeric,
          nullif(v_item->>'commercialVatPercent','')::numeric,
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
          updated_at                        = now();

        v_upserted := v_upserted + 1;

      exception when others then
        raise notice 'Skipped property id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;

    end loop;
  end loop;

  raise notice 'Properties backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;

-- ── 5. Wire into load_all_app_state ───────────────────────────────────────
create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in ('tm_tenants_v11', 'tm_properties_v11')
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',    app.load_tenants(),
      'tm_properties_v11', app.load_properties()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
