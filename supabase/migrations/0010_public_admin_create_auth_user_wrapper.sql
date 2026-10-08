-- Expose admin_create_auth_user in public schema for PostgREST RPC calls.
-- Frontend currently calls supabase.rpc('admin_create_auth_user'), which resolves in public.
create or replace function public.admin_create_auth_user(
  p_email text,
  p_password text,
  p_role text,
  p_full_name text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_id_number text default null
)
returns uuid
language sql
security definer
set search_path = public, app, auth
as $$
  select app.admin_create_auth_user(
    p_email := p_email,
    p_password := p_password,
    p_role := p_role,
    p_full_name := p_full_name,
    p_first_name := p_first_name,
    p_last_name := p_last_name,
    p_phone := p_phone,
    p_id_number := p_id_number
  );
$$;

grant execute on function public.admin_create_auth_user(
  text, text, text, text, text, text, text, text
) to authenticated;
