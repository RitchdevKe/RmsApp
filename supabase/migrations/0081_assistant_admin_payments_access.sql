-- supabase/migrations/0081_assistant_admin_payments_access.sql
--
-- Ensures the Assistant Admin role has:
--   1. All Payments sub-module paths in accessible_submodules.
--   2. Full Financials action permissions (including pay) required for
--      payment matching and processing across Inbound, Outbound, Reconciliation.
--
-- Uses jsonb / array operations so only the targeted fields are touched;
-- all other role customisations are preserved.
-- Idempotent.

do $$
declare
  v_role_id uuid;
  v_current_subs text[];
  v_payment_subs text[] := array[
    'Payments',
    'Payments/Overview',
    'Payments/Inbound',
    'Payments/Outbound',
    'Payments/Invoices',
    'Payments/Reconciliation',
    'Payments/Landlord Payouts',
    'Payments/Overpayments',
    'Payments/Payment Processing'
  ];
  sub text;
begin
  select id into v_role_id from app.roles where name = 'Assistant Admin' limit 1;
  if v_role_id is null then
    raise notice 'Assistant Admin role not found — skipping';
    return;
  end if;

  -- 1. Ensure all Payments/* paths are in accessible_submodules ----------
  select coalesce(accessible_submodules, '{}') into v_current_subs
    from app.roles where id = v_role_id;

  foreach sub in array v_payment_subs loop
    if not (sub = any(v_current_subs)) then
      v_current_subs := v_current_subs || sub;
    end if;
  end loop;

  update app.roles
     set accessible_submodules = v_current_subs,
         updated_at = now()
   where id = v_role_id;

  -- 2. Set full Financials action permissions (including pay) ----------
  update app.roles
     set permissions = jsonb_set(
           permissions,
           '{Financials}',
           '{"create":true,"edit":true,"delete":true,"view":true,"approve":true,"import":true,"activate":true,"deactivate":true,"publish":true,"pay":true,"resolve":true,"cancel":true}'::jsonb
         ),
         updated_at = now()
   where id = v_role_id;

  raise notice 'Assistant Admin: Payments submodule access and Financials permissions updated.';
end $$;
