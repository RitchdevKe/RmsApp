-- Migration: Delete legacy simulated multi-occupancy allocation payments permanently from all databases
-- Date: 2026-07-02
-- Purpose: Remove all simulated/assumed multi-occupancy payments from both full RMS and partial RMS tables and JSON history arrays.

-- 1. Remove simulated payments from public.payments (Full RMS Ledger)
DELETE FROM public.payments
WHERE transaction_id LIKE 'MULTI-%'
   OR status = 'Multi-Occupancy Allocation'
   OR checkout_request_id = 'Multi-occupancy sub allocation'
   OR phone = 'Multi-Occupancy';

-- 2. Clean up simulated payments from public.tenants (Full RMS JSONB array)
WITH updated_tenants AS (
  SELECT 
    id,
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(payment_history) elem
        WHERE btrim(COALESCE(elem->>'reference', '')) NOT LIKE 'MULTI-%'
          AND COALESCE(elem->>'method', '') <> 'Multi-Occupancy Allocation'
      ),
      '[]'::jsonb
    ) AS clean_history
  FROM public.tenants
)
UPDATE public.tenants t
SET payment_history = u.clean_history
FROM updated_tenants u
WHERE t.id = u.id;

-- 3. Remove simulated payments from public.partial_rms_payments (Partial RMS Ledger)
DELETE FROM public.partial_rms_payments
WHERE transaction_id LIKE 'MULTI-%'
   OR status = 'Multi-Occupancy Allocation';

-- 4. Clean up simulated payments from public.partial_tenants (Partial RMS JSONB array)
WITH updated_partial_tenants AS (
  SELECT 
    id,
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(payment_history) elem
        WHERE btrim(COALESCE(elem->>'reference', '')) NOT LIKE 'MULTI-%'
          AND COALESCE(elem->>'method', '') <> 'Multi-Occupancy Allocation'
      ),
      '[]'::jsonb
    ) AS clean_history
  FROM public.partial_tenants
)
UPDATE public.partial_tenants t
SET payment_history = u.clean_history
FROM updated_partial_tenants u
WHERE t.id = u.id;
