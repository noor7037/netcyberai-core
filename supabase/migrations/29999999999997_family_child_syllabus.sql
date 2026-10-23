-- A parent's own syllabus for a child (Decision Log C230-AB): for a standalone family whose school does not use
-- NetCyberAI, or whose board and class are not in the catalog yet. In the parent area (parent PIN), the parent gives the
-- chapter and topic titles of one subject (read from photos of the book's contents pages, or typed), checks them, and
-- saves them. Only a saved (confirmed) syllabus reaches the child's Study page; a draft is never shown to the child.
--
-- family: the syllabus and its lines. Titles only: no photo or file is kept anywhere. Own account only, twice (a
-- permissive and a restrictive policy), like every family table (M1-1). A syllabus names a child of its own account
-- (the composite key), and each line names its syllabus with the same account, so no row can point across accounts.
-- Deleting the child or the account deletes its syllabi.
--
-- control: the family.syllabus_extract profile, which reads the photos of a book's contents pages for the parent. It
-- carries a printed book's chapter names, never a child's words, so it starts on Workers AI like Control's own syllabus
-- import (content.syllabus_extract); every line is a draft the parent checks before it is used.

create table family.child_syllabi (
  syllabus_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references family.accounts (account_id) on delete cascade,
  child_id uuid not null,
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  source text not null check (source in ('pdf', 'photos', 'typed')),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  -- Photos read into this draft so far (at most 5 per syllabus).
  photos smallint not null default 0 check (photos between 0 and 5),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check ((status = 'confirmed') = (confirmed_at is not null)),
  unique (syllabus_id, account_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
-- One saved syllabus and one draft per child and subject.
create unique index uq_family_child_syllabus_confirmed on family.child_syllabi (child_id, subject) where status = 'confirmed';
create unique index uq_family_child_syllabus_draft on family.child_syllabi (child_id, subject) where status = 'draft';
create index idx_family_child_syllabi_account on family.child_syllabi (account_id);

-- A chapter (no parent) or a topic (its chapter, in the same syllabus), in the order the parent set.
create table family.child_syllabus_items (
  item_id uuid primary key default gen_random_uuid(),
  syllabus_id uuid not null,
  account_id uuid not null,
  kind text not null check (kind in ('chapter', 'topic')),
  parent_item_id uuid,
  position smallint not null check (position between 1 and 999),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  check ((kind = 'chapter') = (parent_item_id is null)),
  unique (item_id, syllabus_id),
  foreign key (syllabus_id, account_id) references family.child_syllabi (syllabus_id, account_id) on delete cascade,
  foreign key (parent_item_id, syllabus_id) references family.child_syllabus_items (item_id, syllabus_id) on delete cascade
);
create unique index uq_family_child_syllabus_chapter_position on family.child_syllabus_items (syllabus_id, position) where parent_item_id is null;
create unique index uq_family_child_syllabus_topic_position on family.child_syllabus_items (parent_item_id, position) where parent_item_id is not null;
create index idx_family_child_syllabus_items_account on family.child_syllabus_items (account_id);

alter table family.child_syllabi enable row level security;
alter table family.child_syllabi force row level security;
alter table family.child_syllabus_items enable row level security;
alter table family.child_syllabus_items force row level security;
revoke all on family.child_syllabi, family.child_syllabus_items from public, anon, authenticated, app_user, nca_super;
create policy child_syllabi_own on family.child_syllabi as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_syllabi_own_only on family.child_syllabi as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_syllabus_items_own on family.child_syllabus_items as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_syllabus_items_own_only on family.child_syllabus_items as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.child_syllabi, family.child_syllabus_items to family_app;

-- ---- control ------------------------------------------------------------------------------------------------------

-- 4000 output tokens: a contents page of chapters and their topics, as JSON, is longer than the default 2000 allows.
insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, max_output_tokens, carries_child_words, enabled)
values ('family.syllabus_extract', 'workers-ai', '@cf/meta/llama-4-scout-17b-16e-instruct', 'v1', 4000, false, true)
on conflict (profile_id) do nothing;
