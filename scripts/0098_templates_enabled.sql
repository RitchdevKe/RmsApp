-- scripts/0098_templates_enabled.sql
--
-- Add `enabled` flag to communication_templates so admins can disable
-- individual automated reminders without removing them. Disabled templates
-- are skipped by the scheduled-rent-reminders edge function so nothing
-- gets queued while disabled.

alter table public.communication_templates
  add column if not exists enabled boolean not null default true;

-- Refresh load RPC to include the new field
create or replace function app.load_communication_templates()
returns jsonb language sql stable security definer
set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',      t.id,
    'name',    t.name,
    'type',    t.type,
    'content', t.content,
    'enabled', t.enabled
  ) order by t.name asc), '[]'::jsonb)
  from public.communication_templates t;
$$;
grant execute on function app.load_communication_templates() to authenticated;

-- Refresh single-upsert RPC to persist `enabled`
create or replace function app.upsert_communication_template(p_t jsonb)
returns jsonb language plpgsql security definer
set search_path = app, public
as $$
declare v_id text := p_t->>'id';
begin
  if v_id is null then raise exception 'communication_template.id is required'; end if;
  insert into public.communication_templates (id, name, type, content, enabled, updated_at)
  values (
    v_id,
    coalesce(p_t->>'name', ''),
    coalesce(p_t->>'type', 'SMS'),
    coalesce(p_t->>'content', ''),
    coalesce((p_t->>'enabled')::boolean, true),
    now()
  )
  on conflict (id) do update set
    name       = excluded.name,
    type       = excluded.type,
    content    = excluded.content,
    enabled    = excluded.enabled,
    updated_at = now();
  return p_t;
end;
$$;
grant execute on function app.upsert_communication_template(jsonb) to authenticated, service_role;
