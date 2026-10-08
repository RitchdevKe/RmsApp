-- supabase/migrations/0028_fix_record_c2b_payment.sql
--
-- Two fixes to record_c2b_payment:
--  1. Resolve PostgreSQL 42702 (ambiguous "matched_tenant_id") — the column
--     existed as both a payments table column and a RETURNS TABLE variable.
--     Fixed by storing lookup results in local variables before assignment.
--  2. Resolve PostgreSQL 42P10 (no matching ON CONFLICT target) — the
--     transaction_id unique index is partial (WHERE transaction_id IS NOT
--     NULL), so ON CONFLICT must spell out the same predicate.

create or replace function public.record_c2b_payment(
  p_transaction_id text,
  p_amount numeric,
  p_msisdn text,
  p_bill_ref text,
  p_business_short_code text,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_org_balance numeric,
  p_raw jsonb,
  p_trans_time text default null
)
returns table (
  payment_id uuid,
  was_duplicate boolean,
  matched_tenant_id text,
  matched_unit_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id   uuid;
  v_payment_id    uuid;
  v_match         record;
  v_status        text;
  v_tenant_id     text;
  v_unit_id       text;
  v_created_at    timestamptz := now();
begin
  -- Idempotency: return existing row if this TransID is already stored.
  select p.id, p.matched_tenant_id, p.matched_unit_id
    into v_existing_id, v_tenant_id, v_unit_id
  from public.payments p
  where p.transaction_id = p_transaction_id
  limit 1;

  if v_existing_id is not null then
    payment_id       := v_existing_id;
    was_duplicate    := true;
    matched_tenant_id := v_tenant_id;
    matched_unit_id  := v_unit_id;
    return next;
    return;
  end if;

  -- Resolve BillRefNumber → unit → tenant.
  select *
    into v_match
  from public.find_active_tenant_by_unit_tag(p_bill_ref);

  v_status := case
    when v_match.tenant_id is not null then 'reconciled'
    else 'unreconciled'
  end;

  insert into public.payments (
    source,
    status,
    reconciliation_status,
    amount,
    transaction_id,
    bill_ref_number,
    msisdn,
    phone,
    business_short_code,
    first_name,
    middle_name,
    last_name,
    org_account_balance,
    matched_tenant_id,
    matched_unit_id,
    raw_payload,
    result_code,
    result_desc
  ) values (
    'c2b',
    'completed',
    v_status,
    p_amount,
    p_transaction_id,
    p_bill_ref,
    p_msisdn,
    p_msisdn,
    p_business_short_code,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_org_balance,
    v_match.tenant_id,
    v_match.unit_id,
    p_raw,
    0,
    'C2B confirmation received'
  )
  on conflict (transaction_id) where transaction_id is not null
  do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    -- Race condition: another insert won; re-select.
    select p.id, p.matched_tenant_id, p.matched_unit_id
      into v_payment_id, v_tenant_id, v_unit_id
    from public.payments p
    where p.transaction_id = p_transaction_id
    limit 1;

    payment_id        := v_payment_id;
    was_duplicate     := true;
    matched_tenant_id := v_tenant_id;
    matched_unit_id   := v_unit_id;
    return next;
    return;
  end if;

  -- Append to tenant ledger if matched.
  if v_match.tenant_id is not null then
    update public.tenants
       set payment_history = (
             jsonb_build_array(
               jsonb_build_object(
                 'date',      to_char(v_created_at, 'YYYY-MM-DD'),
                 'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
                 'status',    'Paid',
                 'method',    'M-Pesa (C2B)',
                 'reference', p_transaction_id
               )
             ) || coalesce(payment_history, '[]'::jsonb)
           ),
           updated_at = now()
     where id = v_match.tenant_id;
  end if;

  payment_id        := v_payment_id;
  was_duplicate     := false;
  matched_tenant_id := v_match.tenant_id;
  matched_unit_id   := v_match.unit_id;
  return next;
end;
$$;

grant execute on function public.record_c2b_payment(
  text, numeric, text, text, text, text, text, text, numeric, jsonb, text
) to service_role, authenticated;
