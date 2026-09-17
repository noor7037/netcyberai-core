-- =====================================================================
-- Migration 6 (Prompt A) — the not_taught fix (Decision Log A1)
-- Source: 08_EXECUTION_BIBLE.md Prompt A step 6, SQL given verbatim.
-- syllabus_progress.status only allowed ('completed','delayed','partial')
-- but the Pulse's core honesty guarantee ("a not_taught topic generates
-- no Pulse") is unbuildable without a fourth state.
-- =====================================================================

alter table syllabus_progress drop constraint syllabus_progress_status_check;
alter table syllabus_progress
  add constraint syllabus_progress_status_check
  check (status in ('taught','delayed','partial','not_taught'));
update syllabus_progress set status = 'taught' where status = 'completed';
alter table syllabus_progress alter column status set default 'taught';
