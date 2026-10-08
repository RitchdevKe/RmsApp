-- supabase/migrations/0057_withdrawals_normalization.sql
--
-- WithdrawalRequest: { id, investorName, amount, requestDate, type,
--   method, status, destinationAccount?, notes? }
-- Idempotent.

create table if not exists public.withdrawal_requests (
  id                  text primary key,
  investor_name       text not null default '',
  amount              numeric not null default 0,
  request_date        text not null default '',
  type                text not null default 'Interest',
  method              text not null default 'M-Pesa',
  status              text not null default 'Pending Approval',
  destination_account text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists withdrawals_status_idx on public.withdrawal_requests (status);

alter table public.withdrawal_requests enable row level security;

drop policy if exists withdrawals_select_admin on public.withdrawal_requests;
create policy withdrawals_select_admin
on public.withdrawal_requests for select to authenticated using (app.is_admin(auth.uid()));

drop policy if exists withdrawals_write_admin on public.withdrawal_requests;
create policy withdrawals_write_admin
on public.withdrawal_requests for all to authenticated
using (app.is_admin(auth.uid())) with check (app.is_admin(auth.uid()));

create or replace function public.withdrawals_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_withdrawals_updated_at on public.withdrawal_requests;
create trigger trg_withdrawals_updated_at
before update on public.withdrawal_requests
for each row execute function public.withdrawals_set_updated_at();

create or replace function app.load_withdrawal_requests()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',w.id,'investorName',w.investor_name,'amount',w.amount,
    'requestDate',w.request_date,'type',w.type,'method',w.method,
    'status',w.status,'destinationAccount',w.destination_account,'notes',w.notes
  )) order by w.request_date desc), '[]'::jsonb) from public.withdrawal_requests w;
$$;
grant execute on function app.load_withdrawal_requests() to authenticated;

create or replace function app.upsert_withdrawal_request(p_w jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_w->>'id';
begin
  if v_id is null then raise exception 'withdrawal_request.id is required'; end if;
  insert into public.withdrawal_requests (id,investor_name,amount,request_date,type,method,status,destination_account,notes,updated_at)
  values (v_id, coalesce(p_w->>'investorName',''),
    coalesce(nullif(p_w->>'amount','')::numeric,0), coalesce(p_w->>'requestDate',''),
    coalesce(p_w->>'type','Interest'), coalesce(p_w->>'method','M-Pesa'),
    coalesce(p_w->>'status','Pending Approval'), p_w->>'destinationAccount', p_w->>'notes', now())
  on conflict (id) do update set
    investor_name=excluded.investor_name, amount=excluded.amount, request_date=excluded.request_date,
    type=excluded.type, method=excluded.method, status=excluded.status,
    destination_account=excluded.destination_account, notes=excluded.notes, updated_at=now();
  return p_w;
end;
$$;
grant execute on function app.upsert_withdrawal_request(jsonb) to authenticated, service_role;

create or replace function app.upsert_withdrawals_bulk(p_withdrawals jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_withdrawals)<>'array' then raise exception 'p_withdrawals must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_withdrawals)
  loop perform app.upsert_withdrawal_request(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_withdrawals_bulk(jsonb) to authenticated, service_role;

do $$
declare r record; v_arr jsonb; v_item jsonb; v_up int:=0; v_sk int:=0;
begin
  for r in select value from app.app_state where key='tm_withdrawals_v11' loop
    v_arr:=r.value; if v_arr is null or jsonb_typeof(v_arr)<>'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr) loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.withdrawal_requests (id,investor_name,amount,request_date,type,method,status,destination_account,notes,updated_at)
        values (v_item->>'id', coalesce(v_item->>'investorName',''),
          coalesce(nullif(v_item->>'amount','')::numeric,0), coalesce(v_item->>'requestDate',''),
          coalesce(v_item->>'type','Interest'), coalesce(v_item->>'method','M-Pesa'),
          coalesce(v_item->>'status','Pending Approval'), v_item->>'destinationAccount', v_item->>'notes', now())
        on conflict (id) do update set
          investor_name=excluded.investor_name, amount=excluded.amount, request_date=excluded.request_date,
          type=excluded.type, method=excluded.method, status=excluded.status,
          destination_account=excluded.destination_account, notes=excluded.notes, updated_at=now();
        v_up:=v_up+1;
      exception when others then raise notice 'Skipped withdrawal id=% reason=%',v_item->>'id',sqlerrm; v_sk:=v_sk+1; end;
    end loop;
  end loop;
  raise notice 'Withdrawals backfill: upserted=%, skipped=%', v_up, v_sk;
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
    'tm_investments_v11','tm_withdrawals_v11'
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
    'tm_withdrawals_v11',app.load_withdrawal_requests()
  ) from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
