-- supabase/migrations/0040_audit_logs_normalization.sql
--
-- Migration Step 7: Audit Logs — normalize public.audit_logs as source of truth.
--
-- AuditLogEntry: { id, timestamp, action, user } — all text.
--
-- IMPORTANT: load_audit_logs() deliberately returns only the 500 most recent
-- entries ordered by timestamp DESC. Loading the entire audit history on every
-- login would be worse than the blob. The UI only ever prepends new entries
-- and displays recent activity — 500 is sufficient for all current use cases.
--
-- Changes:
--   1. Create public.audit_logs table
--   2. Create app.load_audit_logs() RPC (latest 500)
--   3. Create app.insert_audit_log(jsonb) and bulk variant
--   4. Backfill from tm_audit_logs_v11 blob
--   5. Update load_all_app_state() to serve tm_audit_logs_v11 from table
--
-- Idempotent: safe to re-run.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          text primary key,
  timestamp   text not null,
  action      text not null,
  actor       text not null default '',
  created_at  timestamptz not null default now()
);

-- Index for fast recency queries (most common access pattern)
create index if not exists audit_logs_timestamp_idx
  on public.audit_logs (timestamp desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs for select
to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists audit_logs_insert_admin on public.audit_logs;
create policy audit_logs_insert_admin
on public.audit_logs for insert
to authenticated
with check (app.is_admin(auth.uid()));

-- ── 2. Load RPC — latest 500 only ─────────────────────────────────────────
create or replace function app.load_audit_logs()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',        l.id,
      'timestamp', l.timestamp,
      'action',    l.action,
      'user',      l.actor
    ) as row
    from public.audit_logs l
    order by l.timestamp desc
    limit 500
  ) sub;
$$;

grant execute on function app.load_audit_logs() to authenticated;

-- ── 3. Insert RPCs ─────────────────────────────────────────────────────────
-- Audit logs are append-only. ON CONFLICT DO NOTHING prevents duplicate
-- inserts if the same id is written twice (e.g. re-run of backfill).
create or replace function app.insert_audit_log(p_log jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_log->>'id';
begin
  if v_id is null then return; end if;

  insert into public.audit_logs (id, timestamp, action, actor)
  values (
    v_id,
    coalesce(p_log->>'timestamp', now()::text),
    coalesce(p_log->>'action', ''),
    coalesce(p_log->>'user', '')
  )
  on conflict (id) do nothing;
end;
$$;

grant execute on function app.insert_audit_log(jsonb) to authenticated, service_role;

create or replace function app.insert_audit_logs_bulk(p_logs jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_logs) <> 'array' then
    raise exception 'p_logs must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_logs)
  loop
    perform app.insert_audit_log(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.insert_audit_logs_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_logs     jsonb;
  v_item     jsonb;
  v_inserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_audit_logs_v11'
  loop
    v_logs := r.value;
    if v_logs is null or jsonb_typeof(v_logs) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_logs)
    loop
      if (v_item->>'id') is null then continue; end if;

      begin
        insert into public.audit_logs (id, timestamp, action, actor)
        values (
          v_item->>'id',
          coalesce(v_item->>'timestamp', now()::text),
          coalesce(v_item->>'action', ''),
          coalesce(v_item->>'user', '')
        )
        on conflict (id) do nothing;

        v_inserted := v_inserted + 1;

      exception when others then
        raise notice 'Skipped audit log id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Audit logs backfill complete: inserted=%, skipped=%', v_inserted, v_skipped;
end $$;

-- ── 5. Wire into load_all_app_state ───────────────────────────────────────
create or replace function app.load_all_app_state()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (
      where key not in (
        'tm_tenants_v11', 'tm_properties_v11',
        'tm_landlords_v11', 'tm_staff_v11', 'tm_vendors_v11',
        'tm_external_transactions_v11', 'tm_audit_logs_v11'
      )
    ),
    '{}'::jsonb
  )
  || jsonb_build_object(
      'tm_tenants_v11',               app.load_tenants(),
      'tm_properties_v11',            app.load_properties(),
      'tm_landlords_v11',             app.load_landlords(),
      'tm_staff_v11',                 app.load_staff(),
      'tm_vendors_v11',               app.load_vendors(),
      'tm_external_transactions_v11', app.load_external_transactions(),
      'tm_audit_logs_v11',            app.load_audit_logs()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
