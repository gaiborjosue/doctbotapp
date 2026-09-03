drop index public.docbot_session_messages_owner_session_order_idx;

create index docbot_session_messages_session_owner_order_idx
on public.docbot_session_messages (session_id, user_id, id);
