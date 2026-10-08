
-- Status enums
DO $$ BEGIN
  CREATE TYPE public.lease_status AS ENUM ('active', 'pending', 'ended', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partial_payment_status AS ENUM ('received', 'reconciled', 'paid_out', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_run_status AS ENUM ('draft', 'finalized', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_org_landlord(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid() AND role = 'landlord'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_tenant(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid() AND role = 'tenant'
  );
$$;

-- ============= PROPERTIES =============
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  landlord_user_id uuid NOT NULL,
  name text NOT NULL,
  address text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_org ON public.properties(org_id);
CREATE INDEX idx_properties_landlord ON public.properties(landlord_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY properties_select ON public.properties FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR (is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  );
CREATE POLICY properties_insert ON public.properties FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR is_org_admin(org_id)
    OR (is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  );
CREATE POLICY properties_update ON public.properties FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR (is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  )
  WITH CHECK (
    is_super_admin()
    OR is_org_admin(org_id)
    OR (is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  );
CREATE POLICY properties_delete ON public.properties FOR DELETE TO authenticated
  USING (is_super_admin() OR is_org_admin(org_id));

CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= UNITS =============
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  label text NOT NULL,
  unit_tag text NOT NULL,
  rent_amount numeric(12,2) NOT NULL DEFAULT 0,
  bedrooms int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, unit_tag)
);
CREATE INDEX idx_units_property ON public.units(property_id);
CREATE INDEX idx_units_org ON public.units(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  );
CREATE POLICY units_write ON public.units FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  )
  WITH CHECK (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM public.properties p
               WHERE p.id = units.property_id
                 AND is_org_landlord(units.org_id)
                 AND p.landlord_user_id = auth.uid())
  );

CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= LEASES =============
CREATE TABLE public.leases (
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
CREATE INDEX idx_leases_org ON public.leases(org_id);
CREATE INDEX idx_leases_unit ON public.leases(unit_id);
CREATE INDEX idx_leases_tenant_user ON public.leases(tenant_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;
GRANT ALL ON public.leases TO service_role;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY leases_select ON public.leases FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR tenant_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  );
CREATE POLICY leases_write ON public.leases FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND is_org_landlord(leases.org_id)
        AND p.landlord_user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_leases_updated_at BEFORE UPDATE ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= PARTIAL PAYMENTS =============
CREATE TABLE public.partial_payments (
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
CREATE INDEX idx_partial_payments_org ON public.partial_payments(org_id);
CREATE INDEX idx_partial_payments_lease ON public.partial_payments(lease_id);
CREATE INDEX idx_partial_payments_paid_at ON public.partial_payments(paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partial_payments TO authenticated;
GRANT ALL ON public.partial_payments TO service_role;
ALTER TABLE public.partial_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_select ON public.partial_payments FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.leases l
      JOIN public.units u ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
      WHERE l.id = partial_payments.lease_id
        AND is_org_landlord(partial_payments.org_id)
        AND p.landlord_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.leases l
      WHERE l.id = partial_payments.lease_id AND l.tenant_user_id = auth.uid()
    )
  );
CREATE POLICY pp_write_admin ON public.partial_payments FOR ALL TO authenticated
  USING (is_super_admin() OR is_org_admin(org_id))
  WITH CHECK (is_super_admin() OR is_org_admin(org_id));

CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON public.partial_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= PARTIAL PAYOUT RUNS =============
CREATE TABLE public.partial_payout_runs (
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
CREATE INDEX idx_payout_runs_org ON public.partial_payout_runs(org_id);
CREATE INDEX idx_payout_runs_landlord ON public.partial_payout_runs(landlord_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partial_payout_runs TO authenticated;
GRANT ALL ON public.partial_payout_runs TO service_role;
ALTER TABLE public.partial_payout_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ppr_select ON public.partial_payout_runs FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(org_id)
    OR (is_org_landlord(org_id) AND landlord_user_id = auth.uid())
  );
CREATE POLICY ppr_write ON public.partial_payout_runs FOR ALL TO authenticated
  USING (is_super_admin() OR is_org_admin(org_id))
  WITH CHECK (is_super_admin() OR is_org_admin(org_id));

CREATE TRIGGER trg_ppr_updated_at BEFORE UPDATE ON public.partial_payout_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
