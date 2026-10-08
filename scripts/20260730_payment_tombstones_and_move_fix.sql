-- 20260730_payment_tombstones_and_move_fix.sql
--
-- Run this once in the Supabase SQL editor. Idempotent (safe to re-run).
--
-- PERMANENT FIX for two recurring reconciliation problems:
--
--   1. "Moving a payment from Tenant A to Tenant B leaves it on BOTH tenants."
--   2. "Deleting a payment from a tenant brings it back after reload."
--
-- Root causes:
--   * delete/move only matched the ledger row on payments.transaction_id.
--     When the payment_history entry's `reference` was a payment UUID, a
--     checkout_request_id, or a MULTI- prefixed reference, the ledger row was
--     never deleted / repointed, so any server-side payment_history reconcile
--     re-merged the entry onto the old tenant on the next load.
--   * app.upsert_tenant intentionally preserves payment_history when the client
--     strips the key, so a purely client-side removal never persists.
--
-- The fix adds an authoritative tombstone table. Once a (tenant, reference)
-- pair is tombstoned, app.load_tenants() strips it from that tenant's
-- payment_history forever — no reconcile path can resurrect it.

-- =====================================================================
-- 1. Tombstone table
-- =====================================================================

create table if not exists public.payment_tombstones (
  tenant_id  text not null,
  reference  text not null,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, reference)
);

grant select, insert, delete on public.payment_tombstones to authenticated;
grant all on public.payment_tombstones to service_role;

alter table public.payment_tombstones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'payment_tombstones'
       and policyname = 'authenticated manage payment tombstones'
  ) then
    create policy "authenticated manage payment tombstones"
      on public.payment_tombstones
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- =====================================================================
-- 2. Helper: strip tombstoned entries out of a payment_history blob
-- =====================================================================

create or replace function app.filter_tombstoned_payments(p_tenant_id text, p_history jsonb)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce((
    select jsonb_agg(entry order by ord)
      from jsonb_array_elements(coalesce(p_history, '[]'::jsonb)) with ordinality e(entry, ord)
     where not exists (
       select 1
         from public.payment_tombstones tb
        where tb.tenant_id = p_tenant_id
          and tb.reference in (
            btrim(coalesce(e.entry->>'reference', '')),
            regexp_replace(btrim(coalesce(e.entry->>'reference', '')), '^MULTI-', '')
          )
     )
  ), '[]'::jsonb);
$$;

grant execute on function app.filter_tombstoned_payments(text, jsonb) to authenticated, service_role;

-- =====================================================================
-- 3. Permanent delete RPC — tombstone + JSON strip + ledger delete
-- =====================================================================

drop function if exists public.delete_tenant_payment(uuid, text);

