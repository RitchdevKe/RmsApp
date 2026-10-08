-- supabase/migrations/0046_quotations_normalization.sql
--
-- Quotation: { id, taskId, contractorName, totalAmount,
--   items[{description,amount,type}], status, notes?, submittedDate }
-- Idempotent.

create table if not exists public.quotations (
  id               text primary key,
  task_id          text not null default '',
  contractor_name  text not null default '',
  total_amount     numeric not null default 0,
  items            jsonb default '[]'::jsonb,
  status           text not null default 'Pending',
  notes            text,
  submitted_date   text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists quotations_task_idx   on public.quotations (task_id);
create index if not exists quotations_status_idx on public.quotations (status);

alter table public.quotations enable row level security;

drop policy if exists quotations_select_authenticated on public.quotations;
create policy quotations_select_authenticated
on public.quotations for select to authenticated using (true);

drop policy if exists quotations_write_admin on public.quotations;
create policy quotations_write_admin
on public.quotations for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.quotations_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_quotations_updated_at on public.quotations;
create trigger trg_quotations_updated_at
before update on public.quotations
for each row execute function public.quotations_set_updated_at();

-- Load RPC
create or replace function app.load_quotations()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',              q.id,
    'taskId',          q.task_id,
    'contractorName',  q.contractor_name,
    'totalAmount',     q.total_amount,
    'items',           q.items,
    'status',          q.status,
    'notes',           q.notes,
    'submittedDate',   q.submitted_date
  )) order by q.created_at asc), '[]'::jsonb)
  from public.quotations q;
$$;
grant execute on function app.load_quotations() to authenticated;

-- Upsert RPCs
create or replace function app.upsert_quotation(p_q jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_q->>'id';
begin
  if v_id is null then raise exception 'quotation.id is required'; end if;
  insert into public.quotations (
    id, task_id, contractor_name, total_amount,
    items, status, notes, submitted_date, updated_at
  ) values (
    v_id,
    coalesce(p_q->>'taskId', ''),
    coalesce(p_q->>'contractorName', ''),
    coalesce(nullif(p_q->>'totalAmount','')::numeric, 0),
    coalesce(p_q->'items', '[]'::jsonb),
    coalesce(p_q->>'status', 'Pending'),
    p_q->>'notes',
    coalesce(p_q->>'submittedDate', ''),
    now()
  )
  on conflict (id) do update set
    task_id         = excluded.task_id,
    contractor_name = excluded.contractor_name,
    total_amount    = excluded.total_amount,
    items           = excluded.items,
    status          = excluded.status,
    notes           = excluded.notes,
    submitted_date  = excluded.submitted_date,
    updated_at      = now();
  return p_q;
end;
$$;
grant execute on function app.upsert_quotation(jsonb) to authenticated, service_role;

create or replace function app.upsert_quotations_bulk(p_quotations jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_quotations) <> 'array' then raise exception 'p_quotations must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_quotations)
  loop perform app.upsert_quotation(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_quotations_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_qs jsonb; v_item jsonb;
  v_upserted int := 0; v_skipped int := 0;
begin
  for r in select value from app.app_state where key = 'tm_quotations_v11'
  loop
    v_qs := r.value;
    if v_qs is null or jsonb_typeof(v_qs) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_qs)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.quotations (
          id, task_id, contractor_name, total_amount,
          items, status, notes, submitted_date, updated_at
        ) values (
          v_item->>'id',
          coalesce(v_item->>'taskId', ''),
          coalesce(v_item->>'contractorName', ''),
          coalesce(nullif(v_item->>'totalAmount','')::numeric, 0),
          coalesce(v_item->'items', '[]'::jsonb),
          coalesce(v_item->>'status', 'Pending'),
          v_item->>'notes',
          coalesce(v_item->>'submittedDate', ''),
          now()
        )
        on conflict (id) do update set
          task_id         = excluded.task_id,
          contractor_name = excluded.contractor_name,
          total_amount    = excluded.total_amount,
          items           = excluded.items,
          status          = excluded.status,
          notes           = excluded.notes,
          submitted_date  = excluded.submitted_date,
          updated_at      = now();
        v_upserted := v_upserted + 1;
      exception when others then
        raise notice 'Skipped quotation id=% reason=%', v_item->>'id', sqlerrm;
        v_skipped := v_skipped + 1;
      end;
    end loop;
  end loop;
  raise notice 'Quotations backfill complete: upserted=%, skipped=%', v_upserted, v_skipped;
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
        'tm_quotations_v11'
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
    'tm_quotations_v11',            app.load_quotations()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
