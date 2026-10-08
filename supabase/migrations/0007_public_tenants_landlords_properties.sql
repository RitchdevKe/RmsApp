-- supabase/migrations/0007_public_tenants_landlords_properties.sql
-- Normalized tables for tenants, landlords (applications), properties.
-- Uses exact fields from types.ts; complex nested fields stored as JSONB.
-- RLS: users can only manage records they created (created_by = auth.uid()).

-- public.tenants (TenantProfile fields)
create table if not exists public.tenants (
  id text primary key,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  username text,
  email text not null,
  phone text,
  id_number text,
  status text not null default 'Active',
  property_id text,
  property_name text,
  unit_id text,
  unit text,
  rent_amount numeric default 0,
  rent_due_date int,
  deposit_paid numeric,
  onboarding_date text,
  lease_end text,
  lease_type text,
  payment_history jsonb default '[]',
  outstanding_bills jsonb default '[]',
  outstanding_fines jsonb default '[]',
  maintenance_requests jsonb default '[]',
  notes jsonb default '[]',
  notices jsonb default '[]',
  requests jsonb default '[]',
  date_registered text,
  house_status jsonb default '[]',
  collection_history jsonb default '[]',
  recurring_bills jsonb,
  avatar text,
  profile_picture text,
  kra_pin text,
  arrears numeric,
  role text,
  referrer_id text,
  referral_config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tenants enable row level security;
create policy "tenants_select_own" on public.tenants for select to authenticated using (created_by = auth.uid());
create policy "tenants_insert_own" on public.tenants for insert to authenticated with check (created_by = auth.uid());
create policy "tenants_update_own" on public.tenants for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "tenants_delete_own" on public.tenants for delete to authenticated using (created_by = auth.uid());

-- public.landlords (LandlordApplication fields)
create table if not exists public.landlords (
  id text primary key,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  id_number text,
  status text not null default 'Pending',
  date text not null,
  proposed_properties jsonb default '[]',
  notes text,
  location text,
  property_ids jsonb default '[]',
  payment_config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.landlords enable row level security;
create policy "landlords_select_own" on public.landlords for select to authenticated using (created_by = auth.uid());
create policy "landlords_insert_own" on public.landlords for insert to authenticated with check (created_by = auth.uid());
create policy "landlords_update_own" on public.landlords for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "landlords_delete_own" on public.landlords for delete to authenticated using (created_by = auth.uid());

-- public.properties (Property fields)
create table if not exists public.properties (
  id text primary key,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  type text,
  ownership text,
  branch text,
  status text not null default 'Active',
  landlord_id text not null,
  assigned_agent_id text,
  location text,
  default_monthly_rent numeric,
  floors int,
  units jsonb default '[]',
  assets jsonb default '[]',
  default_unit_type text,
  rent_is_uniform boolean,
  rent_type text,
  deposit jsonb,
  placement_fee boolean,
  bills jsonb,
  remittance_type text,
  remittance_cutoff_day int,
  nearest_landmark text,
  county text,
  sub_county text,
  zone text,
  sub_location text,
  profile_picture_url text,
  rent_by_type jsonb,
  floorplan jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.properties enable row level security;
create policy "properties_select_own" on public.properties for select to authenticated using (created_by = auth.uid());
create policy "properties_insert_own" on public.properties for insert to authenticated with check (created_by = auth.uid());
create policy "properties_update_own" on public.properties for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "properties_delete_own" on public.properties for delete to authenticated using (created_by = auth.uid());
