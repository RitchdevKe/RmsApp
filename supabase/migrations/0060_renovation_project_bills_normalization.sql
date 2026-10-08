-- supabase/migrations/0060_renovation_project_bills_normalization.sql
--
-- RenovationProjectBill: { id, projectId, vendor, description,
--   amount, date, status, category }
-- Idempotent.

create table if not exists public.renovation_project_bills (
  id          text primary key,
  project_id  text not null default '',
  vendor      text not null default '',
  description text not null default '',
  amount      numeric not null default 0,
  date        text not null default '',
  status      text not null default 'Pending',
  category    text not null default 'Other',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists renov_bills_project_idx on public.renovation_project_bills (project_id);
create index if not exists renov_bills_status_idx  on public.renovation_project_bills (status);

alter table public.renovation_project_bills enable row level security;

drop policy if exists renov_bills_select_admin on public.renovation_project_bills;
create policy renov_bills_select_admin
on public.renovation_project_bills for select to authenticated using (app.is_admin(auth.uid()));

drop policy if exists renov_bills_write_admin on public.renovation_project_bills;
create policy renov_bills_write_admin
on public.renovation_project_bills for all to authenticated
using (app.is_admin(auth.uid())) with check (app.is_admin(auth.uid()));

create or replace function public.renov_bills_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_renov_bills_updated_at on public.renovation_project_bills;
create trigger trg_renov_bills_updated_at
before update on public.renovation_project_bills
for each row execute function public.renov_bills_set_updated_at();

create or replace function app.load_renovation_project_bills()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'projectId',b.project_id,'vendor',b.vendor,
    'description',b.description,'amount',b.amount,'date',b.date,
    'status',b.status,'category',b.category
  ) order by b.date desc), '[]'::jsonb) from public.renovation_project_bills b;
$$;
grant execute on function app.load_renovation_project_bills() to authenticated;

create or replace function app.upsert_renovation_project_bill(p_b jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_b->>'id';
begin
  if v_id is null then raise exception 'renovation_project_bill.id is required'; end if;
  insert into public.renovation_project_bills (id,project_id,vendor,description,amount,date,status,category,updated_at)
  values (v_id, coalesce(p_b->>'projectId',''), coalesce(p_b->>'vendor',''),
    coalesce(p_b->>'description',''), coalesce(nullif(p_b->>'amount','')::numeric,0),
    coalesce(p_b->>'date',''), coalesce(p_b->>'status','Pending'),
    coalesce(p_b->>'category','Other'), now())
  on conflict (id) do update set
    project_id=excluded.project_id, vendor=excluded.vendor, description=excluded.description,
    amount=excluded.amount, date=excluded.date, status=excluded.status,
    category=excluded.category, updated_at=now();
  return p_b;
end;
$$;
grant execute on function app.upsert_renovation_project_bill(jsonb) to authenticated, service_role;

create or replace function app.upsert_renovation_project_bills_bulk(p_bills jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_bills)<>'array' then raise exception 'p_bills must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_bills)
  loop perform app.upsert_renovation_project_bill(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_renovation_project_bills_bulk(jsonb) to authenticated, service_role;

do $$
declare r record; v_arr jsonb; v_item jsonb; v_up int:=0; v_sk int:=0;
begin
  for r in select value from app.app_state where key='tm_renovation_project_bills_v11' loop
    v_arr:=r.value; if v_arr is null or jsonb_typeof(v_arr)<>'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr) loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.renovation_project_bills (id,project_id,vendor,description,amount,date,status,category,updated_at)
        values (v_item->>'id', coalesce(v_item->>'projectId',''), coalesce(v_item->>'vendor',''),
          coalesce(v_item->>'description',''), coalesce(nullif(v_item->>'amount','')::numeric,0),
          coalesce(v_item->>'date',''), coalesce(v_item->>'status','Pending'),
          coalesce(v_item->>'category','Other'), now())
        on conflict (id) do update set
          project_id=excluded.project_id, vendor=excluded.vendor, description=excluded.description,
          amount=excluded.amount, date=excluded.date, status=excluded.status,
          category=excluded.category, updated_at=now();
        v_up:=v_up+1;
      exception when others then raise notice 'Skipped renov_bill id=% reason=%',v_item->>'id',sqlerrm; v_sk:=v_sk+1; end;
    end loop;
  end loop;
  raise notice 'Renovation project bills backfill: upserted=%, skipped=%', v_up, v_sk;
end $$;

-- FINAL load_all_app_state — all 32 blob keys normalized
create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_object_agg(key,value) filter (where key not in (
    'tm_tenants_v11','tm_properties_v11','tm_landlords_v11','tm_staff_v11','tm_vendors_v11',
    'tm_external_transactions_v11','tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
    'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11','tm_quotations_v11',
    'tm_landlord_applications_v11','tm_applications_v11','tm_offboarding_v11',
    'tm_landlord_offboarding_v11','tm_commissions_v11','tm_deductions_v11',
    'tm_income_sources_v11','tm_preventive_tasks_v11','tm_funds_v11',
    'tm_investments_v11','tm_withdrawals_v11','tm_renovation_investors_v11',
    'tm_rf_transactions_v11','tm_renovation_project_bills_v11'
  )),'{}'::jsonb)
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
    'tm_landlord_applications_v11',     app.load_landlord_applications(),
    'tm_applications_v11',              app.load_tenant_applications(),
    'tm_offboarding_v11',               app.load_offboarding_records(),
    'tm_landlord_offboarding_v11',      app.load_landlord_offboarding_records(),
    'tm_commissions_v11',               app.load_commission_rules(),
    'tm_deductions_v11',                app.load_deduction_rules(),
    'tm_income_sources_v11',            app.load_income_sources(),
    'tm_preventive_tasks_v11',          app.load_preventive_tasks(),
    'tm_funds_v11',                     app.load_funds(),
    'tm_investments_v11',               app.load_investments(),
    'tm_withdrawals_v11',               app.load_withdrawal_requests(),
    'tm_renovation_investors_v11',      app.load_renovation_investors(),
    'tm_rf_transactions_v11',           app.load_rf_transactions(),
    'tm_renovation_project_bills_v11',  app.load_renovation_project_bills()
  ) from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
