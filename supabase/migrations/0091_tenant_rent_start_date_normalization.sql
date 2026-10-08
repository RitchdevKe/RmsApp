alter table public.tenants add column if not exists rent_start_date text;

update public.tenants
set rent_start_date = coalesce(nullif(rent_start_date, ''), onboarding_date, activation_date)
where coalesce(rent_start_date, '') = '';

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname = 'load_tenants'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname = 'load_tenants_0091'
  ) then
    alter function app.load_tenants() rename to load_tenants_0091;
  end if;
end $$;

create or replace function app.load_tenants()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_set(
        e.item,
        '{rentStartDate}',
        coalesce(to_jsonb(coalesce(nullif(t.rent_start_date, ''), t.onboarding_date, t.activation_date)), 'null'::jsonb),
        true
      )
      order by e.ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(app.load_tenants_0091()) with ordinality e(item, ord)
  left join public.tenants t on t.id = e.item->>'id';
$$;

grant execute on function app.load_tenants() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname = 'upsert_tenant'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname = 'upsert_tenant_0091'
  ) then
    alter function app.upsert_tenant(jsonb) rename to upsert_tenant_0091;
  end if;
end $$;

create or replace function app.upsert_tenant(p_tenant jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_result jsonb;
begin
  v_result := app.upsert_tenant_0091(p_tenant);

  update public.tenants
  set rent_start_date = coalesce(nullif(p_tenant->>'rentStartDate', ''), rent_start_date, onboarding_date, activation_date),
      updated_at = now()
  where id = p_tenant->>'id';

  return v_result;
end;
$$;

grant execute on function app.upsert_tenant(jsonb) to authenticated, service_role;
