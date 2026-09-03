alter table public.docbot_template_versions
  add column source_size_bytes bigint not null,
  add column source_mime_type text not null;

alter table public.docbot_template_versions
  add constraint docbot_template_versions_source_size_valid
  check (source_size_bytes between 1 and 10485760),
  add constraint docbot_template_versions_source_mime_length
  check (char_length(source_mime_type) between 1 and 255);

comment on column public.docbot_template_versions.source_size_bytes is
  'Expected upload size, verified against R2 before opening the untrusted DOCX.';
comment on column public.docbot_template_versions.source_mime_type is
  'Client-declared MIME type used for the signed private R2 upload.';
