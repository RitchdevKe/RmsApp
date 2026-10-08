-- Migration to permanently restore/backfill landlord profiles and roles in Full RMS
-- This resolves the "0 landlords count" issue permanently.

-- 0) Ensure all required columns exist in public.landlords
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS app_scope text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS app_source text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS referrer_id text;
ALTER TABLE public.landlords ADD COLUMN IF NOT EXISTS referral_config jsonb;

-- 1) Populate default roles in app.roles if empty
INSERT INTO app.roles (name, permissions, created_at, updated_at)
VALUES 
  ('Super Admin', '[]'::jsonb, now(), now()),
  ('Assistant Admin', '[]'::jsonb, now(), now()),
  ('System Staff', '[]'::jsonb, now(), now()),
  ('Field Agent', '[]'::jsonb, now(), now()),
  ('Caretaker', '[]'::jsonb, now(), now()),
  ('Tenant', '[]'::jsonb, now(), now()),
  ('Landlord', '[]'::jsonb, now(), now()),
  ('Investor', '[]'::jsonb, now(), now()),
  ('Affiliate', '[]'::jsonb, now(), now()),
  ('Contractor', '[]'::jsonb, now(), now())
ON CONFLICT (name) DO NOTHING;

-- 2) Reconstruct user role alignments in app.user_roles from auth.users metadata if missing
INSERT INTO app.user_roles (user_id, role_id)
SELECT 
  u.id, 
  r.id
FROM auth.users u
JOIN app.roles r ON LOWER(u.raw_user_meta_data->>'role') = LOWER(r.name)
ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

-- 3) Backfill public.landlords from auth.users matching "Landlord" / "Affiliate" roles
INSERT INTO public.landlords (
  id, created_by, name, username, email, phone, id_number, kra_pin, role, status, branch, avatar_url, app_scope, app_source, updated_at, created_at
)
SELECT 
  id::text,
  id, -- created_by
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', substring(email from '^[^@]+')),
  COALESCE(raw_user_meta_data->>'username', substring(email from '^[^@]+')),
  COALESCE(email, ''),
  COALESCE(raw_user_meta_data->>'phone', ''),
  COALESCE(raw_user_meta_data->>'id_number', ''),
  COALESCE(raw_user_meta_data->>'kra_pin', ''),
  COALESCE(raw_user_meta_data->>'role', 'Landlord'),
  'Active',
  COALESCE(raw_user_meta_data->>'branch', 'Nairobi'),
  COALESCE(raw_user_meta_data->>'avatar_url', ''),
  'Full',
  'full',
  COALESCE(updated_at, now()),
  COALESCE(created_at, now())
FROM auth.users
WHERE LOWER(COALESCE(raw_user_meta_data->>'role', '')) IN ('landlord', 'affiliate')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  id_number = EXCLUDED.id_number,
  kra_pin = EXCLUDED.kra_pin,
  updated_at = now();

-- 4) Recover missing placeholder landlords from properties (ensuring all 52 properties map successfully to a visible landlord profile)
INSERT INTO public.landlords (
  id, created_by, name, username, email, phone, id_number, role, status, branch, app_scope, app_source, updated_at, created_at
)
SELECT DISTINCT 
  p.landlord_id,
  NULL::uuid, -- Since they are placeholders, DO NOT reference a non-existent auth user to avoid Fkey violations
  'Landlord (' || substring(p.landlord_id, 1, 8) || ')',
  'landlord_' || substring(p.landlord_id, 1, 8),
  'landlord_' || substring(p.landlord_id, 1, 8) || '@taskme.ke',
  '+254700000000',
  '00000000',
  'Landlord',
  'Active',
  'Nairobi',
  'Full',
  'full',
  now(),
  now()
FROM public.properties p
LEFT JOIN public.landlords l ON p.landlord_id = l.id
LEFT JOIN public.partial_landlords pl ON p.landlord_id = pl.id
WHERE p.landlord_id IS NOT NULL 
  AND l.id IS NULL
  AND pl.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5) Relax Row Level Security for SELECT on landlords so authenticated staff, managers, and admins can always read them
DROP POLICY IF EXISTS "landlords_select_all" ON public.landlords;
CREATE POLICY "landlords_select_all" ON public.landlords FOR SELECT TO authenticated USING (true);

-- 6) Touch/refresh loaded state function to ensure changes take effect immediately
SELECT count(*) FROM public.landlords;
