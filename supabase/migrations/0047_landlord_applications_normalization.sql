-- supabase/migrations/0047_landlord_applications_normalization.sql
--
-- LandlordApplication: { id, name, email, phone?, idNumber?, status,
--   date, proposedProperties[], notes?, location?, propertyIds[], paymentConfig? }
-- Idempotent.

create table if not exists public.landlord_applications (
  id                  text primary key,
  name                text not null default '',
  email               text not null default '',
  phone               text,
  id_number           text,
  status              text not null default 'Pending',
  date                text not null default '',
  proposed_properties jsonb default '[]'::jsonb,
  notes               text,
  location            text,
  property_ids        jsonb default '[]'::jsonb,
  payment_config      jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists landlord_apps_status_idx on public.landlord_applications (status);

alter table public.landlord_applications enable row level security;

drop policy if exists landlord_apps_select_admin on public.landlord_applications;
create policy landlord_apps_select_admin
on public.landlord_applications for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists landlord_apps_write_admin on public.landlord_applications;
create policy landlord_apps_write_admin
on public.landlord_applications for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.landlord_apps_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_landlord_apps_updated_at on public.landlord_applications;
create trigger trg_landlord_apps_updated_at
before update on public.landlord_applications
for each row execute function public.landlord_apps_set_updated_at();

-- Load RPC
create or replace function app.load_landlord_applications()
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
  from public.landlord_applications a;
$$;
grant execute on function app.load_landlord_applications() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_landlord_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'landlord_application.id is required'; end if;
  insert into public.landlord_applications (
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
grant execute on function app.upsert_landlord_application(jsonb) to authenticated, service_role;

create or replace function app.upsert_landlord_applications_bulk(p_apps jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_apps) <> 'array' then raise exception 'p_apps must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_apps)
  loop perform app.upsert_landlord_application(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_landlord_applications_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_apps jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_landlord_applications_v11'
  loop
    v_apps := r.value;
    if v_apps is null or jsonb_typeof(v_apps) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_apps)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.landlord_applications (
          id, name, email, phone, id_number, status, date,
          proposed_properties, notes, location, property_ids, payment_config, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', ''),
          coalesce(v_item->>'email', ''),
          v_item->>'phone',
          v_item->>'idNumber',
          coalesce(v_item->>'status', 'Pending'),
          coalesce(v_item->>'date', ''),
          coalesce(v_item->'proposedProperties', '[]'::jsonb),
          v_item->>'notes',
          v_item->>'location',
          coalesce(v_item->'propertyIds', '[]'::jsonb),
          v_item->'paymentConfig',
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
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped landlord_application id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Landlord applications backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
end $$;

-- load_all_app_state
create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in (
        'tm_tenants_v11','tm_properties_v11','tm_landlords_v11',
        'tm_staff_v11','tm_vendors_v11','tm_external_transactions_v11',
        'tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
        'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11',
        'tm_quotations_v11','tm_landlord_applications_v11'
      )
    ), '{}'::jsonb
  )
  || jsonb_build_object(
    'tm_tenants_v11',                   app.load_tenants(),
    'tm_properties_v11',                app.load_properties(),
    'tm_landlords_v11',                 app.load_landlords(),
    'tm_staff_v11',                     app.load_staff(),
    'tm_vendors_v11',                   app.load_vendors(),
    'tm_external_transactions_v11',     app.load_external_transactions(),
    'tm_audit_logs_v11',                app.load_audit_logs(),
    'tm_tasks_v11',                     app.load_tasks(),
    'tm_bills_v11',                     app.load_bills(),
    'tm_invoices_v11',                  app.load_invoices(),
    'tm_fines_v11',                     app.load_fine_rules(),
    'tm_overpayments_v11',              app.load_overpayments(),
    'tm_quotations_v11',                app.load_quotations(),
    'tm_landlord_applications_v11',     app.load_landlord_applications()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
