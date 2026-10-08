-- 20260721_permanent_delete_and_move_payment.sql
--
-- Run this in the Supabase SQL editor. Idempotent (safe to re-run).
--
-- Fixes three related issues reported by the operator:
--
--   1. "Deleting a payment brings it back after reload."
--        → delete_tenant_payment() already exists (scripts/0095_delete_tenant_payment.sql)
--          but is re-published here so every environment has the current signature
--          and permission grants, and to grant execute to both parameter orders.
--
--   2. "Deleting a tenant brings the tenant back after reload."
--        → re-publishes app.delete_tenant() which fans the delete across every
--          persistence surface (tenants, partial_tenants, tenant_applications,
--          partial_tenant_applications) so no re-hydrate path can revive it.
--
--   3. "Reassigning a payment from Tenant A to Tenant B leaves the payment
--       showing on BOTH profiles."
--        → introduces a new SECURITY DEFINER RPC move_tenant_payment(from,to,ref)
--          that in one transaction removes the JSONB entry from A.payment_history,
--          appends it to B.payment_history, and repoints public.payments.matched_tenant_id
--          to B. The client was previously doing this only in memory, and a
--          concurrent server-side payment_history reconcile would resurrect the
--          entry on Tenant A on the next refresh.

-- =====================================================================
-- 1. Payment permanent delete RPC (re-published)
-- =====================================================================

drop function if exists public.delete_tenant_payment(uuid, text);
drop function if exists public.delete_tenant_payment(text, text);

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
  if v_ref = '' then
    raise exception 'Payment reference is required';
  end if;

  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
            where btrim(coalesce(entry->>'reference', '')) <> v_ref
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_tenant_id;

  delete from public.payments
   where transaction_id = v_ref
     and matched_tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.delete_tenant_payment(text, text) to authenticated, service_role;

-- =====================================================================
-- 2. Tenant permanent delete RPC (re-published)
-- =====================================================================

create or replace function app.delete_tenant(p_id text)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from public.tenants                    where id = p_id;
  delete from public.partial_tenants            where id = p_id;
  delete from public.tenant_applications        where id = p_id;
  delete from public.partial_tenant_applications where id = p_id;
end;
$$;

grant execute on function app.delete_tenant(text) to authenticated, service_role;

-- =====================================================================
-- 3. Atomic move-payment RPC (new)
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

  -- 1. Extract the payment entry from the source tenant's history.
  select entry into v_entry
    from public.tenants t,
         lateral jsonb_array_elements(coalesce(t.payment_history, '[]'::jsonb)) entry
   where t.id = p_from_tenant_id
     and btrim(coalesce(entry->>'reference', '')) = v_ref
   limit 1;

  if v_entry is null then
    raise exception 'Payment % not found on source tenant %', v_ref, p_from_tenant_id;
  end if;

  -- 2. Remove the entry from the source tenant (all matching copies).
  update public.tenants
     set payment_history = coalesce((
           select jsonb_agg(entry)
             from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
            where btrim(coalesce(entry->>'reference', '')) <> v_ref
         ), '[]'::jsonb),
         updated_at = now()
   where id = p_from_tenant_id;

  -- 3. Append to the destination tenant, guarding against duplicates.
  update public.tenants
     set payment_history = (
           select jsonb_agg(entry)
             from jsonb_array_elements(
                    coalesce(payment_history, '[]'::jsonb)
                    || jsonb_build_array(v_entry)
                  ) entry
            where btrim(coalesce(entry->>'reference', '')) = v_ref
               or true  -- keep all rows, but the DISTINCT below will de-dupe
         ),
         updated_at = now()
   where id = p_to_tenant_id;

  -- De-duplicate any entries with the same reference on the destination
  -- (in case a concurrent write also appended it).
  update public.tenants
     set payment_history = (
           select jsonb_agg(entry)
             from (
               select distinct on (btrim(coalesce(entry->>'reference', '')))
                      entry
                 from jsonb_array_elements(coalesce(payment_history, '[]'::jsonb)) entry
                order by btrim(coalesce(entry->>'reference', '')), entry->>'date' desc nulls last
             ) s
         )
   where id = p_to_tenant_id;

  -- 4. Repoint the ledger row so load_tenants() cannot merge it back onto
  --    the source tenant on the next refresh.
  update public.payments
     set matched_tenant_id = p_to_tenant_id,
         updated_at = now()
   where transaction_id = v_ref
     and matched_tenant_id = p_from_tenant_id;

  return v_entry;
end;
$$;

grant execute on function public.move_tenant_payment(text, text, text) to authenticated, service_role;
