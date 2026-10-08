-- supabase/migrations/0056_investments_normalization.sql
--
-- Investment: { id, fundId, fundName, amount, date, strategy,
--   status, accruedInterest, investorId? }
-- Idempotent.

create table if not exists public.investments (
  id               text primary key,
  fund_id          text not null default '',
  fund_name        text not null default '',
  amount           numeric not null default 0,
  date             text not null default '',
  strategy         text not null default 'Monthly Payout',
  status           text not null default 'Active',
  accrued_interest numeric not null default 0,
  investor_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists investments_fund_idx     on public.investments (fund_id);
create index if not exists investments_investor_idx on public.investments (investor_id);

alter table public.investments enable row level security;

drop policy if exists investments_select_admin on public.investments;
create policy investments_select_admin
on public.investments for select to authenticated using (app.is_admin(auth.uid()));

drop policy if exists investments_write_admin on public.investments;
create policy investments_write_admin
on public.investments for all to authenticated
using (app.is_admin(auth.uid())) with check (app.is_admin(auth.uid()));

create or replace function public.investments_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_investments_updated_at on public.investments;
create trigger trg_investments_updated_at
before update on public.investments
for each row execute function public.investments_set_updated_at();

create or replace function app.load_investments()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id','accruedInterest',i.accrued_interest,'amount',i.amount,'date',i.date,
    'fundId',i.fund_id,'fundName',i.fund_name,'id',i.id,'investorId',i.investor_id,
    'status',i.status,'strategy',i.strategy
  )) order by i.date desc), '[]'::jsonb) from public.investments i;
$$;

-- Rebuild cleanly
create or replace function app.load_investments()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',              i.id,
    'fundId',          i.fund_id,
    'fundName',        i.fund_name,
    'amount',          i.amount,
    'date',            i.date,
    'strategy',        i.strategy,
    'status',          i.status,
    'accruedInterest', i.accrued_interest,
    'investorId',      i.investor_id
  )) order by i.date desc), '[]'::jsonb) from public.investments i;
$$;
grant execute on function app.load_investments() to authenticated;

create or replace function app.upsert_investment(p_i jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_i->>'id';
begin
  if v_id is null then raise exception 'investment.id is required'; end if;
  insert into public.investments (id,fund_id,fund_name,amount,date,strategy,status,accrued_interest,investor_id,updated_at)
  values (v_id, coalesce(p_i->>'fundId',''), coalesce(p_i->>'fundName',''),
    coalesce(nullif(p_i->>'amount','')::numeric,0), coalesce(p_i->>'date',''),
    coalesce(p_i->>'strategy','Monthly Payout'), coalesce(p_i->>'status','Active'),
    coalesce(nullif(p_i->>'accruedInterest','')::numeric,0), p_i->>'investorId', now())
  on conflict (id) do update set
    fund_id=excluded.fund_id, fund_name=excluded.fund_name, amount=excluded.amount,
    date=excluded.date, strategy=excluded.strategy, status=excluded.status,
    accrued_interest=excluded.accrued_interest, investor_id=excluded.investor_id, updated_at=now();
  return p_i;
end;
$$;
grant execute on function app.upsert_investment(jsonb) to authenticated, service_role;

create or replace function app.upsert_investments_bulk(p_investments jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_investments) <> 'array' then raise exception 'p_investments must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_investments)
  loop perform app.upsert_investment(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_investments_bulk(jsonb) to authenticated, service_role;

do $$
declare r record; v_arr jsonb; v_item jsonb; v_up int:=0; v_sk int:=0;
begin
  for r in select value from app.app_state where key='tm_investments_v11' loop
    v_arr:=r.value; if v_arr is null or jsonb_typeof(v_arr)<>'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr) loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.investments (id,fund_id,fund_name,amount,date,strategy,status,accrued_interest,investor_id,updated_at)
        values (v_item->>'id', coalesce(v_item->>'fundId',''), coalesce(v_item->>'fundName',''),
          coalesce(nullif(v_item->>'amount','')::numeric,0), coalesce(v_item->>'date',''),
          coalesce(v_item->>'strategy','Monthly Payout'), coalesce(v_item->>'status','Active'),
          coalesce(nullif(v_item->>'accruedInterest','')::numeric,0), v_item->>'investorId', now())
        on conflict (id) do update set
          fund_id=excluded.fund_id, fund_name=excluded.fund_name, amount=excluded.amount,
          date=excluded.date, strategy=excluded.strategy, status=excluded.status,
          accrued_interest=excluded.accrued_interest, investor_id=excluded.investor_id, updated_at=now();
        v_up:=v_up+1;
      exception when others then raise notice 'Skipped investment id=% reason=%',v_item->>'id',sqlerrm; v_sk:=v_sk+1; end;
    end loop;
  end loop;
  raise notice 'Investments backfill: upserted=%, skipped=%', v_up, v_sk;
end $$;

create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_object_agg(key,value) filter (where key not in (
    'tm_tenants_v11','tm_properties_v11','tm_landlords_v11','tm_staff_v11','tm_vendors_v11',
    'tm_external_transactions_v11','tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
    'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11','tm_quotations_v11',
    'tm_landlord_applications_v11','tm_applications_v11','tm_offboarding_v11',
    'tm_landlord_offboarding_v11','tm_commissions_v11','tm_deductions_v11',
    'tm_income_sources_v11','tm_preventive_tasks_v11','tm_funds_v11','tm_investments_v11'
  )),'{}'::jsonb)
  || jsonb_build_object(
    'tm_tenants_v11',app.load_tenants(),'tm_properties_v11',app.load_properties(),
    'tm_landlords_v11',app.load_landlords(),'tm_staff_v11',app.load_staff(),
    'tm_vendors_v11',app.load_vendors(),'tm_external_transactions_v11',app.load_external_transactions(),
    'tm_audit_logs_v11',app.load_audit_logs(),'tm_tasks_v11',app.load_tasks(),
    'tm_bills_v11',app.load_bills(),'tm_invoices_v11',app.load_invoices(),
    'tm_fines_v11',app.load_fine_rules(),'tm_overpayments_v11',app.load_overpayments(),
    'tm_quotations_v11',app.load_quotations(),'tm_landlord_applications_v11',app.load_landlord_applications(),
    'tm_applications_v11',app.load_tenant_applications(),'tm_offboarding_v11',app.load_offboarding_records(),
    'tm_landlord_offboarding_v11',app.load_landlord_offboarding_records(),
    'tm_commissions_v11',app.load_commission_rules(),'tm_deductions_v11',app.load_deduction_rules(),
    'tm_income_sources_v11',app.load_income_sources(),'tm_preventive_tasks_v11',app.load_preventive_tasks(),
    'tm_funds_v11',app.load_funds(),'tm_investments_v11',app.load_investments()
  ) from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
