-- Z1 (hardening): on a child's own phone (app.current_child_id set, M2b-2) every family table shows that one child only.
-- Two Wave 2 tables keyed by child missed the restrictive one-child rule the others carry: the reading place (S1) and
-- the study source a parent picks per subject (S3). Same rule as family.tutor_conversations: with no current child (the
-- parent's own session) it does not narrow; with one, only that child's rows are seen or written.
create policy chapter_reading_one_child on family.chapter_reading as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

create policy child_subject_source_one_child on family.child_subject_source as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);
