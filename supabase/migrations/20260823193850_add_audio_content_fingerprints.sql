-- Identify byte-for-byte duplicate audio per user before creating another R2 object.
alter table public.docbot_upload_files
  add column content_sha256 text;

alter table public.docbot_upload_files
  add constraint docbot_upload_files_content_sha256_valid
  check (
    content_sha256 is null
    or (
      kind = 'audio'
      and content_sha256 ~ '^[0-9a-f]{64}$'
    )
  );

comment on column public.docbot_upload_files.content_sha256 is
  'Lowercase SHA-256 fingerprint for canonical user-owned audio. Legacy duplicate rows may remain null.';

create unique index docbot_upload_files_user_audio_sha256_active_uidx
on public.docbot_upload_files (user_id, content_sha256)
where kind = 'audio'
  and content_sha256 is not null
  and status in ('pending', 'uploaded');
