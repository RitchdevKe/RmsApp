-- supabase/migrations/0082_staff_admin_payments_rls.sql
--
-- Root cause: app.is_admin() only returns true for 'Super Admin', so all other
-- privileged system roles (Assistant Admin, Finance Manager, Branch Manager)
-- receive zero rows from public.payments and cannot call matching RPCs.
--
-- Fix:
--   1. Create app.is_staff_admin() — true for all privileged system roles.
--   2. Replace app.is_admin() guard on public.payments RLS policies.
--   3. Replace app.is_admin() guard inside match_c2b_payment_to_tenant.
--   4. Replace app.is_admin() guard inside record_manual_payment.
--
-- app.is_admin() is left UNCHANGED — it stays Super-Admin-only to protect
-- role editing, auth user deletion, and other high-privilege operations.
-- Idempotent.

-- ── 1. Helper: is_staff_admin ──────────────────────────────────────────────
create or replace function app.is_staff_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
    where ur.user_id = p_user
      and r.name in (
        'Super Admin',
        'Assistant Admin',
        'Finance Manager',
        'Branch Manager'
      )
  );
$$;

grant execute on function app.is_staff_admin(uuid) to authenticated, service_role;

-- ── 2. public.payments RLS policies ───────────────────────────────────────
drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin"
on public.payments
for select
to authenticated
using (app.is_staff_admin(auth.uid()));

drop policy if exists "payments_update_admin" on public.payments;
create policy "payments_update_admin"
on public.payments
for update
to authenticated
using (app.is_staff_admin(auth.uid()))
with check (app.is_staff_admin(auth.uid()));

drop policy if exists "payments_insert_admin" on public.payments;
create policy "payments_insert_admin"
on public.payments
for insert
to authenticated
with check (app.is_staff_admin(auth.uid()));

-- ── 3. match_c2b_payment_to_tenant — replace is_admin guard ───────────────
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
  if not app.is_staff_admin(auth.uid()) then
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

-- ── 4. record_manual_payment — replace is_admin guard ─────────────────────
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
  if not app.is_staff_admin(auth.uid()) then
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
