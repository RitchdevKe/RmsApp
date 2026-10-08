-- supabase/migrations/0008_storage_buckets.sql
-- Storage buckets: profile-pictures, documents, property-photos, maintenance-photos
-- Public read; upload restricted to user's own folder (/{user_id}/...)

insert into storage.buckets (id, name, public)
values
  ('profile-pictures', 'profile-pictures', true),
  ('documents', 'documents', true),
  ('property-photos', 'property-photos', true),
  ('maintenance-photos', 'maintenance-photos', true)
on conflict (id) do update set public = excluded.public;

-- RLS: users can only upload to their own folder (path starts with {user_id}/)
drop policy if exists "profile-pictures_insert_own" on storage.objects;
create policy "profile-pictures_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-pictures' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile-pictures_select_public" on storage.objects;
create policy "profile-pictures_select_public"
on storage.objects for select to public
using (bucket_id = 'profile-pictures');

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "documents_select_public" on storage.objects;
create policy "documents_select_public"
on storage.objects for select to public
using (bucket_id = 'documents');

drop policy if exists "property-photos_insert_own" on storage.objects;
create policy "property-photos_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "property-photos_select_public" on storage.objects;
create policy "property-photos_select_public"
on storage.objects for select to public
using (bucket_id = 'property-photos');

drop policy if exists "maintenance-photos_insert_own" on storage.objects;
create policy "maintenance-photos_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'maintenance-photos' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "maintenance-photos_select_public" on storage.objects;
create policy "maintenance-photos_select_public"
on storage.objects for select to public
using (bucket_id = 'maintenance-photos');
