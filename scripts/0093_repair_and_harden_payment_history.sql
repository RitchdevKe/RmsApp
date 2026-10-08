-- 0093_repair_and_harden_payment_history.sql
--
-- Purpose:
--   Repair tenant.payment_history from the authoritative public.payments ledger
--   and make app.load_tenants() include any matched completed ledger payments
--   that are still missing from the tenant JSON history.
--
-- Safe to run more than once: it only adds payments whose reference is missing.

do $$
declare
  v_tenant record;
  v_payment record;
  v_history jsonb;
  v_ref text;
  v_added int := 0;
begin
  for v_tenant in
    select id, coalesce(payment_history, '[]'::jsonb) as payment_history
    from public.tenants
    where exists (
      select 1
      from public.payments p
      where p.matched_tenant_id = public.tenants.id
        and p.status = 'completed'
    )
  loop
    v_history := v_tenant.payment_history;

    for v_payment in
      select
        p.id,
        coalesce(p.amount, 0) as amount,
        p.source,
        p.transaction_id,
        p.created_at,
        to_char((p.created_at at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD') as payment_date,
        case p.source
          when 'c2b' then 'M-Pesa (C2B)'
          when 'stk' then 'M-Pesa STK'
          when 'manual' then coalesce(nullif(p.result_desc, ''), 'Manual')
          else coalesce(nullif(p.result_desc, ''), 'Manual')
        end as payment_method
      from public.payments p
      where p.matched_tenant_id = v_tenant.id
        and p.status = 'completed'
      order by p.created_at asc, p.id asc
    loop
      v_ref := coalesce(nullif(btrim(v_payment.transaction_id), ''), v_payment.id::text);

      if exists (
        select 1
        from jsonb_array_elements(v_history) hist(entry)
        where coalesce(nullif(btrim(hist.entry->>'reference'), ''), '') = v_ref
      ) then
        continue;
      end if;

      v_history := jsonb_build_array(
        jsonb_build_object(
          'date',      v_payment.payment_date,
          'amount',    'KES ' || to_char(v_payment.amount, 'FM999,999,999,990'),
          'status',    'Paid',
          'method',    v_payment.payment_method,
          'reference', v_ref
        )
      ) || v_history;
      v_added := v_added + 1;
    end loop;

    update public.tenants
       set payment_history = v_history,
           updated_at = now()
     where id = v_tenant.id
       and payment_history is distinct from v_history;
  end loop;

  raise notice 'Payment history repair complete. Added % missing entries.', v_added;
end $$;

create or replace function app.load_tenants()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          e.item,
          '{rentStartDate}',
          coalesce(to_jsonb(coalesce(nullif(t.rent_start_date, ''), t.onboarding_date, t.activation_date)), 'null'::jsonb),
          true
        ),
        '{paymentHistory}',
        (
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'date',      to_char((p.created_at at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD'),
                'amount',    'KES ' || to_char(coalesce(p.amount, 0), 'FM999,999,999,990'),
                'status',    'Paid',
                'method',    case p.source
                               when 'c2b' then 'M-Pesa (C2B)'
                               when 'stk' then 'M-Pesa STK'
                               when 'manual' then coalesce(nullif(p.result_desc, ''), 'Manual')
                               else coalesce(nullif(p.result_desc, ''), 'Manual')
                             end,
                'reference', coalesce(nullif(btrim(p.transaction_id), ''), p.id::text)
              )
              order by p.created_at desc, p.id desc
            )
            from public.payments p
            where p.matched_tenant_id = e.item->>'id'
              and p.status = 'completed'
              and not exists (
                select 1
                from jsonb_array_elements(coalesce(e.item->'paymentHistory', '[]'::jsonb)) hist(entry)
                where coalesce(nullif(btrim(hist.entry->>'reference'), ''), '') = coalesce(nullif(btrim(p.transaction_id), ''), p.id::text)
              )
          ), '[]'::jsonb) || coalesce(e.item->'paymentHistory', '[]'::jsonb)
        ),
        true
      )
      order by e.ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(app.load_tenants_0091()) with ordinality e(item, ord)
  left join public.tenants t on t.id = e.item->>'id';
$$;

grant execute on function app.load_tenants() to authenticated;