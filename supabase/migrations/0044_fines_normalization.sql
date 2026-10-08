-- supabase/migrations/0044_fines_normalization.sql
--
-- FineRule: { id, type, basis, value, description, appliesTo }
-- Idempotent.

create table if not exists public.fine_rules (
  id          text primary key,
  type        text not null default '',
  basis       text not null default 'Fixed Fee',
  value       numeric not null default 0,
  description text not null default '',
  applies_to  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.fine_rules enable row level security;

drop policy if exists fine_rules_select_authenticated on public.fine_rules;
create policy fine_rules_select_authenticated
on public.fine_rules for select to authenticated using (true);

drop policy if exists fine_rules_write_admin on public.fine_rules;
create policy fine_rules_write_admin
on public.fine_rules for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.fine_rules_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_fine_rules_updated_at on public.fine_rules;
create trigger trg_fine_rules_updated_at
before update on public.fine_rules
for each row execute function public.fine_rules_set_updated_at();

-- Load RPC
create or replace function app.load_fine_rules()
returns jsonb
language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          f.id,
    'type',        f.type,
    'basis',       f.basis,
    'value',       f.value,
    'description', f.description,
    'appliesTo',   f.applies_to
  ) order by f.created_at asc), '[]'::jsonb)
  from public.fine_rules f;
$$;
grant execute on function app.load_fine_rules() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_fine_rule(p_fine jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_fine->>'id';
begin
  if v_id is null then raise exception 'fine_rule.id is required'; end if;
  insert into public.fine_rules (id, type, basis, value, description, applies_to, updated_at)
  values (
    v_id,
    coalesce(p_fine->>'type', ''),
    coalesce(p_fine->>'basis', 'Fixed Fee'),
    coalesce(nullif(p_fine->>'value','')::numeric, 0),
    coalesce(p_fine->>'description', ''),
    coalesce(p_fine->>'appliesTo', ''),
    now()
  )
  on conflict (id) do update set
    type = excluded.type, basis = excluded.basis,
    value = excluded.value, description = excluded.description,
    applies_to = excluded.applies_to, updated_at = now();
  return p_fine;
end;
$$;
grant execute on function app.upsert_fine_rule(jsonb) to authenticated, service_role;

create or replace function app.upsert_fine_rules_bulk(p_fines jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_fines) <> 'array' then raise exception 'p_fines must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_fines)
  loop perform app.upsert_fine_rule(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_fine_rules_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_fines jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_fines_v11'
  loop
    v_fines := r.value;
    if v_fines is null or jsonb_typeof(v_fines) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_fines)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.fine_rules (id, type, basis, value, description, applies_to, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'type', ''),
          coalesce(v_item->>'basis', 'Fixed Fee'),
          coalesce(nullif(v_item->>'value','')::numeric, 0),
          coalesce(v_item->>'description', ''),
          coalesce(v_item->>'appliesTo', ''),
          now()
        )
        on conflict (id) do update set
          type = excluded.type, basis = excluded.basis,
          value = excluded.value, description = excluded.description,
          applies_to = excluded.applies_to, updated_at = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped fine_rule id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Fine rules backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_invoices_v11','tm_fines_v11'
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
    'tm_fines_v11',                 app.load_fine_rules()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
