
-- Idempotency for M-Pesa receipts per org in partial_payments
CREATE UNIQUE INDEX IF NOT EXISTS partial_payments_org_receipt_uniq
  ON public.partial_payments(org_id, mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

-- ============================================================================
-- record_partial_payment: called by c2b-confirmation for partial-tier orgs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_partial_payment(
  p_org_id uuid,
  p_amount numeric,
  p_unit_tag text,
  p_receipt text,
  p_msisdn text,
  p_payer_name text,
  p_paid_at timestamptz DEFAULT now(),
  p_raw jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_lease_id uuid;
  v_fee_pct numeric;
  v_fee numeric;
  v_payout numeric;
  v_status partial_payment_status := 'received';
  v_id uuid;
  v_existing uuid;
BEGIN
  -- Dedupe by receipt
  IF p_receipt IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.partial_payments
     WHERE org_id = p_org_id AND mpesa_receipt = p_receipt LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- Resolve unit + active lease
  IF p_unit_tag IS NOT NULL AND length(trim(p_unit_tag)) > 0 THEN
    SELECT u.id INTO v_unit_id FROM public.units u
     WHERE u.org_id = p_org_id AND lower(u.unit_tag) = lower(trim(p_unit_tag))
     LIMIT 1;
    IF v_unit_id IS NOT NULL THEN
      SELECT l.id INTO v_lease_id FROM public.leases l
       WHERE l.unit_id = v_unit_id AND l.status = 'active'
       ORDER BY l.start_date DESC LIMIT 1;
    END IF;
  END IF;

  -- Mgmt fee from org feature_flags
  SELECT COALESCE((feature_flags->>'mgmt_fee_pct')::numeric, 10) INTO v_fee_pct
    FROM public.organizations WHERE id = p_org_id;
  v_fee := round((p_amount * v_fee_pct / 100)::numeric, 2);
  v_payout := p_amount - v_fee;

  INSERT INTO public.partial_payments
    (org_id, lease_id, unit_tag, amount, mgmt_fee_pct, mgmt_fee_amount,
     landlord_payout_amount, mpesa_receipt, payer_phone, payer_name, paid_at,
     status, metadata)
  VALUES
    (p_org_id, v_lease_id, p_unit_tag, p_amount, v_fee_pct, v_fee,
     v_payout, p_receipt, p_msisdn, p_payer_name, p_paid_at,
     v_status, COALESCE(p_raw, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_partial_payment(uuid,numeric,text,text,text,text,timestamptz,jsonb) TO service_role;

-- ============================================================================
-- update_org_mgmt_fee_pct: agency/owner-admin sets fee for their org
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_org_mgmt_fee_pct(_org_id uuid, _pct numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.is_org_admin(_org_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _pct < 0 OR _pct > 100 THEN
    RAISE EXCEPTION 'mgmt_fee_pct must be between 0 and 100';
  END IF;
  UPDATE public.organizations
     SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                         || jsonb_build_object('mgmt_fee_pct', _pct)
   WHERE id = _org_id;
  INSERT INTO public.org_audit_log(org_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (_org_id, auth.uid(), 'mgmt_fee_pct_updated', 'organization', _org_id::text,
          jsonb_build_object('pct', _pct));
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_org_mgmt_fee_pct(uuid, numeric) TO authenticated;

-- ============================================================================
-- generate_payout_run: aggregate received payments for a landlord & period
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_payout_run(
  _org_id uuid,
  _landlord_user_id uuid,
  _period_start date,
  _period_end date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_total_collected numeric := 0;
  v_total_fee numeric := 0;
  v_total_payout numeric := 0;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_org_admin(_org_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(sum(pp.amount),0), COALESCE(sum(pp.mgmt_fee_amount),0), COALESCE(sum(pp.landlord_payout_amount),0)
    INTO v_total_collected, v_total_fee, v_total_payout
  FROM public.partial_payments pp
  JOIN public.leases l ON l.id = pp.lease_id
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE pp.org_id = _org_id
    AND p.landlord_user_id = _landlord_user_id
    AND pp.payout_run_id IS NULL
    AND pp.status = 'received'
    AND pp.paid_at::date BETWEEN _period_start AND _period_end;

  INSERT INTO public.partial_payout_runs
    (org_id, landlord_user_id, period_start, period_end,
     total_collected, total_fee, total_payout, status)
  VALUES (_org_id, _landlord_user_id, _period_start, _period_end,
          v_total_collected, v_total_fee, v_total_payout, 'draft')
  RETURNING id INTO v_run_id;

  UPDATE public.partial_payments pp
     SET payout_run_id = v_run_id, status = 'reconciled'
   FROM public.leases l, public.units u, public.properties p
   WHERE pp.lease_id = l.id AND l.unit_id = u.id AND u.property_id = p.id
     AND pp.org_id = _org_id AND p.landlord_user_id = _landlord_user_id
     AND pp.payout_run_id IS NULL AND pp.status = 'received'
     AND pp.paid_at::date BETWEEN _period_start AND _period_end;

  INSERT INTO public.org_audit_log(org_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (_org_id, auth.uid(), 'payout_run_generated', 'partial_payout_run', v_run_id::text,
          jsonb_build_object('landlord_user_id', _landlord_user_id,
                             'period_start', _period_start, 'period_end', _period_end,
                             'total_payout', v_total_payout));
  RETURN v_run_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_payout_run(uuid, uuid, date, date) TO authenticated;

-- Mark payout run paid
CREATE OR REPLACE FUNCTION public.mark_payout_run_paid(_run_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.partial_payout_runs WHERE id = _run_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF NOT (public.is_super_admin() OR public.is_org_admin(v_org)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.partial_payout_runs SET status='paid', paid_at=now(), notes=_notes WHERE id=_run_id;
  UPDATE public.partial_payments SET status='paid_out' WHERE payout_run_id=_run_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_payout_run_paid(uuid, text) TO authenticated;

-- ============================================================================
-- claim_tenant_lease: signed-in user links themselves to a lease by email
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_tenant_lease()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_count int := 0;
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN RETURN 0; END IF;

  -- Link unclaimed leases by matching email
  WITH updated AS (
    UPDATE public.leases
       SET tenant_user_id = v_user_id
     WHERE tenant_user_id IS NULL
       AND lower(tenant_email) = lower(v_email)
    RETURNING org_id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Ensure tenant role in each org the user now has a lease in
  FOR v_org_id IN
    SELECT DISTINCT org_id FROM public.leases WHERE tenant_user_id = v_user_id
  LOOP
    INSERT INTO public.org_members(org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'tenant')
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_tenant_lease() TO authenticated;

-- ============================================================================
-- Integral platform metrics + directories (super-admin only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_metrics(_tier org_tier DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orgs int;
  v_landlords int;
  v_tenants int;
  v_properties int;
  v_units int;
  v_active_leases int;
  v_mtd_collected numeric;
  v_mtd_fees numeric;
  v_month_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT count(*) INTO v_orgs FROM public.organizations o
   WHERE (_tier IS NULL OR o.tier = _tier);

  SELECT count(DISTINCT m.user_id) INTO v_landlords
    FROM public.org_members m JOIN public.organizations o ON o.id = m.org_id
   WHERE m.role = 'landlord' AND (_tier IS NULL OR o.tier = _tier);

  SELECT count(DISTINCT m.user_id) INTO v_tenants
    FROM public.org_members m JOIN public.organizations o ON o.id = m.org_id
   WHERE m.role = 'tenant' AND (_tier IS NULL OR o.tier = _tier);

  SELECT count(*) INTO v_properties FROM public.properties p
    JOIN public.organizations o ON o.id = p.org_id
   WHERE (_tier IS NULL OR o.tier = _tier);

  SELECT count(*) INTO v_units FROM public.units u
    JOIN public.organizations o ON o.id = u.org_id
   WHERE (_tier IS NULL OR o.tier = _tier);

  SELECT count(*) INTO v_active_leases FROM public.leases l
    JOIN public.organizations o ON o.id = l.org_id
   WHERE l.status='active' AND (_tier IS NULL OR o.tier = _tier);

  SELECT COALESCE(sum(pp.amount),0), COALESCE(sum(pp.mgmt_fee_amount),0)
    INTO v_mtd_collected, v_mtd_fees
    FROM public.partial_payments pp
    JOIN public.organizations o ON o.id = pp.org_id
   WHERE pp.paid_at >= v_month_start
     AND (_tier IS NULL OR o.tier = _tier);

  RETURN jsonb_build_object(
    'orgs', v_orgs,
    'landlords', v_landlords,
    'tenants', v_tenants,
    'properties', v_properties,
    'units', v_units,
    'active_leases', v_active_leases,
    'mtd_collected', v_mtd_collected,
    'mtd_fees', v_mtd_fees
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_metrics(org_tier) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_landlords(_tier org_tier DEFAULT NULL, _org_id uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, email text, org_id uuid, org_name text, org_tier org_tier,
  org_subdomain text, properties int, units int, mtd_collected numeric, last_payment_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_month_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT m.user_id,
         u.email::text,
         o.id, o.name, o.tier, o.primary_subdomain,
         COALESCE((SELECT count(*)::int FROM public.properties p WHERE p.org_id=o.id AND p.landlord_user_id=m.user_id),0) AS properties,
         COALESCE((SELECT count(*)::int FROM public.units un JOIN public.properties p ON p.id=un.property_id
                   WHERE p.org_id=o.id AND p.landlord_user_id=m.user_id),0) AS units,
         COALESCE((SELECT sum(pp.amount) FROM public.partial_payments pp
                    JOIN public.leases l ON l.id=pp.lease_id
                    JOIN public.units un ON un.id=l.unit_id
                    JOIN public.properties p ON p.id=un.property_id
                   WHERE pp.org_id=o.id AND p.landlord_user_id=m.user_id
                     AND pp.paid_at >= v_month_start), 0) AS mtd_collected,
         (SELECT max(pp.paid_at) FROM public.partial_payments pp
            JOIN public.leases l ON l.id=pp.lease_id
            JOIN public.units un ON un.id=l.unit_id
            JOIN public.properties p ON p.id=un.property_id
           WHERE pp.org_id=o.id AND p.landlord_user_id=m.user_id) AS last_payment_at
    FROM public.org_members m
    JOIN public.organizations o ON o.id = m.org_id
    JOIN auth.users u ON u.id = m.user_id
   WHERE m.role = 'landlord'
     AND (_tier IS NULL OR o.tier = _tier)
     AND (_org_id IS NULL OR o.id = _org_id)
   ORDER BY mtd_collected DESC NULLS LAST, o.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_landlords(org_tier, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_tenants(_tier org_tier DEFAULT NULL, _org_id uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, email text, lease_id uuid, tenant_name text, unit_label text, unit_tag text,
  org_id uuid, org_name text, org_tier org_tier, lease_status lease_status, rent_amount numeric,
  mtd_paid numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_month_start timestamptz := date_trunc('month', now());
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT l.tenant_user_id, u.email::text, l.id, l.tenant_name, un.label, un.unit_tag,
         o.id, o.name, o.tier, l.status, l.rent_amount,
         COALESCE((SELECT sum(pp.amount) FROM public.partial_payments pp
                   WHERE pp.lease_id=l.id AND pp.paid_at >= v_month_start),0) AS mtd_paid
    FROM public.leases l
    JOIN public.units un ON un.id = l.unit_id
    JOIN public.organizations o ON o.id = l.org_id
    LEFT JOIN auth.users u ON u.id = l.tenant_user_id
   WHERE (_tier IS NULL OR o.tier = _tier)
     AND (_org_id IS NULL OR o.id = _org_id)
   ORDER BY o.name, l.tenant_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_tenants(org_tier, uuid) TO authenticated;
