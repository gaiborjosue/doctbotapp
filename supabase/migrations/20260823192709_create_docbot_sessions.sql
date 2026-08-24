-- Persist one user-owned chat session for every successfully processed audio source.
alter table public.docbot_processing_jobs
  alter column model set default 'gemini-2.5-flash';

alter table public.docbot_processing_jobs
  add constraint docbot_processing_jobs_id_upload_user_unique
  unique (id, upload_id, user_id);

comment on table public.docbot_processing_jobs is
  'Canonical Gemini audio-processing state and text output for authenticated users.';

create table public.docbot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  upload_id uuid not null,
  processing_job_id uuid not null unique,
  title text not null,
  created_at timestamp with time zone not null default now(),
  last_activity_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_sessions_id_user_id_unique unique (id, user_id),
  constraint docbot_sessions_upload_owner_fkey
    foreign key (upload_id, user_id)
    references public.docbot_uploads (id, user_id)
    on delete cascade,
  constraint docbot_sessions_processing_source_fkey
    foreign key (processing_job_id, upload_id, user_id)
    references public.docbot_processing_jobs (id, upload_id, user_id)
    on delete cascade,
  constraint docbot_sessions_title_length
    check (char_length(title) between 1 and 160)
);

comment on table public.docbot_sessions is
  'User-owned chat sessions whose canonical context is a completed Gemini processing job.';
comment on column public.docbot_sessions.processing_job_id is
  'References the canonical Gemini output used as the foundation for this session.';

create index docbot_sessions_user_activity_idx
on public.docbot_sessions (user_id, last_activity_at desc, id desc);

create index docbot_sessions_upload_owner_idx
on public.docbot_sessions (upload_id, user_id);

alter table public.docbot_sessions enable row level security;

revoke all on table public.docbot_sessions from anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.docbot_sessions to authenticated;

create policy "Users can read their own DocBot sessions"
on public.docbot_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.sync_docbot_session_from_processing_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  session_title text;
  session_created_at timestamp with time zone;
begin
  if new.status <> 'completed'
    or new.output_text is null
    or btrim(new.output_text) = '' then
    return new;
  end if;

  if request_user_id is not null and request_user_id <> new.user_id then
    raise exception 'The processing source does not belong to the authenticated user.'
      using errcode = '42501';
  end if;

  select left(
    coalesce(
      nullif(
        btrim(regexp_replace(upload_file.original_name, '\.[^.]+$', '')),
        ''
      ),
      'Audio session'
    ),
    160
  )
  into session_title
  from public.docbot_upload_files as upload_file
  where upload_file.upload_id = new.upload_id
    and upload_file.user_id = new.user_id
    and upload_file.kind = 'audio'
  order by upload_file.created_at
  limit 1;

  session_title := coalesce(session_title, 'Audio session');
  session_created_at := coalesce(new.completed_at, new.updated_at, now());

  insert into public.docbot_sessions (
    user_id,
    upload_id,
    processing_job_id,
    title,
    created_at,
    last_activity_at,
    updated_at
  )
  values (
    new.user_id,
    new.upload_id,
    new.id,
    session_title,
    session_created_at,
    session_created_at,
    session_created_at
  )
  on conflict (processing_job_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.sync_docbot_session_from_processing_job()
from public, anon, authenticated;

create trigger sync_docbot_session_after_processing
after insert or update on public.docbot_processing_jobs
for each row
execute function private.sync_docbot_session_from_processing_job();

-- Backfill sessions for audio that completed before session persistence existed.
insert into public.docbot_sessions (
  user_id,
  upload_id,
  processing_job_id,
  title,
  created_at,
  last_activity_at,
  updated_at
)
select
  processing_job.user_id,
  processing_job.upload_id,
  processing_job.id,
  left(
    coalesce(
      nullif(
        btrim(regexp_replace(upload_file.original_name, '\.[^.]+$', '')),
        ''
      ),
      'Audio session'
    ),
    160
  ),
  coalesce(
    processing_job.completed_at,
    processing_job.updated_at,
    processing_job.created_at
  ),
  coalesce(
    processing_job.completed_at,
    processing_job.updated_at,
    processing_job.created_at
  ),
  coalesce(
    processing_job.completed_at,
    processing_job.updated_at,
    processing_job.created_at
  )
from public.docbot_processing_jobs as processing_job
left join lateral (
  select candidate.original_name
  from public.docbot_upload_files as candidate
  where candidate.upload_id = processing_job.upload_id
    and candidate.user_id = processing_job.user_id
    and candidate.kind = 'audio'
  order by candidate.created_at
  limit 1
) as upload_file on true
where processing_job.status = 'completed'
  and processing_job.output_text is not null
  and btrim(processing_job.output_text) <> ''
on conflict (processing_job_id) do nothing;
