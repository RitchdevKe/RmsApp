-- supabase/migrations/0031_fix_unit_tag_matching.sql
--
-- Problem: find_active_tenant_by_unit_tag only matched units that have an
-- explicit `unitTag` field in the properties.units JSONB. When a unit was
-- created without a unitTag (but with a name like "INCA/13"), C2B payments
-- whose BillRefNumber = "INCA/13" were never reconciled even though the
-- front-end correctly displayed "INCA/13" as the Payment Account (via the
-- tenant.unit fallback). The two sides were disconnected.
--
-- Fix: extend matching to three tiers, tried in order, stopping at first hit:
--   1. u->>'unitTag'  — dedicated Safaricom account reference (existing logic)
--   2. u->>'name'     — unit name field in the properties.units JSONB
--   3. tenants.unit   — the unit name stored on the tenant row directly
--
-- Also fix: previously only 'Active' tenants were matched; Overdue tenants
-- should be matched too so their payments are auto-reconciled.
--
-- NOTE: written as a pure `language sql` CTE to avoid PL/pgSQL
-- `SELECT ... INTO`, which the Supabase SQL Editor misparses as
-- PostgreSQL's `SELECT INTO tablename` DDL (error 42P01).

create or replace function public.find_active_tenant_by_unit_tag(p_tag text)
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
  -- Tier 3: tenant.unit column — the exact value the UI shows as Payment
  -- Account when no unitTag is set on the unit object.
  tier3 as (
    select
      null::text as property_id,
      t.unit_id  as unit_id,
      t.unit     as resolved_tag,
      3          as prio
    from public.tenants t
    where upper(btrim(t.unit)) = upper(btrim(p_tag))
      and t.status in ('Active', 'Overdue')
      and t.unit_id is not null
    limit 1
  ),
  -- Pick the highest-priority (lowest prio number) matching unit.
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
  -- Join winning unit to its active/overdue tenant.
  select
    bu.property_id,
    bu.unit_id,
    bu.resolved_tag as unit_tag,
    t.id            as tenant_id,
    t.name          as tenant_name
  from best_unit bu
  left join public.tenants t
         on t.unit_id = bu.unit_id
        and t.status in ('Active', 'Overdue')
  limit 1
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text)
  to anon, authenticated, service_role;
