-- Migration to permanently disable Row-Level Security on core Full RMS tables
-- This aligns Full RMS with Partial RMS (see migration 0110) to prevent silent filtering or empty queries for admins and managers.

ALTER TABLE public.landlords DISABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties DISABLE ROW LEVEL SECURITY;
