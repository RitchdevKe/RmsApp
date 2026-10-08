
-- 1. Bootstrap super-admin: first signed-in user becomes Integral owner if Integral has no members.
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_integral_id uuid;
  v_user_id uuid := auth.uid();
  v_existing int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_integral_id FROM public.organizations WHERE tier = 'integral' LIMIT 1;
  IF v_integral_id IS NULL THEN
    RAISE EXCEPTION 'Integral organization not seeded';
  END IF;

  SELECT count(*) INTO v_existing FROM public.org_members WHERE org_id = v_integral_id;

  IF v_existing = 0 THEN
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_integral_id, v_user_id, 'owner');

    INSERT INTO public.org_audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (v_integral_id, v_user_id, 'super_admin_bootstrapped', 'org_member', v_user_id::text, '{}'::jsonb);
  ELSE
    -- Idempotent: if already a member, do nothing; otherwise refuse.
    IF NOT EXISTS (
      SELECT 1 FROM public.org_members WHERE org_id = v_integral_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Integral super-admin already claimed';
    END IF;
  END IF;

  RETURN v_integral_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin() TO authenticated;

-- 2. Create org (super-admin only) and seed first owner.
CREATE OR REPLACE FUNCTION public.create_organization(
  _name text,
  _slug text,
  _tier org_tier,
  _primary_subdomain text,
  _branding jsonb DEFAULT '{}'::jsonb,
  _mpesa_shortcode text DEFAULT NULL,
  _mpesa_callback_secret text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super-admins can create organizations';
  END IF;

  INSERT INTO public.organizations (name, slug, tier, primary_subdomain, branding, mpesa_shortcode, mpesa_callback_secret)
  VALUES (_name, _slug, _tier, _primary_subdomain, COALESCE(_branding, '{}'::jsonb), _mpesa_shortcode, _mpesa_callback_secret)
  RETURNING id INTO v_org_id;

  INSERT INTO public.org_audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_org_id, auth.uid(), 'org_created', 'organization', v_org_id::text,
    jsonb_build_object('tier', _tier, 'slug', _slug));

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(text, text, org_tier, text, jsonb, text, text) TO authenticated;

-- 3. Accept invitation: consume token and add user to org.
CREATE OR REPLACE FUNCTION public.accept_org_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.org_invitations%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_user_email text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite FROM public.org_invitations
  WHERE accept_token = _token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation invalid or expired';
  END IF;

  IF lower(v_invite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'Invitation email mismatch';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, invited_by)
  VALUES (v_invite.org_id, v_user_id, v_invite.role, v_invite.invited_by)
  ON CONFLICT DO NOTHING;

  UPDATE public.org_invitations SET status = 'accepted', accepted_at = now() WHERE id = v_invite.id;

  INSERT INTO public.org_audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_invite.org_id, v_user_id, 'invitation_accepted', 'org_member', v_user_id::text,
    jsonb_build_object('role', v_invite.role));

  RETURN v_invite.org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(text) TO authenticated;

-- 4. Resolve org by Mpesa shortcode (used by edge function via service role; also safe for super-admins).
CREATE OR REPLACE FUNCTION public.resolve_org_by_shortcode(_shortcode text)
RETURNS TABLE(id uuid, slug text, name text, tier org_tier, status org_status)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name, o.tier, o.status
  FROM public.organizations o
  WHERE o.mpesa_shortcode = _shortcode
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_org_by_shortcode(text) TO authenticated, service_role, anon;

-- 5. Suspend / reactivate (super-admin only)
CREATE OR REPLACE FUNCTION public.set_organization_status(_org_id uuid, _status org_status, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super-admins can change org status';
  END IF;

  UPDATE public.organizations SET status = _status, suspend_reason = _reason WHERE id = _org_id;

  INSERT INTO public.org_audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (_org_id, auth.uid(), 'org_status_changed', 'organization', _org_id::text,
    jsonb_build_object('status', _status, 'reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_organization_status(uuid, org_status, text) TO authenticated;
