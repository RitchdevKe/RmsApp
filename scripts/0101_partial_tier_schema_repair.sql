-- Repair partial-tier schema after partial migration attempts.
--
-- Why this exists:
-- 20260606120547 tries to CREATE public.properties, but older TaskMe schemas
-- already have public.properties. That aborts the transaction before units,
-- leases, partial_payments and partial_payout_runs are created; then
-- 20260606121408 fails because public.partial_payments is missing.
--
-- Run this once, then rerun 20260606121408.

-- Required trigger helper, in case the base org migration has not created it yet.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Ensure role enum values exist. If this script is run inside one transaction,
-- the helper functions below compare role::text so they do not depend on using
-- the newly added enum values before commit.
DO $$
BEGIN
  IF to_regtype('public.org_member_role') IS NOT NULL THEN
    ALTER TYPE public.org_member_role ADD VALUE IF NOT EXISTS 'landlord';
    ALTER TYPE public.org_member_role ADD VALUE IF NOT EXISTS 'tenant';
  END IF;
END $$;

-- Status enums used by the partial-tier tables.
DO $$ BEGIN
  CREATE TYPE public.lease_status AS ENUM ('active', 'pending', 'ended', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partial_payment_status AS ENUM ('received', 'reconciled', 'paid_out', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_run_status AS ENUM ('draft', 'finalized', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper functions for RLS.
CREATE OR REPLACE FUNCTION public.is_org_landlord(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid() AND role::text = 'landlord'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_tenant(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid() AND role::text = 'tenant'
  );
$$;

-- public.properties already exists in older schemas. Add the partial-tier
-- columns that the new UI expects instead of recreating the table.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS landlord_user_id uuid,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS description text;

-- Older TaskMe schemas have public.properties.id as text with no default, and
-- landlord_id as NOT NULL. Partial-tier property creation expects an automatic
-- id and uses landlord_user_id instead. Make the old shape compatible.
DO $$
DECLARE
  v_property_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_property_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'properties'
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_property_id_type = 'uuid' THEN
    EXECUTE 'ALTER TABLE public.properties ALTER COLUMN id SET DEFAULT gen_random_uuid()';
  ELSIF v_property_id_type = 'text' THEN
    EXECUTE 'ALTER TABLE public.properties ALTER COLUMN id SET DEFAULT gen_random_uuid()::text';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'landlord_id'
  ) THEN
    ALTER TABLE public.properties ALTER COLUMN landlord_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_org ON public.properties(org_id);
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON public.properties(landlord_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partial_properties_select ON public.properties;
CREATE POLICY partial_properties_select ON public.properties FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND (
      public.is_super_admin()
      OR public.is_org_admin(org_id)
      OR (public.is_org_landlord(org_id) AND landlord_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS partial_properties_insert ON public.properties;
CREATE POLICY partial_properties_insert ON public.properties FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL AND (
      public.is_super_admin()
      OR public.is_org_admin(org_id)
      OR (public.is_org_landlord(org_id) AND landlord_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS partial_properties_update ON public.properties;
CREATE POLICY partial_properties_update ON public.properties FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL AND (
      public.is_super_admin()
      OR public.is_org_admin(org_id)
      OR (public.is_org_landlord(org_id) AND landlord_user_id = auth.uid())
    )
  )
  WITH CHECK (
    org_id IS NOT NULL AND (
      public.is_super_admin()
      OR public.is_org_admin(org_id)
      OR (public.is_org_landlord(org_id) AND landlord_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS partial_properties_delete ON public.properties;
CREATE POLICY partial_properties_delete ON public.properties FOR DELETE TO authenticated
  USING (org_id IS NOT NULL AND (public.is_super_admin() OR public.is_org_admin(org_id)));

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create public.units with property_id using the same type as public.properties.id
-- (older schemas use text; fresh partial schemas may use uuid).
DO $$
DECLARE
  v_property_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_property_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'properties'
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_property_id_type IS NULL THEN
    RAISE EXCEPTION 'public.properties.id was not found';
  END IF;

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS public.units (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      property_id %s NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
      label text NOT NULL,
      unit_tag text NOT NULL,
      rent_amount numeric(12,2) NOT NULL DEFAULT 0,
      bedrooms int,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, unit_tag)
    )
  $ddl$, v_property_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_units_property ON public.units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_org ON public.units(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND public.is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  );

DROP POLICY IF EXISTS units_write ON public.units;
CREATE POLICY units_write ON public.units FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND public.is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND public.is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_units_updated_at ON public.units;
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leases.
CREATE TABLE IF NOT EXISTS public.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_user_id uuid,
  tenant_name text NOT NULL,
  tenant_phone text,
  tenant_email text,
  rent_amount numeric(12,2) NOT NULL,
  deposit_amount numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date,
  status public.lease_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leases_org ON public.leases(org_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON public.leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_user ON public.leases(tenant_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;
GRANT ALL ON public.leases TO service_role;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leases_select ON public.leases;
CREATE POLICY leases_select ON public.leases FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR tenant_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND public.is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS leases_write ON public.leases;
CREATE POLICY leases_write ON public.leases FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND public.is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND public.is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_leases_updated_at ON public.leases;
CREATE TRIGGER trg_leases_updated_at BEFORE UPDATE ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Partial payments.
CREATE TABLE IF NOT EXISTS public.partial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lease_id uuid REFERENCES public.leases(id) ON DELETE SET NULL,
  unit_tag text,
  amount numeric(12,2) NOT NULL,
  mgmt_fee_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  mgmt_fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  landlord_payout_amount numeric(12,2) NOT NULL DEFAULT 0,
  mpesa_receipt text,
  payer_phone text,
  payer_name text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  status public.partial_payment_status NOT NULL DEFAULT 'received',
  payout_run_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partial_payments_org ON public.partial_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_partial_payments_lease ON public.partial_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_partial_payments_paid_at ON public.partial_payments(paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partial_payments TO authenticated;
GRANT ALL ON public.partial_payments TO service_role;
ALTER TABLE public.partial_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_select ON public.partial_payments;
CREATE POLICY pp_select ON public.partial_payments FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.leases l
      JOIN public.units u ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
      WHERE l.id = partial_payments.lease_id
        AND public.is_org_landlord(partial_payments.org_id)
        AND p.landlord_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.leases l
      WHERE l.id = partial_payments.lease_id AND l.tenant_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS pp_write_admin ON public.partial_payments;
CREATE POLICY pp_write_admin ON public.partial_payments FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_org_admin(org_id))
  WITH CHECK (public.is_super_admin() OR public.is_org_admin(org_id));

DROP TRIGGER IF EXISTS trg_pp_updated_at ON public.partial_payments;
CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON public.partial_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Partial payout runs.
CREATE TABLE IF NOT EXISTS public.partial_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  landlord_user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_collected numeric(12,2) NOT NULL DEFAULT 0,
  total_fee numeric(12,2) NOT NULL DEFAULT 0,
  total_payout numeric(12,2) NOT NULL DEFAULT 0,
  status public.payout_run_status NOT NULL DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_runs_org ON public.partial_payout_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_payout_runs_landlord ON public.partial_payout_runs(landlord_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partial_payout_runs TO authenticated;
GRANT ALL ON public.partial_payout_runs TO service_role;
ALTER TABLE public.partial_payout_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppr_select ON public.partial_payout_runs;
CREATE POLICY ppr_select ON public.partial_payout_runs FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(org_id)
    OR (public.is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  );

DROP POLICY IF EXISTS ppr_write ON public.partial_payout_runs;
CREATE POLICY ppr_write ON public.partial_payout_runs FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_org_admin(org_id))
  WITH CHECK (public.is_super_admin() OR public.is_org_admin(org_id));

DROP TRIGGER IF EXISTS trg_ppr_updated_at ON public.partial_payout_runs;
CREATE TRIGGER trg_ppr_updated_at BEFORE UPDATE ON public.partial_payout_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();