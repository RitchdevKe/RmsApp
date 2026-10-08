-- Migration 20260714120000: Synchronize completed payments from public.payments/partial_rms_payments to tenant payment_history.
-- This ensures that payments are permanently saved in the tenant's JSONB payment_history column,
-- eliminating the need for the frontend to calculate them on-the-fly and preventing latency.

-- 1. Sync public.payments -> public.tenants (for Full RMS)
do $blk$
declare
  r          record;
  v_ref      text;
  v_method   text;
  v_entry    jsonb;
  v_date_str text;
begin
  if exists (
    select 1 from pg_class
     where relname = 'tenants'
       and relnamespace = 'public'::regnamespace
  ) and exists (
    select 1 from pg_class
     where relname = 'payments'
       and relnamespace = 'public'::regnamespace
  ) then
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

      if not exists (
        select 1
          from public.tenants t,
               jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) elem
         where t.id = r.matched_tenant_id
           and nullif(trim(elem->>'reference'), '') = v_ref
      ) then
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
      end if;
    end loop;
  end if;
end
$blk$;

-- 2. Sync public.payments -> public.partial_tenants (for Partial RMS using main payments table)
do $blk$
declare
  r          record;
  v_ref      text;
  v_method   text;
  v_entry    jsonb;
  v_date_str text;
begin
  if exists (
    select 1 from pg_class
     where relname = 'partial_tenants'
       and relnamespace = 'public'::regnamespace
  ) and exists (
    select 1 from pg_class
     where relname = 'payments'
       and relnamespace = 'public'::regnamespace
  ) then
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

      if not exists (
        select 1
          from public.partial_tenants t,
               jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) elem
         where t.id = r.matched_tenant_id
           and nullif(trim(elem->>'reference'), '') = v_ref
      ) then
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
      end if;
    end loop;
  end if;
end
$blk$;

-- 3. Sync public.partial_rms_payments -> public.partial_tenants (for Partial RMS using isolated table)
do $blk$
declare
  r          record;
  v_ref      text;
  v_method   text;
  v_entry    jsonb;
  v_date_str text;
begin
  if exists (
    select 1 from pg_class
     where relname = 'partial_tenants'
       and relnamespace = 'public'::regnamespace
  ) and exists (
    select 1 from pg_class
     where relname = 'partial_rms_payments'
       and relnamespace = 'public'::regnamespace
  ) then
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

      if not exists (
        select 1
          from public.partial_tenants t,
               jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) elem
         where t.id = r.matched_tenant_id
           and nullif(trim(elem->>'reference'), '') = v_ref
      ) then
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
      end if;
    end loop;
  end if;
end
$blk$;
