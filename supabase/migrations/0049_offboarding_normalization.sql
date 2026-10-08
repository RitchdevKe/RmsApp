-- supabase/migrations/0049_offboarding_normalization.sql
--
-- OffboardingRecord: { id, tenantId, tenantName, unit, noticeDate,
--   moveOutDate, status, inspectionStatus, utilityClearance,
--   depositRefunded, keysReturned, finalBillAmount? }
-- Idempotent.

create table if not exists public.offboarding_records (
  id                text primary key,
  tenant_id         text not null default '',
  tenant_name       text not null default '',
  unit              text not null default '',
  notice_date       text not null default '',
  move_out_date     text not null default '',
  status            text not null default 'Notice Given',
  inspection_status text not null default 'Pending',
  utility_clearance boolean not null default false,
  deposit_refunded  boolean not null default false,
  keys_returned     boolean not null default false,
  final_bill_amount numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists offboarding_status_idx    on public.offboarding_records (status);
create index if not exists offboarding_tenant_idx    on public.offboarding_records (tenant_id);

alter table public.offboarding_records enable row level security;

drop policy if exists offboarding_select_admin on public.offboarding_records;
create policy offboarding_select_admin
on public.offboarding_records for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists offboarding_write_admin on public.offboarding_records;
create policy offboarding_write_admin
on public.offboarding_records for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.offboarding_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_offboarding_updated_at on public.offboarding_records;
create trigger trg_offboarding_updated_at
before update on public.offboarding_records
for each row execute function public.offboarding_set_updated_at();

-- Load RPC
create or replace function app.load_offboarding_records()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',               r.id,
    'tenantId',         r.tenant_id,
    'tenantName',       r.tenant_name,
    'unit',             r.unit,
    'noticeDate',       r.notice_date,
    'moveOutDate',      r.move_out_date,
    'status',           r.status,
    'inspectionStatus', r.inspection_status,
    'utilityClearance', r.utility_clearance,
    'depositRefunded',  r.deposit_refunded,
    'keysReturned',     r.keys_returned,
    'finalBillAmount',  r.final_bill_amount
  )) order by r.created_at desc), '[]'::jsonb)
  from public.offboarding_records r;
$$;
grant execute on function app.load_offboarding_records() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_offboarding_record(p_r jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_r->>'id';
begin
  if v_id is null then raise exception 'offboarding_record.id is required'; end if;
  insert into public.offboarding_records (
    id, tenant_id, tenant_name, unit, notice_date, move_out_date,
    status, inspection_status, utility_clearance, deposit_refunded,
    keys_returned, final_bill_amount, updated_at
  ) values (
    v_id,
    coalesce(p_r->>'tenantId', ''),
    coalesce(p_r->>'tenantName', ''),
    coalesce(p_r->>'unit', ''),
    coalesce(p_r->>'noticeDate', ''),
    coalesce(p_r->>'moveOutDate', ''),
    coalesce(p_r->>'status', 'Notice Given'),
    coalesce(p_r->>'inspectionStatus', 'Pending'),
    coalesce((p_r->>'utilityClearance')::boolean, false),
    coalesce((p_r->>'depositRefunded')::boolean, false),
    coalesce((p_r->>'keysReturned')::boolean, false),
    nullif(p_r->>'finalBillAmount','')::numeric,
    now()
  )
  on conflict (id) do update set
    tenant_id         = excluded.tenant_id,
    tenant_name       = excluded.tenant_name,
    unit              = excluded.unit,
    notice_date       = excluded.notice_date,
    move_out_date     = excluded.move_out_date,
    status            = excluded.status,
    inspection_status = excluded.inspection_status,
    utility_clearance = excluded.utility_clearance,
    deposit_refunded  = excluded.deposit_refunded,
    keys_returned     = excluded.keys_returned,
    final_bill_amount = excluded.final_bill_amount,
    updated_at        = now();
  return p_r;
end;
$$;
grant execute on function app.upsert_offboarding_record(jsonb) to authenticated, service_role;

create or replace function app.upsert_offboarding_records_bulk(p_records jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_records)
  loop perform app.upsert_offboarding_record(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_offboarding_records_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_recs jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_offboarding_v11'
  loop
    v_recs := r.value;
    if v_recs is null or jsonb_typeof(v_recs) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_recs)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.offboarding_records (
          id, tenant_id, tenant_name, unit, notice_date, move_out_date,
          status, inspection_status, utility_clearance, deposit_refunded,
          keys_returned, final_bill_amount, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'tenantId', ''),
          coalesce(v_item->>'tenantName', ''),
          coalesce(v_item->>'unit', ''),
          coalesce(v_item->>'noticeDate', ''),
          coalesce(v_item->>'moveOutDate', ''),
          coalesce(v_item->>'status', 'Notice Given'),
          coalesce(v_item->>'inspectionStatus', 'Pending'),
          coalesce((v_item->>'utilityClearance')::boolean, false),
          coalesce((v_item->>'depositRefunded')::boolean, false),
          coalesce((v_item->>'keysReturned')::boolean, false),
          nullif(v_item->>'finalBillAmount','')::numeric,
          now()
        )
        on conflict (id) do update set
          tenant_id         = excluded.tenant_id,
          tenant_name       = excluded.tenant_name,
          unit              = excluded.unit,
          notice_date       = excluded.notice_date,
          move_out_date     = excluded.move_out_date,
          status            = excluded.status,
          inspection_status = excluded.inspection_status,
          utility_clearance = excluded.utility_clearance,
          deposit_refunded  = excluded.deposit_refunded,
          keys_returned     = excluded.keys_returned,
          final_bill_amount = excluded.final_bill_amount,
          updated_at        = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped offboarding id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Offboarding records backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_applications_v11','tm_offboarding_v11'
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
    'tm_offboarding_v11',           app.load_offboarding_records()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
