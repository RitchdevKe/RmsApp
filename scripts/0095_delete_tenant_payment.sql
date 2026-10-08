-- 0095_delete_tenant_payment.sql
-- Purpose:
--   Provide a SECURITY DEFINER RPC that permanently removes a payment from a
--   tenant's payment_history AND from the public.payments ledger in one
--   transaction. Without this, clients with no DELETE privilege on
--   public.payments silently fail to detach the row, so load_tenants() merges
--   it back into payment_history on the next refresh ("the payment comes back
--   after refresh"). Only Super / Assistant admins may invoke this.
--
-- Safe to re-run.

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
  v_ref text := btrim(coalesce(p_reference, ''));
begin
  if not app.is_staff_admin(auth.uid()) then
    raise exception 'Only admins can delete payments';
  end if;

  if v_ref = '' then
    raise exception 'Payment reference is required';
  end if;

  -- 1. Remove from tenants.payment_history (JSONB array) — drop any entry
  --    whose reference matches (trimmed, case-sensitive — references are
  --    M-Pesa receipts / MAN-... codes, both case-stable).
  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
            where btrim(coalesce(entry->>'reference', '')) <> v_ref
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_tenant_id;

  -- 2. Permanently delete the ledger row for this tenant + reference so
  --    load_tenants() cannot re-hydrate it. We delete instead of unmatching
  --    because the admin explicitly chose to wipe the payment.
  delete from public.payments
   where transaction_id = v_ref
     and matched_tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.delete_tenant_payment(text, text) to authenticated;
