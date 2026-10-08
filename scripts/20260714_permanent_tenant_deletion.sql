-- 20260714_permanent_tenant_deletion.sql
--
-- Run this in the Supabase SQL editor.
--
-- Problem
-- --------
-- Deleting a tenant from Registration → Users → Tenants removed the row from
-- the UI but the tenant reappeared after a reload. Two root causes:
--
--   1. app.delete_tenant() only removed the row from public.tenants. Any copy
--      still living in public.partial_tenants, public.tenant_applications or
--      public.partial_tenant_applications was left behind, so the next batch
--      load / "re-hydrate pending applicant" effect resurrected the tenant.
--   2. RLS on the *_applications tables blocked DELETE for non-admin operators,
--      so the client-side delete silently failed.
--
-- Fix
-- ----
--   • Rewrite app.delete_tenant(p_id text) to delete the tenant row AND every
--     linked application/partial record in a single SECURITY DEFINER call.
--   • Add matching authenticated DELETE policies + grants so direct client
--     deletes (used as a fallback) also work.
--
-- This migration is idempotent: it is safe to run more than once.

-- ============================================================
-- 1. Permanent delete RPC (single source of truth)
-- ============================================================

create or replace function app.delete_tenant(p_id text)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  -- Full RMS tenant row
  delete from public.tenants                    where id = p_id;
  -- Partial RMS tenant row (same id space)
  delete from public.partial_tenants            where id = p_id;
  -- Tenant application rows keyed by the same id (so the re-hydrate
  -- effect on the client can't re-create the tenant on reload)
  delete from public.tenant_applications        where id = p_id;
  delete from public.partial_tenant_applications where id = p_id;
end;
$$;

grant execute on function app.delete_tenant(text) to authenticated, service_role;

-- ============================================================
-- 2. Permissive DELETE policies + grants for the client fallback path
-- ============================================================

-- Tenants
alter table if exists public.tenants                    enable row level security;
alter table if exists public.partial_tenants            enable row level security;
alter table if exists public.tenant_applications        enable row level security;
alter table if exists public.partial_tenant_applications enable row level security;

drop policy if exists tenants_delete_authenticated                    on public.tenants;
create policy tenants_delete_authenticated
on public.tenants for delete to authenticated using (true);

drop policy if exists partial_tenants_delete_authenticated            on public.partial_tenants;
create policy partial_tenants_delete_authenticated
on public.partial_tenants for delete to authenticated using (true);

drop policy if exists tenant_applications_delete_authenticated        on public.tenant_applications;
create policy tenant_applications_delete_authenticated
on public.tenant_applications for delete to authenticated using (true);

drop policy if exists partial_tenant_applications_delete_authenticated on public.partial_tenant_applications;
create policy partial_tenant_applications_delete_authenticated
on public.partial_tenant_applications for delete to authenticated using (true);

grant delete on public.tenants                    to authenticated;
grant delete on public.partial_tenants            to authenticated;
grant delete on public.tenant_applications        to authenticated;
grant delete on public.partial_tenant_applications to authenticated;
