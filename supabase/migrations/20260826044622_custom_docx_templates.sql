-- User-owned DOCX templates and deterministic tag-based routing.
create table public.docbot_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_tags_id_user_id_unique unique (id, user_id),
  constraint docbot_tags_user_normalized_unique unique (user_id, normalized_name),
  constraint docbot_tags_name_length check (char_length(name) between 1 and 40),
  constraint docbot_tags_normalized_name_valid check (
    char_length(normalized_name) between 1 and 40
    and normalized_name = lower(btrim(normalized_name))
  )
);

create table public.docbot_upload_tags (
  upload_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now(),

  primary key (upload_id, tag_id),
  constraint docbot_upload_tags_upload_owner_fkey
    foreign key (upload_id, user_id)
    references public.docbot_uploads (id, user_id)
    on delete cascade,
  constraint docbot_upload_tags_tag_owner_fkey
    foreign key (tag_id, user_id)
    references public.docbot_tags (id, user_id)
    on delete cascade
);

create table public.docbot_session_tags (
  session_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now(),

  primary key (session_id, tag_id),
  constraint docbot_session_tags_session_owner_fkey
    foreign key (session_id, user_id)
    references public.docbot_sessions (id, user_id)
    on delete cascade,
  constraint docbot_session_tags_tag_owner_fkey
    foreign key (tag_id, user_id)
    references public.docbot_tags (id, user_id)
    on delete cascade
);

create table public.docbot_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft',
  is_default boolean not null default false,
  current_version_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_templates_id_user_id_unique unique (id, user_id),
  constraint docbot_templates_name_length check (char_length(name) between 1 and 80),
  constraint docbot_templates_description_length check (
    description is null or char_length(description) <= 500
  ),
  constraint docbot_templates_status_valid check (status in ('draft', 'active', 'archived')),
  constraint docbot_templates_active_has_version check (
    status <> 'active' or current_version_id is not null
  )
);

create unique index docbot_templates_one_default_per_user_idx
on public.docbot_templates (user_id)
where is_default and status = 'active';

create table public.docbot_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_number integer not null,
  status text not null default 'uploaded',
  extraction_mode text not null default 'structure_and_wording',
  source_file_name text not null,
  source_content_sha256 text not null,
  source_object_key text,
  sanitized_object_key text,
  sanitized_file_name text,
  structure_json jsonb,
  field_mappings jsonb,
  analysis_notes jsonb,
  failure_message text,
  created_at timestamp with time zone not null default now(),
  analyzed_at timestamp with time zone,

  constraint docbot_template_versions_id_user_id_unique
    unique (id, user_id),
  constraint docbot_template_versions_id_template_user_unique
    unique (id, template_id, user_id),
  constraint docbot_template_versions_template_number_unique
    unique (template_id, version_number),
  constraint docbot_template_versions_template_owner_fkey
    foreign key (template_id, user_id)
    references public.docbot_templates (id, user_id)
    on delete cascade,
  constraint docbot_template_versions_number_positive check (version_number > 0),
  constraint docbot_template_versions_status_valid
    check (status in ('uploaded', 'analyzing', 'ready', 'failed')),
  constraint docbot_template_versions_extraction_mode_valid
    check (extraction_mode in ('structure_only', 'structure_and_wording')),
  constraint docbot_template_versions_source_name_length
    check (char_length(source_file_name) between 1 and 240),
  constraint docbot_template_versions_source_sha256_valid
    check (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint docbot_template_versions_source_key_length
    check (source_object_key is null or char_length(source_object_key) between 1 and 1024),
  constraint docbot_template_versions_sanitized_key_length
    check (sanitized_object_key is null or char_length(sanitized_object_key) between 1 and 1024),
  constraint docbot_template_versions_sanitized_name_length
    check (sanitized_file_name is null or char_length(sanitized_file_name) between 1 and 240),
  constraint docbot_template_versions_structure_object
    check (structure_json is null or jsonb_typeof(structure_json) = 'object'),
  constraint docbot_template_versions_mappings_array
    check (field_mappings is null or jsonb_typeof(field_mappings) = 'array'),
  constraint docbot_template_versions_notes_array
    check (analysis_notes is null or jsonb_typeof(analysis_notes) = 'array'),
  constraint docbot_template_versions_failure_length
    check (failure_message is null or char_length(failure_message) <= 1000),
  constraint docbot_template_versions_ready_has_artifact check (
    status <> 'ready'
    or (
      sanitized_object_key is not null
      and sanitized_file_name is not null
      and structure_json is not null
      and field_mappings is not null
      and analyzed_at is not null
    )
  )
);

alter table public.docbot_templates
  add constraint docbot_templates_current_version_owner_fkey
  foreign key (current_version_id, id, user_id)
  references public.docbot_template_versions (id, template_id, user_id)
  deferrable initially deferred;

