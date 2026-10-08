-- SQL script to resolve the multiple-occupancy payment discrepancy for Nancy O in unit KEZIA/01.
-- Authoritative payment in public.payments for transaction reference UF8F673F42 has the amount of KES 2,000.
-- This script updates the tenant's cached ledger (payment_history) JSONB column to match the correct 2,000 amount.

DO $$
DECLARE
  v_tenant_id UUID := '53167717-7116-4ee4-b364-42a52680d071'; -- Nancy O / KEZIA/01
  v_target_ref TEXT := 'UF8F673F42';
  v_updated_history JSONB;
BEGIN
  -- Perform a check to confirm the tenant exists
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id::text) THEN
    RAISE NOTICE 'Tenant with ID % not found. Skipping update.', v_tenant_id;
    RETURN;
  END IF;

  -- Update payment_history JSONB array
  SELECT jsonb_agg(
    CASE 
      WHEN UPPER(TRIM(elem->>'reference')) = v_target_ref THEN
        -- Update the main payment amount to KES 2,000
        jsonb_build_object(
          'date',      elem->>'date',
          'amount',    'KES 2,000',
          'method',    elem->>'method',
          'status',    elem->>'status',
          'reference', elem->>'reference',
          'allocationLines', CASE 
            WHEN elem ? 'allocationLines' THEN
              (
                SELECT jsonb_agg(
                  CASE 
                    WHEN line->>'kind' = 'rent' THEN
                      line || jsonb_build_object('amount', 2000)
                    ELSE line
                  END
                )
                FROM jsonb_array_elements(elem->'allocationLines') line
              )
            ELSE null
          END
        ) - 'allocationLines' || CASE WHEN elem ? 'allocationLines' THEN jsonb_build_object('allocationLines', (
                SELECT jsonb_agg(
                  CASE 
                    WHEN line->>'kind' = 'rent' THEN
                      line || jsonb_build_object('amount', 2000)
                    ELSE line
                  END
                )
                FROM jsonb_array_elements(elem->'allocationLines') line
              )) ELSE '{}'::jsonb END
      ELSE elem
    END
  )
  INTO v_updated_history
  FROM public.tenants t,
  LATERAL jsonb_array_elements(COALESCE(t.payment_history, '[]'::jsonb)) elem
  WHERE t.id = v_tenant_id::text;

  -- Apply the updated history back to the tenant record
  IF v_updated_history IS NOT NULL THEN
    UPDATE public.tenants
    SET payment_history = v_updated_history,
        updated_at = NOW()
    WHERE id = v_tenant_id::text;
    
    RAISE NOTICE 'Successfully updated Nancy O''s payment_history entry for transaction % to KES 2,000.', v_target_ref;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX FOR SIGN IN PAGE BRANDING LOGO LOAD DISCREPANCY
-- ─────────────────────────────────────────────────────────────────────────────
-- This grants unauthenticated clients (anon role) execute permissions on load_system_settings()
-- so that the landing/sign-in page can display the company logo & name when no user is logged in yet.
GRANT EXECUTE ON FUNCTION app.load_system_settings() TO anon;
GRANT EXECUTE ON FUNCTION app.partial_load_system_settings() TO anon;

