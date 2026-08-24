-- Persist the structured clinical source and immutable DOCX revisions for each session.
alter table public.docbot_processing_jobs
  add column output_json jsonb;

alter table public.docbot_processing_jobs
  add constraint docbot_processing_jobs_output_json_object
  check (output_json is null or jsonb_typeof(output_json) = 'object');

alter table public.docbot_processing_jobs
  add constraint docbot_processing_jobs_id_user_id_unique
  unique (id, user_id);

comment on column public.docbot_processing_jobs.output_json is
  'Canonical structured clinical extraction returned by Gemini for this audio.';

create table public.docbot_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  current_revision_id uuid,
  template_key text not null default 'historia-clinica-medicina-interna-v1',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_reports_id_user_id_unique unique (id, user_id),
  constraint docbot_reports_session_user_id_unique unique (session_id, user_id),
  constraint docbot_reports_session_owner_fkey
    foreign key (session_id, user_id)
    references public.docbot_sessions (id, user_id)
    on delete cascade,
  constraint docbot_reports_template_key_length
    check (char_length(template_key) between 1 and 120)
);

create table public.docbot_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  revision_number integer not null,
  source_processing_job_id uuid,
  clinical_json jsonb not null,
  document_object_key text not null,
  document_file_name text not null,
  document_mime_type text not null
    default 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  document_text text not null,
  change_summary text,
  originating_message_id text,
  created_at timestamp with time zone not null default now(),

  constraint docbot_report_revisions_id_report_user_unique
    unique (id, report_id, user_id),
  constraint docbot_report_revisions_report_number_unique
    unique (report_id, revision_number),
  constraint docbot_report_revisions_report_owner_fkey
    foreign key (report_id, user_id)
    references public.docbot_reports (id, user_id)
    on delete cascade,
  constraint docbot_report_revisions_processing_owner_fkey
    foreign key (source_processing_job_id, user_id)
    references public.docbot_processing_jobs (id, user_id)
    on delete cascade,
  constraint docbot_report_revisions_number_positive
    check (revision_number > 0),
  constraint docbot_report_revisions_clinical_json_object
    check (jsonb_typeof(clinical_json) = 'object'),
  constraint docbot_report_revisions_object_key_length
    check (char_length(document_object_key) between 1 and 1024),
  constraint docbot_report_revisions_file_name_length
    check (char_length(document_file_name) between 1 and 240),
  constraint docbot_report_revisions_document_text_length
    check (char_length(document_text) <= 1000000),
  constraint docbot_report_revisions_change_summary_length
    check (change_summary is null or char_length(change_summary) <= 1200),
  constraint docbot_report_revisions_originating_message_length
    check (
      originating_message_id is null
      or char_length(originating_message_id) <= 128
    )
);

alter table public.docbot_reports
  add constraint docbot_reports_current_revision_fkey
  foreign key (current_revision_id, id, user_id)
  references public.docbot_report_revisions (id, report_id, user_id)
  deferrable initially deferred;

comment on table public.docbot_reports is
  'One user-owned clinical report per DocBot session, pointing to its current immutable revision.';
comment on table public.docbot_report_revisions is
  'Immutable structured clinical snapshots and versioned DOCX objects for a DocBot report.';
comment on column public.docbot_report_revisions.clinical_json is
  'Structured clinical source used to create this revision; revision one is the canonical Gemini extraction.';

create index docbot_reports_user_updated_idx
on public.docbot_reports (user_id, updated_at desc, id desc);

create index docbot_report_revisions_user_report_created_idx
on public.docbot_report_revisions (user_id, report_id, revision_number desc);

create index docbot_report_revisions_processing_owner_idx
on public.docbot_report_revisions (source_processing_job_id, user_id)
where source_processing_job_id is not null;

alter table public.docbot_reports enable row level security;
alter table public.docbot_report_revisions enable row level security;

revoke all on table public.docbot_reports from anon, authenticated;
revoke all on table public.docbot_report_revisions from anon, authenticated;

grant select, insert on table public.docbot_reports to authenticated;
grant update (current_revision_id, updated_at)
  on public.docbot_reports to authenticated;
grant select, insert on table public.docbot_report_revisions to authenticated;

create policy "Users can read their own DocBot reports"
on public.docbot_reports
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own DocBot reports"
on public.docbot_reports
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own DocBot reports"
on public.docbot_reports
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their own DocBot report revisions"
on public.docbot_report_revisions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own DocBot report revisions"
on public.docbot_report_revisions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.docbot_reports as report
    where report.id = report_id
      and report.user_id = (select auth.uid())
  )
);
