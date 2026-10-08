-- supabase/migrations/0038_vendors_normalization.sql
--
-- Migration Step 5: Vendors — create public.vendors as source of truth.
--
-- app.contractors has `id uuid references auth.users` — vendor IDs in the blob
-- are not guaranteed to be auth users, so we create a separate public.vendors
-- table with a plain text primary key.
--
-- Changes:
--   1. Create public.vendors table
--   2. Create app.load_vendors() RPC
--   3. Create app.upsert_vendor(jsonb) and app.upsert_vendors_bulk(jsonb)
--   4. Backfill public.vendors from tm_vendors_v11 blob
--   5. Update load_all_app_state() to serve tm_vendors_v11 from the table
--
-- Idempotent: safe to re-run.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.vendors (
  id              text primary key,
  created_by      uuid references auth.users(id) on delete set null,
  name            text not null,
  username        text,
  specialty       text not null default 'General',
  rating          numeric default 5,
  email           text,
  phone           text,
  location        text,
  daily_rate      numeric,
  verified        boolean default false,
  completed_jobs  int default 0,
  avatar_url      text,
  summary         text,
  certifications  jsonb default '[]'::jsonb,
  eta             text,
  available       boolean default true,
  portfolio_images jsonb default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.vendors enable row level security;

drop policy if exists vendors_select_authenticated on public.vendors;
create policy vendors_select_authenticated
on public.vendors for select to authenticated using (true);

drop policy if exists vendors_admin_write on public.vendors;
create policy vendors_admin_write
on public.vendors for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_vendors()
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
    from public.vendors v
    order by v.created_at asc
  ) sub;
$$;

grant execute on function app.load_vendors() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_vendor(p_vendor jsonb)
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

  insert into public.vendors (
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

grant execute on function app.upsert_vendor(jsonb) to authenticated, service_role;

create or replace function app.upsert_vendors_bulk(p_vendors jsonb)
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
    perform app.upsert_vendor(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_vendors_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_vendors  jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_vendors_v11'
  loop
    v_vendors := r.value;
    if v_vendors is null or jsonb_typeof(v_vendors) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_vendors)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        insert into public.vendors (
          id, name, username, specialty, rating,
          email, phone, location, daily_rate, verified,
          completed_jobs, avatar_url, summary,
          certifications, eta, available, portfolio_images,
          updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', '(unnamed)'),
          v_item->>'username',
          coalesce(v_item->>'specialty', 'General'),
          coalesce(nullif(v_item->>'rating','')::numeric, 5),
          v_item->>'email',
          v_item->>'phone',
          v_item->>'location',
          nullif(v_item->>'dailyRate','')::numeric,
          coalesce((v_item->>'verified')::boolean, false),
          coalesce(nullif(v_item->>'completedJobs','')::int, 0),
          v_item->>'avatarUrl',
          v_item->>'summary',
          coalesce(v_item->'certifications', '[]'::jsonb),
          v_item->>'eta',
          coalesce((v_item->>'available')::boolean, true),
          coalesce(v_item->'portfolioImages', '[]'::jsonb),
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

        v_upserted := v_upserted + 1;

      exception when others then
        raise notice 'Skipped vendor id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Vendors backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
      where key not in (
        'tm_tenants_v11', 'tm_properties_v11',
        'tm_landlords_v11', 'tm_staff_v11', 'tm_vendors_v11'
      )
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',    app.load_tenants(),
      'tm_properties_v11', app.load_properties(),
      'tm_landlords_v11',  app.load_landlords(),
      'tm_staff_v11',      app.load_staff(),
      'tm_vendors_v11',    app.load_vendors()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
