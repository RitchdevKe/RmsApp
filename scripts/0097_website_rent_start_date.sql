-- 0097_website_rent_start_date.sql
-- Capture the tenant-chosen move-in / rent start date on the website link.
-- Used by the website wizard's prorated first-month calculation and stored
-- so the RMS posts the right rentStartDate on the tenant record at onboarding.

alter table public.website_tenant_links
    add column if not exists rent_start_date date;
