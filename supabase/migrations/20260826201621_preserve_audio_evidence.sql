-- Preserve the exhaustive first-pass audio evidence separately from the
-- compact canonical summary. Custom templates may define fields outside the
-- built-in clinical JSON schema and need this grounded source at render time.
alter table public.docbot_processing_jobs
  add column evidence_text text;

alter table public.docbot_processing_jobs
  add constraint docbot_processing_jobs_evidence_text_length
  check (evidence_text is null or char_length(evidence_text) <= 200000);

comment on column public.docbot_processing_jobs.evidence_text is
  'Exhaustive Spanish clinical evidence extracted directly from the audio before canonical schema projection.';
