-- Permanent persistence + M-Pesa account matching repair (Full RMS).
-- Safe to run more than once.

-- Multi-occupancy fields must exist and round-trip through app.upsert_tenant.
alter table public.tenants add column if not exists occupancy_type text default 'Single';
alter table public.tenants add column if not exists main_tenant_id text;

-- Restore the complete matcher. Later migrations accidentally reduced matching
-- to properties.units[].unitTag only, excluding the unit number/name shown as
-- the Payment Account on many existing records.
drop function if exists public.find_active_tenant_by_unit_tag(text);

create function public.find_active_tenant_by_unit_tag(p_tag text)
returns table (
  property_id text,
  unit_id text,
  unit_tag text,
  tenant_id text,
  tenant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select regexp_replace(upper(btrim(coalesce(p_tag, ''))), '[^A-Z0-9]', '', 'g') as tag
  ),
  candidates as (
    -- Explicit unit payment account.
    select p.id property_id, u->>'id' unit_id, u->>'unitTag' resolved_tag, 1 priority
      from public.properties p
      cross join lateral jsonb_array_elements(coalesce(p.units, '[]'::jsonb)) u
      cross join input i
     where i.tag <> ''
       and regexp_replace(upper(btrim(coalesce(u->>'unitTag', ''))), '[^A-Z0-9]', '', 'g') = i.tag
    union all
    -- Unit number/name fallback.
    select p.id, u->>'id', coalesce(nullif(u->>'unitNumber', ''), u->>'name'), 2
      from public.properties p
      cross join lateral jsonb_array_elements(coalesce(p.units, '[]'::jsonb)) u
      cross join input i
     where i.tag <> '' and (
       regexp_replace(upper(btrim(coalesce(u->>'unitNumber', ''))), '[^A-Z0-9]', '', 'g') = i.tag
       or regexp_replace(upper(btrim(coalesce(u->>'name', ''))), '[^A-Z0-9]', '', 'g') = i.tag
     )
    union all
    -- Normalized tenant fallback for legacy units whose JSON has no unitTag.
    select t.property_id, t.unit_id, t.unit, 3
      from public.tenants t
      cross join input i
     where i.tag <> ''
       and regexp_replace(upper(btrim(coalesce(t.unit, ''))), '[^A-Z0-9]', '', 'g') = i.tag
       and t.status in ('Active','Overdue','Notice','PendingPayment')
       and t.unit_id is not null
  ),
  ranked as (
    select distinct on (c.unit_id) c.*
      from candidates c
     where c.unit_id is not null
     order by c.unit_id, c.priority
  )
  select r.property_id, r.unit_id, r.resolved_tag,
         t.id, t.name
    from ranked r
    join public.tenants t
      on t.unit_id = r.unit_id
      and t.status in ('Active','Overdue','Notice','PendingPayment')
   order by r.priority,
     case t.status
       when 'Active' then 1 when 'Overdue' then 2 when 'Notice' then 3
        when 'PendingPayment' then 4 else 5
     end,
     t.updated_at desc nulls last
   limit 1;
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text)
  to anon, authenticated, service_role;

