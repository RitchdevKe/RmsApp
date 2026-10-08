-- Migration 0083: allow C2B auto-match for Pending/PendingPayment tenants
--
-- Problem: find_active_tenant_by_unit_tag() joined on t.status = 'Active' only.
-- A tenant in PendingPayment or Pending status who pays via C2B with the correct
-- unit tag received no auto-match → payment landed in the unmatched (reconciliation)
-- queue instead of being credited to the tenant.
--
-- Fix: expand the status filter to include all "in-tenancy" statuses so that
-- pending tenants are auto-matched just like active ones.

drop function if exists public.find_active_tenant_by_unit_tag(text);

create function public.find_active_tenant_by_unit_tag(p_tag text)
returns table (
  property_id text,
  unit_id     text,
  unit_tag    text,
  tenant_id   text,
  tenant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with matched_unit as (
    select
      p.id as property_id,
      u->>'id' as unit_id,
      u->>'unitTag' as unit_tag
    from public.properties p,
         jsonb_array_elements(coalesce(p.units, '[]'::jsonb)) u
    where upper(btrim(u->>'unitTag')) = upper(btrim(p_tag))
    limit 1
  )
  select
    mu.property_id,
    mu.unit_id,
    mu.unit_tag,
    t.id as tenant_id,
    t.name as tenant_name
  from matched_unit mu
  left join public.tenants t
    on t.unit_id = mu.unit_id
   and t.status in ('Active', 'Overdue', 'PendingPayment', 'Pending', 'Notice')
  order by
    -- Prefer fully-active tenants when multiple rows exist for a unit
    case t.status
      when 'Active'         then 1
      when 'Overdue'        then 2
      when 'Notice'         then 3
      when 'PendingPayment' then 4
      when 'Pending'        then 5
      else 6
    end
  limit 1;
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text)
  to anon, authenticated, service_role;
