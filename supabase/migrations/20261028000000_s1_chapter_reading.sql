-- S1, the chapter reader (docs/37 §4 Wave 2; Decision Log C374). Placeholder timestamp: the lead renames it to the
-- version it is applied as.
--
-- family.chapter_reading: where a child stopped listening to a chapter, so narration resumes there: one row per child
-- per chapter, the block's stable id and the sentence within it. A place, never a text: nothing the child said or typed.
-- family.topic_progress is not used for this: it moves only by checked answers (mastery), and a reading place is not
-- one. Own account only, twice (a permissive and a restrictive policy), like every family table (M1-1). Removed with
-- the child (the foreign key cascades).

create table family.chapter_reading (
  account_id uuid not null,
  child_id uuid not null,
  chapter_key text not null check (chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  block_id text not null check (block_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  sentence smallint not null check (sentence between 0 and 999),
  updated_at timestamptz not null default now(),
  primary key (child_id, chapter_key),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_chapter_reading_account on family.chapter_reading (account_id);

alter table family.chapter_reading enable row level security;
alter table family.chapter_reading force row level security;
revoke all on family.chapter_reading from public, anon, authenticated, app_user, nca_super;
create policy chapter_reading_own on family.chapter_reading as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy chapter_reading_own_only on family.chapter_reading as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.chapter_reading to family_app;
