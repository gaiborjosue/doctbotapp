-- Persist AI SDK UI messages without copying the canonical audio summary into chat history.
create table public.docbot_session_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null,
  role text not null,
  parts jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint docbot_session_messages_session_owner_fkey
    foreign key (session_id, user_id)
    references public.docbot_sessions (id, user_id)
    on delete cascade,
  constraint docbot_session_messages_session_message_unique
    unique (session_id, message_id),
  constraint docbot_session_messages_message_id_length
    check (char_length(message_id) between 1 and 128),
  constraint docbot_session_messages_role_check
    check (role in ('user', 'assistant')),
  constraint docbot_session_messages_parts_array
    check (jsonb_typeof(parts) = 'array'),
  constraint docbot_session_messages_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.docbot_session_messages is
  'User-owned AI SDK UIMessage history for a DocBot session. The canonical audio context remains on docbot_processing_jobs.';
comment on column public.docbot_session_messages.parts is
  'Serialized AI SDK UIMessage parts, preserving streaming text and future tool parts.';

create index docbot_session_messages_owner_session_order_idx
on public.docbot_session_messages (user_id, session_id, id);

alter table public.docbot_session_messages enable row level security;

revoke all on table public.docbot_session_messages from anon, authenticated;
revoke all on sequence public.docbot_session_messages_id_seq from anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.docbot_session_messages to authenticated;
grant insert (session_id, user_id, message_id, role, parts, metadata)
  on public.docbot_session_messages to authenticated;
grant update (parts, metadata, updated_at)
  on public.docbot_session_messages to authenticated;
grant usage on sequence public.docbot_session_messages_id_seq to authenticated;

create policy "Users can read their own DocBot session messages"
on public.docbot_session_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own DocBot session messages"
on public.docbot_session_messages
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own DocBot session messages"
on public.docbot_session_messages
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function private.touch_docbot_session_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is not null and request_user_id <> new.user_id then
    raise exception 'The chat message does not belong to the authenticated user.'
      using errcode = '42501';
  end if;

  update public.docbot_sessions
  set
    last_activity_at = now(),
    updated_at = now()
  where id = new.session_id
    and user_id = new.user_id;

  return new;
end;
$$;

revoke execute on function private.touch_docbot_session_from_message()
from public, anon, authenticated;

create trigger touch_docbot_session_after_message
after insert or update on public.docbot_session_messages
for each row
execute function private.touch_docbot_session_from_message();
