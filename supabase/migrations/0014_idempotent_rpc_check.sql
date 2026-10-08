-- Ensure public RPCs exist on projects that were linked before 0013 was added.
-- Safe to re-run: replaces functions with the same signatures.

drop function if exists public.check_phone_unique(text);
drop function if exists app.check_phone_unique(text);

create or replace function app.check_phone_unique(
  p_phone text
)
returns table(
  user_id text,
  source text,
  name text,
  email text
)
language sql
security definer
set search_path = app, public, auth
as $$
  select t.id::text as user_id, 'tenant'::text as source, t.name, t.email
    from public.tenants t
   where t.phone = p_phone
  union all
  select l.id::text as user_id, 'landlord'::text as source, l.name, l.email
    from public.landlords l
   where l.phone = p_phone
  union all
  select s.id::text as user_id, 'staff'::text as source, s.name, s.email
    from app.staff_profiles s
   where s.phone = p_phone;
$$;

create or replace function public.check_phone_unique(
  p_phone text
)
returns table(
  user_id text,
  source text,
  name text,
  email text
)
language sql
security definer
set search_path = public, app, auth
as $$
  select * from app.check_phone_unique(p_phone := p_phone);
$$;

grant execute on function public.check_phone_unique(text) to authenticated;
