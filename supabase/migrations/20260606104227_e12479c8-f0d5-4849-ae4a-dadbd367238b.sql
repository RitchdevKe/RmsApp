
-- ============================================================
-- Multi-tenant SAAS foundation — organization data model
-- ============================================================

-- --- Enums ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.org_tier AS ENUM ('integral', 'agency', 'partial', 'self_manage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.org_status AS ENUM ('active', 'trial', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'staff', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.org_invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.org_domain_status AS ENUM ('pending_verification', 'verified', 'failed', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- updated_at trigger fn ----------------------------------
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

-- ============================================================
-- 1. organizations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tier public.org_tier NOT NULL,
  status public.org_status NOT NULL DEFAULT 'active',
  primary_subdomain text NOT NULL UNIQUE,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  mpesa_shortcode text,
  mpesa_callback_secret text,
  comms_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  suspend_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizations_tier_idx ON public.organizations(tier);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON public.organizations(status);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. org_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'staff',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON public.org_members(org_id);

DROP TRIGGER IF EXISTS org_members_set_updated_at ON public.org_members;
CREATE TRIGGER org_members_set_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper functions (SECURITY DEFINER, no recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.user_id = auth.uid()
      AND o.tier = 'integral'
      AND m.role IN ('owner', 'admin')
  );
$$;

-- Reads the per-request org context the app sets via set_config('app.current_org', ...)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid;
$$;

-- ============================================================
-- RLS: organizations
-- ============================================================
DROP POLICY IF EXISTS "org_select_own_or_super" ON public.organizations;
CREATE POLICY "org_select_own_or_super" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR public.is_super_admin());

DROP POLICY IF EXISTS "org_insert_super_only" ON public.organizations;
CREATE POLICY "org_insert_super_only" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "org_update_admin_or_super" ON public.organizations;
CREATE POLICY "org_update_admin_or_super" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id) OR public.is_super_admin())
  WITH CHECK (public.is_org_admin(id) OR public.is_super_admin());

DROP POLICY IF EXISTS "org_delete_super_only" ON public.organizations;
CREATE POLICY "org_delete_super_only" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ============================================================
-- RLS: org_members
-- ============================================================
DROP POLICY IF EXISTS "members_select_same_org_or_super" ON public.org_members;
CREATE POLICY "members_select_same_org_or_super" ON public.org_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_member(org_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "members_insert_admin_or_super" ON public.org_members;
CREATE POLICY "members_insert_admin_or_super" ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "members_update_admin_or_super" ON public.org_members;
CREATE POLICY "members_update_admin_or_super" ON public.org_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin())
  WITH CHECK (public.is_org_admin(org_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "members_delete_admin_or_super" ON public.org_members;
CREATE POLICY "members_delete_admin_or_super" ON public.org_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin());

-- ============================================================
-- 3. org_invitations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_member_role NOT NULL DEFAULT 'staff',
  accept_token text NOT NULL UNIQUE,
  status public.org_invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_invitations_org_id_idx ON public.org_invitations(org_id);
CREATE INDEX IF NOT EXISTS org_invitations_email_idx ON public.org_invitations(lower(email));

DROP TRIGGER IF EXISTS org_invitations_set_updated_at ON public.org_invitations;
CREATE TRIGGER org_invitations_set_updated_at
  BEFORE UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;
GRANT ALL ON public.org_invitations TO service_role;

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_select_admin_or_super" ON public.org_invitations;
CREATE POLICY "invites_select_admin_or_super" ON public.org_invitations
  FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "invites_write_admin_or_super" ON public.org_invitations;
CREATE POLICY "invites_write_admin_or_super" ON public.org_invitations
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin())
  WITH CHECK (public.is_org_admin(org_id) OR public.is_super_admin());

-- ============================================================
-- 4. org_custom_domains (scaffolded for Phase 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  verification_token text NOT NULL,
  status public.org_domain_status NOT NULL DEFAULT 'pending_verification',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_custom_domains_org_id_idx ON public.org_custom_domains(org_id);

DROP TRIGGER IF EXISTS org_custom_domains_set_updated_at ON public.org_custom_domains;
CREATE TRIGGER org_custom_domains_set_updated_at
  BEFORE UPDATE ON public.org_custom_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_custom_domains TO authenticated;
GRANT ALL ON public.org_custom_domains TO service_role;

ALTER TABLE public.org_custom_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domains_select_admin_or_super" ON public.org_custom_domains;
CREATE POLICY "domains_select_admin_or_super" ON public.org_custom_domains
  FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "domains_write_admin_or_super" ON public.org_custom_domains;
CREATE POLICY "domains_write_admin_or_super" ON public.org_custom_domains
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id) OR public.is_super_admin())
  WITH CHECK (public.is_org_admin(org_id) OR public.is_super_admin());

-- ============================================================
-- 5. org_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_audit_log_org_id_idx ON public.org_audit_log(org_id);
CREATE INDEX IF NOT EXISTS org_audit_log_created_at_idx ON public.org_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS org_audit_log_action_idx ON public.org_audit_log(action);

GRANT SELECT, INSERT ON public.org_audit_log TO authenticated;
GRANT ALL ON public.org_audit_log TO service_role;

ALTER TABLE public.org_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_admin_or_super" ON public.org_audit_log;
CREATE POLICY "audit_select_admin_or_super" ON public.org_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (org_id IS NOT NULL AND public.is_org_admin(org_id))
  );

DROP POLICY IF EXISTS "audit_insert_member_or_super" ON public.org_audit_log;
CREATE POLICY "audit_insert_member_or_super" ON public.org_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
  );

-- ============================================================
-- 6. org_impersonation_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_impersonation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  issued_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  consumer_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS imp_tokens_target_user_idx ON public.org_impersonation_tokens(target_user_id);
CREATE INDEX IF NOT EXISTS imp_tokens_expires_at_idx ON public.org_impersonation_tokens(expires_at);

GRANT SELECT, INSERT, UPDATE ON public.org_impersonation_tokens TO authenticated;
GRANT ALL ON public.org_impersonation_tokens TO service_role;

ALTER TABLE public.org_impersonation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "imp_select_super_only" ON public.org_impersonation_tokens;
CREATE POLICY "imp_select_super_only" ON public.org_impersonation_tokens
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR issued_by_user_id = auth.uid());

DROP POLICY IF EXISTS "imp_insert_super_only" ON public.org_impersonation_tokens;
CREATE POLICY "imp_insert_super_only" ON public.org_impersonation_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND issued_by_user_id = auth.uid());

DROP POLICY IF EXISTS "imp_update_super_only" ON public.org_impersonation_tokens;
CREATE POLICY "imp_update_super_only" ON public.org_impersonation_tokens
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