create or replace function public.delete_tenant_payment(
  p_tenant_id text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref  text := btrim(coalesce(p_reference, ''));
  v_base text;
begin
  if v_ref = '' then
    raise exception 'Payment reference is required';
  end if;
  v_base := regexp_replace(v_ref, '^MULTI-', '');

  -- 1. Tombstone first so no reconcile path can resurrect the entry.
  insert into public.payment_tombstones (tenant_id, reference, reason)
  values (p_tenant_id, v_ref, 'deleted'), (p_tenant_id, v_base, 'deleted')
  on conflict (tenant_id, reference) do nothing;

  -- 2. Strip from the tenant JSON history (both plain and MULTI- forms).
  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
            where btrim(coalesce(entry->>'reference', '')) not in (v_ref, v_base, 'MULTI-' || v_base)
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_tenant_id;

  -- 3. Delete the ledger row(s) using every identifier the UI may hold.
  delete from public.payments p
   where p.matched_tenant_id = p_tenant_id
     and (
       p.transaction_id = v_base
       or p.transaction_id = v_ref
       or p.checkout_request_id = v_base
       or p.id::text = v_base
     );
end;
$$;

grant execute on function public.delete_tenant_payment(text, text) to authenticated, service_role;

-- =====================================================================
-- 4. Atomic move RPC — tombstone source + repoint ledger
-- =====================================================================

drop function if exists public.move_tenant_payment(text, text, text);

create or replace function public.move_tenant_payment(
  p_from_tenant_id text,
  p_to_tenant_id   text,
  p_reference      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text := btrim(coalesce(p_reference, ''));
  v_base  text;
  v_entry jsonb;
begin
  if v_ref = '' then
    raise exception 'Payment reference is required';
  end if;
  if p_from_tenant_id is null or p_to_tenant_id is null then
    raise exception 'Both source and destination tenant ids are required';
  end if;
  if p_from_tenant_id = p_to_tenant_id then
    raise exception 'Source and destination tenants must differ';
  end if;
  v_base := regexp_replace(v_ref, '^MULTI-', '');

  -- 1. Grab the entry from the source tenant's history.
  select entry into v_entry
    from public.tenants t,
         lateral jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) entry
   where t.id = p_from_tenant_id
     and btrim(coalesce(entry->>'reference', '')) in (v_ref, v_base, 'MULTI-' || v_base)
   limit 1;

  -- Fall back to the ledger row if the JSON history is already missing it.
  if v_entry is null then
    select jsonb_build_object(
             'date',      to_char((p.created_at at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD'),
             'amount',    'KES ' || to_char(coalesce(p.amount, 0), 'FM999,999,999,990'),
             'status',    'Paid',
             'method',    case p.source
                            when 'c2b' then 'M-Pesa (C2B)'
                            when 'stk' then 'M-Pesa STK'
                            else coalesce(nullif(p.result_desc, ''), 'Manual')
                          end,
             'reference', coalesce(nullif(btrim(p.transaction_id), ''), p.id::text)
           )
      into v_entry
      from public.payments p
     where (p.transaction_id = v_base or p.id::text = v_base or p.checkout_request_id = v_base)
     limit 1;
  end if;

  if v_entry is null then
    raise exception 'Payment % not found on source tenant %', v_ref, p_from_tenant_id;
  end if;

  -- 2. Tombstone on the source tenant (permanent), and lift any stale
  --    tombstone on the destination so the entry is allowed to live there.
  insert into public.payment_tombstones (tenant_id, reference, reason)
  values (p_from_tenant_id, v_ref, 'moved'), (p_from_tenant_id, v_base, 'moved')
  on conflict (tenant_id, reference) do nothing;

  delete from public.payment_tombstones
   where tenant_id = p_to_tenant_id
     and reference in (v_ref, v_base, 'MULTI-' || v_base);

  -- 3. Remove from source history.
  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
            where btrim(coalesce(entry->>'reference', '')) not in (v_ref, v_base, 'MULTI-' || v_base)
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_from_tenant_id;

  -- 4. Append to destination history, de-duplicated by reference.
  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from (
               select distinct on (btrim(coalesce(entry->>'reference', ''))) entry
                 from jsonb_array_elements(
                        coalesce(payment_history, '[]'::jsonb) || jsonb_build_array(v_entry)
                      ) entry
                order by btrim(coalesce(entry->>'reference', '')), entry->>'date' desc nulls last
             ) s
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_to_tenant_id;

  -- 5. Repoint the authoritative ledger row on every identifier form.
  update public.payments p
     set matched_tenant_id = p_to_tenant_id,
         matched_unit_id   = (select t.unit_id from public.tenants t where t.id = p_to_tenant_id),
         updated_at        = now()
   where (p.transaction_id = v_base or p.transaction_id = v_ref
          or p.checkout_request_id = v_base or p.id::text = v_base);

  return v_entry;
end;
$$;

grant execute on function public.move_tenant_payment(text, text, text) to authenticated, service_role;

-- =====================================================================
-- 5. app.load_tenants() — never return tombstoned payments
-- =====================================================================

create or replace function app.load_tenants()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb)
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id',                      t.id,
      'name',                    t.name,
      'username',                t.username,
      'email',                   t.email,
      'phone',                   t.phone,
      'alternativePhone',        t.alternative_phone,
      'nextOfKinName',           t.next_of_kin_name,
      'nextOfKinPhone',          t.next_of_kin_phone,
      'nextOfKinRelationship',   t.next_of_kin_relationship,
      'idNumber',                t.id_number,
      'status',                  t.status,
      'propertyId',              t.property_id,
      'propertyName',            t.property_name,
      'unitId',                  t.unit_id,
      'unit',                    t.unit,
      'rentAmount',              t.rent_amount,
      'rentDueDate',             t.rent_due_date,
      'rentGraceDays',           t.rent_grace_days,
      'depositPaid',             t.deposit_paid,
      'depositExempt',           t.deposit_exempt,
      'depositExpected',         t.deposit_expected,
      'depositMonths',           t.deposit_months,
      'proratedDeposit',         t.prorated_deposit,
      'rentExtension',           t.rent_extension,
      'activationDate',          t.activation_date,
      'nextDueDate',             t.next_due_date,
      'rentStartDate',           t.rent_start_date,
      'onboardingDate',          t.onboarding_date,
      'leaseSigned',             t.lease_signed,
      'leaseStartDate',          t.lease_start_date,
      'leaseEnd',                t.lease_end,
      'leaseType',               t.lease_type,
      'paymentHistory',          app.filter_tombstoned_payments(t.id, coalesce(t.payment_history, '[]'::jsonb)),
      'outstandingBills',        coalesce(t.outstanding_bills, '[]'::jsonb),
      'outstandingFines',        coalesce(t.outstanding_fines, '[]'::jsonb),
      'waivedLateFeeMonths',     coalesce(t.waived_late_fee_months, '[]'::jsonb),
      'maintenanceRequests',     coalesce(t.maintenance_requests, '[]'::jsonb),
      'notes',                   coalesce(t.notes, '[]'::jsonb),
      'notices',                 coalesce(t.notices, '[]'::jsonb),
      'requests',                coalesce(t.requests, '[]'::jsonb),
      'dateRegistered',          t.date_registered,
      'houseStatus',             coalesce(t.house_status, '[]'::jsonb),
      'collectionHistory',       coalesce(t.collection_history, '[]'::jsonb),
      'recurringBills',          coalesce(t.recurring_bills, '[]'::jsonb),
      'avatar',                  t.avatar,
      'profilePicture',          t.profile_picture,
      'kraPin',                  t.kra_pin,
      'arrears',                 t.arrears,
      'role',                    t.role
    ) || jsonb_build_object(
      'referrerId',              t.referrer_id,
      'referralConfig',          t.referral_config,
      'authUserId',              t.auth_user_id,
      'occupancyType',           t.occupancy_type,
      'mainTenantId',            t.main_tenant_id
    )) AS row
    FROM public.tenants t
    ORDER BY t.created_at DESC
  ) sub;
$$;

grant execute on function app.load_tenants() to authenticated, service_role;

-- =====================================================================
-- 6. One-off cleanup: drop history entries whose ledger row now belongs
--    to a different tenant (the historical "shows on both" duplicates).
-- =====================================================================

do $$
declare
  v_row record;
begin
  for v_row in
    select t.id as tenant_id, btrim(coalesce(e.entry->>'reference', '')) as ref
      from public.tenants t,
           lateral jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) e(entry)
     where exists (
       select 1 from public.payments p
        where p.transaction_id = regexp_replace(btrim(coalesce(e.entry->>'reference', '')), '^MULTI-', '')
          and p.matched_tenant_id is not null
          and p.matched_tenant_id <> t.id
     )
  loop
    perform public.delete_tenant_payment(v_row.tenant_id, v_row.ref);
  end loop;
end $$;
