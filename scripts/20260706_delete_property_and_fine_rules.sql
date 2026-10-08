-- 20260706_delete_property_and_fine_rules.sql
--
-- Run this in the Supabase SQL editor.
--
-- Fixes:
--   1. Registration > Properties: allow deleting properties (their units are
--      stored inside the properties.units jsonb column, so deleting the row
--      permanently removes all units too).
--   2. Tenants > Fines & Penalties: make delete permanent. The previous RLS
--      policy required app.is_admin(auth.uid()), so non-admin operators saw
--      the fine reappear on reload. We add SECURITY DEFINER RPCs and a
--      permissive delete policy for authenticated users.

-- ============================================================
-- 1. PROPERTIES delete policies (units are jsonb, no cascade needed)
-- ============================================================

-- Full RMS
drop policy if exists "properties_delete_own"   on public.properties;
drop policy if exists "properties_delete_admin" on public.properties;

create policy "properties_delete_own"
on public.properties for delete to authenticated
using (created_by = auth.uid());

create policy "properties_delete_admin"
on public.properties for delete to authenticated
using (app.is_admin(auth.uid()));

-- Partial RMS
alter table if exists public.partial_properties enable row level security;

drop policy if exists "partial_properties_delete_own"   on public.partial_properties;
drop policy if exists "partial_properties_delete_admin" on public.partial_properties;

create policy "partial_properties_delete_own"
on public.partial_properties for delete to authenticated
using (created_by = auth.uid());

create policy "partial_properties_delete_admin"
on public.partial_properties for delete to authenticated
using (app.is_admin(auth.uid()));

grant delete on public.properties         to authenticated;
grant delete on public.partial_properties to authenticated;

-- ============================================================
-- 2. FINE RULES — SECURITY DEFINER delete RPCs + permissive delete policy
-- ============================================================

-- Full RMS RPC (called as supabase.schema('app').rpc('delete_fine_rule', ...))
create or replace function app.delete_fine_rule(p_id text)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from public.fine_rules where id = p_id;
end;
$$;
grant execute on function app.delete_fine_rule(text) to authenticated, service_role;

-- Partial RMS RPC exposed in public (called as supabase.rpc('delete_partial_fine_rule', ...))
create or replace function public.delete_partial_fine_rule(p_id text)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  delete from public.partial_fine_rules where id = p_id;
end;
$$;
grant execute on function public.delete_partial_fine_rule(text) to authenticated, service_role;

-- Loosen direct-table delete so the client fallback path also works.
drop policy if exists fine_rules_delete_authenticated         on public.fine_rules;
create policy fine_rules_delete_authenticated
on public.fine_rules for delete to authenticated using (true);

alter table if exists public.partial_fine_rules enable row level security;
drop policy if exists partial_fine_rules_delete_authenticated on public.partial_fine_rules;
create policy partial_fine_rules_delete_authenticated
on public.partial_fine_rules for delete to authenticated using (true);

grant delete on public.fine_rules         to authenticated;
grant delete on public.partial_fine_rules to authenticated;
