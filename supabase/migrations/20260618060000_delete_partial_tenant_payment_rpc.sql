-- Create delete_partial_tenant_payment RPC function
drop function if exists public.delete_partial_tenant_payment(uuid, text);
drop function if exists public.delete_partial_tenant_payment(text, text);

create or replace function public.delete_partial_tenant_payment(
  p_tenant_id text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_ref text := btrim(coalesce(p_reference, ''));
  v_new_history jsonb;
begin
  if not (
    app.is_staff_admin(auth.uid()) or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('Super Admin', 'Assistant Admin', 'Finance Manager', 'Branch Manager')
    )
  ) then
    raise exception 'Only admins can delete payments';
  end if;

  if v_ref = '' then
    raise exception 'Payment reference is required';
  end if;

  -- 1. Remove from partial_tenants.payment_history (JSONB array)
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_new_history
  from public.partial_tenants t,
       jsonb_array_elements(t.payment_history) elem
  where t.id = p_tenant_id
    and btrim(lower(coalesce(elem->>'reference', ''))) <> lower(v_ref);

  update public.partial_tenants
  set payment_history = coalesce(v_new_history, '[]'::jsonb),
      updated_at = now()
  where id = p_tenant_id;

  -- 2. Permanently delete the ledger row for this tenant + reference from partial_payments table
  delete from public.partial_payments
   where btrim(lower(transaction_id)) = lower(v_ref)
     and matched_tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.delete_partial_tenant_payment(text, text) to authenticated;
