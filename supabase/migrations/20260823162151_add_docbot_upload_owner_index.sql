drop index if exists public.docbot_upload_files_upload_idx;

create index docbot_upload_files_upload_owner_idx
on public.docbot_upload_files (upload_id, user_id);
