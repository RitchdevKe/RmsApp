begin;

create or replace function public.get_public_branding()
returns jsonb language sql stable security definer
as $$
  select coalesce(
    jsonb_strip_nulls(jsonb_build_object(
      'companyName', s.company_name,
      'logo', s.logo
    )),
    jsonb_build_object('companyName', 'TaskMe Realty')
  )
  from public.system_settings s
  where s.id = 'singleton';
$$;

grant execute on function public.get_public_branding() to anon, authenticated;

commit;
