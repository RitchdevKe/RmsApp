-- supabase/migrations/0092_auto_confirm_users.sql
-- Fixes authentication issues where users (e.g. Zablon and self-registering tenants)
-- are unable to log in because Supabase requires email confirmation, but the app
-- expects auto-confirmation to be enabled. 

-- 1. Retrospectively confirm all existing users who missed the confirmation step
UPDATE auth.users
   SET email_confirmed_at = coalesce(email_confirmed_at, now())
 WHERE email_confirmed_at IS NULL;

-- 2. Create a trigger to automatically confirm all future signups instantly
CREATE OR REPLACE FUNCTION public.auto_confirm_new_users()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;

-- We MUST use BEFORE INSERT so that the row is saved with email_confirmed_at
CREATE TRIGGER on_auth_user_created_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_new_users();
