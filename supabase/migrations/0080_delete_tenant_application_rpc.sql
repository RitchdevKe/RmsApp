-- supabase/migrations/0080_delete_tenant_application_rpc.sql
--
-- Adds app.delete_tenant_application(p_id text) so the client can permanently
-- remove a TenantApplication from public.tenant_applications.
-- Mirrors the existing app.delete_tenant(p_id text) pattern.
-- Idempotent.

create or replace function app.delete_tenant_application(p_id text)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from public.tenant_applications where id = p_id;
  return found;
end;
$$;

grant execute on function app.delete_tenant_application(text) to authenticated, service_role;
