-- Migration to grant execute on load_system_settings to unauthenticated visitors (anon role)
-- This allows the login and sign-up pages to display the correct company branding (logo, name, etc.)
-- when there is no active session yet.

GRANT EXECUTE ON FUNCTION app.load_system_settings() TO anon;
GRANT EXECUTE ON FUNCTION app.partial_load_system_settings() TO anon;
