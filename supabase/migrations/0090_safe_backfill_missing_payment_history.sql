-- 0090_safe_backfill_missing_payment_history.sql
--
-- Safe, additive backfill for tenant payment history.
--
-- Goal:
--   Backfill missing payment_history entries from the authoritative
--   public.payments ledger without deleting or rebuilding any existing
--   tenant.payment_history rows.
--
-- Safety guarantees:
--   1. Existing payment_history rows are preserved as-is.
--   2. Only completed payments already matched to a tenant are considered.
--   3. A payment is appended only if it is not already represented.
--   4. No tenant status, activation_date, onboarding_date, or next_due_date
--      values are modified by this migration.
--   5. The migration is idempotent: rerunning it should not create duplicates.

do $$
declare
  v_tenant       record;
  v_payment      record;
  v_history      jsonb;
  v_added        int;
  v_total_added  int := 0;
begin
  for v_tenant in
    select
      t.id,
      t.name,
      coalesce(t.payment_history, '[]'::jsonb) as payment_history
    from public.tenants t
    where exists (
      select 1
      from public.payments p
      where p.matched_tenant_id = t.id
        and p.status = 'completed'
    )
    order by t.id
  loop
    v_history := v_tenant.payment_history;
    v_added := 0;

    for v_payment in
      select
        p.id,
        coalesce(p.amount, 0) as amount,
        p.source,
        p.transaction_id,
        p.created_at,
        coalesce(nullif(btrim(p.transaction_id), ''), p.id::text) as payment_ref,
        to_char((p.created_at at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD') as payment_date,
        case p.source
          when 'c2b' then 'M-Pesa (C2B)'
          when 'stk' then 'M-Pesa STK'
          when 'manual' then 'Manual'
          else 'M-Pesa'
        end as payment_method
      from public.payments p
      where p.matched_tenant_id = v_tenant.id
        and p.status = 'completed'
      order by p.created_at asc, p.id asc
    loop
      if exists (
        select 1
        from jsonb_array_elements(v_history) as hist(entry)
        where coalesce(nullif(btrim(hist.entry->>'reference'), ''), '') = v_payment.payment_ref
           or (
             coalesce(nullif(btrim(hist.entry->>'reference'), ''), '') = ''
             and
             coalesce(hist.entry->>'date', '') = v_payment.payment_date
             and case
                   when upper(coalesce(hist.entry->>'method', '')) in ('M-PESA STK', 'M-PESA (STK)') then 'stk'
                   when upper(coalesce(hist.entry->>'method', '')) in ('M-PESA (C2B)', 'M-PESA C2B') then 'c2b'
                   when upper(coalesce(hist.entry->>'method', '')) in ('MANUAL', 'CASH', 'BANK') then 'manual'
                   else upper(coalesce(hist.entry->>'method', ''))
                 end = case
                   when v_payment.source = 'stk' then 'stk'
                   when v_payment.source = 'c2b' then 'c2b'
                   when v_payment.source = 'manual' then 'manual'
                   else upper(coalesce(v_payment.payment_method, ''))
                 end
             and coalesce(
                   nullif(regexp_replace(coalesce(hist.entry->>'amount', ''), '[^0-9.]', '', 'g'), ''),
                   '0'
                 )::numeric = v_payment.amount
           )
      ) then
        continue;
      end if;

      v_history := v_history || jsonb_build_array(
        jsonb_build_object(
          'date',      v_payment.payment_date,
          'amount',    'KES ' || to_char(v_payment.amount, 'FM999,999,999,990'),
          'status',    'Paid',
          'method',    v_payment.payment_method,
          'reference', v_payment.payment_ref
        )
      );

      v_added := v_added + 1;
      v_total_added := v_total_added + 1;
    end loop;

    if v_added > 0 then
      select coalesce(
        jsonb_agg(entry order by
          case
            when coalesce(entry->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (entry->>'date')::date
            else null
          end desc nulls last,
          ord desc
        ),
        '[]'::jsonb
      )
      into v_history
      from jsonb_array_elements(v_history) with ordinality as hist(entry, ord);

      update public.tenants
         set payment_history = v_history,
             updated_at = now()
       where id = v_tenant.id;

      raise notice 'Backfilled id=% name="%" added=% total_history=%',
        v_tenant.id, v_tenant.name, v_added, jsonb_array_length(v_history);
    end if;
  end loop;

  raise notice '=== Safe payment history backfill complete: % entry(s) added ===', v_total_added;
end $$;
