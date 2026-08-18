-- A profile row must not disappear while its private CV object is still
-- referenced. Operators remove the Storage object and metadata first, then
-- delete the profile, so no untracked personal document can remain behind.
alter table public.freelancer_cv_documents
  drop constraint freelancer_cv_documents_profile_id_fkey;

alter table public.freelancer_cv_documents
  add constraint freelancer_cv_documents_profile_id_fkey
  foreign key (profile_id)
  references public.freelancer_profiles (id)
  on delete restrict;

comment on constraint freelancer_cv_documents_profile_id_fkey
  on public.freelancer_cv_documents is
  'Requires operators to remove the private Storage object and CV metadata before deleting a freelancer profile.';
