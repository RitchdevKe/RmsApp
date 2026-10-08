-- supabase/migrations/0051_commission_rules_normalization.sql
--
-- CommissionRule: { id, trigger, rateType('%'|'KES'), rateValue,
--   description, appliesTo, deadlineDay? }
-- Idempotent.

create table if not exists public.commission_rules (
  id           text primary key,
  trigger      text not null default '',
  rate_type    text not null default '%',
  rate_value   numeric not null default 0,
  description  text not null default '',
  applies_to   text not null default '',
  deadline_day int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.commission_rules enable row level security;

drop policy if exists commission_rules_select_admin on public.commission_rules;
create policy commission_rules_select_admin
on public.commission_rules for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists commission_rules_write_admin on public.commission_rules;
create policy commission_rules_write_admin
on public.commission_rules for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.commission_rules_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_commission_rules_updated_at on public.commission_rules;
create trigger trg_commission_rules_updated_at
before update on public.commission_rules
for each row execute function public.commission_rules_set_updated_at();

-- Load RPC
create or replace function app.load_commission_rules()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          c.id,
    'trigger',     c.trigger,
    'rateType',    c.rate_type,
    'rateValue',   c.rate_value,
    'description', c.description,
    'appliesTo',   c.applies_to,
    'deadlineDay', c.deadline_day
  )) order by c.created_at asc), '[]'::jsonb)
  from public.commission_rules c;
$$;
grant execute on function app.load_commission_rules() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_commission_rule(p_c jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_c->>'id';
begin
  if v_id is null then raise exception 'commission_rule.id is required'; end if;
  insert into public.commission_rules (
    id, trigger, rate_type, rate_value, description, applies_to, deadline_day, updated_at
  ) values (
    v_id,
    coalesce(p_c->>'trigger', ''),
    coalesce(p_c->>'rateType', '%'),
    coalesce(nullif(p_c->>'rateValue','')::numeric, 0),
    coalesce(p_c->>'description', ''),
    coalesce(p_c->>'appliesTo', ''),
    nullif(p_c->>'deadlineDay','')::int,
    now()
  )
  on conflict (id) do update set
    trigger      = excluded.trigger,
    rate_type    = excluded.rate_type,
    rate_value   = excluded.rate_value,
    description  = excluded.description,
    applies_to   = excluded.applies_to,
    deadline_day = excluded.deadline_day,
    updated_at   = now();
  return p_c;
end;
$$;
grant execute on function app.upsert_commission_rule(jsonb) to authenticated, service_role;

create or replace function app.upsert_commission_rules_bulk(p_rules jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'p_rules must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_rules)
  loop perform app.upsert_commission_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_commission_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_rules jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_commissions_v11'
  loop
    v_rules := r.value;
    if v_rules is null or jsonb_typeof(v_rules) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_rules)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.commission_rules (
          id, trigger, rate_type, rate_value, description, applies_to, deadline_day, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'trigger', ''),
          coalesce(v_item->>'rateType', '%'),
          coalesce(nullif(v_item->>'rateValue','')::numeric, 0),
          coalesce(v_item->>'description', ''),
          coalesce(v_item->>'appliesTo', ''),
          nullif(v_item->>'deadlineDay','')::int,
          now()
        )
        on conflict (id) do update set
          trigger      = excluded.trigger,
          rate_type    = excluded.rate_type,
          rate_value   = excluded.rate_value,
          description  = excluded.description,
          applies_to   = excluded.applies_to,
          deadline_day = excluded.deadline_day,
          updated_at   = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped commission_rule id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Commission rules backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_landlord_offboarding_v11','tm_commissions_v11'
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
    'tm_commissions_v11',           app.load_commission_rules()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
