-- supabase/migrations/0027_c2b_payment_rpcs.sql
--
-- Server-side matching and insertion helpers for C2B and Manual payments.
--
-- These are SECURITY DEFINER functions so the edge functions (which use the
-- service-role key) and the admin UI can insert/update payments and append
-- to the tenant ledger atomically.

-- ── 0. public wrapper for app.is_admin ─────────────────────────────────────
-- PostgREST only exposes the `public` schema by default, so edge functions
-- need a public-schema entry point for admin checks.
create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.is_admin(p_user);
$$;

grant execute on function public.is_admin(uuid) to authenticated, anon, service_role;

-- ── 1. find_active_tenant_by_unit_tag ──────────────────────────────────────
-- Given an account reference typed at the Paybill (BillRefNumber), return the
-- matched tenant and unit. Case-insensitive, trimmed.
--
-- Returns NULL row if no unit carries that tag or the unit has no active tenant.
create or replace function public.find_active_tenant_by_unit_tag(p_tag text)
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
   and t.status = 'Active'
  limit 1;
$$;

grant execute on function public.find_active_tenant_by_unit_tag(text) to anon, authenticated, service_role;


-- ── 2. record_c2b_payment ──────────────────────────────────────────────────
-- Called by the mpesa-c2b-confirmation edge function (service role).
-- Idempotent: if a row with the same transaction_id already exists, returns
-- that row's id and takes no further action. Otherwise inserts a new
-- payment row, attempts match-by-tag, and on match appends to the tenant's
-- payment_history.
create or replace function public.record_c2b_payment(
  p_transaction_id text,
  p_amount numeric,
  p_msisdn text,
  p_bill_ref text,
  p_business_short_code text,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_org_balance numeric,
  p_raw jsonb,
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
  v_existing_id uuid;
  v_payment_id uuid;
  v_match record;
  v_status text;
  v_created_at timestamptz := now();
begin
  -- Idempotency check — return existing row if this TransID is already stored.
  select id, matched_tenant_id, matched_unit_id
    into v_existing_id, matched_tenant_id, matched_unit_id
  from public.payments
  where transaction_id = p_transaction_id
  limit 1;

  if v_existing_id is not null then
    payment_id := v_existing_id;
    was_duplicate := true;
    return next;
    return;
  end if;

  -- Attempt to resolve BillRefNumber → unit → tenant.
  select *
    into v_match
  from public.find_active_tenant_by_unit_tag(p_bill_ref);

  v_status := case
    when v_match.tenant_id is not null then 'reconciled'
    else 'unreconciled'
  end;

  insert into public.payments (
    source,
    status,
    reconciliation_status,
    amount,
    transaction_id,
    bill_ref_number,
    msisdn,
    phone,
    business_short_code,
    first_name,
    middle_name,
    last_name,
    org_account_balance,
    matched_tenant_id,
    matched_unit_id,
    raw_payload,
    result_code,
    result_desc
  ) values (
    'c2b',
    'completed',
    v_status,
    p_amount,
    p_transaction_id,
    p_bill_ref,
    p_msisdn,
    p_msisdn,
    p_business_short_code,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_org_balance,
    v_match.tenant_id,
    v_match.unit_id,
    p_raw,
    0,
    'C2B confirmation received'
  )
  on conflict (transaction_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    -- Conflict raced with us — re-select.
    select id, matched_tenant_id, matched_unit_id
      into v_payment_id, matched_tenant_id, matched_unit_id
    from public.payments
    where transaction_id = p_transaction_id
    limit 1;

    payment_id := v_payment_id;
    was_duplicate := true;
    return next;
    return;
  end if;

  -- If matched, append to tenant.payment_history.
  if v_match.tenant_id is not null then
    update public.tenants
       set payment_history = (
             jsonb_build_array(
               jsonb_build_object(
                 'date',      to_char(v_created_at, 'YYYY-MM-DD'),
                 'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
                 'status',    'Paid',
                 'method',    'M-Pesa (C2B)',
                 'reference', p_transaction_id
               )
             ) || coalesce(payment_history, '[]'::jsonb)
           ),
           updated_at = now()
     where id = v_match.tenant_id;
  end if;

  payment_id := v_payment_id;
  was_duplicate := false;
  matched_tenant_id := v_match.tenant_id;
  matched_unit_id := v_match.unit_id;
  return next;
end;
$$;

grant execute on function public.record_c2b_payment(
  text, numeric, text, text, text, text, text, text, numeric, jsonb, text
) to service_role, authenticated;


-- ── 3. match_c2b_payment_to_tenant ─────────────────────────────────────────
-- Admin-triggered manual matching from the Reconciliation → External
-- Unmatched page. Updates the payment row and appends to the tenant ledger.
create or replace function public.match_c2b_payment_to_tenant(
  p_payment_id uuid,
  p_tenant_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_tenant record;
begin
  if not app.is_admin(auth.uid()) then
    raise exception 'Only admins can match payments';
  end if;

  select id, amount, transaction_id, matched_tenant_id, created_at, source
    into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.matched_tenant_id is not null then
    raise exception 'Payment is already matched';
  end if;

  select id, unit_id, payment_history
    into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if not found then
    raise exception 'Tenant not found';
  end if;

  update public.payments
     set matched_tenant_id = p_tenant_id,
         matched_unit_id = v_tenant.unit_id,
         reconciliation_status = 'reconciled',
         updated_at = now()
   where id = p_payment_id;

  update public.tenants
     set payment_history = (
           jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(coalesce(v_payment.created_at, now()), 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(v_payment.amount, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    case v_payment.source when 'c2b' then 'M-Pesa (C2B)' else 'Manual' end,
               'reference', coalesce(v_payment.transaction_id, v_payment.id::text)
             )
           ) || coalesce(payment_history, '[]'::jsonb)
         ),
         updated_at = now()
   where id = p_tenant_id;
end;
$$;

grant execute on function public.match_c2b_payment_to_tenant(uuid, text) to authenticated;


-- ── 4. record_manual_payment ───────────────────────────────────────────────
-- Called by the Inbound page when an admin records a Bank or Cash payment
-- against a known tenant.
create or replace function public.record_manual_payment(
  p_tenant_id text,
  p_amount numeric,
  p_reference text,
  p_method text,
  p_date text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_tenant record;
  v_date timestamptz := coalesce(p_date::timestamptz, now());
begin
  if not app.is_admin(auth.uid()) then
    raise exception 'Only admins can record manual payments';
  end if;

  if p_method not in ('Bank', 'Cash') then
    raise exception 'Method must be Bank or Cash';
  end if;

  select id, unit_id, payment_history
    into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if not found then
    raise exception 'Tenant not found';
  end if;

  insert into public.payments (
    source,
    status,
    reconciliation_status,
    amount,
    transaction_id,
    matched_tenant_id,
    matched_unit_id,
    result_code,
    result_desc,
    created_at
  ) values (
    'manual',
    'completed',
    'reconciled',
    p_amount,
    p_reference,
    p_tenant_id,
    v_tenant.unit_id,
    0,
    p_method,
    v_date
  )
  returning id into v_payment_id;

  update public.tenants
     set payment_history = (
           jsonb_build_array(
             jsonb_build_object(
               'date',      to_char(v_date, 'YYYY-MM-DD'),
               'amount',    'KES ' || to_char(p_amount, 'FM999,999,999,990'),
               'status',    'Paid',
               'method',    p_method,
               'reference', p_reference
             )
           ) || coalesce(payment_history, '[]'::jsonb)
         ),
         updated_at = now()
   where id = p_tenant_id;

  return v_payment_id;
end;
$$;

grant execute on function public.record_manual_payment(text, numeric, text, text, text) to authenticated;
