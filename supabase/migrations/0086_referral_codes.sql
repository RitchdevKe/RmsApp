-- Add referral_code columns and backfill deterministic codes for tenants, landlords/affiliates, vendors (contractors), and staff (field agents)
-- Deterministic short code mirrors frontend generateUserReferralCode logic:
--   prefix: first-name uppercase letters (3 chars, padded with X)
--   suffix: base36 hash of id (mod 36^3), 3 chars uppercase

begin;

-- 1) Ensure columns exist
alter table if exists public.tenants       add column if not exists referral_code text;
alter table if exists public.landlords     add column if not exists referral_code text;
alter table if exists public.vendors       add column if not exists referral_code text;
alter table if exists app.staff_profiles   add column if not exists referral_code text;

-- 2) Helper function in app schema (drop at end)
create or replace function app.compute_referral(p_name text, p_id text)
returns text
language plpgsql
as $$
declare
    digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    prefix_raw text;
    prefix     text;
    key        text := replace(coalesce(p_id, ''), '-', '');
    hash_val   int := 0;
    suffix     text := '';
    n          int;
    c          text;
begin
    prefix_raw := upper(regexp_replace(split_part(coalesce(p_name, ''), ' ', 1), '[^A-Z]', '', 'g'));
    prefix := substring(prefix_raw || 'XXX', 1, 3);

    if key <> '' then
        for i in 1..length(key) loop
            c := substring(key from i for 1);
            hash_val := (hash_val * 31 + ascii(c)) % 46656;
        end loop;
    end if;

    n := hash_val;
    for i in 1..3 loop
        suffix := substr(digits, (n % 36) + 1, 1) || suffix;
        n := n / 36;
    end loop;

    return prefix || suffix;
end;
$$;

-- 3) Backfill deterministically
update public.tenants
   set referral_code = app.compute_referral(name, id::text)
 where coalesce(referral_code, '') = '';

update public.landlords
   set referral_code = app.compute_referral(name, id::text)
 where coalesce(referral_code, '') = '';

update public.vendors
   set referral_code = app.compute_referral(name, id::text)
 where coalesce(referral_code, '') = '';

update app.staff_profiles
   set referral_code = app.compute_referral(name, id::text)
 where coalesce(referral_code, '') = '';

-- 4) Clean up helper
drop function if exists app.compute_referral(text, text);

commit;
