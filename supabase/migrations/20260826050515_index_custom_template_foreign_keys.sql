create index docbot_upload_tags_upload_owner_idx
on public.docbot_upload_tags (upload_id, user_id);

create index docbot_upload_tags_tag_owner_idx
on public.docbot_upload_tags (tag_id, user_id);

create index docbot_session_tags_session_owner_idx
on public.docbot_session_tags (session_id, user_id);

create index docbot_session_tags_tag_owner_idx
on public.docbot_session_tags (tag_id, user_id);

create index docbot_template_versions_template_owner_idx
on public.docbot_template_versions (template_id, user_id);

create index docbot_template_tag_rules_tag_owner_idx
on public.docbot_template_tag_rules (tag_id, user_id);

create index docbot_templates_current_version_owner_idx
on public.docbot_templates (current_version_id, id, user_id)
where current_version_id is not null;
