-- 0094_partial_deposit_payment_repair.sql
-- Purpose:
--   Ensure manual payments that partially pay security deposit immediately update
--   tenants.deposit_paid, not only when the payment covers the full deposit.
--   Safe to run after 0092/0093.

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
  v_dep_credit   numeric;
  v_new_dep_paid numeric;
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
  ) returning id into v_payment_id;

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
   where id = p_tenant_id
     and not coalesce(payment_history @> jsonb_build_array(jsonb_build_object('reference', p_reference)), false);

  v_dep_expected := case
    when coalesce(v_tenant.deposit_exempt, false) then 0
    when coalesce(v_tenant.rent_extension->>'enabled', 'false') = 'true' then 0
    when coalesce(v_tenant.prorated_deposit->>'enabled', 'false') = 'true'
      then coalesce((v_tenant.prorated_deposit->>'monthlyInstallment')::numeric, 0)
    when coalesce(v_tenant.deposit_expected, 0) > 0 then v_tenant.deposit_expected
    else coalesce(v_tenant.rent_amount, 0) * coalesce(v_tenant.deposit_months, 1)
  end;

  v_dep_owed := greatest(0, v_dep_expected - coalesce(v_tenant.deposit_paid, 0));
  v_dep_credit := least(greatest(0, p_amount), v_dep_owed);
  v_new_dep_paid := coalesce(v_tenant.deposit_paid, 0) + v_dep_credit;

  if v_dep_credit > 0 then
    update public.tenants
       set deposit_paid = v_new_dep_paid,
           updated_at   = now()
     where id = p_tenant_id;
  end if;

  if v_tenant.status in ('Pending', 'PendingPayment')
     and v_new_dep_paid + 0.5 >= v_dep_expected
     and greatest(0, p_amount - v_dep_credit) + 0.5 >= coalesce(v_tenant.rent_amount, 0)
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

grant execute on function public.record_manual_payment(text, numeric, text, text, text) to authenticated;