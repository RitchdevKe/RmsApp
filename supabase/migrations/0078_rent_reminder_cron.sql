-- 0078_rent_reminder_cron.sql
-- Sets up pg_cron jobs to trigger the scheduled-rent-reminders Edge Function.
--
-- Prerequisites:
--   1. pg_cron extension enabled (Supabase Dashboard → Extensions → pg_cron)
--   2. pg_net extension enabled (for net.http_post)
--   3. SUPABASE_EDGE_FUNCTION_BASE_URL env var set to your project's function URL
--      e.g. https://<project-ref>.supabase.co/functions/v1
--   4. SUPABASE_ANON_KEY or a Service Key configured for the HTTP call
--
-- Cron times are in UTC. EAT = UTC+3:
--   25th at 16:00 EAT = 25th at 13:00 UTC
--    1st at 09:00 EAT =  1st at 06:00 UTC
--    5th at 09:00 EAT =  5th at 06:00 UTC
--    7th at 09:00 EAT =  7th at 06:00 UTC
--
-- IMPORTANT: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below before applying.
-- Or manage cron jobs via Supabase Dashboard → Cron (Integrations).

-- Enable required extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previously registered jobs with the same names
select cron.unschedule(jobname)
from cron.job
where jobname in (
  'rent-reminder-25th',
  'rent-reminder-1st',
  'rent-reminder-5th',
  'rent-reminder-7th'
);

-- Helper: invoke the edge function for a specific day
-- We POST with {"day": N} so the function knows which template to use
-- even if the cron fires slightly off-schedule.

select cron.schedule(
  'rent-reminder-25th',
  '0 13 25 * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-rent-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{"day":25}'::jsonb
  );
  $$
);

select cron.schedule(
  'rent-reminder-1st',
  '0 6 1 * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-rent-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{"day":1}'::jsonb
  );
  $$
);

select cron.schedule(
  'rent-reminder-5th',
  '0 6 5 * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-rent-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{"day":5}'::jsonb
  );
  $$
);

select cron.schedule(
  'rent-reminder-7th',
  '0 6 7 * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-rent-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{"day":7}'::jsonb
  );
  $$
);
