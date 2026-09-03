-- Cover the composite processing-source foreign key for joins and cascades.
create index docbot_sessions_processing_source_idx
on public.docbot_sessions (processing_job_id, upload_id, user_id);
