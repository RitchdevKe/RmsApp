-- supabase/migrations/0050_landlord_offboarding_normalization.sql
--
-- LandlordOffboardingRecord: { id, landlordId, landlordName, propertyCount,
--   reason, status, terminationDate, checklist?, financials?, documents? }
-- Nested objects stored as JSONB. Idempotent.

create table if not exists public.landlord_offboarding_records (
  id                text primary key,
  landlord_id       text not null default '',
  landlord_name     text not null default '',
  property_count    int not null default 0,
  reason            text not null default '',
  status            text not null default 'Notice Served',
  termination_date  text not null default '',
  checklist         jsonb,
  financials        jsonb,
  documents         jsonb default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists landlord_offboarding_status_idx     on public.landlord_offboarding_records (status);
create index if not exists landlord_offboarding_landlord_idx   on public.landlord_offboarding_records (landlord_id);

alter table public.landlord_offboarding_records enable row level security;

drop policy if exists ll_offboarding_select_admin on public.landlord_offboarding_records;
create policy ll_offboarding_select_admin
on public.landlord_offboarding_records for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists ll_offboarding_write_admin on public.landlord_offboarding_records;
create policy ll_offboarding_write_admin
on public.landlord_offboarding_records for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.ll_offboarding_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_ll_offboarding_updated_at on public.landlord_offboarding_records;
create trigger trg_ll_offboarding_updated_at
before update on public.landlord_offboarding_records
for each row execute function public.ll_offboarding_set_updated_at();

-- Load RPC
create or replace function app.load_landlord_offboarding_records()
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
  from public.landlord_offboarding_records r;
$$;
grant execute on function app.load_landlord_offboarding_records() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_landlord_offboarding_record(p_r jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_r->>'id';
begin
  if v_id is null then raise exception 'landlord_offboarding_record.id is required'; end if;
  insert into public.landlord_offboarding_records (
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
grant execute on function app.upsert_landlord_offboarding_record(jsonb) to authenticated, service_role;

create or replace function app.upsert_landlord_offboarding_bulk(p_records jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_records)
  loop perform app.upsert_landlord_offboarding_record(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_landlord_offboarding_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_recs jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_landlord_offboarding_v11'
  loop
    v_recs := r.value;
    if v_recs is null or jsonb_typeof(v_recs) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_recs)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.landlord_offboarding_records (
          id, landlord_id, landlord_name, property_count, reason,
          status, termination_date, checklist, financials, documents, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'landlordId', ''),
          coalesce(v_item->>'landlordName', ''),
          coalesce(nullif(v_item->>'propertyCount','')::int, 0),
          coalesce(v_item->>'reason', ''),
          coalesce(v_item->>'status', 'Notice Served'),
          coalesce(v_item->>'terminationDate', ''),
          v_item->'checklist',
          v_item->'financials',
          coalesce(v_item->'documents', '[]'::jsonb),
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
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped ll_offboarding id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Landlord offboarding backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_quotations_v11','tm_landlord_applications_v11',
        'tm_applications_v11','tm_offboarding_v11',
        'tm_landlord_offboarding_v11'
      )
    ), '{}'::jsonb
  )
  || jsonb_build_object(
    'tm_tenants_v11',               app.load_tenants(),
    'tm_properties_v11',            app.load_properties(),
    'tm_landlords_v11',             app.load_landlords(),
    'tm_staff_v11',                 app.load_staff(),
    'tm_vendors_v11',               app.load_vendors(),
    'tm_external_transactions_v11', app.load_external_transactions(),
    'tm_audit_logs_v11',            app.load_audit_logs(),
    'tm_tasks_v11',                 app.load_tasks(),
    'tm_bills_v11',                 app.load_bills(),
    'tm_invoices_v11',              app.load_invoices(),
    'tm_fines_v11',                 app.load_fine_rules(),
    'tm_overpayments_v11',          app.load_overpayments(),
    'tm_quotations_v11',            app.load_quotations(),
    'tm_landlord_applications_v11', app.load_landlord_applications(),
    'tm_applications_v11',          app.load_tenant_applications(),
    'tm_offboarding_v11',           app.load_offboarding_records(),
    'tm_landlord_offboarding_v11',  app.load_landlord_offboarding_records()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
