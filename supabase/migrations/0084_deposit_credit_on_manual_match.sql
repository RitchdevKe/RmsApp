-- Migration 0084: credit deposit_paid (and activate) in record_manual_payment
--                 and match_c2b_payment_to_tenant
--
-- Problem: both RPCs only appended to payment_history. When a Pending/PendingPayment
-- tenant pays an amount that covers the full deposit (but not yet rent+deposit),
-- deposit_paid stayed at 0 — leaving the card and profile out of sync with what
-- was actually received.
--
-- record_c2b_payment already has the full priority waterfall (migration 0077).
-- This migration brings the other two RPCs up to the same standard:
--   1. Credit deposit_paid = deposit_expected when payment >= deposit_expected.
--   2. Mark status = 'Active' + activation_date when payment >= rent + deposit.

-- ── 1. record_manual_payment ────────────────────────────────────────────────
create or replace function public.record_manual_payment(
  p_tenant_id text,
  p_amount    numeric,
  p_reference text,
  p_method    text,
  p_date      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id   uuid;
  v_tenant       record;
  v_date         timestamptz := coalesce(p_date::timestamptz, now());
  v_dep_expected numeric;
  v_dep_owed     numeric;
begin
  if not app.is_staff_admin(auth.uid()) then
    raise exception 'Only admins can record manual payments';
  end if;

  if p_method not in ('Bank', 'Cash') then
    raise exception 'Method must be Bank or Cash';
  end if;

  select id, unit_id, payment_history,
         deposit_paid, deposit_exempt, deposit_expected, deposit_months,
         rent_amount, status, prorated_deposit, rent_extension
    into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if not found then
    raise exception 'Tenant not found';
  end if;

  -- Insert payment row
  insert into public.payments (
    source, status, reconciliation_status,
    amount, transaction_id,
    matched_tenant_id, matched_unit_id,
    result_code, result_desc, created_at
  ) values (
    'manual', 'completed', 'reconciled',
    p_amount, p_reference,
    p_tenant_id, v_tenant.unit_id,
    0, p_method, v_date
  )
  returning id into v_payment_id;

  -- Append payment_history entry
  update public.tenants
     set payment_history = (
           jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(v_date, 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    p_method,
               'reference', p_reference
             )
           ) || coalesce(payment_history, '[]'::jsonb)
         ),
         updated_at = now()
   where id = p_tenant_id;

  -- ── Deposit credit ─────────────────────────────────────────────────────
  -- Compute the expected deposit for this tenant.
  v_dep_expected := case
    when coalesce(v_tenant.deposit_exempt, false)                                   then 0
    when coalesce(v_tenant.rent_extension->>'enabled', 'false') = 'true'            then 0
    when coalesce(v_tenant.prorated_deposit->>'enabled', 'false') = 'true'
         then coalesce((v_tenant.prorated_deposit->>'monthlyInstallment')::numeric, 0)
    when coalesce(v_tenant.deposit_expected, 0) > 0                                 then v_tenant.deposit_expected
    else coalesce(v_tenant.rent_amount, 0) * coalesce(v_tenant.deposit_months, 1)
  end;

  v_dep_owed := greatest(0, v_dep_expected - coalesce(v_tenant.deposit_paid, 0));

  -- Credit deposit when the payment fully covers what is still owed on deposit.
  if v_dep_owed > 0 and p_amount >= v_dep_expected then
    update public.tenants
       set deposit_paid = v_dep_expected,
           updated_at   = now()
     where id = p_tenant_id;
  end if;

  -- ── Status activation ──────────────────────────────────────────────────
  -- Move Pending/PendingPayment → Active once both rent and full deposit are covered.
  if v_tenant.status in ('Pending', 'PendingPayment')
     and p_amount >= coalesce(v_tenant.rent_amount, 0) + v_dep_expected
  then
    update public.tenants
       set status          = 'Active',
           activation_date = to_char(v_date, 'YYYY-MM-DD'),
           updated_at      = now()
     where id = p_tenant_id;
  end if;

  return v_payment_id;
end;
$$;

grant execute on function public.record_manual_payment(text, numeric, text, text, text)
  to authenticated;


-- ── 2. match_c2b_payment_to_tenant ──────────────────────────────────────────
create or replace function public.match_c2b_payment_to_tenant(
  p_payment_id uuid,
  p_tenant_id  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment      record;
  v_tenant       record;
  v_dep_expected numeric;
  v_dep_owed     numeric;
  v_amt          numeric;
begin
  if not app.is_staff_admin(auth.uid()) then
    raise exception 'Only admins can match payments';
  end if;

  select id, amount, transaction_id, matched_tenant_id, created_at, source
    into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.matched_tenant_id is not null then
    raise exception 'Payment is already matched';
  end if;

  select id, unit_id, payment_history,
         deposit_paid, deposit_exempt, deposit_expected, deposit_months,
         rent_amount, status, prorated_deposit, rent_extension
    into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if not found then
    raise exception 'Tenant not found';
  end if;

  v_amt := coalesce(v_payment.amount, 0);

  -- Mark payment as matched
  update public.payments
     set matched_tenant_id     = p_tenant_id,
         matched_unit_id       = v_tenant.unit_id,
         reconciliation_status = 'reconciled',
         updated_at            = now()
   where id = p_payment_id;

  -- Append payment_history entry
  update public.tenants
     set payment_history = (
           jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(coalesce(v_payment.created_at, now()), 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(v_amt, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    case v_payment.source when 'c2b' then 'M-Pesa (C2B)' else 'Manual' end,
               'reference', coalesce(v_payment.transaction_id, v_payment.id::text)
             )
           ) || coalesce(payment_history, '[]'::jsonb)
         ),
         updated_at = now()
   where id = p_tenant_id;

  -- ── Deposit credit ─────────────────────────────────────────────────────
  v_dep_expected := case
    when coalesce(v_tenant.deposit_exempt, false)                                   then 0
    when coalesce(v_tenant.rent_extension->>'enabled', 'false') = 'true'            then 0
    when coalesce(v_tenant.prorated_deposit->>'enabled', 'false') = 'true'
         then coalesce((v_tenant.prorated_deposit->>'monthlyInstallment')::numeric, 0)
    when coalesce(v_tenant.deposit_expected, 0) > 0                                 then v_tenant.deposit_expected
    else coalesce(v_tenant.rent_amount, 0) * coalesce(v_tenant.deposit_months, 1)
  end;

  v_dep_owed := greatest(0, v_dep_expected - coalesce(v_tenant.deposit_paid, 0));

  if v_dep_owed > 0 and v_amt >= v_dep_expected then
    update public.tenants
       set deposit_paid = v_dep_expected,
           updated_at   = now()
     where id = p_tenant_id;
  end if;

  -- ── Status activation ──────────────────────────────────────────────────
  if v_tenant.status in ('Pending', 'PendingPayment')
     and v_amt >= coalesce(v_tenant.rent_amount, 0) + v_dep_expected
  then
    update public.tenants
       set status          = 'Active',
           activation_date = to_char(coalesce(v_payment.created_at, now()), 'YYYY-MM-DD'),
           updated_at      = now()
     where id = p_tenant_id;
  end if;
end;
$$;

grant execute on function public.match_c2b_payment_to_tenant(uuid, text)
  to authenticated;
