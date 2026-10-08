-- 0114_fix_partial_rms_payments_user_id.sql
-- In 0111 the user_id was omitted on the manual payment insert, creating invisible payments.
-- This recreates the function to insert user_id, and backfills user_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.partial_record_manual_payment(
  p_tenant_id text,
  p_amount    numeric,
  p_reference text,
  p_method    text,
  p_date      text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_payment_id   uuid;
  v_tenant       record;
  v_date         timestamptz := coalesce(p_date::timestamptz, now());
  v_dep_expected numeric;
  v_dep_owed     numeric;
BEGIN
  IF NOT app.is_staff_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can record manual payments';
  END IF;

  IF p_method NOT IN ('Bank', 'Cash') THEN
    RAISE EXCEPTION 'Method must be Bank or Cash';
  END IF;

  SELECT id, unit_id, payment_history,
         deposit_paid, deposit_exempt, deposit_expected, deposit_months,
         rent_amount, status, prorated_deposit, rent_extension
    INTO v_tenant
  FROM public.partial_tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Insert into our dedicated sandbox table
  INSERT INTO public.partial_rms_payments (
    user_id, source, status, reconciliation_status,
    amount, transaction_id,
    matched_tenant_id, matched_unit_id,
    result_code, result_desc, created_at
  ) VALUES (
    auth.uid(), 'manual', 'completed', 'reconciled',
    p_amount, p_reference,
    p_tenant_id, v_tenant.unit_id,
    0, p_method, v_date
  )
  RETURNING id INTO v_payment_id;

  -- Append payment_history entry to partial_tenants
  UPDATE public.partial_tenants
     SET payment_history = (
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
   WHERE id = p_tenant_id;

  -- Deposit credit calculation
  v_dep_expected := CASE
    WHEN coalesce(v_tenant.deposit_exempt, false)                                   THEN 0
    WHEN coalesce(v_tenant.rent_extension->>'enabled', 'false') = 'true'            THEN 0
    WHEN coalesce(v_tenant.prorated_deposit->>'enabled', 'false') = 'true'
         THEN coalesce((v_tenant.prorated_deposit->>'monthlyInstallment')::numeric, 0)
    WHEN coalesce(v_tenant.deposit_expected, 0) > 0                                 THEN v_tenant.deposit_expected
    ELSE coalesce(v_tenant.rent_amount, 0) * coalesce(v_tenant.deposit_months, 1)
  END;

  v_dep_owed := greatest(0, v_dep_expected - coalesce(v_tenant.deposit_paid, 0));

  IF v_dep_owed > 0 AND p_amount >= v_dep_expected THEN
    UPDATE public.partial_tenants
       SET deposit_paid = v_dep_expected,
           updated_at   = now()
     WHERE id = p_tenant_id;
  END IF;

  -- Status activation
  IF v_tenant.status IN ('Pending', 'PendingPayment')
     AND p_amount >= coalesce(v_tenant.rent_amount, 0) + v_dep_expected
  THEN
    UPDATE public.partial_tenants
       SET status          = 'Active',
           activation_date = to_char(v_date, 'YYYY-MM-DD'),
           updated_at      = now()
     WHERE id = p_tenant_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

-- Ensure existing payments missing user_id are assigned appropriately 
-- assuming they were made by partial_tenants' created_by user
UPDATE public.partial_rms_payments prp
SET user_id = pt.created_by
FROM public.partial_tenants pt
WHERE prp.matched_tenant_id = pt.id 
  AND prp.user_id IS NULL;

COMMIT;
