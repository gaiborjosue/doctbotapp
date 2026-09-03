-- Keep a compact model-facing conversation memory without deleting the full
-- AI SDK UI message history.
alter table public.docbot_sessions
  add column conversation_summary text,
  add column conversation_summary_through_message_id bigint,
  add column conversation_summary_message_count integer not null default 0,
  add column conversation_summary_updated_at timestamp with time zone;

alter table public.docbot_sessions
  add constraint docbot_sessions_conversation_summary_length
  check (
    conversation_summary is null
    or char_length(conversation_summary) <= 250000
  ),
  add constraint docbot_sessions_conversation_summary_count_nonnegative
  check (conversation_summary_message_count >= 0),
  add constraint docbot_sessions_conversation_summary_cursor_fkey
  foreign key (conversation_summary_through_message_id)
  references public.docbot_session_messages (id)
  on delete set null;

create index if not exists docbot_sessions_conversation_summary_cursor_idx
on public.docbot_sessions (conversation_summary_through_message_id)
where conversation_summary_through_message_id is not null;

comment on column public.docbot_sessions.conversation_summary is
  'Rolling Spanish summary of older chat turns. Canonical clinical JSON and DOCX text are stored separately and are never compacted.';
comment on column public.docbot_sessions.conversation_summary_through_message_id is
  'Highest docbot_session_messages.id incorporated into conversation_summary.';

grant update (
  conversation_summary,
  conversation_summary_through_message_id,
  conversation_summary_message_count,
  conversation_summary_updated_at,
  updated_at
) on public.docbot_sessions to authenticated;

-- Store provider-reported aggregate usage for every completed multi-step
-- agent generation. The same compact snapshot is also attached to assistant
-- message metadata so the chat UI can render it without another request.
create table public.docbot_chat_generations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  assistant_message_id text not null,
  model text not null,
  context_limit_tokens integer not null default 67000,
  context_input_tokens integer not null,
  exact_message_count integer not null,
  compacted_message_count integer not null,
  input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  total_tokens integer,
  step_count integer not null,
  created_at timestamp with time zone not null default now(),

  constraint docbot_chat_generations_session_owner_fkey
    foreign key (session_id, user_id)
    references public.docbot_sessions (id, user_id)
    on delete cascade,
  constraint docbot_chat_generations_message_fkey
    foreign key (session_id, assistant_message_id)
    references public.docbot_session_messages (session_id, message_id)
    on delete cascade,
  constraint docbot_chat_generations_session_message_unique
    unique (session_id, assistant_message_id),
  constraint docbot_chat_generations_message_id_length
    check (char_length(assistant_message_id) between 1 and 128),
  constraint docbot_chat_generations_model_length
    check (char_length(model) between 1 and 160),
  constraint docbot_chat_generations_context_limit_positive
    check (context_limit_tokens > 0),
  constraint docbot_chat_generations_counts_nonnegative
    check (
      context_input_tokens >= 0
      and exact_message_count >= 0
      and compacted_message_count >= 0
      and step_count > 0
      and (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (reasoning_tokens is null or reasoning_tokens >= 0)
      and (cache_read_tokens is null or cache_read_tokens >= 0)
      and (cache_write_tokens is null or cache_write_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
    )
);

comment on table public.docbot_chat_generations is
  'Provider-reported aggregate token usage and context composition for each completed DocBot agent response.';
comment on column public.docbot_chat_generations.input_tokens is
  'Aggregate input usage across every tool-loop model step, as reported by the AI SDK.';
comment on column public.docbot_chat_generations.context_input_tokens is
  'Preflight token count for the model-facing canonical state, rolling summary, and exact recent messages.';

create index docbot_chat_generations_session_owner_created_idx
on public.docbot_chat_generations (session_id, user_id, created_at desc);

create index docbot_chat_generations_owner_created_idx
on public.docbot_chat_generations (user_id, created_at desc);

alter table public.docbot_chat_generations enable row level security;

revoke all on table public.docbot_chat_generations from anon, authenticated;
grant select on table public.docbot_chat_generations to authenticated;
grant insert (
  session_id,
  user_id,
  assistant_message_id,
  model,
  context_limit_tokens,
  context_input_tokens,
  exact_message_count,
  compacted_message_count,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  cache_read_tokens,
  cache_write_tokens,
  total_tokens,
  step_count
) on public.docbot_chat_generations to authenticated;

create policy "Users can read their own DocBot chat usage"
on public.docbot_chat_generations
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own DocBot chat usage"
on public.docbot_chat_generations
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.docbot_sessions as session
    where session.id = session_id
      and session.user_id = (select auth.uid())
  )
);
