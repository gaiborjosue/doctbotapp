-- Persist durable, user-owned Gemini background interaction state.
create table public.docbot_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'google',
  model text not null default 'gemini-3.7-flash',
  interaction_id text unique,
  status text not null default 'preparing',
  output_text text,
  error_message text,
  poll_attempts integer not null default 0,
  consecutive_poll_errors integer not null default 0,
  created_at timestamp with time zone not null default now(),
  submitted_at timestamp with time zone,
  last_polled_at timestamp with time zone,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone not null default now(),

  constraint docbot_processing_jobs_upload_owner_fkey
    foreign key (upload_id, user_id)
    references public.docbot_uploads (id, user_id)
    on delete cascade,
  constraint docbot_processing_jobs_provider_valid
    check (provider = 'google'),
  constraint docbot_processing_jobs_model_length
    check (char_length(model) between 1 and 100),
  constraint docbot_processing_jobs_interaction_id_length
    check (interaction_id is null or char_length(interaction_id) between 1 and 512),
  constraint docbot_processing_jobs_status_valid
    check (
      status in (
        'preparing',
        'queued',
        'in_progress',
        'requires_action',
        'completed',
        'failed',
        'cancelled',
        'incomplete',
        'budget_exceeded'
      )
    ),
  constraint docbot_processing_jobs_output_length
    check (output_text is null or char_length(output_text) <= 200000),
  constraint docbot_processing_jobs_error_length
    check (error_message is null or char_length(error_message) <= 2000),
  constraint docbot_processing_jobs_poll_attempts_valid
    check (poll_attempts >= 0 and consecutive_poll_errors >= 0)
);

comment on table public.docbot_processing_jobs is
  'Durable status and text output for authenticated Gemini background interactions.';

create index docbot_processing_jobs_user_created_idx
on public.docbot_processing_jobs (user_id, created_at desc);

create index docbot_processing_jobs_upload_owner_created_idx
on public.docbot_processing_jobs (upload_id, user_id, created_at desc);

create unique index docbot_processing_jobs_one_active_upload_idx
on public.docbot_processing_jobs (upload_id)
where status in ('preparing', 'queued', 'in_progress');

alter table public.docbot_processing_jobs enable row level security;

revoke all on table public.docbot_processing_jobs from anon;
grant usage on schema public to authenticated;
grant select, insert, update on table public.docbot_processing_jobs to authenticated;

create policy "Users can read their own processing jobs"
on public.docbot_processing_jobs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own processing jobs"
on public.docbot_processing_jobs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own processing jobs"
on public.docbot_processing_jobs
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
