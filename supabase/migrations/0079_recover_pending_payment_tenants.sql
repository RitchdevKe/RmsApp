-- 0079_recover_pending_payment_tenants.sql
--
-- One-time data recovery for tenants stuck in PendingPayment / PendingAllocation
-- after two compounding bugs:
--
--   1. Re-activation in May (applyPaidState) set onboarding_date to May in
--      the app_state blob, replacing the correct April join date.
--
--   2. Migration 0033 re-backfill ran with the corrupted blob and wrote:
--        - onboarding_date = May (wrong date)
--        - payment_history = [] (empty, wiping C2B webhook entries)
--      directly into public.tenants for the affected tenants.
--
-- Recovery strategy — for every PendingPayment / PendingAllocation tenant that
-- has at least one completed row in public.payments (the authoritative ledger):
--
--   a. Rebuild payment_history from public.payments rows (C2B + STK).
--   b. Set onboarding_date = earliest matched payment date
--      (unless the existing date is already earlier — keeps a correct April date).
--   c. Set activation_date = earliest payment date
--      (preserves existing if already set to an earlier value).
--   d. Set status = 'Active'.
--   e. Set next_due_date = configured due-day of the month AFTER the latest
--      payment month (e.g. April payment → May 1st; May payment → June 1st).
--
-- Tenants with ZERO completed matched payments are left unchanged.
-- Already Active / Overdue / Notice tenants are NOT touched.
-- Only fully-allocated tenants (unit_id set) are eligible.

do $$
declare
  v_tenant   public.tenants%rowtype;
  v_pay      record;
  v_history  jsonb;
  v_earliest date;
  v_latest   date;
  v_due_day  int;
  v_next_due text;
  v_count    int := 0;
begin

  for v_tenant in
    select *
      from public.tenants
     where status in ('PendingPayment', 'PendingAllocation')
       and coalesce(unit_id, '') <> ''
       and exists (
             select 1
               from public.payments p
              where p.matched_tenant_id = public.tenants.id
                and p.status = 'completed'
           )
     order by id
  loop

    -- ── 1. Rebuild payment_history from public.payments ──────────────────────
    v_history  := '[]'::jsonb;
    v_earliest := null;
    v_latest   := null;

    for v_pay in
      select
        amount,
        transaction_id,
        source,
        (created_at at time zone 'Africa/Nairobi')::date as pay_date
      from public.payments
     where matched_tenant_id = v_tenant.id
       and status = 'completed'
     order by created_at asc
    loop
      if v_earliest is null then v_earliest := v_pay.pay_date; end if;
      v_latest := v_pay.pay_date;

      v_history := v_history || jsonb_build_array(
        jsonb_build_object(
          'date',      to_char(v_pay.pay_date, 'YYYY-MM-DD'),
          'amount',    'KES ' || to_char(v_pay.amount, 'FM999,999,999,990'),
          'status',    'Paid',
          'method',    case v_pay.source
                         when 'c2b'    then 'M-Pesa (C2B)'
                         when 'stk'    then 'M-Pesa (STK)'
                         when 'manual' then 'Manual'
                         else               'M-Pesa'
                       end,
          'reference', coalesce(v_pay.transaction_id, '')
        )
      );
    end loop;

    -- ── 2. Compute next_due_date ──────────────────────────────────────────────
    -- 1st (or configured due-day) of the month after the latest payment month.
    v_due_day := coalesce(v_tenant.rent_due_date, 1);
    if v_due_day < 1  then v_due_day := 1; end if;
    if v_due_day > 28 then v_due_day := 1; end if;

    v_next_due := to_char(
      date_trunc('month', v_latest::timestamp)
        + interval '1 month'
        + ((v_due_day - 1)::text || ' days')::interval,
      'YYYY-MM-DD'
    );

    -- ── 3. Apply all corrections ──────────────────────────────────────────────
    update public.tenants set
      payment_history = v_history,
      status          = 'Active',

      -- onboarding_date: keep existing only if it is already earlier (correct April date).
      -- Otherwise reset to the date of the first payment.
      onboarding_date = case
        when onboarding_date ~ '^\d{4}-\d{2}-\d{2}$'
             and onboarding_date::date <= v_earliest
          then onboarding_date
          else to_char(v_earliest, 'YYYY-MM-DD')
        end,

      -- activation_date: preserve if already set to an earlier date.
      activation_date = case
        when activation_date ~ '^\d{4}-\d{2}-\d{2}$'
             and activation_date::date <= v_earliest
          then activation_date
          else to_char(v_earliest, 'YYYY-MM-DD')
        end,

      next_due_date   = v_next_due,
      updated_at      = now()

    where id = v_tenant.id;

    v_count := v_count + 1;
    raise notice 'Recovered id=% name="%" payments=% next_due=%',
      v_tenant.id, v_tenant.name, jsonb_array_length(v_history), v_next_due;

  end loop;

  raise notice '=== Recovery complete: % tenant(s) updated ===', v_count;

end $$;
