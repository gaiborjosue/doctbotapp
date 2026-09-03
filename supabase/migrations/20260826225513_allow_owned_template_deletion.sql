-- RLS still restricts deletion to templates owned by the authenticated user.
grant delete on table public.docbot_templates to authenticated;
