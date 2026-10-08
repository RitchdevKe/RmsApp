-- supabase/migrations/0041_tasks_normalization.sql
--
-- Migration Step 8: Tasks — normalize public.tasks as source of truth.
--
-- Task fields: id, title, description, status, priority, dueDate, sla?,
--   assignedTo?, tenant {name,unit}, property, comments[], history[],
--   attachments[], source?, costs {labor,materials,travel}, completionAttachments[]
--
-- Nested objects stored as JSONB. Idempotent.

-- ── 1. Create table ────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                     text primary key,
  title                  text not null default '',
  description            text not null default '',
  status                 text not null default 'Open',
  priority               text not null default 'Medium',
  due_date               text not null default '',
  sla                    int,
  assigned_to            text,
  tenant                 jsonb,
  property               text not null default '',
  comments               jsonb default '[]'::jsonb,
  history                jsonb default '[]'::jsonb,
  attachments            jsonb default '[]'::jsonb,
  source                 text,
  costs                  jsonb,
  completion_attachments jsonb default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

alter table public.tasks enable row level security;

drop policy if exists tasks_select_authenticated on public.tasks;
create policy tasks_select_authenticated
on public.tasks for select to authenticated using (true);

drop policy if exists tasks_write_admin on public.tasks;
create policy tasks_write_admin
on public.tasks for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.tasks_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.tasks_set_updated_at();

-- ── 2. Load RPC ────────────────────────────────────────────────────────────
create or replace function app.load_tasks()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id',                    t.id,
      'title',                 t.title,
      'description',           t.description,
      'status',                t.status,
      'priority',              t.priority,
      'dueDate',               t.due_date,
      'sla',                   t.sla,
      'assignedTo',            t.assigned_to,
      'tenant',                t.tenant,
      'property',              t.property,
      'comments',              t.comments,
      'history',               t.history,
      'attachments',           t.attachments,
      'source',                t.source,
      'costs',                 t.costs,
      'completionAttachments', t.completion_attachments
    )) as row
    from public.tasks t
    order by t.created_at asc
  ) sub;
$$;

grant execute on function app.load_tasks() to authenticated;

-- ── 3. Upsert RPCs ─────────────────────────────────────────────────────────
create or replace function app.upsert_task(p_task jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id text := p_task->>'id';
begin
  if v_id is null then raise exception 'task.id is required'; end if;

  insert into public.tasks (
    id, title, description, status, priority, due_date, sla,
    assigned_to, tenant, property, comments, history,
    attachments, source, costs, completion_attachments, updated_at
  ) values (
    v_id,
    coalesce(p_task->>'title', ''),
    coalesce(p_task->>'description', ''),
    coalesce(p_task->>'status', 'Open'),
    coalesce(p_task->>'priority', 'Medium'),
    coalesce(p_task->>'dueDate', ''),
    nullif(p_task->>'sla', '')::int,
    p_task->>'assignedTo',
    p_task->'tenant',
    coalesce(p_task->>'property', ''),
    coalesce(p_task->'comments', '[]'::jsonb),
    coalesce(p_task->'history', '[]'::jsonb),
    coalesce(p_task->'attachments', '[]'::jsonb),
    p_task->>'source',
    p_task->'costs',
    coalesce(p_task->'completionAttachments', '[]'::jsonb),
    now()
  )
  on conflict (id) do update set
    title                  = excluded.title,
    description            = excluded.description,
    status                 = excluded.status,
    priority               = excluded.priority,
    due_date               = excluded.due_date,
    sla                    = excluded.sla,
    assigned_to            = excluded.assigned_to,
    tenant                 = excluded.tenant,
    property               = excluded.property,
    comments               = excluded.comments,
    history                = excluded.history,
    attachments            = excluded.attachments,
    source                 = excluded.source,
    costs                  = excluded.costs,
    completion_attachments = excluded.completion_attachments,
    updated_at             = now();

  return p_task;
end;
$$;

grant execute on function app.upsert_task(jsonb) to authenticated, service_role;

create or replace function app.upsert_tasks_bulk(p_tasks jsonb)
returns int
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count int := 0;
  v_item  jsonb;
begin
  if jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'p_tasks must be a JSONB array';
  end if;
  for v_item in select * from jsonb_array_elements(p_tasks)
  loop
    perform app.upsert_task(v_item);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function app.upsert_tasks_bulk(jsonb) to authenticated, service_role;

-- ── 4. Backfill from blob ──────────────────────────────────────────────────
do $$
declare
  r          record;
  v_tasks    jsonb;
  v_item     jsonb;
  v_upserted int := 0;
  v_skipped  int := 0;
begin
  for r in select value from app.app_state where key = 'tm_tasks_v11'
  loop
    v_tasks := r.value;
    if v_tasks is null or jsonb_typeof(v_tasks) <> 'array' then continue; end if;

    for v_item in select * from jsonb_array_elements(v_tasks)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.tasks (
          id, title, description, status, priority, due_date, sla,
          assigned_to, tenant, property, comments, history,
          attachments, source, costs, completion_attachments, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'title', ''),
          coalesce(v_item->>'description', ''),
          coalesce(v_item->>'status', 'Open'),
          coalesce(v_item->>'priority', 'Medium'),
          coalesce(v_item->>'dueDate', ''),
          nullif(v_item->>'sla', '')::int,
          v_item->>'assignedTo',
          v_item->'tenant',
          coalesce(v_item->>'property', ''),
          coalesce(v_item->'comments', '[]'::jsonb),
          coalesce(v_item->'history', '[]'::jsonb),
          coalesce(v_item->'attachments', '[]'::jsonb),
          v_item->>'source',
          v_item->'costs',
          coalesce(v_item->'completionAttachments', '[]'::jsonb),
          now()
        )
        on conflict (id) do update set
          title                  = excluded.title,
          description            = excluded.description,
          status                 = excluded.status,
          priority               = excluded.priority,
          due_date               = excluded.due_date,
          sla                    = excluded.sla,
          assigned_to            = excluded.assigned_to,
          tenant                 = excluded.tenant,
          property               = excluded.property,
          comments               = excluded.comments,
          history                = excluded.history,
          attachments            = excluded.attachments,
          source                 = excluded.source,
          costs                  = excluded.costs,
          completion_attachments = excluded.completion_attachments,
          updated_at             = now();

        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped task id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;

  raise notice 'Tasks backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_external_transactions_v11', 'tm_audit_logs_v11',
        'tm_tasks_v11'
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
      'tm_audit_logs_v11',            app.load_audit_logs(),
      'tm_tasks_v11',                 app.load_tasks()
  )
  from app.app_state;
$$;

grant execute on function app.load_all_app_state() to authenticated;
