-- Cover report ownership/current-revision foreign keys in their declared order.
create index docbot_report_revisions_report_owner_idx
on public.docbot_report_revisions (report_id, user_id);

create index docbot_reports_current_revision_owner_idx
on public.docbot_reports (current_revision_id, id, user_id)
where current_revision_id is not null;
