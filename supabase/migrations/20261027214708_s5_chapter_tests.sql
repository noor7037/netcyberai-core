-- S5, chapter tests (docs/37 §4 Wave 2; Decision Log C378). Placeholder timestamp: the lead renames it to the version it
-- is applied as. File only: not applied by the builder.
--
-- 1. family.chapter_test_attempts: one row each time a child SUBMITS a chapter's test. A row exists only because the
--    child sent answers; nothing is pre-filled and no score is invented. The multiple-choice total and correct count
--    are what the server computed from the sealed answers (the phone never holds them); written and photo answers
--    carry no score at all (they are for the parent or teacher to read and mark against the rubric).
-- 2. family.chapter_test_answers: the answers of an attempt, one per question: a choice with whether the server found it
--    right; the child's written answer (at most 2000 characters); or a photo, which is a file kept in the tutor's private
--    bucket (family.tutor_attachments, S2): no new bucket. The question and its rubric are copied in, so a parent reads
--    what was asked even when the chapter is later revised.
-- 3. family.tutor_attachments.kept_for: a file kept for a test answer is not "unsent" tutor material, so it does not count
--    toward the tutor window's per-question file limit and is never attached to a question by mistake.
--
-- Own account only, twice (a permissive and a restrictive policy), like every family table (M1-1); on a child's own phone,
-- that one child only (as S2's tables). Removed with the child (the foreign keys cascade). A file the parent clears in the
-- Learning Vault leaves the answer in place with its photo marked removed (attachment_id set null).

alter table family.tutor_attachments add column kept_for text check (kept_for is null or kept_for = 'test');

create table family.chapter_test_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  chapter_key text not null check (chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  block_id text not null check (block_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  lang text not null default 'en' check (lang in ('en', 'hi')),
  mcq_total smallint not null check (mcq_total between 0 and 8),
  mcq_correct smallint not null check (mcq_correct between 0 and mcq_total),
  submitted_at timestamptz not null default now(),
  unique (attempt_id, account_id, child_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_chapter_test_attempts_account on family.chapter_test_attempts (account_id, child_id, submitted_at desc);

create table family.chapter_test_answers (
  answer_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  account_id uuid not null,
  child_id uuid not null,
  item_id text not null check (item_id ~ '^[a-z0-9_-]{1,20}$'),
  kind text not null check (kind in ('mcq', 'written', 'photo')),
  question text not null check (char_length(question) between 1 and 400),
  choice smallint check (choice is null or choice between 0 and 4),
  correct boolean,
  body text check (body is null or char_length(body) between 1 and 2000),
  attachment_id uuid references family.tutor_attachments (attachment_id) on delete set null,
  rubric jsonb check (rubric is null or (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 1 and 6)),
  unique (attempt_id, item_id),
  check (
    (kind = 'mcq' and choice is not null and correct is not null and body is null and attachment_id is null and rubric is null)
    or (kind = 'written' and body is not null and choice is null and correct is null and attachment_id is null and rubric is not null)
    or (kind = 'photo' and choice is null and correct is null and body is null and rubric is not null)
  ),
  foreign key (attempt_id, account_id, child_id) references family.chapter_test_attempts (attempt_id, account_id, child_id) on delete cascade
);
create index idx_family_chapter_test_answers_attempt on family.chapter_test_answers (attempt_id);
create index idx_family_chapter_test_answers_account on family.chapter_test_answers (account_id, child_id);
create index idx_family_chapter_test_answers_attachment on family.chapter_test_answers (attachment_id);

alter table family.chapter_test_attempts enable row level security;
alter table family.chapter_test_attempts force row level security;
alter table family.chapter_test_answers enable row level security;
alter table family.chapter_test_answers force row level security;
revoke all on family.chapter_test_attempts from public, anon, authenticated, app_user, nca_super;
revoke all on family.chapter_test_answers from public, anon, authenticated, app_user, nca_super;

create policy chapter_test_attempts_own on family.chapter_test_attempts as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy chapter_test_attempts_own_only on family.chapter_test_attempts as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy chapter_test_attempts_one_child on family.chapter_test_attempts as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

create policy chapter_test_answers_own on family.chapter_test_answers as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy chapter_test_answers_own_only on family.chapter_test_answers as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy chapter_test_answers_one_child on family.chapter_test_answers as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

-- An attempt is never edited: it is what the child sent, once. It goes with the child.
grant select, insert, delete on family.chapter_test_attempts to family_app;
grant select, insert, delete on family.chapter_test_answers to family_app;
