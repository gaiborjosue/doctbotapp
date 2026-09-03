-- Persist authenticated R2 upload groups and their object metadata.
create table public.docbot_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null default 'upload',
  status text not null default 'uploading',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_uploads_id_user_id_unique unique (id, user_id),
  constraint docbot_uploads_source_valid
    check (source in ('upload', 'recording')),
  constraint docbot_uploads_status_valid
    check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed'))
);

create table public.docbot_upload_files (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_name text not null,
  object_key text not null unique,
  kind text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  etag text,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  uploaded_at timestamp with time zone,

  constraint docbot_upload_files_upload_owner_fkey
    foreign key (upload_id, user_id)
    references public.docbot_uploads (id, user_id)
    on delete cascade,
  constraint docbot_upload_files_bucket_name_length
    check (char_length(bucket_name) between 3 and 63),
  constraint docbot_upload_files_object_key_length
    check (char_length(object_key) between 1 and 1024),
  constraint docbot_upload_files_kind_valid
    check (kind in ('audio', 'image', 'file')),
  constraint docbot_upload_files_original_name_length
    check (char_length(original_name) between 1 and 255),
  constraint docbot_upload_files_mime_type_length
    check (char_length(mime_type) between 1 and 255),
  constraint docbot_upload_files_size_valid
    check (size_bytes between 1 and 536870912),
  constraint docbot_upload_files_status_valid
    check (status in ('pending', 'uploaded', 'failed'))
);

comment on table public.docbot_uploads is
  'Authenticated DocBot upload groups and their processing lifecycle.';
comment on table public.docbot_upload_files is
  'Private metadata for user-owned objects stored in Cloudflare R2.';

create index docbot_uploads_user_created_idx
on public.docbot_uploads (user_id, created_at desc);

create index docbot_upload_files_upload_idx
on public.docbot_upload_files (upload_id);

create index docbot_upload_files_user_created_idx
on public.docbot_upload_files (user_id, created_at desc);

alter table public.docbot_uploads enable row level security;
alter table public.docbot_upload_files enable row level security;

revoke all on table public.docbot_uploads from anon;
revoke all on table public.docbot_upload_files from anon;
grant usage on schema public to authenticated;
grant select, insert, update on table public.docbot_uploads to authenticated;
grant select, insert, update on table public.docbot_upload_files to authenticated;

create policy "Users can read their own uploads"
on public.docbot_uploads
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own uploads"
on public.docbot_uploads
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own uploads"
on public.docbot_uploads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own upload files"
on public.docbot_upload_files
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own upload files"
on public.docbot_upload_files
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own upload files"
on public.docbot_upload_files
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
