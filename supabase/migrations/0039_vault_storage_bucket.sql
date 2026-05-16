-- 0039_vault_storage_bucket.sql
-- Create the `vault` Supabase Storage bucket + per-agency RLS for uploads.
-- Used by:
--   • Document drag+drop on /vault → Documents (path: vault/{agency_id}/docs/...)
--   • Course-lesson video upload on /vault → Courses (path: vault/{agency_id}/courses/{course_id}/...)
--   • Future: rep-uploaded coaching examples, slide decks, etc.
--
-- Folder convention: {agency_id}/{kind}/{file_id}.{ext}
--   - agency_id is the first folder segment (storage.foldername(name)[1])
--     so the RLS check can scope reads/writes per-agency.
--   - kind is one of 'docs', 'courses', 'misc' (advisory; not enforced).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault','vault',false,524288000,null)
on conflict (id) do update
   set file_size_limit = excluded.file_size_limit,
       public          = excluded.public;

drop policy if exists "vault read own agency" on storage.objects;
create policy "vault read own agency"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vault'
    and (
      (storage.foldername(name))[1]::uuid in (select public.viewer_agency_ids())
      or coalesce((select me.role from public.me() me limit 1), '') = 'super_admin'
    )
  );

drop policy if exists "vault upload own agency" on storage.objects;
create policy "vault upload own agency"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1]::uuid in (select public.viewer_agency_ids())
  );

drop policy if exists "vault update own agency" on storage.objects;
create policy "vault update own agency"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1]::uuid in (select public.viewer_agency_ids())
  );

drop policy if exists "vault delete manager+" on storage.objects;
create policy "vault delete manager+"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vault'
    and public.viewer_is_manager_in((storage.foldername(name))[1]::uuid)
  );
