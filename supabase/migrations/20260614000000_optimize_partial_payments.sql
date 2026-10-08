-- Optimization: Add indexing to partial_payments and payments for better Dashboard and Inbound UI performance.
-- This ensures rapid filtering without doing sequential sequence scans to deplete disk IO.

CREATE INDEX IF NOT EXISTS idx_partial_payments_status_org 
ON public.partial_payments(status, org_id);

CREATE INDEX IF NOT EXISTS idx_partial_payments_created_at 
ON public.partial_payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partial_payments_source_matched 
ON public.partial_payments(source, matched_tenant_id);

CREATE INDEX IF NOT EXISTS idx_partial_payments_checkout_req_id
ON public.partial_payments(checkout_request_id);

-- Full RMS payments table
CREATE INDEX IF NOT EXISTS idx_payments_status_org 
ON public.payments(status, org_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_at 
ON public.payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_source_matched 
ON public.payments(source, matched_tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_checkout_req_id
ON public.payments(checkout_request_id);
