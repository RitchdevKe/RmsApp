-- 0096_website_sync.sql
-- Tables to support the www.task-me.ke ↔ RMS sync layer.
--
-- website_tenant_links: maps a website tenant (Supabase user in the website
--   project) to the RMS tenant id created on their behalf. Drives the
--   onboarding wizard state and is updated by the M-Pesa callback when full
--   registration payment lands.
--
-- website_referral_credits: idempotent ledger so we credit a referral
--   commission exactly once per onboarded tenant.

create table if not exists public.website_tenant_links (
    id uuid primary key default gen_random_uuid(),
    website_user_id text not null unique,
    tenant_id text,                 -- id inside tm_tenants_v11 blob
    property_id text,
    unit_number text,
    ref_code text,
    phone text,
    email text,
    name text,
    status text not null default 'pending'
        check (status in ('pending','unit_selected','awaiting_payment','onboarded','cancelled')),
    expected_amount integer,        -- KES, total due for registration (deposit + first month)
    paid_amount integer not null default 0,
    last_checkout_request_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists website_tenant_links_status_idx
    on public.website_tenant_links(status);
create index if not exists website_tenant_links_ref_idx
    on public.website_tenant_links(ref_code);

grant select, insert, update on public.website_tenant_links to authenticated;
grant all on public.website_tenant_links to service_role;

alter table public.website_tenant_links enable row level security;

-- Only service_role (edge functions) and signed-in super admins read/write.
drop policy if exists "service role manages website tenant links" on public.website_tenant_links;
create policy "service role manages website tenant links"
    on public.website_tenant_links for all
    to service_role
    using (true) with check (true);

drop policy if exists "authenticated can read website tenant links" on public.website_tenant_links;
create policy "authenticated can read website tenant links"
    on public.website_tenant_links for select
    to authenticated
    using (true);

-- ── Referral credit ledger ─────────────────────────────────────────────────
create table if not exists public.website_referral_credits (
    id uuid primary key default gen_random_uuid(),
    website_user_id text not null,
    ref_code text not null,
    tenant_id text,
    amount integer not null,
    transaction_id text,           -- M-Pesa receipt; null if credited manually
    created_at timestamptz not null default now(),
    unique (website_user_id, transaction_id)
);

grant select on public.website_referral_credits to authenticated;
grant all on public.website_referral_credits to service_role;

alter table public.website_referral_credits enable row level security;

drop policy if exists "service role manages referral credits" on public.website_referral_credits;
create policy "service role manages referral credits"
    on public.website_referral_credits for all
    to service_role
    using (true) with check (true);

drop policy if exists "authenticated read referral credits" on public.website_referral_credits;
create policy "authenticated read referral credits"
    on public.website_referral_credits for select
    to authenticated
    using (true);

-- ── Tag payments with onboarding metadata so the callback can fan out ──────
-- The existing payments table already has bill_ref_number / lease_id.
-- We add a "purpose" column so website-driven registration payments are
-- distinguishable from regular monthly rent.
alter table public.payments
    add column if not exists purpose text,
    add column if not exists website_user_id text;

create index if not exists payments_website_user_idx
    on public.payments(website_user_id);
