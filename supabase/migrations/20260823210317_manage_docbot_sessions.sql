alter table public.docbot_sessions
  add column archived_at timestamp with time zone;

comment on column public.docbot_sessions.archived_at is
  'When set, hides the user-owned session from active chat history without deleting it.';

grant update (title, archived_at, updated_at)
  on public.docbot_sessions to authenticated;
grant delete on table public.docbot_sessions to authenticated;

create policy "Users can update their own DocBot sessions"
on public.docbot_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own DocBot sessions"
on public.docbot_sessions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index docbot_sessions_user_active_activity_idx
on public.docbot_sessions (user_id, last_activity_at desc, id desc)
where archived_at is null;
