-- Profile pictures + documents storage buckets used by the user app portal
-- (UserProfile photo upload, Applications document capture). Buckets are
-- public-read so <img src> works without signed URLs; writes are limited to
-- authenticated users uploading into their own user-id-prefixed folder.

insert into storage.buckets (id, name, public)
values
  ('profile-pictures', 'profile-pictures', true),
  ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

-- profile-pictures: public read, authenticated users can manage files inside
-- a folder named after their auth.uid.
drop policy if exists "profile-pictures public read" on storage.objects;
create policy "profile-pictures public read"
on storage.objects for select
using (bucket_id = 'profile-pictures');

drop policy if exists "profile-pictures owner write" on storage.objects;
create policy "profile-pictures owner write"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-pictures' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "profile-pictures owner update" on storage.objects;
create policy "profile-pictures owner update"
on storage.objects for update to authenticated
using (bucket_id = 'profile-pictures' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "profile-pictures owner delete" on storage.objects;
create policy "profile-pictures owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-pictures' and auth.uid()::text = (storage.foldername(name))[1]);

-- documents: same shape. Tenants/staff upload ID copies, leases, inventory
-- checklists, etc. Public read keeps existing <img>/preview flows working.
drop policy if exists "documents public read" on storage.objects;
create policy "documents public read"
on storage.objects for select
using (bucket_id = 'documents');

drop policy if exists "documents auth write" on storage.objects;
create policy "documents auth write"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents');

drop policy if exists "documents auth update" on storage.objects;
create policy "documents auth update"
on storage.objects for update to authenticated
using (bucket_id = 'documents');

drop policy if exists "documents auth delete" on storage.objects;
create policy "documents auth delete"
on storage.objects for delete to authenticated
using (bucket_id = 'documents');
