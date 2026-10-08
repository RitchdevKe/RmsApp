-- supabase/migrations/0111_standalone_partial_rms_payments_table.sql
-- Standalone, independent payments table for Partial RMS sandbox environment.
-- This decouples Partial RMS payments and dashboards completely from Full RMS's 'partial' payout / installment records.

CREATE TABLE IF NOT EXISTS public.partial_rms_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  lease_id uuid,
  amount numeric NOT NULL,
  phone text,
  checkout_request_id text,
  transaction_id text,
  status text NOT NULL CHECK (status in ('pending','completed','failed','cancelled')),
  result_code integer,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  matched_tenant_id text,
  matched_unit_id text,
  source text,
  bill_ref_number text,
  msisdn text,
  first_name text,
  middle_name text,
  last_name text,
  paired_payment_id text,
  reconciliation_status text
);

-- Ensure updated_at trigger is active on the standalone table
DROP TRIGGER IF EXISTS trg_partial_rms_payments_set_updated_at ON public.partial_rms_payments;
CREATE TRIGGER trg_partial_rms_payments_set_updated_at
BEFORE UPDATE ON public.partial_rms_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Disable Row Level Security to avoid authorization issues in the Partial RMS sandbox
ALTER TABLE public.partial_rms_payments DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partial_rms_payments TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Standboxed Manual Payment Recorder
-- ─────────────────────────────────────────────────────────────────────────────
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
    source, status, reconciliation_status,
    amount, transaction_id,
    matched_tenant_id, matched_unit_id,
    result_code, result_desc, created_at
  ) VALUES (
    'manual', 'completed', 'reconciled',
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

GRANT EXECUTE ON FUNCTION public.partial_record_manual_payment(text, numeric, text, text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Standboxed Payment Matcher
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partial_match_c2b_payment_to_tenant(
  p_payment_id uuid,
  p_tenant_id  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_payment      record;
  v_tenant       record;
  v_dep_expected numeric;
  v_dep_owed     numeric;
  v_amt          numeric;
BEGIN
  IF NOT app.is_staff_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can match payments';
  END IF;

  SELECT id, amount, transaction_id, matched_tenant_id, created_at, source
    INTO v_payment
  FROM public.partial_rms_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.matched_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already matched';
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

  v_amt := coalesce(v_payment.amount, 0);

  -- Mark payment as matched on our dedicated sandboxed table
  UPDATE public.partial_rms_payments
     SET matched_tenant_id     = p_tenant_id,
         matched_unit_id       = v_tenant.unit_id,
         reconciliation_status = 'reconciled',
         updated_at            = now()
   WHERE id = p_payment_id;

  -- Append payment_history entry to partial_tenants
  UPDATE public.partial_tenants
     SET payment_history = (
           jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(coalesce(v_payment.created_at, now()), 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(v_amt, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    CASE v_payment.source WHEN 'c2b' THEN 'M-Pesa (C2B)' ELSE 'Manual' END,
               'reference', coalesce(v_payment.transaction_id, v_payment.id::text)
             )
           ) || coalesce(payment_history, '[]'::jsonb)
         ),
         updated_at = now()
   WHERE id = p_tenant_id;

  -- Deposit credit
  v_dep_expected := CASE
    WHEN coalesce(v_tenant.deposit_exempt, false)                                   THEN 0
    WHEN coalesce(v_tenant.rent_extension->>'enabled', 'false') = 'true'            THEN 0
    WHEN coalesce(v_tenant.prorated_deposit->>'enabled', 'false') = 'true'
         THEN coalesce((v_tenant.prorated_deposit->>'monthlyInstallment')::numeric, 0)
    WHEN coalesce(v_tenant.deposit_expected, 0) > 0                                 THEN v_tenant.deposit_expected
    ELSE coalesce(v_tenant.rent_amount, 0) * coalesce(v_tenant.deposit_months, 1)
  END;

  v_dep_owed := greatest(0, v_dep_expected - coalesce(v_tenant.deposit_paid, 0));

  IF v_dep_owed > 0 AND v_amt >= v_dep_expected THEN
    UPDATE public.partial_tenants
       SET deposit_paid = v_dep_expected,
           updated_at   = now()
     WHERE id = p_tenant_id;
  END IF;

  -- Activate tenant
  IF v_tenant.status IN ('Pending', 'PendingPayment')
     AND v_amt >= coalesce(v_tenant.rent_amount, 0) + v_dep_expected
  THEN
    UPDATE public.partial_tenants
       SET status          = 'Active',
           activation_date = to_char(coalesce(v_payment.created_at, now()), 'YYYY-MM-DD'),
           updated_at      = now()
     WHERE id = p_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partial_match_c2b_payment_to_tenant(uuid, text) TO authenticated, service_role;