-- Partial RMS has its own tenants and payment ledger. Real callbacks previously
-- never reached either table, so valid Partial RMS account numbers could not
-- auto-match. This RPC is deliberately a no-op when the tag is not owned by a
-- Partial RMS tenant, allowing the edge functions to fall back to Full RMS.
create or replace function public.record_partial_rms_c2b_payment(
  p_transaction_id text,
  p_amount numeric,
  p_msisdn text,
  p_bill_ref text,
  p_first_name text default null,
  p_middle_name text default null,
  p_last_name text default null,
  p_trans_time text default null
)
returns table (
  payment_id uuid,
  was_duplicate boolean,
  matched_tenant_id text,
  matched_unit_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_existing record;
  v_id uuid;
  v_paid_at timestamptz := now();
  v_reference text := coalesce(nullif(btrim(p_transaction_id), ''), gen_random_uuid()::text);
begin
  select p.id, p.matched_tenant_id, p.matched_unit_id
    into v_existing
    from public.partial_rms_payments p
   where upper(btrim(p.transaction_id)) = upper(btrim(p_transaction_id))
   limit 1;
  if found then
    payment_id := v_existing.id;
    was_duplicate := true;
    matched_tenant_id := v_existing.matched_tenant_id;
    matched_unit_id := v_existing.matched_unit_id;
    return next;
    return;
  end if;

  select t.id, t.unit_id, t.payment_history
    into v_tenant
    from public.partial_tenants t
   where regexp_replace(upper(btrim(coalesce(t.unit, ''))), '[^A-Z0-9]', '', 'g') =
         regexp_replace(upper(btrim(coalesce(p_bill_ref, ''))), '[^A-Z0-9]', '', 'g')
     and t.status in ('Active','Overdue','Notice','PendingPayment')
     and t.unit_id is not null
   order by case t.status when 'Active' then 1 when 'Overdue' then 2 else 3 end,
            t.updated_at desc nulls last
   limit 1;

  if not found then return; end if;

  begin
    if nullif(btrim(p_trans_time), '') is not null then
      v_paid_at := to_timestamp(p_trans_time, 'YYYYMMDDHH24MISS') at time zone 'Africa/Nairobi';
    end if;
  exception when others then
    v_paid_at := now();
  end;

  insert into public.partial_rms_payments (
    source, status, reconciliation_status, amount, transaction_id,
    bill_ref_number, msisdn, phone, first_name, middle_name, last_name,
    matched_tenant_id, matched_unit_id, result_code, result_desc, created_at
  ) values (
    'c2b', 'completed', 'reconciled', p_amount, p_transaction_id,
    p_bill_ref, p_msisdn, p_msisdn, p_first_name, p_middle_name, p_last_name,
    v_tenant.id, v_tenant.unit_id, 0, 'C2B confirmation received', v_paid_at
  ) returning id into v_id;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_tenant.payment_history, '[]'::jsonb)) e
     where upper(btrim(coalesce(e->>'reference', ''))) = upper(btrim(v_reference))
  ) then
    update public.partial_tenants
       set payment_history = jsonb_build_array(jsonb_build_object(
             'date', to_char(v_paid_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD'),
             'amount', 'KES ' || to_char(p_amount, 'FM999,999,999,990'),
             'status', 'Paid', 'method', 'M-Pesa (C2B)', 'reference', v_reference
           )) || coalesce(payment_history, '[]'::jsonb),
           updated_at = now()
     where id = v_tenant.id;
  end if;

  payment_id := v_id;
  was_duplicate := false;
  matched_tenant_id := v_tenant.id;
  matched_unit_id := v_tenant.unit_id;
  return next;
end;
$$;

grant execute on function public.record_partial_rms_c2b_payment(
  text, numeric, text, text, text, text, text, text
) to service_role;

-- Historical unmatched payments must not be bulk-rematched from an account
-- number. That account may now belong to a different occupant. They remain in
-- Reconciliation until an operator explicitly selects the owning tenant id.

-- Remove a provable leakage case only: the same receipt exists on both a former
-- tenant and a current occupant. Keep the former tenant's copy and ownership.
do $$
declare
  duplicate_record record;
begin
  for duplicate_record in
    select distinct old_t.id as owner_id,
           new_t.id as duplicate_tenant_id,
           upper(btrim(old_entry->>'reference')) as reference
      from public.tenants old_t
      cross join lateral jsonb_array_elements(coalesce(old_t.payment_history, '[]'::jsonb)) old_entry
      join public.tenants new_t
        on new_t.id <> old_t.id
       and new_t.status in ('Active','Overdue','Notice','PendingPayment')
      cross join lateral jsonb_array_elements(coalesce(new_t.payment_history, '[]'::jsonb)) new_entry
     where old_t.status in ('Vacated','Evicted','Blacklisted','Inactive')
       and nullif(btrim(old_entry->>'reference'), '') is not null
       and upper(btrim(new_entry->>'reference')) = upper(btrim(old_entry->>'reference'))
  loop
    update public.tenants
       set payment_history = coalesce((
         select jsonb_agg(entry order by ord)
           from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) with ordinality h(entry, ord)
          where upper(btrim(coalesce(entry->>'reference', ''))) <> duplicate_record.reference
       ), '[]'::jsonb),
           updated_at = now()
     where id = duplicate_record.duplicate_tenant_id;

    update public.payments
       set matched_tenant_id = duplicate_record.owner_id,
           updated_at = now()
     where matched_tenant_id = duplicate_record.duplicate_tenant_id
       and upper(btrim(coalesce(transaction_id, checkout_request_id, ''))) = duplicate_record.reference;
  end loop;
end $$;

-- Verification queries (all should return the expected tenant; the last query
-- should return zero rows for account numbers that now resolve).
select * from public.find_active_tenant_by_unit_tag('ABC/C6');
select * from public.find_active_tenant_by_unit_tag('ROSE/26');
select * from public.find_active_tenant_by_unit_tag('ABC/A10');
select * from public.find_active_tenant_by_unit_tag('MC/18');
select * from public.find_active_tenant_by_unit_tag('KEZIA/27');
select * from public.find_active_tenant_by_unit_tag('MUT/08');
select transaction_id, bill_ref_number
  from public.payments p
 where lower(coalesce(p.status, '')) = 'completed'
   and p.matched_tenant_id is null
   and exists (select 1 from public.find_active_tenant_by_unit_tag(p.bill_ref_number));