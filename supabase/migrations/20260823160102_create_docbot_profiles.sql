-- Persist private DocBot customization for each authenticated account.
create table public.docbot_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_id text not null default 'grok-bot',
  avatar_colors jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now(),

  constraint docbot_profiles_username_length
    check (char_length(username) between 3 and 20),
  constraint docbot_profiles_avatar_id_valid
    check (
      avatar_id in (
        'grok-bot',
        'strobi',
        'freddy',
        'citrus',
        'nova',
        'sunee',
        'kirby',
        'cloudee',
        'cubee',
        'onee'
      )
    ),
  constraint docbot_profiles_avatar_colors_object
    check (jsonb_typeof(avatar_colors) = 'object'),
  constraint docbot_profiles_avatar_colors_size
    check (octet_length(avatar_colors::text) <= 4096)
);

comment on table public.docbot_profiles is
  'Private, authenticated user preferences for DocBot customization.';

alter table public.docbot_profiles enable row level security;

revoke all on table public.docbot_profiles from anon;
grant usage on schema public to authenticated;
grant select, insert, update on table public.docbot_profiles to authenticated;

create policy "Users can read their own DocBot profile"
on public.docbot_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own DocBot profile"
on public.docbot_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own DocBot profile"
on public.docbot_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
