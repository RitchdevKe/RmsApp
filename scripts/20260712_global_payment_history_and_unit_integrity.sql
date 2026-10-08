-- Global integrity repair:
-- 1) Keep tenant payment_history synchronized from the authoritative payment ledgers.
-- 2) Prevent more than one occupying tenant from being assigned to the same unit.
--
-- Run this once in the database SQL editor. It is idempotent.

create or replace function app.payment_reference_key(p_entry jsonb)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_entry->>'reference', '')))
$$;

grant execute on function app.payment_reference_key(jsonb) to authenticated, service_role;

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
      select distinct app.payment_reference_key(elem) as ref
      from incoming_arr, jsonb_array_elements(incoming_arr.arr) elem
      where app.payment_reference_key(elem) <> ''
    ),
    preserved as (
      select elem
      from existing_arr, jsonb_array_elements(existing_arr.arr) elem
      where app.payment_reference_key(elem) <> ''
        and app.payment_reference_key(elem) not in (select ref from incoming_refs)
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
    NEW.payment_history := app.merge_payment_history(OLD.payment_history, NEW.payment_history);
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
  if to_regclass('public.partial_tenants') is not null then
    execute 'drop trigger if exists trg_preserve_payment_history on public.partial_tenants';
    execute 'create trigger trg_preserve_payment_history
             before update on public.partial_tenants
             for each row
             execute function public.tg_preserve_payment_history()';
  end if;
end
$blk$;

create or replace function public.tg_sync_payment_ledger_to_tenant_history()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  v_tenant_table text;
  v_ref          text;
  v_method       text;
  v_entry        jsonb;
begin
  if lower(coalesce(NEW.status, '')) <> 'completed' then
    return NEW;
  end if;
  if NEW.matched_tenant_id is null or btrim(NEW.matched_tenant_id) = '' then
    return NEW;
  end if;

  v_tenant_table := case TG_TABLE_NAME
    when 'partial_rms_payments' then 'partial_tenants'
    else 'tenants'
  end;

  if to_regclass('public.' || v_tenant_table) is null then
    return NEW;
  end if;

  v_ref := coalesce(nullif(btrim(NEW.transaction_id), ''), nullif(btrim(NEW.checkout_request_id), ''), NEW.id::text);
  v_method := case lower(coalesce(NEW.source, ''))
    when 'c2b' then 'M-Pesa (C2B)'
    when 'stk' then 'M-Pesa (STK)'
    when 'manual' then coalesce(nullif(btrim(NEW.result_desc), ''), 'Manual')
    else coalesce(initcap(NEW.source), 'Payment')
  end;

  v_entry := jsonb_build_object(
    'date',      to_char(coalesce(NEW.created_at, now()), 'YYYY-MM-DD'),
    'amount',    'KES ' || to_char(coalesce(NEW.amount, 0), 'FM999,999,999,990'),
    'status',    'Paid',
    'method',    v_method,
    'reference', v_ref
  );

  execute format(
    'update public.%I
        set payment_history = jsonb_build_array($1) || coalesce(payment_history, ''[]''::jsonb),
            updated_at = now()
      where id = $2
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(payment_history, ''[]''::jsonb)) elem
          where lower(btrim(coalesce(elem->>''reference'', ''''))) = lower(btrim($3))
        )',
    v_tenant_table
  ) using v_entry, NEW.matched_tenant_id, v_ref;

  return NEW;
end;
$fn$;

drop trigger if exists trg_sync_payment_history on public.payments;
create trigger trg_sync_payment_history
after insert or update of status, matched_tenant_id, transaction_id, checkout_request_id, amount, source
on public.payments
for each row
execute function public.tg_sync_payment_ledger_to_tenant_history();

do $blk$
begin
  if to_regclass('public.partial_rms_payments') is not null then
    execute 'drop trigger if exists trg_sync_payment_history on public.partial_rms_payments';
    execute 'create trigger trg_sync_payment_history
             after insert or update of status, matched_tenant_id, transaction_id, checkout_request_id, amount, source
             on public.partial_rms_payments
             for each row
             execute function public.tg_sync_payment_ledger_to_tenant_history()';
  end if;
end
$blk$;

-- Backfill full-RMS tenant profiles from completed ledger rows.
do $blk$
declare
  r record;
  v_entry jsonb;
  v_ref text;
  v_method text;
begin
  for r in
    select id, created_at, amount, source, transaction_id, checkout_request_id, result_desc, matched_tenant_id
    from public.payments
    where matched_tenant_id is not null
      and lower(coalesce(status, '')) = 'completed'
      and coalesce(amount, 0) > 0
    order by created_at asc
  loop
    v_ref := coalesce(nullif(btrim(r.transaction_id), ''), nullif(btrim(r.checkout_request_id), ''), r.id::text);
    v_method := case lower(coalesce(r.source, ''))
      when 'c2b' then 'M-Pesa (C2B)'
      when 'stk' then 'M-Pesa (STK)'
      when 'manual' then coalesce(nullif(btrim(r.result_desc), ''), 'Manual')
      else coalesce(initcap(r.source), 'Payment')
    end;
    v_entry := jsonb_build_object(
      'date',      to_char(coalesce(r.created_at, now()), 'YYYY-MM-DD'),
      'amount',    'KES ' || to_char(coalesce(r.amount, 0), 'FM999,999,999,990'),
      'status',    'Paid',
      'method',    v_method,
      'reference', v_ref
    );

    update public.tenants
       set payment_history = jsonb_build_array(v_entry) || coalesce(payment_history, '[]'::jsonb),
           updated_at = now()
     where id = r.matched_tenant_id
       and not exists (
         select 1 from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) elem
         where lower(btrim(coalesce(elem->>'reference', ''))) = lower(btrim(v_ref))
       );
  end loop;
end
$blk$;

-- Backfill Partial-RMS tenant profiles from completed ledger rows.
do $blk$
declare
  r record;
  v_entry jsonb;
  v_ref text;
  v_method text;
begin
  if to_regclass('public.partial_rms_payments') is null or to_regclass('public.partial_tenants') is null then
    return;
  end if;

  for r in execute
    'select id, created_at, amount, source, transaction_id, checkout_request_id, result_desc, matched_tenant_id
       from public.partial_rms_payments
      where matched_tenant_id is not null
        and lower(coalesce(status, '''')) = ''completed''
        and coalesce(amount, 0) > 0
      order by created_at asc'
  loop
    v_ref := coalesce(nullif(btrim(r.transaction_id), ''), nullif(btrim(r.checkout_request_id), ''), r.id::text);
    v_method := case lower(coalesce(r.source, ''))
      when 'c2b' then 'M-Pesa (C2B)'
      when 'stk' then 'M-Pesa (STK)'
      when 'manual' then coalesce(nullif(btrim(r.result_desc), ''), 'Manual')
      else coalesce(initcap(r.source), 'Payment')
    end;
    v_entry := jsonb_build_object(
      'date',      to_char(coalesce(r.created_at, now()), 'YYYY-MM-DD'),
      'amount',    'KES ' || to_char(coalesce(r.amount, 0), 'FM999,999,999,990'),
      'status',    'Paid',
      'method',    v_method,
      'reference', v_ref
    );

    execute
      'update public.partial_tenants
          set payment_history = jsonb_build_array($1) || coalesce(payment_history, ''[]''::jsonb),
              updated_at = now()
        where id = $2
          and not exists (
            select 1 from jsonb_array_elements(coalesce(payment_history, ''[]''::jsonb)) elem
            where lower(btrim(coalesce(elem->>''reference'', ''''))) = lower(btrim($3))
          )'
    using v_entry, r.matched_tenant_id, v_ref;
  end loop;
end
$blk$;

create or replace function app.is_occupying_tenant_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_status, ''))) in (
    'active', 'overdue', 'notice', 'pending', 'pendingapproval',
    'pendingallocation', 'pendingpayment'
  )
$$;

grant execute on function app.is_occupying_tenant_status(text) to authenticated, service_role;

-- Clean existing duplicate occupants before enabling hard enforcement.
do $blk$
begin
  with ranked as (
    select id,
           row_number() over (
             partition by
               lower(btrim(coalesce(nullif(property_id, ''), property_name, ''))),
               lower(btrim(coalesce(nullif(unit_id, ''), unit, '')))
             order by
               case lower(coalesce(status, ''))
                 when 'active' then 1
                 when 'overdue' then 2
                 when 'notice' then 3
                 when 'pendingpayment' then 4
                 when 'pending' then 5
                 when 'pendingapproval' then 6
                 when 'pendingallocation' then 7
                 else 99
               end,
               coalesce(activation_date, lease_start_date, rent_start_date, onboarding_date, date_registered, '9999-12-31'),
               created_at,
               id
           ) as rn
    from public.tenants
    where app.is_occupying_tenant_status(status)
      and coalesce(nullif(property_id, ''), nullif(property_name, '')) is not null
      and coalesce(nullif(unit_id, ''), nullif(unit, '')) is not null
  )
  update public.tenants t
     set status = 'PendingAllocation',
         property_id = null,
         property_name = null,
         unit_id = null,
         unit = '',
         lease_start_date = null,
         lease_end = null,
         updated_at = now()
    from ranked r
   where t.id = r.id
     and r.rn > 1;
end
$blk$;

do $blk$
begin
  if to_regclass('public.partial_tenants') is null then
    return;
  end if;

  execute $sql$
    with ranked as (
      select id,
             row_number() over (
               partition by
                 lower(btrim(coalesce(nullif(property_id, ''), property_name, ''))),
                 lower(btrim(coalesce(nullif(unit_id, ''), unit, '')))
               order by
                 case lower(coalesce(status, ''))
                   when 'active' then 1
                   when 'overdue' then 2
                   when 'notice' then 3
                   when 'pendingpayment' then 4
                   when 'pending' then 5
                   when 'pendingapproval' then 6
                   when 'pendingallocation' then 7
                   else 99
                 end,
                 coalesce(activation_date, lease_start_date, rent_start_date, onboarding_date, date_registered, '9999-12-31'),
                 created_at,
                 id
             ) as rn
      from public.partial_tenants
      where app.is_occupying_tenant_status(status)
        and coalesce(nullif(property_id, ''), nullif(property_name, '')) is not null
        and coalesce(nullif(unit_id, ''), nullif(unit, '')) is not null
    )
    update public.partial_tenants t
       set status = 'PendingAllocation',
           property_id = null,
           property_name = null,
           unit_id = null,
           unit = '',
           lease_start_date = null,
           lease_end = null,
           updated_at = now()
      from ranked r
     where t.id = r.id
       and r.rn > 1
  $sql$;
end
$blk$;

create or replace function public.tg_prevent_duplicate_unit_occupants()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  v_prop_key text;
  v_unit_key text;
  v_exists boolean;
begin
  if not app.is_occupying_tenant_status(NEW.status) then
    return NEW;
  end if;

  v_prop_key := lower(btrim(coalesce(nullif(NEW.property_id, ''), NEW.property_name, '')));
  v_unit_key := lower(btrim(coalesce(nullif(NEW.unit_id, ''), NEW.unit, '')));

  if v_prop_key = '' or v_unit_key = '' then
    return NEW;
  end if;

  execute format(
    'select exists (
       select 1
       from public.%I t
       where t.id <> $1
         and app.is_occupying_tenant_status(t.status)
         and lower(btrim(coalesce(nullif(t.property_id, ''''), t.property_name, ''''))) = $2
         and lower(btrim(coalesce(nullif(t.unit_id, ''''), t.unit, ''''))) = $3
     )',
    TG_TABLE_NAME
  ) into v_exists using NEW.id, v_prop_key, v_unit_key;

  if v_exists then
    raise exception 'Unit % is already occupied. Vacate or reallocate the existing tenant before assigning another tenant.', coalesce(NEW.unit, NEW.unit_id)
      using errcode = '23505';
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists trg_prevent_duplicate_unit_occupants on public.tenants;
create trigger trg_prevent_duplicate_unit_occupants
before insert or update of status, property_id, property_name, unit_id, unit
on public.tenants
for each row
execute function public.tg_prevent_duplicate_unit_occupants();

create unique index if not exists tenants_one_occupying_tenant_per_unit
on public.tenants (
  lower(btrim(coalesce(nullif(property_id, ''), property_name, ''))),
  lower(btrim(coalesce(nullif(unit_id, ''), unit, '')))
)
where app.is_occupying_tenant_status(status)
  and coalesce(nullif(property_id, ''), nullif(property_name, '')) is not null
  and coalesce(nullif(unit_id, ''), nullif(unit, '')) is not null;

do $blk$
begin
  if to_regclass('public.partial_tenants') is not null then
    execute 'drop trigger if exists trg_prevent_duplicate_unit_occupants on public.partial_tenants';
    execute 'create trigger trg_prevent_duplicate_unit_occupants
             before insert or update of status, property_id, property_name, unit_id, unit
             on public.partial_tenants
             for each row
             execute function public.tg_prevent_duplicate_unit_occupants()';

    execute 'create unique index if not exists partial_tenants_one_occupying_tenant_per_unit
             on public.partial_tenants (
               lower(btrim(coalesce(nullif(property_id, ''''), property_name, ''''))),
               lower(btrim(coalesce(nullif(unit_id, ''''), unit, '''')))
             )
             where app.is_occupying_tenant_status(status)
               and coalesce(nullif(property_id, ''''), nullif(property_name, '''')) is not null
               and coalesce(nullif(unit_id, ''''), nullif(unit, '''')) is not null';
  end if;
end
$blk$;
