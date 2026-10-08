
-- Auto-promote jose.mfavour@gmail.com to Integral super-admin on signup
CREATE OR REPLACE FUNCTION public.auto_grant_integral_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_integral_id uuid;
BEGIN
  IF lower(NEW.email) = 'jose.mfavour@gmail.com' THEN
    SELECT id INTO v_integral_id FROM public.organizations WHERE tier = 'integral' LIMIT 1;
    IF v_integral_id IS NOT NULL THEN
      INSERT INTO public.org_members (org_id, user_id, role)
      VALUES (v_integral_id, NEW.id, 'owner')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.org_audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
      VALUES (v_integral_id, NEW.id, 'super_admin_auto_granted', 'org_member', NEW.id::text,
        jsonb_build_object('email', NEW.email));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_grant_integral_super_admin_trg ON auth.users;
CREATE TRIGGER auto_grant_integral_super_admin_trg
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_grant_integral_super_admin();

-- In case the user already exists, grant now
DO $$
DECLARE
  v_uid uuid;
  v_integral_id uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'jose.mfavour@gmail.com' LIMIT 1;
  SELECT id INTO v_integral_id FROM public.organizations WHERE tier = 'integral' LIMIT 1;
  IF v_uid IS NOT NULL AND v_integral_id IS NOT NULL THEN
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_integral_id, v_uid, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
