-- Preserve an audit record after an R2 object is deleted while allowing the
-- same canonical object key to be uploaded again later.
alter table public.docbot_upload_files
  drop constraint docbot_upload_files_status_valid;

alter table public.docbot_upload_files
  add constraint docbot_upload_files_status_valid
  check (status in ('pending', 'uploaded', 'failed', 'deleted'));

alter table public.docbot_upload_files
  drop constraint docbot_upload_files_object_key_key;

create unique index docbot_upload_files_active_object_key_uidx
on public.docbot_upload_files (object_key)
where status in ('pending', 'uploaded');

comment on column public.docbot_upload_files.status is
  'R2 object lifecycle: pending, uploaded, failed, or deleted.';
