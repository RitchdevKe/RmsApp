
-- 1. Ingest secret on org
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ingest_secret text;

UPDATE public.organizations
   SET ingest_secret = encode(gen_random_bytes(24), 'hex')
 WHERE ingest_secret IS NULL;

-- 2. Org contacts
CREATE TABLE IF NOT EXISTS public.org_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role_title text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_contacts_org_idx ON public.org_contacts(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_contacts TO authenticated;
GRANT ALL ON public.org_contacts TO service_role;
ALTER TABLE public.org_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage org_contacts" ON public.org_contacts
  FOR ALL USING (public.is_super_admin() OR public.is_org_admin(org_id))
  WITH CHECK (public.is_super_admin() OR public.is_org_admin(org_id));

CREATE TRIGGER org_contacts_set_updated_at
  BEFORE UPDATE ON public.org_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Bank accounts
CREATE TABLE IF NOT EXISTS public.org_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  branch text,
  account_name text NOT NULL,
  account_number text NOT NULL,
  swift_code text,
  currency text NOT NULL DEFAULT 'KES',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_bank_accounts_org_idx ON public.org_bank_accounts(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_bank_accounts TO authenticated;
GRANT ALL ON public.org_bank_accounts TO service_role;
ALTER TABLE public.org_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage org_bank_accounts" ON public.org_bank_accounts
  FOR ALL USING (public.is_super_admin() OR public.is_org_admin(org_id))
  WITH CHECK (public.is_super_admin() OR public.is_org_admin(org_id));

CREATE TRIGGER org_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.org_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. M-Pesa configs
CREATE TABLE IF NOT EXISTS public.org_mpesa_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Default',
  shortcode text NOT NULL,
  shortcode_type text NOT NULL DEFAULT 'paybill', -- paybill | till | b2c
  consumer_key text,
  consumer_secret text,
  passkey text,
  callback_url text,
  environment text NOT NULL DEFAULT 'sandbox', -- sandbox | production
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_mpesa_configs_org_idx ON public.org_mpesa_configs(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_mpesa_configs TO authenticated;
GRANT ALL ON public.org_mpesa_configs TO service_role;
ALTER TABLE public.org_mpesa_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage org_mpesa_configs" ON public.org_mpesa_configs
  FOR ALL USING (public.is_super_admin() OR public.is_org_admin(org_id))
  WITH CHECK (public.is_super_admin() OR public.is_org_admin(org_id));

CREATE TRIGGER org_mpesa_configs_set_updated_at
  BEFORE UPDATE ON public.org_mpesa_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. External stats snapshots (pushed by managed org apps)
CREATE TABLE IF NOT EXISTS public.org_external_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  landlords int NOT NULL DEFAULT 0,
  tenants int NOT NULL DEFAULT 0,
  properties int NOT NULL DEFAULT 0,
  units int NOT NULL DEFAULT 0,
  active_leases int NOT NULL DEFAULT 0,
  mtd_collected numeric NOT NULL DEFAULT 0,
  all_time_collected numeric NOT NULL DEFAULT 0,
  source text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_external_stats_org_time_idx
  ON public.org_external_stats(org_id, snapshot_at DESC);

GRANT SELECT ON public.org_external_stats TO authenticated;
GRANT ALL ON public.org_external_stats TO service_role;
ALTER TABLE public.org_external_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin read org_external_stats" ON public.org_external_stats
  FOR SELECT USING (public.is_super_admin() OR public.is_org_admin(org_id));

-- 6. Helper: latest snapshot per org for the hub
CREATE OR REPLACE FUNCTION public.platform_external_latest()
RETURNS TABLE (
  org_id uuid, org_name text, org_tier org_tier,
  snapshot_at timestamptz,
  landlords int, tenants int, properties int, units int, active_leases int,
  mtd_collected numeric, all_time_collected numeric, source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (s.org_id)
    s.org_id, o.name, o.tier, s.snapshot_at,
    s.landlords, s.tenants, s.properties, s.units, s.active_leases,
    s.mtd_collected, s.all_time_collected, s.source
  FROM public.org_external_stats s
  JOIN public.organizations o ON o.id = s.org_id
  WHERE public.is_super_admin()
  ORDER BY s.org_id, s.snapshot_at DESC;
$$;

-- 7. Rotate ingest secret (super admin only)
CREATE OR REPLACE FUNCTION public.rotate_org_ingest_secret(_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_secret := encode(gen_random_bytes(24), 'hex');
  UPDATE public.organizations SET ingest_secret = v_secret WHERE id = _org_id;
  RETURN v_secret;
END;
$$;