create table public.docbot_template_tag_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tag_id uuid not null,
  template_id uuid not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_template_tag_rules_id_user_id_unique unique (id, user_id),
  constraint docbot_template_tag_rules_user_tag_unique unique (user_id, tag_id),
  constraint docbot_template_tag_rules_tag_owner_fkey
    foreign key (tag_id, user_id)
    references public.docbot_tags (id, user_id)
    on delete cascade,
  constraint docbot_template_tag_rules_template_owner_fkey
    foreign key (template_id, user_id)
    references public.docbot_templates (id, user_id)
    on delete cascade,
  constraint docbot_template_tag_rules_priority_valid check (priority between 1 and 1000)
);

alter table public.docbot_reports
  add column template_version_id uuid;

alter table public.docbot_reports
  add constraint docbot_reports_template_version_owner_fkey
  foreign key (template_version_id, user_id)
  references public.docbot_template_versions (id, user_id);

comment on table public.docbot_tags is
  'Normalized, user-owned labels used to route sessions to custom report templates.';
comment on table public.docbot_templates is
  'User-owned custom clinical DOCX template profiles. Active reports are pinned to a concrete version.';
comment on table public.docbot_template_versions is
  'Immutable-ready sanitized DOCX artifacts derived from user-provided examples.';
comment on table public.docbot_template_tag_rules is
  'One deterministic custom-template route per user-owned session tag.';
comment on column public.docbot_template_versions.source_object_key is
  'Temporary private R2 object deleted after analysis succeeds or fails.';
comment on column public.docbot_reports.template_version_id is
  'The exact custom template version used to create this report; null means the built-in template.';

create index docbot_upload_tags_user_tag_idx
on public.docbot_upload_tags (user_id, tag_id, upload_id);

create index docbot_session_tags_user_tag_idx
on public.docbot_session_tags (user_id, tag_id, session_id);

create index docbot_templates_user_status_updated_idx
on public.docbot_templates (user_id, status, updated_at desc, id desc);

create index docbot_template_versions_user_template_created_idx
on public.docbot_template_versions (user_id, template_id, created_at desc);

create index docbot_template_tag_rules_template_owner_idx
on public.docbot_template_tag_rules (template_id, user_id)
where enabled;

create index docbot_reports_template_version_owner_idx
on public.docbot_reports (template_version_id, user_id)
where template_version_id is not null;

alter table public.docbot_tags enable row level security;
alter table public.docbot_upload_tags enable row level security;
alter table public.docbot_session_tags enable row level security;
alter table public.docbot_templates enable row level security;
alter table public.docbot_template_versions enable row level security;
alter table public.docbot_template_tag_rules enable row level security;

revoke all on table public.docbot_tags from anon, authenticated;
revoke all on table public.docbot_upload_tags from anon, authenticated;
revoke all on table public.docbot_session_tags from anon, authenticated;
revoke all on table public.docbot_templates from anon, authenticated;
revoke all on table public.docbot_template_versions from anon, authenticated;
revoke all on table public.docbot_template_tag_rules from anon, authenticated;

grant select, insert, update, delete on table public.docbot_tags to authenticated;
grant select, insert, update, delete on table public.docbot_upload_tags to authenticated;
grant select, insert, delete on table public.docbot_session_tags to authenticated;
grant select, insert, update on table public.docbot_templates to authenticated;
grant select, insert, update on table public.docbot_template_versions to authenticated;
grant select, insert, update, delete on table public.docbot_template_tag_rules to authenticated;
grant update (template_key, template_version_id, updated_at)
  on public.docbot_reports to authenticated;

create policy "Users can manage their own DocBot tags"
on public.docbot_tags
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage their own upload tags"
on public.docbot_upload_tags
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own session tags"
on public.docbot_session_tags
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own session tags"
on public.docbot_session_tags
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own session tags"
on public.docbot_session_tags
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can manage their own DocBot templates"
on public.docbot_templates
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage their own DocBot template versions"
on public.docbot_template_versions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage their own template tag rules"
on public.docbot_template_tag_rules
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function private.copy_docbot_upload_tags_to_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.docbot_session_tags (session_id, tag_id, user_id)
  select new.id, upload_tag.tag_id, new.user_id
  from public.docbot_upload_tags as upload_tag
  where upload_tag.upload_id = new.upload_id
    and upload_tag.user_id = new.user_id
  on conflict (session_id, tag_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.copy_docbot_upload_tags_to_session()
from public, anon, authenticated;

create trigger copy_docbot_upload_tags_after_session_insert
after insert on public.docbot_sessions
for each row
execute function private.copy_docbot_upload_tags_to_session();
