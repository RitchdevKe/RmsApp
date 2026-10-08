
-- Seed Integral super-admin org
INSERT INTO public.organizations (slug, name, tier, status, primary_subdomain, branding, feature_flags)
VALUES (
  'integral',
  'Integral (Super Admin)',
  'integral',
  'active',
  'integral.task-me.ke',
  '{"app_name":"Integral","primary_color":"#0F172A","logo_url":null}'::jsonb,
  '{"all_modules":true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Seed TaskMe Realty (the existing Agency app)
INSERT INTO public.organizations (slug, name, tier, status, primary_subdomain, branding, feature_flags)
VALUES (
  'taskme-realty',
  'TaskMe Realty',
  'agency',
  'active',
  'app.task-me.ke',
  '{"app_name":"TaskMe Realty","primary_color":"#0F172A","logo_url":null}'::jsonb,
  '{"all_modules":true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Public host resolver — returns ONLY safe branding fields, no secrets.
-- Anyone (including anon) can call this so the login page knows which org
-- it's branding for before the user signs in.
CREATE OR REPLACE FUNCTION public.resolve_org_by_host(_host text)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  tier public.org_tier,
  status public.org_status,
  primary_subdomain text,
  branding jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name, o.tier, o.status, o.primary_subdomain, o.branding
  FROM public.organizations o
  WHERE lower(o.primary_subdomain) = lower(_host)
     OR EXISTS (
       SELECT 1 FROM public.org_custom_domains d
       WHERE lower(d.domain) = lower(_host) AND d.status = 'verified' AND d.org_id = o.id
     )
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_org_by_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_org_by_host(text) TO anon, authenticated, service_role;
