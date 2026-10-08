-- 0099_restore_unit_tag_multitier_matching.sql
--
-- Run this in your Supabase SQL Editor (project xdaznrwcitsuwlvwxojp) to fix
-- the bug where Mpesa STK push payments stop attaching to the tenant and
-- pile up in Payments → Reconciliation → External Unmatched.
--
-- Root cause:
--   Migrations 0083 and 0089 dropped tiers 2 & 3 from
--   find_active_tenant_by_unit_tag(p_tag) that 0031 introduced. The function
--   now only matches when u->>'unitTag' is set on the unit JSONB. Units that
--   show e.g. "OCK/02" as the Payment Account via the tenant.unit fallback
--   are never matched, so the C2B confirmation lands without a tenant.
--
-- Fix:
--   Restore three-tier matching (unitTag → unit.name → tenants.unit) while
--   keeping the broader status set so PendingPayment / PendingApproval /
--   Pending tenants (first-time payers) are auto-matched too.

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
  with
  -- Tier 1: explicit unitTag field in the unit JSONB object.
  tier1 as (
    select
      p.id          as property_id,
      u->>'id'      as unit_id,
      u->>'unitTag' as resolved_tag,
      1             as prio
    from public.properties p,
         jsonb_array_elements(coalesce(p.units, '[]'::jsonb)) u
    where upper(btrim(u->>'unitTag')) = upper(btrim(p_tag))
    limit 1
  ),
  -- Tier 2: unit name field when unitTag is absent or empty.
  tier2 as (
    select
      p.id       as property_id,
      u->>'id'   as unit_id,
      u->>'name' as resolved_tag,
      2          as prio
    from public.properties p,
         jsonb_array_elements(coalesce(p.units, '[]'::jsonb)) u
    where upper(btrim(u->>'name')) = upper(btrim(p_tag))
      and (u->>'unitTag' is null or btrim(u->>'unitTag') = '')
    limit 1
  ),
  -- Tier 3: tenant.unit column — the exact value the UI shows as
  -- Payment Account when no unitTag is set on the unit object.
  tier3 as (
    select
      null::text as property_id,
      t.unit_id  as unit_id,
      t.unit     as resolved_tag,
      3          as prio
    from public.tenants t
    where upper(btrim(t.unit)) = upper(btrim(p_tag))
      and t.status in ('Active', 'Overdue', 'Notice', 'PendingPayment', 'PendingApproval', 'Pending')
      and t.unit_id is not null
    limit 1
  ),
  best_unit as (
    select property_id, unit_id, resolved_tag
    from (
      select property_id, unit_id, resolved_tag, prio from tier1
      union all
      select property_id, unit_id, resolved_tag, prio from tier2
      union all
      select property_id, unit_id, resolved_tag, prio from tier3
    ) combined
    order by prio
    limit 1
  )
  select
    bu.property_id,
    bu.unit_id,
    bu.resolved_tag as unit_tag,
    t.id            as tenant_id,
    t.name          as tenant_name
  from best_unit bu
  left join public.tenants t
         on t.unit_id = bu.unit_id
        and t.status in ('Active', 'Overdue', 'Notice', 'PendingPayment', 'PendingApproval', 'Pending')
  order by
    case t.status
      when 'Active'          then 1
      when 'Overdue'         then 2
      when 'Notice'          then 3
      when 'PendingPayment'  then 4
      when 'PendingApproval' then 5
      when 'Pending'         then 6
      else 7
    end
  limit 1
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text)
  to anon, authenticated, service_role;

-- Optional: spot-check by running this with one of your unit names. It
-- should return a tenant row (not empty) when the tenant is in-tenancy.
-- select * from public.find_active_tenant_by_unit_tag('OCK/02');
