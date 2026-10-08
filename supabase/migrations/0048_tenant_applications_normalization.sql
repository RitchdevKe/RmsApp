-- supabase/migrations/0048_tenant_applications_normalization.sql
--
-- TenantApplication: complex type with many fields.
-- Deposit/lease/utility nested objects stored as JSONB.
-- Idempotent.

create table if not exists public.tenant_applications (
  id                  text primary key,
  name                text not null default '',
  phone               text not null default '',
  email               text not null default '',
  id_number           text,
  kra_pin             text,
  property            text,
  property_id         text,
  property_name       text,
  unit                text,
  unit_id             text,
  status              text not null default 'New',
  submitted_date      text not null default '',
  source              text,
  rent_start_date     text,
  rent_amount         numeric,
  rent_due_date       int,
  rent_grace_days     int,
  deposit_paid        numeric,
  lease_signed        boolean default false,
  lease_start_date    text,
  lease_end           text,
  auth_user_id        text,
  documents           jsonb default '[]'::jsonb,
  recurring_bills     jsonb,
  avatar              text,
  profile_picture     text,
  referrer_id         text,
  deposit_exempt      boolean default false,
  deposit_months      int,
  prorated_deposit    jsonb,
  rent_extension      jsonb,
  water_deposit       jsonb,
  electricity_deposit jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists tenant_apps_status_idx      on public.tenant_applications (status);
create index if not exists tenant_apps_property_idx    on public.tenant_applications (property_id);
create index if not exists tenant_apps_submitted_idx   on public.tenant_applications (submitted_date);

alter table public.tenant_applications enable row level security;

drop policy if exists tenant_apps_select_admin on public.tenant_applications;
create policy tenant_apps_select_admin
on public.tenant_applications for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists tenant_apps_write_admin on public.tenant_applications;
create policy tenant_apps_write_admin
on public.tenant_applications for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.tenant_apps_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_tenant_apps_updated_at on public.tenant_applications;
create trigger trg_tenant_apps_updated_at
before update on public.tenant_applications
for each row execute function public.tenant_apps_set_updated_at();

-- Load RPC
create or replace function app.load_tenant_applications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                 a.id,
    'name',               a.name,
    'phone',              a.phone,
    'email',              a.email,
    'idNumber',           a.id_number,
    'kraPin',             a.kra_pin,
    'property',           a.property,
    'propertyId',         a.property_id,
    'propertyName',       a.property_name,
    'unit',               a.unit,
    'unitId',             a.unit_id,
    'status',             a.status,
    'submittedDate',      a.submitted_date,
    'source',             a.source,
    'rentStartDate',      a.rent_start_date,
    'rentAmount',         a.rent_amount,
    'rentDueDate',        a.rent_due_date,
    'rentGraceDays',      a.rent_grace_days,
    'depositPaid',        a.deposit_paid,
    'leaseSigned',        a.lease_signed,
    'leaseStartDate',     a.lease_start_date,
    'leaseEnd',           a.lease_end,
    'authUserId',         a.auth_user_id,
    'documents',          a.documents,
    'recurringBills',     a.recurring_bills,
    'avatar',             a.avatar,
    'profilePicture',     a.profile_picture,
    'referrerId',         a.referrer_id,
    'depositExempt',      a.deposit_exempt,
    'depositMonths',      a.deposit_months,
    'proratedDeposit',    a.prorated_deposit,
    'rentExtension',      a.rent_extension,
    'waterDeposit',       a.water_deposit,
    'electricityDeposit', a.electricity_deposit
  )) order by a.submitted_date desc), '[]'::jsonb)
  from public.tenant_applications a;
