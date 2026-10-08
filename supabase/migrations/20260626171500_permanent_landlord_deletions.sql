-- Migration to support permanent, unrestricted deletions of landlords and landlord applications
-- across both Full and Partial RMS databases.

-- Disable RLS on the core tables so delete statements from the application client can be performed directly.
ALTER TABLE public.landlord_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.partial_landlords DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.partial_landlord_applications DISABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated and service_role roles to perform all operations
GRANT ALL ON TABLE public.landlords TO authenticated, service_role;
GRANT ALL ON TABLE public.partial_landlords TO authenticated, service_role;
GRANT ALL ON TABLE public.landlord_applications TO authenticated, service_role;
GRANT ALL ON TABLE public.partial_landlord_applications TO authenticated, service_role;
