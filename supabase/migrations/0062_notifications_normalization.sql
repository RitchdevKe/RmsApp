-- supabase/migrations/0062_notifications_normalization.sql
--
-- Notification: { id, title, message, date, read, type, recipientRole }
-- Idempotent.

create table if not exists public.notifications (
  id             text primary key,
  title          text not null default '',
  message        text not null default '',
  date           text not null default '',
  read           boolean not null default false,
  type           text not null default 'Info',
  recipient_role text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists notifications_date_idx on public.notifications (date desc);
create index if not exists notifications_read_idx on public.notifications (read);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_admin on public.notifications;
create policy notifications_select_admin
on public.notifications for select to authenticated
using (app.is_admin(auth.uid()));

drop policy if exists notifications_write_admin on public.notifications;
create policy notifications_write_admin
on public.notifications for all to authenticated
using (app.is_admin(auth.uid()))
with check (app.is_admin(auth.uid()));

create or replace function public.notifications_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row execute function public.notifications_set_updated_at();

-- Load RPC
create or replace function app.load_notifications()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            n.id,
    'title',         n.title,
    'message',       n.message,
    'date',          n.date,
    'read',          n.read,
    'type',          n.type,
    'recipientRole', n.recipient_role
  ) order by n.date desc), '[]'::jsonb)
  from public.notifications n;
$$;
grant execute on function app.load_notifications() to authenticated;

-- Upsert single
create or replace function app.upsert_notification(p_n jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_n->>'id';
begin
  if v_id is null then raise exception 'notification.id is required'; end if;
  insert into public.notifications (id, title, message, date, read, type, recipient_role, updated_at)
  values (
    v_id,
    coalesce(p_n->>'title', ''),
    coalesce(p_n->>'message', ''),
    coalesce(p_n->>'date', ''),
    coalesce((p_n->>'read')::boolean, false),
    coalesce(p_n->>'type', 'Info'),
    coalesce(p_n->>'recipientRole', ''),
    now()
  )
  on conflict (id) do update set
    title          = excluded.title,
    message        = excluded.message,
    date           = excluded.date,
    read           = excluded.read,
    type           = excluded.type,
    recipient_role = excluded.recipient_role,
    updated_at     = now();
  return p_n;
end;
$$;
grant execute on function app.upsert_notification(jsonb) to authenticated, service_role;

-- Bulk upsert
create or replace function app.upsert_notifications_bulk(p_notifications jsonb)
returns int language plpgsql security definer
set search_path = app, public
as $$
declare v_count int := 0; v_item jsonb;
begin
  if jsonb_typeof(p_notifications) <> 'array' then raise exception 'p_notifications must be a JSONB array'; end if;
  for v_item in select * from jsonb_array_elements(p_notifications)
  loop perform app.upsert_notification(v_item); v_count := v_count + 1; end loop;
  return v_count;
end;
$$;
grant execute on function app.upsert_notifications_bulk(jsonb) to authenticated, service_role;

-- Backfill
do $$
declare
  r record; v_arr jsonb; v_item jsonb;
  v_up int := 0; v_sk int := 0;
begin
  for r in select value from app.app_state where key = 'tm_notifications_v11'
  loop
    v_arr := r.value;
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then continue; end if;
    for v_item in select * from jsonb_array_elements(v_arr)
    loop
      if (v_item->>'id') is null then continue; end if;
      begin
        insert into public.notifications (id, title, message, date, read, type, recipient_role, updated_at)
        values (
          v_item->>'id',
          coalesce(v_item->>'title', ''),
          coalesce(v_item->>'message', ''),
          coalesce(v_item->>'date', ''),
          coalesce((v_item->>'read')::boolean, false),
          coalesce(v_item->>'type', 'Info'),
          coalesce(v_item->>'recipientRole', ''),
          now()
        )
        on conflict (id) do update set
          title          = excluded.title,
          message        = excluded.message,
          date           = excluded.date,
          read           = excluded.read,
          type           = excluded.type,
          recipient_role = excluded.recipient_role,
          updated_at     = now();
        v_up := v_up + 1;
      exception when others then
        raise notice 'Skipped notification id=% reason=%', v_item->>'id', sqlerrm;
        v_sk := v_sk + 1;
      end;
    end loop;
  end loop;
  raise notice 'Notifications backfill complete: upserted=%, skipped=%', v_up, v_sk;
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
      'tm_messages_v11','tm_notifications_v11'
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
    'tm_notifications_v11',             app.load_notifications()
  )
  from app.app_state;
$$;
grant execute on function app.load_all_app_state() to authenticated;
