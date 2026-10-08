-- supabase/migrations/0061_messages_normalization.sql
--
-- Message: { id, recipient: {name, contact}, content, channel,
--   status, timestamp, priority, isIncoming? }
-- recipient stored as JSONB. Idempotent.

create table if not exists public.messages (
  id          text primary key,
  recipient   jsonb not null default '{}'::jsonb,
  content     text not null default '',
  channel     text not null default 'SMS',
  status      text not null default 'Sent',
  timestamp   text not null default '',
  priority    text not null default 'Normal',
  is_incoming boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists messages_timestamp_idx on public.messages (timestamp desc);
create index if not exists messages_status_idx    on public.messages (status);

alter table public.messages enable row level security;

drop policy if exists messages_select_admin on public.messages;
create policy messages_select_admin
on public.messages for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists messages_write_admin on public.messages;
create policy messages_write_admin
on public.messages for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.messages_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.messages_set_updated_at();

-- Load RPC
create or replace function app.load_messages()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',          m.id,
    'recipient',   m.recipient,
    'content',     m.content,
    'channel',     m.channel,
    'status',      m.status,
    'timestamp',   m.timestamp,
    'priority',    m.priority,
    'isIncoming',  case when m.is_incoming then true else null end
  )) order by m.timestamp desc), '[]'::jsonb)
  from public.messages m;
$$;
grant execute on function app.load_messages() to authenticated;

-- Upsert single
create or replace function app.upsert_message(p_m jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_m->>'id';
begin
  if v_id is null then raise exception 'message.id is required'; end if;
  insert into public.messages (id, recipient, content, channel, status, timestamp, priority, is_incoming, updated_at)
  values (
    v_id,
    coalesce(p_m->'recipient', '{}'::jsonb),
    coalesce(p_m->>'content', ''),
    coalesce(p_m->>'channel', 'SMS'),
    coalesce(p_m->>'status', 'Sent'),
    coalesce(p_m->>'timestamp', ''),
    coalesce(p_m->>'priority', 'Normal'),
    coalesce((p_m->>'isIncoming')::boolean, false),
    now()
  )
  on conflict (id) do update set
    recipient   = excluded.recipient,
    content     = excluded.content,
    channel     = excluded.channel,
    status      = excluded.status,
    timestamp   = excluded.timestamp,
    priority    = excluded.priority,
    is_incoming = excluded.is_incoming,
    updated_at  = now();
  return p_m;
end;
$$;
grant execute on function app.upsert_message(jsonb) to authenticated, service_role;

-- Bulk upsert
create or replace function app.upsert_messages_bulk(p_messages jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_messages) <> 'array' then raise exception 'p_messages must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_messages)
  loop perform app.upsert_message(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_messages_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_arr jsonb; v_item jsonb;
  v_up int := 0; v_sk int := 0;
begin
  for r in select value from app.app_state where key = 'tm_messages_v11'
  loop
    v_arr := r.value;
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.messages (id, recipient, content, channel, status, timestamp, priority, is_incoming, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->'recipient', '{}'::jsonb),
          coalesce(v_item->>'content', ''),
          coalesce(v_item->>'channel', 'SMS'),
          coalesce(v_item->>'status', 'Sent'),
          coalesce(v_item->>'timestamp', ''),
          coalesce(v_item->>'priority', 'Normal'),
          coalesce((v_item->>'isIncoming')::boolean, false),
          now()
        )
        on conflict (id) do update set
          recipient   = excluded.recipient,
          content     = excluded.content,
          channel     = excluded.channel,
          status      = excluded.status,
          timestamp   = excluded.timestamp,
          priority    = excluded.priority,
          is_incoming = excluded.is_incoming,
          updated_at  = now();
        v_up := v_up + 1;
      exception when others then
        raise notice 'Skipped message id=% reason=%', v_item->>'id', sqlerrm;
        v_sk := v_sk + 1;
      end;
    end loop;
  end loop;
  raise notice 'Messages backfill complete: upserted=%, skipped=%', v_up, v_sk;
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
      'tm_messages_v11'
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
    'tm_messages_v11',                  app.load_messages()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
