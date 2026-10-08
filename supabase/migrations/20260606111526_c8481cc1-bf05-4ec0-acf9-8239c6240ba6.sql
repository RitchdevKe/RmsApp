
-- 1. Documents bucket: private + owner-scoped policies
drop policy if exists "documents public read" on storage.objects;
drop policy if exists "documents_select_public" on storage.objects;
drop policy if exists "documents auth write" on storage.objects;
drop policy if exists "documents auth update" on storage.objects;
drop policy if exists "documents auth delete" on storage.objects;
drop policy if exists "documents_insert_own" on storage.objects;

create policy "documents owner read"
on storage.objects for select to authenticated
using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents owner write"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents owner update"
on storage.objects for update to authenticated
using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- 2. Public buckets: drop broad SELECT policies so listing isn't allowed.
--    Files remain fetchable via direct public URLs (bucket public=true).
drop policy if exists "profile-pictures public read" on storage.objects;
drop policy if exists "profile-pictures_select_public" on storage.objects;
drop policy if exists "property-photos_select_public" on storage.objects;
drop policy if exists "maintenance-photos_select_public" on storage.objects;

-- 3. Impersonation tokens: only super-admins may read raw tokens
drop policy if exists "imp_select_super_only" on public.org_impersonation_tokens;
create policy "imp_select_super_only"
on public.org_impersonation_tokens for select to authenticated
using (public.is_super_admin());

-- 4. Prevent tier escalation: block non-super-admins from changing org tier
create or replace function public.guard_org_tier_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.tier is distinct from OLD.tier and not public.is_super_admin() then
    raise exception 'Only super-admins can change organization tier';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_org_tier_change on public.organizations;
create trigger trg_guard_org_tier_change
before update on public.organizations
for each row execute function public.guard_org_tier_change();

-- 5. Lock down SECURITY DEFINER function execution: revoke PUBLIC, grant
--    explicitly to the roles that need them. resolve_org_by_host/shortcode
--    must remain callable by anon (host-based tenant resolution pre-auth).
revoke execute on function public.current_org_id() from public;
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.is_org_admin(uuid) from public;
revoke execute on function public.is_super_admin() from public;
revoke execute on function public.bootstrap_super_admin() from public;
revoke execute on function public.accept_org_invitation(text) from public;
revoke execute on function public.create_organization(text, text, org_tier, text, jsonb, text, text) from public;
revoke execute on function public.set_organization_status(uuid, org_status, text) from public;
revoke execute on function public.resolve_org_by_host(text) from public;
revoke execute on function public.resolve_org_by_shortcode(text) from public;
revoke execute on function public.auto_grant_integral_super_admin() from public;
revoke execute on function public.guard_org_tier_change() from public;
revoke execute on function public.set_updated_at() from public;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.bootstrap_super_admin() to authenticated;
grant execute on function public.accept_org_invitation(text) to authenticated;
grant execute on function public.create_organization(text, text, org_tier, text, jsonb, text, text) to authenticated;
grant execute on function public.set_organization_status(uuid, org_status, text) to authenticated;
grant execute on function public.resolve_org_by_host(text) to anon, authenticated;
grant execute on function public.resolve_org_by_shortcode(text) to anon, authenticated;
