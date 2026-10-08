-- supabase/migrations/0036_landlords_normalization.sql
--
-- Migration Step 3: Landlords — normalize public.landlords as source of truth.
--
-- tm_landlords_v11 stores User[] (active landlords), while the existing
-- public.landlords table was partially built for LandlordApplication fields.
-- This migration:
--   1. Makes `date` nullable (User has no date field)
--   2. Adds missing User columns: username, kra_pin, role, branch, avatar_url,
--      referrer_id, referral_config
--   3. Creates app.load_landlords() RPC — returns User[]-shaped JSONB
--   4. Creates app.upsert_landlord(jsonb) and app.upsert_landlords_bulk(jsonb)
--   5. Backfills public.landlords from tm_landlords_v11 blob
--   6. Updates load_all_app_state() to serve tm_landlords_v11 from the table
--
-- Idempotent: safe to re-run.

-- ── 1. Schema adjustments ─────────────────────────────────────────────────
alter table public.landlords
  alter column date drop not null,
  add column if not exists username    text,
  add column if not exists kra_pin     text,
  add column if not exists role        text,
  add column if not exists branch      text,
  add column if not exists avatar_url  text,
  add column if not exists referrer_id text,
  add column if not exists referral_config jsonb;

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_landlords()
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
    from public.landlords l
    order by l.created_at asc
  ) sub;
$$;

grant execute on function app.load_landlords() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_landlord(p_landlord jsonb)
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

  insert into public.landlords (
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

grant execute on function app.upsert_landlord(jsonb) to authenticated, service_role;

create or replace function app.upsert_landlords_bulk(p_landlords jsonb)
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
    perform app.upsert_landlord(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_landlords_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_landlords jsonb;
  v_item      jsonb;
  v_upserted  int := 0;
  v_skipped   int := 0;
begin
  for r in select value from app.app_state where key = 'tm_landlords_v11'
  loop
    v_landlords := r.value;
    if v_landlords is null or jsonb_typeof(v_landlords) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_landlords)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        insert into public.landlords (
          id, name, username, email, phone, id_number,
          kra_pin, role, status, branch, avatar_url,
          referrer_id, referral_config, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', '(unnamed)'),
          v_item->>'username',
          coalesce(v_item->>'email', ''),
          v_item->>'phone',
          v_item->>'idNumber',
          v_item->>'kraPin',
          v_item->>'role',
          coalesce(v_item->>'status', 'Active'),
          v_item->>'branch',
          v_item->>'avatarUrl',
          v_item->>'referrerId',
          v_item->'referralConfig',
          now()
        )
        on conflict (id) do update set
          name            = excluded.name,
          username        = excluded.username,
          email           = excluded.email,
          phone           = excluded.phone,
          id_number       = excluded.id_number,
          kra_pin         = excluded.kra_pin,
          role            = excluded.role,
          status          = excluded.status,
          branch          = excluded.branch,
          avatar_url      = excluded.avatar_url,
          referrer_id     = excluded.referrer_id,
          referral_config = excluded.referral_config,
          updated_at      = now();

        v_upserted := v_upserted + 1;

      exception when others then
        raise notice 'Skipped landlord id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Landlords backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
      where key not in ('tm_tenants_v11', 'tm_properties_v11', 'tm_landlords_v11')
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',    app.load_tenants(),
      'tm_properties_v11', app.load_properties(),
      'tm_landlords_v11',  app.load_landlords()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
