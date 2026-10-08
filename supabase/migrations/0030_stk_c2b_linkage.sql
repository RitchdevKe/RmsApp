-- 0030_stk_c2b_linkage.sql
--
-- Extends record_c2b_payment with STK<->C2B row pairing.
-- Uses scalar subqueries throughout to avoid SELECT INTO, which the
-- Supabase SQL Editor misparses as plain-SQL "CREATE TABLE AS SELECT".
-- Run in 3 separate blocks in the SQL Editor (DDL, DROP, CREATE).

-- Block 1: DDL
alter table public.payments
  add column if not exists paired_payment_id uuid
    references public.payments(id) on delete set null;

create index if not exists payments_paired_idx
  on public.payments(paired_payment_id)
  where paired_payment_id is not null;

-- Block 2: DROP
drop function if exists public.record_c2b_payment(text,numeric,text,text,text,text,text,text,numeric,jsonb,text);
drop function if exists public.record_c2b_payment(text,numeric,text,text,text,text,text,text,numeric,jsonb);

-- Block 3: CREATE
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
  v_existing_id  uuid;
  v_payment_id   uuid;
  v_ft_tenant_id text;
  v_ft_unit_id   text;
  v_status       text;
  v_tenant_id    text;
  v_unit_id      text;
  v_created_at   timestamptz := now();
  v_twin_id      uuid;
begin
  v_existing_id := (
    select id from public.payments
    where transaction_id = p_transaction_id
    limit 1
  );

  if v_existing_id is not null then
    v_tenant_id := (select matched_tenant_id from public.payments where id = v_existing_id);
    v_unit_id   := (select matched_unit_id   from public.payments where id = v_existing_id);

    v_ft_tenant_id := (select tenant_id from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
    v_ft_unit_id   := (select unit_id   from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);

    v_tenant_id := coalesce(v_tenant_id, v_ft_tenant_id);
    v_unit_id   := coalesce(v_unit_id,   v_ft_unit_id);

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

  v_ft_tenant_id := (select tenant_id from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);
  v_ft_unit_id   := (select unit_id   from public.find_active_tenant_by_unit_tag(p_bill_ref) limit 1);

  v_status := case when v_ft_tenant_id is not null then 'reconciled' else 'unreconciled' end;

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

  if v_ft_tenant_id is not null then
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
  end if;

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
