-- supabase/migrations/0058_renovation_investors_normalization.sql
--
-- RenovationInvestor: { id, name, username?, email, phone, idNumber,
--   status, joinDate, nextOfKin?, paymentDetails?, investorType?,
--   groupMembersCount?, residency?, kraPin?, authorizedRep?,
--   referrerId?, referrerType?, passwordHash? }
-- Nested objects stored as JSONB. Idempotent.

create table if not exists public.renovation_investors (
  id                   text primary key,
  name                 text not null default '',
  username             text,
  email                text not null default '',
  phone                text not null default '',
  id_number            text not null default '',
  status               text not null default 'Pending',
  join_date            text not null default '',
  next_of_kin          jsonb,
  payment_details      jsonb,
  investor_type        text,
  group_members_count  int,
  residency            text,
  kra_pin              text,
  authorized_rep       jsonb,
  referrer_id          text,
  referrer_type        text,
  password_hash        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists renov_investors_status_idx on public.renovation_investors (status);

alter table public.renovation_investors enable row level security;

drop policy if exists renov_investors_select_admin on public.renovation_investors;
create policy renov_investors_select_admin
on public.renovation_investors for select to authenticated using (app.is_admin(auth.uid()));

drop policy if exists renov_investors_write_admin on public.renovation_investors;
create policy renov_investors_write_admin
on public.renovation_investors for all to authenticated
using (app.is_admin(auth.uid())) with check (app.is_admin(auth.uid()));

create or replace function public.renov_investors_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_renov_investors_updated_at on public.renovation_investors;
create trigger trg_renov_investors_updated_at
before update on public.renovation_investors
for each row execute function public.renov_investors_set_updated_at();

create or replace function app.load_renovation_investors()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',i.id,'name',i.name,'username',i.username,'email',i.email,'phone',i.phone,
    'idNumber',i.id_number,'status',i.status,'joinDate',i.join_date,
    'nextOfKin',i.next_of_kin,'paymentDetails',i.payment_details,
    'investorType',i.investor_type,'groupMembersCount',i.group_members_count,
    'residency',i.residency,'kraPin',i.kra_pin,'authorizedRep',i.authorized_rep,
    'referrerId',i.referrer_id,'referrerType',i.referrer_type,'passwordHash',i.password_hash
  )) order by i.join_date desc), '[]'::jsonb) from public.renovation_investors i;
$$;
grant execute on function app.load_renovation_investors() to authenticated;

create or replace function app.upsert_renovation_investor(p_i jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare v_id text := p_i->>'id';
begin
  if v_id is null then raise exception 'renovation_investor.id is required'; end if;
  insert into public.renovation_investors (
    id,name,username,email,phone,id_number,status,join_date,
    next_of_kin,payment_details,investor_type,group_members_count,
    residency,kra_pin,authorized_rep,referrer_id,referrer_type,password_hash,updated_at
  ) values (
    v_id, coalesce(p_i->>'name',''), p_i->>'username',
    coalesce(p_i->>'email',''), coalesce(p_i->>'phone',''), coalesce(p_i->>'idNumber',''),
    coalesce(p_i->>'status','Pending'), coalesce(p_i->>'joinDate',''),
    p_i->'nextOfKin', p_i->'paymentDetails', p_i->>'investorType',
    nullif(p_i->>'groupMembersCount','')::int,
    p_i->>'residency', p_i->>'kraPin', p_i->'authorizedRep',
    p_i->>'referrerId', p_i->>'referrerType', p_i->>'passwordHash', now()
  )
  on conflict (id) do update set
    name=excluded.name, username=excluded.username, email=excluded.email,
    phone=excluded.phone, id_number=excluded.id_number, status=excluded.status,
    join_date=excluded.join_date, next_of_kin=excluded.next_of_kin,
    payment_details=excluded.payment_details, investor_type=excluded.investor_type,
    group_members_count=excluded.group_members_count, residency=excluded.residency,
    kra_pin=excluded.kra_pin, authorized_rep=excluded.authorized_rep,
    referrer_id=excluded.referrer_id, referrer_type=excluded.referrer_type,
    password_hash=excluded.password_hash, updated_at=now();
  return p_i;
end;
$$;
grant execute on function app.upsert_renovation_investor(jsonb) to authenticated, service_role;

create or replace function app.upsert_renovation_investors_bulk(p_investors jsonb)
returns int language plpgsql security definer set search_path = app, public as $$
declare v_count int:=0; v_item jsonb;
begin
  if jsonb_typeof(p_investors)<>'array' then raise exception 'p_investors must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_investors)
  loop perform app.upsert_renovation_investor(v_item); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_renovation_investors_bulk(jsonb) to authenticated, service_role;

do $$
declare r record; v_arr jsonb; v_item jsonb; v_up int:=0; v_sk int:=0;
begin
  for r in select value from app.app_state where key='tm_renovation_investors_v11' loop
    v_arr:=r.value; if v_arr is null or jsonb_typeof(v_arr)<>'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr) loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.renovation_investors (
          id,name,username,email,phone,id_number,status,join_date,
          next_of_kin,payment_details,investor_type,group_members_count,
          residency,kra_pin,authorized_rep,referrer_id,referrer_type,password_hash,updated_at
        ) values (
          v_item->>'id', coalesce(v_item->>'name',''), v_item->>'username',
          coalesce(v_item->>'email',''), coalesce(v_item->>'phone',''), coalesce(v_item->>'idNumber',''),
          coalesce(v_item->>'status','Pending'), coalesce(v_item->>'joinDate',''),
          v_item->'nextOfKin', v_item->'paymentDetails', v_item->>'investorType',
          nullif(v_item->>'groupMembersCount','')::int,
          v_item->>'residency', v_item->>'kraPin', v_item->'authorizedRep',
          v_item->>'referrerId', v_item->>'referrerType', v_item->>'passwordHash', now()
        )
        on conflict (id) do update set
          name=excluded.name, username=excluded.username, email=excluded.email,
          phone=excluded.phone, id_number=excluded.id_number, status=excluded.status,
          join_date=excluded.join_date, next_of_kin=excluded.next_of_kin,
          payment_details=excluded.payment_details, investor_type=excluded.investor_type,
          group_members_count=excluded.group_members_count, residency=excluded.residency,
          kra_pin=excluded.kra_pin, authorized_rep=excluded.authorized_rep,
          referrer_id=excluded.referrer_id, referrer_type=excluded.referrer_type,
          password_hash=excluded.password_hash, updated_at=now();
        v_up:=v_up+1;
      exception when others then raise notice 'Skipped renov_investor id=% reason=%',v_item->>'id',sqlerrm; v_sk:=v_sk+1; end;
    end loop;
  end loop;
  raise notice 'Renovation investors backfill: upserted=%, skipped=%', v_up, v_sk;
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
    'tm_investments_v11','tm_withdrawals_v11','tm_renovation_investors_v11'
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
    'tm_renovation_investors_v11',app.load_renovation_investors()
  ) from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
