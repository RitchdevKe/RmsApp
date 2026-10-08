-- Migration 20260709120000: preserve server-appended payment_history entries
--
-- Problem
-- -------
-- When a C2B (or STK) confirmation arrives, record_c2b_payment prepends a
-- new entry to public.tenants.payment_history. Meanwhile the client's
-- DataContext debounces a 3.5s bulk upsert that ships the FULL tenant record
-- (including a stale paymentHistory) to app.upsert_tenant, whose ON CONFLICT
-- clause REPLACES payment_history with the incoming array. Net effect:
-- the C2B row appears on Payments > Inbound but disappears from the tenant
-- profile shortly after arrival.
--
-- Fix: BEFORE UPDATE trigger merges NEW.payment_history with any entries
-- from OLD.payment_history whose reference is not present in the incoming
-- array — so client overwrites become non-destructive. Then backfill
-- lost receipts from public.payments / public.partial_rms_payments.

create or replace function app.merge_payment_history(
  p_existing jsonb,
  p_incoming jsonb
) returns jsonb
language sql
immutable
as $fn$
  with
    existing_arr as (
      select case when jsonb_typeof(p_existing) = 'array'
                  then p_existing else '[]'::jsonb end as arr
    ),
    incoming_arr as (
      select case when jsonb_typeof(p_incoming) = 'array'
                  then p_incoming else '[]'::jsonb end as arr
    ),
    incoming_refs as (
      select distinct nullif(trim(elem->>'reference'), '') as ref
      from incoming_arr, jsonb_array_elements(incoming_arr.arr) elem
      where nullif(trim(elem->>'reference'), '') is not null
    ),
    preserved as (
      select elem
      from existing_arr, jsonb_array_elements(existing_arr.arr) elem
      where nullif(trim(elem->>'reference'), '') is not null
        and nullif(trim(elem->>'reference'), '') not in (select ref from incoming_refs)
    )
  select coalesce((select jsonb_agg(elem) from preserved), '[]'::jsonb)
       || (select arr from incoming_arr);
$fn$;

grant execute on function app.merge_payment_history(jsonb, jsonb)
  to authenticated, service_role;


create or replace function public.tg_preserve_payment_history()
returns trigger
language plpgsql
as $fn$
begin
  if TG_OP = 'UPDATE' then
    NEW.payment_history := app.merge_payment_history(
      OLD.payment_history,
      NEW.payment_history
    );
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_preserve_payment_history on public.tenants;
create trigger trg_preserve_payment_history
before update on public.tenants
for each row
execute function public.tg_preserve_payment_history();

do $blk$
begin
  if exists (
    select 1 from pg_class
     where relname = 'partial_tenants'
       and relnamespace = 'public'::regnamespace
  ) then
    execute 'drop trigger if exists trg_preserve_payment_history on public.partial_tenants';
    execute 'create trigger trg_preserve_payment_history
             before update on public.partial_tenants
             for each row
             execute function public.tg_preserve_payment_history()';
  end if;
end
$blk$;


-- Backfill lost receipts from public.payments → public.tenants
do $blk$
declare
  r          record;
  v_ref      text;
  v_method   text;
  v_entry    jsonb;
  v_date_str text;
begin
  for r in
    select p.matched_tenant_id,
           p.amount,
           coalesce(p.transaction_id, p.checkout_request_id, p.id::text) as reference,
           p.source,
           coalesce(p.created_at, now()) as ts
      from public.payments p
     where p.matched_tenant_id is not null
       and lower(coalesce(p.status, '')) = 'completed'
       and coalesce(p.amount, 0) > 0
     order by p.created_at asc
  loop
    v_ref      := r.reference;
    v_method   := case r.source
                    when 'c2b'    then 'M-Pesa (C2B)'
                    when 'stk'    then 'M-Pesa (STK)'
                    when 'manual' then 'Manual'
                    else coalesce(initcap(r.source), 'M-Pesa')
                  end;
    v_date_str := to_char(r.ts, 'YYYY-MM-DD');

    if exists (
      select 1
        from public.tenants t,
             jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) elem
       where t.id = r.matched_tenant_id
         and nullif(trim(elem->>'reference'), '') = v_ref
    ) then
      continue;
    end if;

    v_entry := jsonb_build_object(
      'date',      v_date_str,
      'amount',    'KES ' || to_char(r.amount, 'FM999,999,999,990'),
      'status',    'Paid',
      'method',    v_method,
      'reference', v_ref
    );

    update public.tenants
       set payment_history = jsonb_build_array(v_entry)
                             || coalesce(payment_history, '[]'::jsonb),
           updated_at      = now()
     where id = r.matched_tenant_id;
  end loop;
end
$blk$;


-- Backfill Partial-RMS payments → partial_tenants (only when tables exist)
do $blk$
declare
  r          record;
  v_ref      text;
  v_method   text;
  v_entry    jsonb;
  v_date_str text;
begin
  if not exists (
    select 1 from pg_class
     where relname = 'partial_rms_payments'
       and relnamespace = 'public'::regnamespace
  ) then
    return;
  end if;
  if not exists (
    select 1 from pg_class
     where relname = 'partial_tenants'
       and relnamespace = 'public'::regnamespace
  ) then
    return;
  end if;

  for r in
    execute 'select p.matched_tenant_id,
                    p.amount,
                    coalesce(p.transaction_id, p.checkout_request_id, p.id::text) as reference,
                    p.source,
                    coalesce(p.created_at, now()) as ts
               from public.partial_rms_payments p
              where p.matched_tenant_id is not null
                and lower(coalesce(p.status, '''')) = ''completed''
                and coalesce(p.amount, 0) > 0
              order by p.created_at asc'
  loop
    v_ref      := r.reference;
    v_method   := case r.source
                    when 'c2b'    then 'M-Pesa (C2B)'
                    when 'stk'    then 'M-Pesa (STK)'
                    when 'manual' then 'Manual'
                    else coalesce(initcap(r.source), 'M-Pesa')
                  end;
    v_date_str := to_char(r.ts, 'YYYY-MM-DD');

    if exists (
      select 1
        from public.partial_tenants t,
             jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) elem
       where t.id = r.matched_tenant_id
         and nullif(trim(elem->>'reference'), '') = v_ref
    ) then
      continue;
    end if;

    v_entry := jsonb_build_object(
      'date',      v_date_str,
      'amount',    'KES ' || to_char(r.amount, 'FM999,999,999,990'),
      'status',    'Paid',
      'method',    v_method,
      'reference', v_ref
    );

    update public.partial_tenants
       set payment_history = jsonb_build_array(v_entry)
                             || coalesce(payment_history, '[]'::jsonb),
           updated_at      = now()
     where id = r.matched_tenant_id;
  end loop;
end
$blk$;
