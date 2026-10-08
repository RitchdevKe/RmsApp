-- 0077_c2b_priority_deduction.sql
--
-- Replaces record_c2b_payment with a version that applies priority-based
-- payment allocation after recording the payment history entry.
--
-- Priority order (same as client-side waterfall):
--   1. Security deposit (standard lump-sum, then prorated installment)
--   2. Late fee fines   (outstanding_fines where type = 'Late Rent')
--   3. Rent arrears     (outstanding_bills  where type ilike '%arrear%')
--   4. Current rent     (advances next_due_date by one month)
--   5. Other outstanding bills
--   6. Other outstanding fines (non-late-fee)
--
-- NOTE: only items fully covered (remaining >= item amount) are marked Paid.
-- Partial coverage does NOT partially mark an item — it leaves it Pending.
-- This matches the manual payment UX behaviour.

-- Drop previous versions (both signatures).
drop function if exists public.record_c2b_payment(text,numeric,text,text,text,text,text,text,numeric,jsonb,text);
drop function if exists public.record_c2b_payment(text,numeric,text,text,text,text,text,text,numeric,jsonb);

create function public.record_c2b_payment(
  p_transaction_id      text,
  p_amount              numeric,
  p_msisdn              text,
  p_bill_ref            text,
  p_business_short_code text,
  p_first_name          text,
  p_middle_name         text,
  p_last_name           text,
  p_org_balance         numeric,
  p_raw                 jsonb,
  p_trans_time          text default null
)
returns table (
  payment_id        uuid,
  was_duplicate     boolean,
  matched_tenant_id text,
  matched_unit_id   text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  v_existing_id    uuid;
  v_payment_id     uuid;
  v_ft_tenant_id   text;
  v_ft_unit_id     text;
  v_status         text;
  v_tenant_id      text;
  v_unit_id        text;
  v_created_at     timestamptz := now();
  v_twin_id        uuid;
  -- allocation
  v_tenant_row     public.tenants%rowtype;
  v_remaining      numeric;
  v_deposit_owed   numeric;
  v_new_dep_paid   numeric;
  v_new_prorated   jsonb;
  v_bills          jsonb;
  v_fines          jsonb;
  v_bill_item      jsonb;
  v_fine_item      jsonb;
  v_bill_amt       numeric;
  v_fine_amt       numeric;
  v_i              int;
  v_rent_amt       numeric;
  v_next_due       text;
begin

  -- ── 1. Duplicate detection ─────────────────────────────────────────────────
  v_existing_id := (
    select id from public.payments
     where transaction_id = p_transaction_id
     limit 1
  );

  if v_existing_id is not null then
    v_tenant_id    := (select matched_tenant_id from public.payments where id = v_existing_id);
    v_unit_id      := (select matched_unit_id   from public.payments where id = v_existing_id);
    v_ft_tenant_id := (select tenant_id from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
    v_ft_unit_id   := (select unit_id   from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
    v_tenant_id    := coalesce(v_tenant_id, v_ft_tenant_id);
    v_unit_id      := coalesce(v_unit_id,   v_ft_unit_id);

    update public.payments
       set bill_ref_number     = coalesce(bill_ref_number,     p_bill_ref),
           msisdn              = coalesce(msisdn,              p_msisdn),
           first_name          = coalesce(first_name,          p_first_name),
           middle_name         = coalesce(middle_name,         p_middle_name),
           last_name           = coalesce(last_name,           p_last_name),
           business_short_code = coalesce(business_short_code, p_business_short_code),
           org_account_balance = coalesce(org_account_balance, p_org_balance),
           matched_tenant_id   = v_tenant_id,
           matched_unit_id     = v_unit_id,
           reconciliation_status = case
             when v_tenant_id is not null then 'reconciled'
             else coalesce(reconciliation_status, 'unreconciled')
           end,
           raw_payload         = coalesce(raw_payload, p_raw),
           updated_at          = now()
     where id = v_existing_id;

    if v_tenant_id is not null then
      update public.tenants
         set payment_history = jsonb_build_array(
               jsonb_build_object(
                 'date',      to_char(v_created_at, 'YYYY-MM-DD'),
                 'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
                 'status',    'Paid',
                 'method',    'M-Pesa',
                 'reference', p_transaction_id
               )
             ) || coalesce(payment_history, '[]'::jsonb),
             updated_at = now()
       where id = v_tenant_id
         and not coalesce(
               payment_history @> jsonb_build_array(
                 jsonb_build_object('reference', p_transaction_id)
               ),
               false
             );
    end if;

    payment_id        := v_existing_id;
    was_duplicate     := true;
    matched_tenant_id := v_tenant_id;
    matched_unit_id   := v_unit_id;
    return next;
    return;
  end if;

  -- ── 2. Resolve tenant via unit tag ─────────────────────────────────────────
  v_ft_tenant_id := (select tenant_id from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
  v_ft_unit_id   := (select unit_id   from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
  v_status := case when v_ft_tenant_id is not null then 'reconciled' else 'unreconciled' end;

  -- ── 3. Insert payment row ──────────────────────────────────────────────────
  insert into public.payments (
    source, status, reconciliation_status,
    amount, transaction_id,
    bill_ref_number, msisdn, phone, business_short_code,
    first_name, middle_name, last_name,
    org_account_balance, matched_tenant_id, matched_unit_id,
    raw_payload, result_code, result_desc
  ) values (
    'c2b', 'completed', v_status,
    p_amount, p_transaction_id,
    p_bill_ref, p_msisdn, p_msisdn, p_business_short_code,
    p_first_name, p_middle_name, p_last_name,
    p_org_balance, v_ft_tenant_id, v_ft_unit_id,
    p_raw, 0, 'C2B confirmation received'
  )
  on conflict (transaction_id) where transaction_id is not null
  do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    v_payment_id   := (select id               from public.payments where transaction_id = p_transaction_id limit 1);
    v_tenant_id    := (select matched_tenant_id from public.payments where transaction_id = p_transaction_id limit 1);
    v_unit_id      := (select matched_unit_id   from public.payments where transaction_id = p_transaction_id limit 1);
    payment_id        := v_payment_id;
    was_duplicate     := true;
    matched_tenant_id := v_tenant_id;
    matched_unit_id   := v_unit_id;
    return next;
    return;
  end if;

  -- ── 4. Per-tenant updates (only when matched) ──────────────────────────────
  if v_ft_tenant_id is not null then

    -- 4a. STK pairing (unchanged logic)
    v_twin_id := (
      select id from public.payments
       where source = 'stk'
         and matched_tenant_id is not distinct from v_ft_tenant_id
         and round(amount) = round(p_amount)
         and paired_payment_id is null
         and id <> v_payment_id
         and created_at >= v_created_at - interval '10 minutes'
       order by created_at desc
       limit 1
    );
    if v_twin_id is null then
      v_twin_id := (
        select id from public.payments
         where source = 'stk'
           and matched_tenant_id is null
           and msisdn is not distinct from p_msisdn
           and round(amount) = round(p_amount)
           and paired_payment_id is null
           and id <> v_payment_id
           and created_at >= v_created_at - interval '10 minutes'
         order by created_at desc
         limit 1
      );
    end if;
    if v_twin_id is not null then
      update public.payments set paired_payment_id = v_twin_id    where id = v_payment_id;
      update public.payments set paired_payment_id = v_payment_id where id = v_twin_id;
    end if;

    -- 4b. Record payment history entry
    update public.tenants
       set payment_history = jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(v_created_at, 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    'M-Pesa (C2B)',
               'reference', p_transaction_id
             )
           ) || coalesce(payment_history, '[]'::jsonb),
           updated_at = now()
     where id = v_ft_tenant_id;

    -- 4c. Read tenant snapshot for allocation waterfall
    select * into v_tenant_row from public.tenants where id = v_ft_tenant_id;

    v_remaining := p_amount;
    v_bills     := coalesce(v_tenant_row.outstanding_bills, '[]'::jsonb);
    v_fines     := coalesce(v_tenant_row.outstanding_fines, '[]'::jsonb);
    v_rent_amt  := coalesce(v_tenant_row.rent_amount, 0);
    v_next_due  := v_tenant_row.next_due_date;

    -- Priority 1a: Standard (lump-sum) security deposit
    if not coalesce(v_tenant_row.deposit_exempt, false)
       and coalesce(v_tenant_row.prorated_deposit->>'enabled', 'false') <> 'true'
       and coalesce(v_tenant_row.rent_extension->>'enabled',   'false') <> 'true'
       and v_remaining > 0
    then
      v_deposit_owed := greatest(0,
        coalesce(v_tenant_row.deposit_expected, 0) - coalesce(v_tenant_row.deposit_paid, 0)
      );
      if v_deposit_owed > 0 then
        v_new_dep_paid := coalesce(v_tenant_row.deposit_paid, 0)
                          + least(v_remaining, v_deposit_owed);
        v_remaining    := greatest(0, v_remaining - v_deposit_owed);
        update public.tenants
           set deposit_paid = v_new_dep_paid,
               updated_at   = now()
         where id = v_ft_tenant_id;
      end if;
    end if;

    -- Priority 1b: Prorated deposit installment (full installment only)
    if not coalesce(v_tenant_row.deposit_exempt, false)
       and coalesce(v_tenant_row.prorated_deposit->>'enabled', 'false') = 'true'
       and v_remaining > 0
    then
      v_bill_amt := coalesce((v_tenant_row.prorated_deposit->>'monthlyInstallment')::numeric, 0);
      if v_bill_amt > 0 and v_remaining >= v_bill_amt then
        v_new_prorated := jsonb_set(
          jsonb_set(
            v_tenant_row.prorated_deposit,
            '{monthsPaid}',
            to_jsonb(coalesce((v_tenant_row.prorated_deposit->>'monthsPaid')::int, 0) + 1)
          ),
          '{amountPaidSoFar}',
          to_jsonb(
            coalesce((v_tenant_row.prorated_deposit->>'amountPaidSoFar')::numeric, 0) + v_bill_amt
          )
        );
        v_remaining := v_remaining - v_bill_amt;
        update public.tenants
           set prorated_deposit = v_new_prorated,
               deposit_paid     = coalesce((v_new_prorated->>'amountPaidSoFar')::numeric, 0),
               updated_at       = now()
         where id = v_ft_tenant_id;
      end if;
    end if;

    -- Priority 2: Late fee fines (type = 'Late Rent', fully covered only)
    if v_remaining > 0 and jsonb_array_length(v_fines) > 0 then
      for v_i in 0 .. jsonb_array_length(v_fines) - 1 loop
        v_fine_item := v_fines -> v_i;
        if (v_fine_item->>'type')   = 'Late Rent'
           and (v_fine_item->>'status') = 'Pending'
        then
          v_fine_amt := coalesce((v_fine_item->>'amount')::numeric, 0);
          if v_fine_amt > 0 and v_remaining >= v_fine_amt then
            v_fines     := jsonb_set(v_fines, array[v_i::text, 'status'], to_jsonb('Paid'::text));
            v_remaining := v_remaining - v_fine_amt;
          end if;
        end if;
      end loop;
    end if;

    -- Priority 3: Rent arrears (bills where type ilike '%arrear%', fully covered only)
    if v_remaining > 0 and jsonb_array_length(v_bills) > 0 then
      for v_i in 0 .. jsonb_array_length(v_bills) - 1 loop
        v_bill_item := v_bills -> v_i;
        if lower(coalesce(v_bill_item->>'type', '')) like '%arrear%'
           and (v_bill_item->>'status') = 'Pending'
        then
          v_bill_amt := coalesce((v_bill_item->>'amount')::numeric, 0);
          if v_bill_amt > 0 and v_remaining >= v_bill_amt then
            v_bills     := jsonb_set(v_bills, array[v_i::text, 'status'], to_jsonb('Paid'::text));
            v_remaining := v_remaining - v_bill_amt;
          end if;
        end if;
      end loop;
    end if;

    -- Priority 4: Current rent — advance next_due_date by one month
    if v_remaining > 0 and v_rent_amt > 0 and v_remaining >= v_rent_amt then
      if v_next_due is not null then
        v_next_due := to_char((v_next_due::date + interval '1 month'), 'YYYY-MM-DD');
      else
        v_next_due := to_char(date_trunc('month', v_created_at) + interval '1 month', 'YYYY-MM-DD');
      end if;
      v_remaining := v_remaining - v_rent_amt;
      update public.tenants
         set next_due_date = v_next_due,
             updated_at    = now()
       where id = v_ft_tenant_id;
    end if;

    -- Priority 5: Other outstanding bills (non-arrears, fully covered only)
    if v_remaining > 0 and jsonb_array_length(v_bills) > 0 then
      for v_i in 0 .. jsonb_array_length(v_bills) - 1 loop
        v_bill_item := v_bills -> v_i;
        if lower(coalesce(v_bill_item->>'type', '')) not like '%arrear%'
           and (v_bill_item->>'status') = 'Pending'
        then
          v_bill_amt := coalesce((v_bill_item->>'amount')::numeric, 0);
          if v_bill_amt > 0 and v_remaining >= v_bill_amt then
            v_bills     := jsonb_set(v_bills, array[v_i::text, 'status'], to_jsonb('Paid'::text));
            v_remaining := v_remaining - v_bill_amt;
          end if;
        end if;
      end loop;
    end if;

    -- Priority 6: Other fines (non-late-fee, fully covered only)
    if v_remaining > 0 and jsonb_array_length(v_fines) > 0 then
      for v_i in 0 .. jsonb_array_length(v_fines) - 1 loop
        v_fine_item := v_fines -> v_i;
        if coalesce(v_fine_item->>'type', '') <> 'Late Rent'
           and (v_fine_item->>'status') = 'Pending'
        then
          v_fine_amt := coalesce((v_fine_item->>'amount')::numeric, 0);
          if v_fine_amt > 0 and v_remaining >= v_fine_amt then
            v_fines     := jsonb_set(v_fines, array[v_i::text, 'status'], to_jsonb('Paid'::text));
            v_remaining := v_remaining - v_fine_amt;
          end if;
        end if;
      end loop;
    end if;

    -- Write updated bills and fines arrays back in one statement
    update public.tenants
       set outstanding_bills = v_bills,
           outstanding_fines = v_fines,
           updated_at        = now()
     where id = v_ft_tenant_id;

  end if;

  -- ── 5. Return result ───────────────────────────────────────────────────────
  payment_id        := v_payment_id;
  was_duplicate     := false;
  matched_tenant_id := v_ft_tenant_id;
  matched_unit_id   := v_ft_unit_id;
  return next;
end;
$$;

grant execute on function public.record_c2b_payment(
  text, numeric, text, text, text, text, text, text, numeric, jsonb, text
) to service_role, authenticated;
