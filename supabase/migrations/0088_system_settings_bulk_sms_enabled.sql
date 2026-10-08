begin;

alter table if exists public.system_settings
  add column if not exists bulk_sms_enabled boolean not null default false;

create or replace function app.load_system_settings()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    jsonb_strip_nulls(jsonb_build_object(
      'companyName',             s.company_name,
      'logo',                    s.logo,
      'profilePic',              s.profile_pic,
      'address',                 s.address,
      'phone',                   s.phone,
      'shortcode',               s.shortcode,
      'agencyPaybill',           s.agency_paybill,
      'agencyAirtelPartnerId',   s.agency_airtel_partner_id,
      'softwareConstants',       case when s.software_constants = '{}'::jsonb then null else s.software_constants end,
      'bulkSmsEnabled',          s.bulk_sms_enabled
    )),
    jsonb_build_object('companyName', 'TaskMe Realty', 'bulkSmsEnabled', false)
  )
  from public.system_settings s
  where s.id = 'singleton';
$$;

grant execute on function app.load_system_settings() to authenticated;

create or replace function app.upsert_system_settings(p_s jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
begin
  insert into public.system_settings
    (id, company_name, logo, profile_pic, address, phone, shortcode,
     agency_paybill, agency_airtel_partner_id, software_constants, bulk_sms_enabled, updated_at)
  values (
    'singleton',
    coalesce(p_s->>'companyName', 'TaskMe Realty'),
    p_s->>'logo',
    p_s->>'profilePic',
    p_s->>'address',
    p_s->>'phone',
    p_s->>'shortcode',
    p_s->>'agencyPaybill',
    p_s->>'agencyAirtelPartnerId',
    coalesce(p_s->'softwareConstants', '{}'::jsonb),
    coalesce((p_s->>'bulkSmsEnabled')::boolean, false),
    now()
  )
  on conflict (id) do update set
    company_name             = coalesce(excluded.company_name, 'TaskMe Realty'),
    logo                     = excluded.logo,
    profile_pic              = excluded.profile_pic,
    address                  = excluded.address,
    phone                    = excluded.phone,
    shortcode                = excluded.shortcode,
    agency_paybill           = excluded.agency_paybill,
    agency_airtel_partner_id = excluded.agency_airtel_partner_id,
    software_constants       = excluded.software_constants,
    bulk_sms_enabled         = case
                                 when p_s ? 'bulkSmsEnabled' then coalesce((p_s->>'bulkSmsEnabled')::boolean, false)
                                 else public.system_settings.bulk_sms_enabled
                               end,
    updated_at               = now();
  return p_s;
end;
$$;

grant execute on function app.upsert_system_settings(jsonb) to authenticated, service_role;

do $$
declare
  v_bulk_sms_enabled boolean;
begin
  if to_regclass('app.app_state') is not null then
    execute $sql$
      select case
               when jsonb_typeof(value) = 'object' and value ? 'bulkSmsEnabled'
                 then coalesce((value->>'bulkSmsEnabled')::boolean, false)
               else null
             end
      from app.app_state
      where key = 'tm_system_settings_v11'
      limit 1
    $sql$
    into v_bulk_sms_enabled;

    if v_bulk_sms_enabled is not null then
      insert into public.system_settings (id, bulk_sms_enabled, updated_at)
      values ('singleton', v_bulk_sms_enabled, now())
      on conflict (id) do update set
        bulk_sms_enabled = excluded.bulk_sms_enabled,
        updated_at = now();
    end if;
  end if;
end $$;

commit;
