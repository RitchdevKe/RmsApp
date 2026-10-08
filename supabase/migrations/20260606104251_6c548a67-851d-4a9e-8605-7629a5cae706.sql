
-- Lock search_path on current_org_id (was missing)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid;
$$;

-- Revoke broad EXECUTE from anon/public on our new helpers.
-- They're only meant to run inside RLS policies (where they execute as
-- security definer with the calling user's auth.uid()), so signed-out
-- API callers should never invoke them directly.
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_org_id()    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_id()    TO authenticated, service_role;
