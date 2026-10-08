-- supabase/migrations/0070_fundi_jobs_normalization.sql
--
-- FundiJob: { id, fundiId, fundiName, clientName, clientPhone,
--   location, description, status, date, amount?, source }
-- Idempotent.

create table if not exists public.fundi_jobs (
  id           text primary key,
  fundi_id     text not null default '',
  fundi_name   text not null default '',
  client_name  text not null default '',
  client_phone text not null default '',
  location     text not null default '',
  description  text not null default '',
  status       text not null default 'Pending',
  date         text not null default '',
  amount       numeric,
  source       text not null default 'App',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists fundi_jobs_fundi_idx  on public.fundi_jobs (fundi_id);
create index if not exists fundi_jobs_status_idx on public.fundi_jobs (status);
create index if not exists fundi_jobs_date_idx   on public.fundi_jobs (date desc);

alter table public.fundi_jobs enable row level security;

drop policy if exists fundi_jobs_select_admin on public.fundi_jobs;
create policy fundi_jobs_select_admin
on public.fundi_jobs for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists fundi_jobs_write_admin on public.fundi_jobs;
create policy fundi_jobs_write_admin
on public.fundi_jobs for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.fundi_jobs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_fundi_jobs_updated_at on public.fundi_jobs;
create trigger trg_fundi_jobs_updated_at
before update on public.fundi_jobs
for each row execute function public.fundi_jobs_set_updated_at();

-- Load RPC
create or replace function app.load_fundi_jobs()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          j.id,
    'fundiId',     j.fundi_id,
    'fundiName',   j.fundi_name,
    'clientName',  j.client_name,
    'clientPhone', j.client_phone,
    'location',    j.location,
    'description', j.description,
    'status',      j.status,
    'date',        j.date,
    'amount',      j.amount,
    'source',      j.source
  )) order by j.date desc), '[]'::jsonb)
  from public.fundi_jobs j;
$$;
grant execute on function app.load_fundi_jobs() to authenticated;

-- Upsert single
create or replace function app.upsert_fundi_job(p_j jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_j->>'id';
begin
  if v_id is null then raise exception 'fundi_job.id is required'; end if;
  insert into public.fundi_jobs (id, fundi_id, fundi_name, client_name, client_phone,
    location, description, status, date, amount, source, updated_at)
  values (
    v_id,
    coalesce(p_j->>'fundiId', ''),
    coalesce(p_j->>'fundiName', ''),
    coalesce(p_j->>'clientName', ''),
    coalesce(p_j->>'clientPhone', ''),
    coalesce(p_j->>'location', ''),
    coalesce(p_j->>'description', ''),
    coalesce(p_j->>'status', 'Pending'),
    coalesce(p_j->>'date', ''),
    nullif(p_j->>'amount', '')::numeric,
    coalesce(p_j->>'source', 'App'),
    now()
  )
  on conflict (id) do update set
    fundi_id     = excluded.fundi_id,
    fundi_name   = excluded.fundi_name,
    client_name  = excluded.client_name,
    client_phone = excluded.client_phone,
    location     = excluded.location,
    description  = excluded.description,
    status       = excluded.status,
    date         = excluded.date,
    amount       = excluded.amount,
    source       = excluded.source,
    updated_at   = now();
  return p_j;
end;
$$;
grant execute on function app.upsert_fundi_job(jsonb) to authenticated, service_role;

-- Bulk upsert
create or replace function app.upsert_fundi_jobs_bulk(p_jobs jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_jobs) <> 'array' then raise exception 'p_jobs must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_jobs)
  loop perform app.upsert_fundi_job(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_fundi_jobs_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_arr jsonb; v_item jsonb;
  v_up int := 0; v_sk int := 0;
begin
  for r in select value from app.app_state where key = 'tm_fundi_jobs_v11'
  loop
    v_arr := r.value;
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.fundi_jobs (id, fundi_id, fundi_name, client_name, client_phone,
          location, description, status, date, amount, source, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'fundiId', ''),
          coalesce(v_item->>'fundiName', ''),
          coalesce(v_item->>'clientName', ''),
          coalesce(v_item->>'clientPhone', ''),
          coalesce(v_item->>'location', ''),
          coalesce(v_item->>'description', ''),
          coalesce(v_item->>'status', 'Pending'),
          coalesce(v_item->>'date', ''),
          nullif(v_item->>'amount', '')::numeric,
          coalesce(v_item->>'source', 'App'),
          now()
        )
        on conflict (id) do update set
          fundi_id     = excluded.fundi_id,
          fundi_name   = excluded.fundi_name,
          client_name  = excluded.client_name,
          client_phone = excluded.client_phone,
          location     = excluded.location,
          description  = excluded.description,
          status       = excluded.status,
          date         = excluded.date,
          amount       = excluded.amount,
          source       = excluded.source,
          updated_at   = now();
        v_up := v_up + 1;
      exception when others then
        raise notice 'Skipped fundi_job id=% reason=%', v_item->>'id', sqlerrm;
        v_sk := v_sk + 1;
      end;
    end loop;
  end loop;
  raise notice 'Fundi jobs backfill complete: upserted=%, skipped=%', v_up, v_sk;
end $$;

-- load_all_app_state
create or replace function app.load_all_app_state()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (where key not in (
      'tm_tenants_v11','tm_properties_v11','tm_landlords_v11','tm_staff_v11','tm_vendors_v11',
      'tm_external_transactions_v11','tm_audit_logs_v11','tm_tasks_v11','tm_bills_v11',
      'tm_invoices_v11','tm_fines_v11','tm_overpayments_v11','tm_quotations_v11',
      'tm_landlord_applications_v11','tm_applications_v11','tm_offboarding_v11',
      'tm_landlord_offboarding_v11','tm_commissions_v11','tm_deductions_v11',
      'tm_income_sources_v11','tm_preventive_tasks_v11','tm_funds_v11',
      'tm_investments_v11','tm_withdrawals_v11','tm_renovation_investors_v11',
      'tm_rf_transactions_v11','tm_renovation_project_bills_v11',
      'tm_messages_v11','tm_notifications_v11','tm_templates_v11',
      'tm_workflows_v11','tm_automation_rules_v11','tm_escalation_rules_v11',
      'tm_scheduled_reports_v11','tm_tax_records_v11','tm_leads_v11',
      'tm_fundi_jobs_v11'
    )), '{}'::jsonb
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
    'tm_renovation_project_bills_v11',  app.load_renovation_project_bills(),
    'tm_messages_v11',                  app.load_messages(),
    'tm_notifications_v11',             app.load_notifications(),
    'tm_templates_v11',                 app.load_communication_templates(),
    'tm_workflows_v11',                 app.load_workflows(),
    'tm_automation_rules_v11',          app.load_automation_rules(),
    'tm_escalation_rules_v11',          app.load_escalation_rules(),
    'tm_scheduled_reports_v11',         app.load_scheduled_reports(),
    'tm_tax_records_v11',               app.load_tax_records(),
    'tm_leads_v11',                     app.load_leads(),
    'tm_fundi_jobs_v11',                app.load_fundi_jobs()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
