-- supabase/migrations/0055_funds_normalization.sql
--
-- Fund: complex R-REITs fund record.
-- boq, documents, progressUpdates stored as JSONB arrays.
-- Idempotent.

create table if not exists public.funds (
  id                    text primary key,
  name                  text not null default '',
  description           text not null default '',
  target_apy            text not null default '',
  capital_raised        numeric not null default 0,
  target_capital        numeric not null default 0,
  investors             int not null default 0,
  status                text not null default 'Active',
  risk_profile          text not null default 'Medium',
  projected_completion  text,
  landlord_type         text,
  landlord_name         text,
  landlord_id           text,
  landlord_contact      text,
  landlord_pic          text,
  property_type         text,
  client_interest_rate  numeric,
  project_pic           text,
  renovation_start_date text,
  renovation_end_date   text,
  boq                   jsonb default '[]'::jsonb,
  documents             jsonb default '[]'::jsonb,
  progress_updates      jsonb default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists funds_status_idx on public.funds (status);

alter table public.funds enable row level security;

drop policy if exists funds_select_authenticated on public.funds;
create policy funds_select_authenticated
on public.funds for select to authenticated using (true);

drop policy if exists funds_write_admin on public.funds;
create policy funds_write_admin
on public.funds for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.funds_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_funds_updated_at on public.funds;
create trigger trg_funds_updated_at
before update on public.funds
for each row execute function public.funds_set_updated_at();

-- Load RPC
create or replace function app.load_funds()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',                   f.id,
    'name',                 f.name,
    'description',          f.description,
    'targetApy',            f.target_apy,
    'capitalRaised',        f.capital_raised,
    'targetCapital',        f.target_capital,
    'investors',            f.investors,
    'status',               f.status,
    'riskProfile',          f.risk_profile,
    'projectedCompletion',  f.projected_completion,
    'landlordType',         f.landlord_type,
    'landlordName',         f.landlord_name,
    'landlordId',           f.landlord_id,
    'landlordContact',      f.landlord_contact,
    'landlordPic',          f.landlord_pic,
    'propertyType',         f.property_type,
    'clientInterestRate',   f.client_interest_rate,
    'projectPic',           f.project_pic,
    'renovationStartDate',  f.renovation_start_date,
    'renovationEndDate',    f.renovation_end_date,
    'boq',                  f.boq,
    'documents',            f.documents,
    'progressUpdates',      f.progress_updates
  )) order by f.created_at asc), '[]'::jsonb)
  from public.funds f;
