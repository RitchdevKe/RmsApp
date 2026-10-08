-- supabase/migrations/0059_rf_transactions_normalization.sql
--
-- RFTransaction: { id, date, type, category, amount,
--   partyName, reference, status, description? }
-- Idempotent.

create table if not exists public.rf_transactions (
  id          text primary key,
  date        text not null default '',
  type        text not null default '',
  category    text not null default 'Inbound',
  amount      numeric not null default 0,
  party_name  text not null default '',
  reference   text not null default '',
  status      text not null default 'Completed',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists rf_tx_date_idx   on public.rf_transactions (date desc);
create index if not exists rf_tx_status_idx on public.rf_transactions (status);

alter table public.rf_transactions enable row level security;

drop policy if exists rf_tx_select_admin on public.rf_transactions;
create policy rf_tx_select_admin
on public.rf_transactions for select to authenticated using (app.is_admin(auth.uid()));

drop policy if exists rf_tx_write_admin on public.rf_transactions;
create policy rf_tx_write_admin
on public.rf_transactions for all to authenticated
using (app.is_admin(auth.uid())) with check (app.is_admin(auth.uid()));

create or replace function public.rf_tx_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_rf_tx_updated_at on public.rf_transactions;
create trigger trg_rf_tx_updated_at
before update on public.rf_transactions
for each row execute function public.rf_tx_set_updated_at();

create or replace function app.load_rf_transactions()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',t.id,'date',t.date,'type',t.type,'category',t.category,
    'amount',t.amount,'partyName',t.party_name,'reference',t.reference,
    'status',t.status,'description',t.description
  )) order by t.date desc), '[]'::jsonb) from public.rf_transactions t;
$$;
grant execute on function app.load_rf_transactions() to authenticated;

create or replace function app.upsert_rf_transaction(p_t jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'rf_transaction.id is required'; end if;
  insert into public.rf_transactions (id,date,type,category,amount,party_name,reference,status,description,updated_at)
  values (v_id, coalesce(p_t->>'date',''), coalesce(p_t->>'type',''),
    coalesce(p_t->>'category','Inbound'), coalesce(nullif(p_t->>'amount','')::numeric,0),
    coalesce(p_t->>'partyName',''), coalesce(p_t->>'reference',''),
    coalesce(p_t->>'status','Completed'), p_t->>'description', now())
  on conflict (id) do update set
    date=excluded.date, type=excluded.type, category=excluded.category,
    amount=excluded.amount, party_name=excluded.party_name, reference=excluded.reference,
    status=excluded.status, description=excluded.description, updated_at=now();
  return p_t;
end;
$$;
grant execute on function app.upsert_rf_transaction(jsonb) to authenticated, service_role;

create or replace function app.upsert_rf_transactions_bulk(p_txs jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_txs)<>'array' then raise exception 'p_txs must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_txs)
  loop perform app.upsert_rf_transaction(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_rf_transactions_bulk(jsonb) to authenticated, service_role;

do $$
declare r record; v_arr jsonb; v_item jsonb; v_up int:=0; v_sk int:=0;
begin
  for r in select value from app.app_state where key='tm_rf_transactions_v11' loop
    v_arr:=r.value; if v_arr is null or jsonb_typeof(v_arr)<>'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr) loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.rf_transactions (id,date,type,category,amount,party_name,reference,status,description,updated_at)
        values (v_item->>'id', coalesce(v_item->>'date',''), coalesce(v_item->>'type',''),
          coalesce(v_item->>'category','Inbound'), coalesce(nullif(v_item->>'amount','')::numeric,0),
          coalesce(v_item->>'partyName',''), coalesce(v_item->>'reference',''),
          coalesce(v_item->>'status','Completed'), v_item->>'description', now())
        on conflict (id) do update set
          date=excluded.date, type=excluded.type, category=excluded.category,
          amount=excluded.amount, party_name=excluded.party_name, reference=excluded.reference,
          status=excluded.status, description=excluded.description, updated_at=now();
        v_up:=v_up+1;
      exception when others then raise notice 'Skipped rf_tx id=% reason=%',v_item->>'id',sqlerrm; v_sk:=v_sk+1; end;
    end loop;
  end loop;
  raise notice 'RF transactions backfill: upserted=%, skipped=%', v_up, v_sk;
end $$;

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
    'tm_rf_transactions_v11'
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
    'tm_funds_v11',app.load_funds(),'tm_investments_v11',app.load_investments(),
    'tm_withdrawals_v11',app.load_withdrawal_requests(),
    'tm_renovation_investors_v11',app.load_renovation_investors(),
    'tm_rf_transactions_v11',app.load_rf_transactions()
  ) from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
