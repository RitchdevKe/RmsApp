-- Migration to support sticky multi-occupancy for both Full RMS and Partial RMS
-- Ensures that both public.tenants and public.partial_tenants tables contain occupancy_type and main_tenant_id columns.

-- 0) Ensure all required columns exist in public.tenants (Full RMS)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS occupancy_type text DEFAULT 'Single';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS main_tenant_id text;

-- 1) Ensure all required columns exist in public.partial_tenants (Partial RMS)
ALTER TABLE public.partial_tenants ADD COLUMN IF NOT EXISTS occupancy_type text DEFAULT 'Single';
ALTER TABLE public.partial_tenants ADD COLUMN IF NOT EXISTS main_tenant_id text;

-- 2) Re-grant execute permissions to authenticated and service_role for sync functions
GRANT EXECUTE ON FUNCTION app.upsert_tenant(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.upsert_tenants_bulk(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenant(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.partial_upsert_tenants_bulk(jsonb) TO authenticated, service_role;
