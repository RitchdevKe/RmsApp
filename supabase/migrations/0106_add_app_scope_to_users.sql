-- Add app_scope to user tables

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS app_scope VARCHAR;
ALTER TABLE public.partial_tenants ADD COLUMN IF NOT EXISTS app_scope VARCHAR;

ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS app_scope VARCHAR;
ALTER TABLE public.partial_landlords ADD COLUMN IF NOT EXISTS app_scope VARCHAR;

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS app_scope VARCHAR;
ALTER TABLE public.partial_vendors ADD COLUMN IF NOT EXISTS app_scope VARCHAR;

ALTER TABLE public.renovation_investors ADD COLUMN IF NOT EXISTS app_scope VARCHAR;
ALTER TABLE public.partial_renovation_investors ADD COLUMN IF NOT EXISTS app_scope VARCHAR;

ALTER TABLE app.staff_profiles ADD COLUMN IF NOT EXISTS app_scope VARCHAR;
ALTER TABLE app.partial_staff_profiles ADD COLUMN IF NOT EXISTS app_scope VARCHAR;

-- Update load and upsert functions for landlords
CREATE OR REPLACE FUNCTION app.load_landlords() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb) FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
      'id',             l.id,
      'name',           l.name,
      'username',       l.username,
      'email',          l.email,
      'phone',          l.phone,
      'idNumber',       l.id_number,
      'kraPin',         l.kra_pin,
      'role',           l.role,
      'status',         l.status,
      'branch',         l.branch,
      'avatarUrl',      l.avatar_url,
      'referrerId',     l.referrer_id,
      'referralConfig', l.referral_config,
      'appScope',       l.app_scope
    )) as row
    FROM public.landlords l ORDER BY l.created_at ASC
  ) sub;
$$;

CREATE OR REPLACE FUNCTION app.partial_load_landlords() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb) FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
      'id',             l.id,
      'name',           l.name,
      'username',       l.username,
      'email',          l.email,
      'phone',          l.phone,
      'idNumber',       l.id_number,
      'kraPin',         l.kra_pin,
      'role',           l.role,
      'status',         l.status,
      'branch',         l.branch,
      'avatarUrl',      l.avatar_url,
      'referrerId',     l.referrer_id,
      'referralConfig', l.referral_config,
      'appScope',       l.app_scope
    )) as row
    FROM public.partial_landlords l ORDER BY l.created_at ASC
  ) sub;
$$;

CREATE OR REPLACE FUNCTION app.upsert_landlord(p_landlord jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_id text := p_landlord->>'id';
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'landlord.id is required'; END IF;
  INSERT INTO public.landlords (
    id, created_by, name, username, email, phone, id_number,
    kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_scope, updated_at
  ) VALUES (
    v_id, auth.uid(), COALESCE(p_landlord->>'name', '(unnamed)'), p_landlord->>'username',
    COALESCE(p_landlord->>'email', ''), p_landlord->>'phone', p_landlord->>'idNumber',
    p_landlord->>'kraPin', p_landlord->>'role', COALESCE(p_landlord->>'status', 'Active'),
    p_landlord->>'branch', p_landlord->>'avatarUrl', p_landlord->>'referrerId', p_landlord->'referralConfig',
    p_landlord->>'appScope', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, username = EXCLUDED.username, email = EXCLUDED.email, phone = EXCLUDED.phone,
    id_number = EXCLUDED.id_number, kra_pin = EXCLUDED.kra_pin, role = EXCLUDED.role, status = EXCLUDED.status,
    branch = EXCLUDED.branch, avatar_url = EXCLUDED.avatar_url, referrer_id = EXCLUDED.referrer_id,
    referral_config = EXCLUDED.referral_config, app_scope = COALESCE(EXCLUDED.app_scope, public.landlords.app_scope), updated_at = now();
  RETURN p_landlord;
END;
$$;

CREATE OR REPLACE FUNCTION app.partial_upsert_landlord(p_landlord jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_id text := p_landlord->>'id';
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'landlord.id is required'; END IF;
  INSERT INTO public.partial_landlords (
    id, created_by, name, username, email, phone, id_number,
    kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, app_scope, updated_at
  ) VALUES (
    v_id, auth.uid(), COALESCE(p_landlord->>'name', '(unnamed)'), p_landlord->>'username',
    COALESCE(p_landlord->>'email', ''), p_landlord->>'phone', p_landlord->>'idNumber',
    p_landlord->>'kraPin', p_landlord->>'role', COALESCE(p_landlord->>'status', 'Active'),
    p_landlord->>'branch', p_landlord->>'avatarUrl', p_landlord->>'referrerId', p_landlord->'referralConfig',
    p_landlord->>'appScope', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, username = EXCLUDED.username, email = EXCLUDED.email, phone = EXCLUDED.phone,
    id_number = EXCLUDED.id_number, kra_pin = EXCLUDED.kra_pin, role = EXCLUDED.role, status = EXCLUDED.status,
    branch = EXCLUDED.branch, avatar_url = EXCLUDED.avatar_url, referrer_id = EXCLUDED.referrer_id,
    referral_config = EXCLUDED.referral_config, app_scope = COALESCE(EXCLUDED.app_scope, public.partial_landlords.app_scope), updated_at = now();
  RETURN p_landlord;
END;
$$;