$$;
grant execute on function app.load_funds() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_fund(p_f jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_f->>'id';
begin
  if v_id is null then raise exception 'fund.id is required'; end if;
  insert into public.funds (
    id, name, description, target_apy, capital_raised, target_capital,
    investors, status, risk_profile, projected_completion,
    landlord_type, landlord_name, landlord_id, landlord_contact, landlord_pic,
    property_type, client_interest_rate, project_pic,
    renovation_start_date, renovation_end_date,
    boq, documents, progress_updates, updated_at
  ) values (
    v_id,
    coalesce(p_f->>'name', ''),
    coalesce(p_f->>'description', ''),
    coalesce(p_f->>'targetApy', ''),
    coalesce(nullif(p_f->>'capitalRaised','')::numeric, 0),
    coalesce(nullif(p_f->>'targetCapital','')::numeric, 0),
    coalesce(nullif(p_f->>'investors','')::int, 0),
    coalesce(p_f->>'status', 'Active'),
    coalesce(p_f->>'riskProfile', 'Medium'),
    p_f->>'projectedCompletion',
    p_f->>'landlordType', p_f->>'landlordName', p_f->>'landlordId',
    p_f->>'landlordContact', p_f->>'landlordPic',
    p_f->>'propertyType',
    nullif(p_f->>'clientInterestRate','')::numeric,
    p_f->>'projectPic',
    p_f->>'renovationStartDate', p_f->>'renovationEndDate',
    coalesce(p_f->'boq', '[]'::jsonb),
    coalesce(p_f->'documents', '[]'::jsonb),
    coalesce(p_f->'progressUpdates', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    name                  = excluded.name,
    description           = excluded.description,
    target_apy            = excluded.target_apy,
    capital_raised        = excluded.capital_raised,
    target_capital        = excluded.target_capital,
    investors             = excluded.investors,
    status                = excluded.status,
    risk_profile          = excluded.risk_profile,
    projected_completion  = excluded.projected_completion,
    landlord_type         = excluded.landlord_type,
    landlord_name         = excluded.landlord_name,
    landlord_id           = excluded.landlord_id,
    landlord_contact      = excluded.landlord_contact,
    landlord_pic          = excluded.landlord_pic,
    property_type         = excluded.property_type,
    client_interest_rate  = excluded.client_interest_rate,
    project_pic           = excluded.project_pic,
    renovation_start_date = excluded.renovation_start_date,
    renovation_end_date   = excluded.renovation_end_date,
    boq                   = excluded.boq,
    documents             = excluded.documents,
    progress_updates      = excluded.progress_updates,
    updated_at            = now();
  return p_f;
end;
$$;
grant execute on function app.upsert_fund(jsonb) to authenticated, service_role;

create or replace function app.upsert_funds_bulk(p_funds jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_funds) <> 'array' then raise exception 'p_funds must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_funds)
  loop perform app.upsert_fund(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_funds_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_funds jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_funds_v11'
  loop
    v_funds := r.value;
    if v_funds is null or jsonb_typeof(v_funds) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_funds)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.funds (
          id, name, description, target_apy, capital_raised, target_capital,
          investors, status, risk_profile, projected_completion,
          landlord_type, landlord_name, landlord_id, landlord_contact, landlord_pic,
          property_type, client_interest_rate, project_pic,
          renovation_start_date, renovation_end_date,
          boq, documents, progress_updates, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'name', ''),
          coalesce(v_item->>'description', ''),
          coalesce(v_item->>'targetApy', ''),
          coalesce(nullif(v_item->>'capitalRaised','')::numeric, 0),
          coalesce(nullif(v_item->>'targetCapital','')::numeric, 0),
          coalesce(nullif(v_item->>'investors','')::int, 0),
          coalesce(v_item->>'status', 'Active'),
          coalesce(v_item->>'riskProfile', 'Medium'),
          v_item->>'projectedCompletion',
          v_item->>'landlordType', v_item->>'landlordName', v_item->>'landlordId',
          v_item->>'landlordContact', v_item->>'landlordPic',
          v_item->>'propertyType',
          nullif(v_item->>'clientInterestRate','')::numeric,
          v_item->>'projectPic',
          v_item->>'renovationStartDate', v_item->>'renovationEndDate',
          coalesce(v_item->'boq', '[]'::jsonb),
          coalesce(v_item->'documents', '[]'::jsonb),
          coalesce(v_item->'progressUpdates', '[]'::jsonb),
          now()
        )
        on conflict (id) do update set
          name                  = excluded.name,
          description           = excluded.description,
          target_apy            = excluded.target_apy,
          capital_raised        = excluded.capital_raised,
          target_capital        = excluded.target_capital,
          investors             = excluded.investors,
          status                = excluded.status,
          risk_profile          = excluded.risk_profile,
          projected_completion  = excluded.projected_completion,
          landlord_type         = excluded.landlord_type,
          landlord_name         = excluded.landlord_name,
          landlord_id           = excluded.landlord_id,
          landlord_contact      = excluded.landlord_contact,
          landlord_pic          = excluded.landlord_pic,
          property_type         = excluded.property_type,
          client_interest_rate  = excluded.client_interest_rate,
          project_pic           = excluded.project_pic,
          renovation_start_date = excluded.renovation_start_date,
          renovation_end_date   = excluded.renovation_end_date,
          boq                   = excluded.boq,
          documents             = excluded.documents,
          progress_updates      = excluded.progress_updates,
          updated_at            = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped fund id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Funds backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_landlord_offboarding_v11','tm_commissions_v11',
        'tm_deductions_v11','tm_income_sources_v11',
        'tm_preventive_tasks_v11','tm_funds_v11'
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
    'tm_landlord_offboarding_v11',  app.load_landlord_offboarding_records(),
    'tm_commissions_v11',           app.load_commission_rules(),
    'tm_deductions_v11',            app.load_deduction_rules(),
    'tm_income_sources_v11',        app.load_income_sources(),
    'tm_preventive_tasks_v11',      app.load_preventive_tasks(),
    'tm_funds_v11',                 app.load_funds()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
