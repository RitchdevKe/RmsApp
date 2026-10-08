-- Purge synthetic multi-occupancy sub-unit payments (MULTI-*) once more.
-- Run this once against the database (SQL editor).
-- Sub-units never hold payments: every receipt lives on the main unit exactly
-- as received from M-Pesa C2B. Older builds regenerated these rows during
-- balance recomputes; that generator has now been removed from the client.

DELETE FROM public.payments
WHERE transaction_id LIKE 'MULTI-%'
   OR status = 'Multi-Occupancy Allocation'
   OR checkout_request_id = 'Multi-occupancy sub allocation'
   OR phone = 'Multi-Occupancy';

WITH cleaned AS (
  SELECT id,
         COALESCE((
           SELECT jsonb_agg(elem)
           FROM jsonb_array_elements(payment_history) elem
           WHERE upper(btrim(COALESCE(elem->>'reference', ''))) NOT LIKE 'MULTI-%'
             AND COALESCE(elem->>'method', '') <> 'Multi-Occupancy Allocation'
             AND COALESCE(elem->>'status', '') <> 'Multi-Occupancy Allocation'
         ), '[]'::jsonb) AS h
  FROM public.tenants
)
UPDATE public.tenants t SET payment_history = c.h
FROM cleaned c WHERE t.id = c.id AND t.payment_history IS DISTINCT FROM c.h;

DELETE FROM public.partial_rms_payments
WHERE transaction_id LIKE 'MULTI-%'
   OR status = 'Multi-Occupancy Allocation';

WITH cleaned_partial AS (
  SELECT id,
         COALESCE((
           SELECT jsonb_agg(elem)
           FROM jsonb_array_elements(payment_history) elem
           WHERE upper(btrim(COALESCE(elem->>'reference', ''))) NOT LIKE 'MULTI-%'
             AND COALESCE(elem->>'method', '') <> 'Multi-Occupancy Allocation'
             AND COALESCE(elem->>'status', '') <> 'Multi-Occupancy Allocation'
         ), '[]'::jsonb) AS h
  FROM public.partial_tenants
)
UPDATE public.partial_tenants t SET payment_history = c.h
FROM cleaned_partial c WHERE t.id = c.id AND t.payment_history IS DISTINCT FROM c.h;