$$;
grant execute on function app.load_tenant_applications() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_tenant_application(p_app jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_app->>'id';
begin
  if v_id is null then raise exception 'tenant_application.id is required'; end if;
  insert into public.tenant_applications (
    id, name, phone, email, id_number, kra_pin,
    property, property_id, property_name, unit, unit_id,
    status, submitted_date, source,
    rent_start_date, rent_amount, rent_due_date, rent_grace_days, deposit_paid,
    lease_signed, lease_start_date, lease_end, auth_user_id,
    documents, recurring_bills, avatar, profile_picture, referrer_id,
    deposit_exempt, deposit_months, prorated_deposit, rent_extension,
    water_deposit, electricity_deposit, updated_at
  ) values (
    v_id,
    coalesce(p_app->>'name', ''),
    coalesce(p_app->>'phone', ''),
    coalesce(p_app->>'email', ''),
    p_app->>'idNumber',
    p_app->>'kraPin',
    p_app->>'property',
    p_app->>'propertyId',
    p_app->>'propertyName',
    p_app->>'unit',
    p_app->>'unitId',
    coalesce(p_app->>'status', 'New'),
    coalesce(p_app->>'submittedDate', ''),
    p_app->>'source',
    p_app->>'rentStartDate',
    nullif(p_app->>'rentAmount','')::numeric,
    nullif(p_app->>'rentDueDate','')::int,
    nullif(p_app->>'rentGraceDays','')::int,
    nullif(p_app->>'depositPaid','')::numeric,
    coalesce((p_app->>'leaseSigned')::boolean, false),
    p_app->>'leaseStartDate',
    p_app->>'leaseEnd',
    p_app->>'authUserId',
    coalesce(p_app->'documents', '[]'::jsonb),
    p_app->'recurringBills',
    p_app->>'avatar',
    p_app->>'profilePicture',
    p_app->>'referrerId',
    coalesce((p_app->>'depositExempt')::boolean, false),
    nullif(p_app->>'depositMonths','')::int,
    p_app->'proratedDeposit',
    p_app->'rentExtension',
    p_app->'waterDeposit',
    p_app->'electricityDeposit',
    now()
  )
  on conflict (id) do update set
    name                = excluded.name,
    phone               = excluded.phone,
    email               = excluded.email,
    id_number           = excluded.id_number,
    kra_pin             = excluded.kra_pin,
    property            = excluded.property,
    property_id         = excluded.property_id,
    property_name       = excluded.property_name,
    unit                = excluded.unit,
    unit_id             = excluded.unit_id,
    status              = excluded.status,
    submitted_date      = excluded.submitted_date,
    source              = excluded.source,
    rent_start_date     = excluded.rent_start_date,
    rent_amount         = excluded.rent_amount,
    rent_due_date       = excluded.rent_due_date,
    rent_grace_days     = excluded.rent_grace_days,
    deposit_paid        = excluded.deposit_paid,
    lease_signed        = excluded.lease_signed,
    lease_start_date    = excluded.lease_start_date,
    lease_end           = excluded.lease_end,
    auth_user_id        = excluded.auth_user_id,
    documents           = excluded.documents,
    recurring_bills     = excluded.recurring_bills,
    avatar              = excluded.avatar,
    profile_picture     = excluded.profile_picture,
    referrer_id         = excluded.referrer_id,
    deposit_exempt      = excluded.deposit_exempt,
    deposit_months      = excluded.deposit_months,
    prorated_deposit    = excluded.prorated_deposit,
    rent_extension      = excluded.rent_extension,
    water_deposit       = excluded.water_deposit,
    electricity_deposit = excluded.electricity_deposit,
    updated_at          = now();
  return p_app;
end;
$$;
grant execute on function app.upsert_tenant_application(jsonb) to authenticated, service_role;

create or replace function app.upsert_tenant_applications_bulk(p_apps jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_apps) <> 'array' then raise exception 'p_apps must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_apps)
  loop perform app.upsert_tenant_application(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_tenant_applications_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_apps jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_applications_v11'
  loop
    v_apps := r.value;
    if v_apps is null or jsonb_typeof(v_apps) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_apps)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.tenant_applications (
          id, name, phone, email, id_number, kra_pin,
          property, property_id, property_name, unit, unit_id,
          status, submitted_date, source,
          rent_start_date, rent_amount, rent_due_date, rent_grace_days, deposit_paid,
          lease_signed, lease_start_date, lease_end, auth_user_id,
          documents, recurring_bills, avatar, profile_picture, referrer_id,
          deposit_exempt, deposit_months, prorated_deposit, rent_extension,
          water_deposit, electricity_deposit, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', ''),
          coalesce(v_item->>'phone', ''),
          coalesce(v_item->>'email', ''),
          v_item->>'idNumber',
          v_item->>'kraPin',
          v_item->>'property',
          v_item->>'propertyId',
          v_item->>'propertyName',
          v_item->>'unit',
          v_item->>'unitId',
          coalesce(v_item->>'status', 'New'),
          coalesce(v_item->>'submittedDate', ''),
          v_item->>'source',
          v_item->>'rentStartDate',
          nullif(v_item->>'rentAmount','')::numeric,
          nullif(v_item->>'rentDueDate','')::int,
          nullif(v_item->>'rentGraceDays','')::int,
          nullif(v_item->>'depositPaid','')::numeric,
          coalesce((v_item->>'leaseSigned')::boolean, false),
          v_item->>'leaseStartDate',
          v_item->>'leaseEnd',
          v_item->>'authUserId',
          coalesce(v_item->'documents', '[]'::jsonb),
          v_item->'recurringBills',
          v_item->>'avatar',
          v_item->>'profilePicture',
          v_item->>'referrerId',
          coalesce((v_item->>'depositExempt')::boolean, false),
          nullif(v_item->>'depositMonths','')::int,
          v_item->'proratedDeposit',
          v_item->'rentExtension',
          v_item->'waterDeposit',
          v_item->'electricityDeposit',
          now()
        )
        on conflict (id) do update set
          name                = excluded.name,
          phone               = excluded.phone,
          email               = excluded.email,
          id_number           = excluded.id_number,
          kra_pin             = excluded.kra_pin,
          property            = excluded.property,
          property_id         = excluded.property_id,
          property_name       = excluded.property_name,
          unit                = excluded.unit,
          unit_id             = excluded.unit_id,
          status              = excluded.status,
          submitted_date      = excluded.submitted_date,
          source              = excluded.source,
          rent_start_date     = excluded.rent_start_date,
          rent_amount         = excluded.rent_amount,
          rent_due_date       = excluded.rent_due_date,
          rent_grace_days     = excluded.rent_grace_days,
          deposit_paid        = excluded.deposit_paid,
          lease_signed        = excluded.lease_signed,
          lease_start_date    = excluded.lease_start_date,
          lease_end           = excluded.lease_end,
          auth_user_id        = excluded.auth_user_id,
          documents           = excluded.documents,
          recurring_bills     = excluded.recurring_bills,
          avatar              = excluded.avatar,
          profile_picture     = excluded.profile_picture,
          referrer_id         = excluded.referrer_id,
          deposit_exempt      = excluded.deposit_exempt,
          deposit_months      = excluded.deposit_months,
          prorated_deposit    = excluded.prorated_deposit,
          rent_extension      = excluded.rent_extension,
          water_deposit       = excluded.water_deposit,
          electricity_deposit = excluded.electricity_deposit,
          updated_at          = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped tenant_application id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Tenant applications backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_applications_v11'
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
    'tm_landlord_applications_v11',     app.load_landlord_applications(),
    'tm_applications_v11',              app.load_tenant_applications()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
