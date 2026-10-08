alter table public.tenants drop constraint if exists tenants_status_check;

alter table public.tenants
  add constraint tenants_status_check check (status in (
    'PendingApproval',
    'PendingAllocation',
    'PendingPayment',
    'Active',
    'Overdue',
    'Notice',
    'Vacated',
    'Evicted',
    'Blacklisted',
    'Inactive',
    'Pending'
  ));

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
   and t.status in ('Active', 'Overdue', 'PendingPayment', 'PendingApproval', 'Pending', 'Notice')
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
  limit 1;
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text)
  to anon, authenticated, service_role;
