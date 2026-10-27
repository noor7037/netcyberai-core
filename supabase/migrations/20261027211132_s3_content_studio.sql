-- S3, the content studio (docs/37 §4 Wave 2, decisions 7 and 9; Decision Log C376). Placeholder timestamp: the lead
-- renames it to the version it is applied as.
--
-- Chapters as database content, in the one typed block schema (src/lib/family/blocks.ts), versioned. A person on the
-- NetCyberAI staff types or corrects the blocks, a second step marks the version reviewed, a third publishes it: there is
-- no automatic publication, the database refuses a jump (draft to published) and a change to a version already
-- published. A new version keeps the chapter_key and, in the studio, the block ids, so family.chapter_reading (which
-- keys on chapter_key and a block id) keeps a child's place across versions.
--
--   content.chapter_contents  one row per chapter version. owner_account_id / child_id null: released to every family
--                             (the studio's own chapters); set: a chapter made from one parent's upload, which only
--                             that account reads, and for that child.
--   content.chapter_requests  the missing-chapter queue: a parent's request (with a private PDF, or from the catalog).
--                             received -> digitizing -> ready (or declined). Study's badges read it: Received,
--                             Digitizing; ready shows Published.
--   family.child_subject_source  the per-student assignment mode: which source a child's subject reads, the board's
--                             catalog, the school's, or the parent's own upload.
--
-- Family roles read published chapters (and, own account only, their requests) and never write a chapter. Control
-- (nca_super, which bypasses row level security) writes through the studio routes only.

create table content.chapter_requests (
  request_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  board_id text not null check (board_id ~ '^[A-Z][A-Z0-9-]{1,15}$'),
  class_level smallint not null check (class_level between 1 and 12),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  title text not null check (char_length(title) between 1 and 200),
  source text not null check (source in ('parent_upload', 'catalog')),
  -- The parent's PDF in the private documents bucket; removed when the request is ready or declined.
  upload_key text check (upload_key is null or (char_length(upload_key) <= 200 and upload_key like 'family/%')),
  status text not null default 'received' check (status in ('received', 'digitizing', 'ready', 'declined')),
  -- The chapter being made for it; set when digitizing starts.
  chapter_key text check (chapter_key is null or chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 300),
  claimed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('digitizing', 'ready') or (chapter_key is not null and claimed_by is not null)),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create unique index chapter_requests_one_open on content.chapter_requests (child_id, subject, lower(title)) where status in ('received', 'digitizing');
create index chapter_requests_queue on content.chapter_requests (status, created_at);
create index chapter_requests_account on content.chapter_requests (account_id);

create table content.chapter_contents (
  chapter_key text not null check (chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  version_no integer not null check (version_no >= 1),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  board_id text check (board_id is null or board_id ~ '^[A-Z][A-Z0-9-]{1,15}$'),
  class_level smallint check (class_level is null or class_level between 1 and 12),
  title_en text not null check (char_length(title_en) between 1 and 120),
  title_hi text not null check (char_length(title_hi) between 1 and 120),
  -- { "en": [block, ...], "hi": [block, ...] }; the application checks every block (chapters.ts) before it is saved.
  blocks jsonb not null check (jsonb_typeof(blocks) = 'object' and pg_column_size(blocks) <= 400000),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published', 'retired')),
  source text not null check (source in ('studio', 'parent_upload', 'catalog')),
  request_id uuid references content.chapter_requests (request_id) on delete set null,
  owner_account_id uuid,
  child_id uuid,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  retired_at timestamptz,
  primary key (chapter_key, version_no),
  check ((owner_account_id is null) = (child_id is null)),
  check (status not in ('reviewed', 'published', 'retired') or (reviewed_by is not null and reviewed_at is not null)),
  check (status not in ('published', 'retired') or (published_by is not null and published_at is not null)),
  foreign key (owner_account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
-- At most one published version of a chapter: publishing a new one retires the old in the same transaction.
create unique index chapter_contents_one_published on content.chapter_contents (chapter_key) where status = 'published';
create index chapter_contents_subject on content.chapter_contents (subject, status);
create index chapter_contents_owner on content.chapter_contents (owner_account_id) where owner_account_id is not null;

create table family.child_subject_source (
  account_id uuid not null,
  child_id uuid not null,
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  mode text not null check (mode in ('catalog', 'school', 'parent')),
  updated_at timestamptz not null default now(),
  primary key (child_id, subject),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_child_subject_source_account on family.child_subject_source (account_id);

-- The version rules, held by the database as well as the studio: only draft -> reviewed -> published -> retired (and
-- reviewed -> draft after a correction); a published or retired version never changes except to be retired; a reviewed
-- version is published exactly as it was reviewed.
create function content.chapter_contents_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if old.status in ('published', 'retired') then
    if old.status = 'published' and new.status = 'retired'
       and (new.blocks, new.title_en, new.title_hi, new.subject, new.chapter_key, new.version_no) is not distinct from (old.blocks, old.title_en, old.title_hi, old.subject, old.chapter_key, old.version_no) then
      return new;
    end if;
    raise exception 'a published chapter version does not change' using errcode = '23514';
  end if;
  if not ((old.status = 'draft' and new.status in ('draft', 'reviewed'))
       or (old.status = 'reviewed' and new.status in ('draft', 'reviewed', 'published'))) then
    raise exception 'chapter version cannot go from % to %', old.status, new.status using errcode = '23514';
  end if;
  if old.status = 'reviewed' and new.status in ('reviewed', 'published')
     and (new.blocks, new.title_en, new.title_hi) is distinct from (old.blocks, old.title_en, old.title_hi) then
    raise exception 'a reviewed version is published as it was reviewed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function content.chapter_contents_guard() from public, anon, authenticated, service_role;
create trigger chapter_contents_guard before update on content.chapter_contents for each row execute function content.chapter_contents_guard();

alter table content.chapter_contents enable row level security;
alter table content.chapter_contents force row level security;
alter table content.chapter_requests enable row level security;
alter table content.chapter_requests force row level security;
alter table family.child_subject_source enable row level security;
alter table family.child_subject_source force row level security;

revoke all on content.chapter_contents, content.chapter_requests from public, anon, authenticated, service_role, app_user;
revoke all on family.child_subject_source from public, anon, authenticated, service_role, app_user, nca_super;

-- Families read what is published for everyone, or published from their own upload.
create policy chapter_contents_family_read on content.chapter_contents as permissive for select to family_app
  using (status = 'published' and (owner_account_id is null or owner_account_id = family.current_account()));
create policy chapter_contents_family_only on content.chapter_contents as restrictive for all to family_app
  using (status = 'published' and (owner_account_id is null or owner_account_id = family.current_account())) with check (false);
grant select on content.chapter_contents to family_app;
grant select, insert, update on content.chapter_contents to nca_super;

-- A family reads, adds (as Received only) and withdraws (while still Received) its own requests; it never moves one.
create policy chapter_requests_family_read on content.chapter_requests as permissive for select to family_app
  using (account_id = family.current_account());
create policy chapter_requests_family_add on content.chapter_requests as permissive for insert to family_app
  with check (account_id = family.current_account() and status = 'received' and chapter_key is null and claimed_by is null);
create policy chapter_requests_family_cancel on content.chapter_requests as permissive for delete to family_app
  using (account_id = family.current_account() and status = 'received');
create policy chapter_requests_family_only on content.chapter_requests as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account() and status = 'received');
grant select, insert, delete on content.chapter_requests to family_app;
grant select, update on content.chapter_requests to nca_super;

create policy child_subject_source_own on family.child_subject_source as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy child_subject_source_own_only on family.child_subject_source as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
grant select, insert, update, delete on family.child_subject_source to family_app;
