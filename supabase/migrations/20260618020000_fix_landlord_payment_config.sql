-- 1) Re-define app.partial_load_landlords() to return payment_config
CREATE OR REPLACE FUNCTION app.partial_load_landlords()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from (
    select jsonb_strip_nulls(jsonb_build_object(
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
      'payment_config', l.payment_config, 
      'appScope',       l.app_source
    )) as row
    from public.partial_landlords l
    order by l.created_at asc
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.partial_load_landlords TO authenticated, service_role;

-- 2) Re-define app.partial_upsert_landlord(...) to persist payment_config
CREATE OR REPLACE FUNCTION app.partial_upsert_landlord(p_landlord jsonb)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = app, public 
AS $$
declare 
  v_id text := p_landlord->>'id';
begin
  if v_id is null then raise exception 'landlord.id is required'; end if;
  insert into public.partial_landlords (
    id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, payment_config, app_source, updated_at
  ) values (
    v_id, 
    auth.uid(), 
    coalesce(p_landlord->>'name', '(unnamed)'), 
    p_landlord->>'username', 
    coalesce(p_landlord->>'email', ''),
    p_landlord->>'phone', 
    p_landlord->>'idNumber', 
    p_landlord->>'kraPin', 
    p_landlord->>'role', 
    coalesce(p_landlord->>'status', 'Active'),
    p_landlord->>'branch', 
    p_landlord->>'avatarUrl', 
    p_landlord->>'referrerId', 
    p_landlord->'referralConfig', 
    p_landlord->'payment_config', 
    coalesce(p_landlord->>'appScope', 'full'), 
    now()
  ) on conflict (id) do update set
    name = excluded.name, 
    username = excluded.username, 
    email = excluded.email, 
    phone = excluded.phone, 
    id_number = excluded.id_number,
    kra_pin = excluded.kra_pin, 
    role = excluded.role, 
    status = excluded.status, 
    branch = excluded.branch, 
    avatar_url = excluded.avatar_url,
    referrer_id = excluded.referrer_id, 
    referral_config = excluded.referral_config, 
    payment_config = excluded.payment_config, 
    app_source = excluded.app_source, 
    updated_at = now();
  return p_landlord;
end;
$$;
GRANT EXECUTE ON FUNCTION app.partial_upsert_landlord(jsonb) TO authenticated, service_role;

-- 3) Re-define app.load_landlords() to include payment_config
CREATE OR REPLACE FUNCTION app.load_landlords()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(JSONB_AGG(row), '[]'::jsonb) FROM (
    SELECT JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
      'id',             id,
      'name',           name,
      'username',       username,
      'email',          email,
      'phone',          phone,
      'idNumber',       id_number,
      'kraPin',         kra_pin,
      'role',           role,
      'status',         status,
      'branch',         branch,
      'avatarUrl',      avatar_url,
      'referrerId',     referrer_id,
      'referralConfig', referral_config,
      'payment_config', payment_config,
      'appScope',       app_scope
    )) as row
    FROM (
      SELECT DISTINCT ON (id)
        id, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, referrer_id, referral_config, payment_config, app_scope, created_at
      FROM (
        SELECT 
          l.id, l.name, l.username, l.email, l.phone, l.id_number, l.kra_pin, l.role, l.status, l.branch, l.avatar_url, l.referrer_id, l.referral_config, l.payment_config,
          COALESCE(l.app_scope, l.app_source, 'Full') as app_scope, coalesce(l.created_at, now()) as created_at
        FROM public.landlords l
        UNION ALL
        SELECT 
          pl.id, pl.name, pl.username, pl.email, pl.phone, pl.id_number, pl.kra_pin, pl.role, pl.status, pl.branch, pl.avatar_url, pl.referrer_id, pl.referral_config, pl.payment_config,
          COALESCE(pl.app_source, 'Full') as app_scope, coalesce(pl.created_at, now()) as created_at
        FROM public.partial_landlords pl
        WHERE LOWER(COALESCE(pl.app_source, 'Full')) IN ('full', 'both', 'full rms')
      ) raw_union
      ORDER BY id, created_at ASC
    ) distinct_union
    ORDER BY created_at ASC
  ) sub;
$$;
GRANT EXECUTE ON FUNCTION app.load_landlords() TO authenticated, service_role;
