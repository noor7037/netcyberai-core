-- S2, the shared tutor window (docs/37 §4 Wave 2; Decision Log C375). Placeholder timestamp: the lead renames it to the
-- version it is applied as.
--
-- 1. family.tutor_conversations: one conversation per child per subject. The child's typed questions and the checked
--    answers the tutor gave, kept so the child can look back and the parent can see and clear them (the Learning
--    Vault). Nothing here is shared with any other child, account or school.
-- 2. family.tutor_messages: the turns. A child's turn is the words the child sent (at most 500 characters, as the
--    Understand box takes) and, when asked from the chapter reader, the chapter and the block it was asked about; a
--    tutor's turn is the answer's blocks as they were shown, without any check or practice item (their answers are
--    sealed for the phone and are never kept here).
-- 3. family.tutor_attachments: a photo or PDF the child attached, kept in the private Storage bucket `family-tutor`
--    under "<account>/<child>/<attachment>.<ext>" (the server chooses the key; nothing the phone sends names it). A row
--    is 'pending' from the moment an upload link is given until the server has read the file (its real size, its first
--    bytes and the Aadhaar check) and moved it to its kept key; only a 'ready' file is ever handed out, as a short
--    signed link, to its own account and child.
-- 4. The bucket: private (never a public URL), 10 MB at most, PNG, JPEG, WebP or PDF only (the store refuses anything
--    else; the server checks the first bytes again).
--
-- Own account only, twice (a permissive and a restrictive policy), like every family table (M1-1); on a child's own
-- phone, that one child only (as M2b-2's tables). The conversation, its child and its account are one: a turn or a file
-- names all three, so a turn can never sit in another child's conversation. Removed with the child (the foreign keys
-- cascade); the files are removed by the server first (src/lib/family/tutor.ts).

create table family.tutor_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, subject),
  unique (conversation_id, account_id, child_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_tutor_conversations_account on family.tutor_conversations (account_id, child_id);

create table family.tutor_messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  account_id uuid not null,
  child_id uuid not null,
  role text not null check (role in ('child', 'tutor')),
  body text check (body is null or char_length(body) between 1 and 500),
  blocks jsonb check (blocks is null or (jsonb_typeof(blocks) = 'array' and octet_length(blocks::text) <= 60000)),
  chapter_key text check (chapter_key is null or chapter_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  block_id text check (block_id is null or block_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  -- The language the child was using when the turn was made, so it is read back in that language (screen readers).
  lang text not null default 'en' check (lang in ('en', 'hi')),
  created_at timestamptz not null default now(),
  check ((role = 'child' and body is not null and blocks is null) or (role = 'tutor' and blocks is not null and body is null and chapter_key is null and block_id is null)),
  unique (message_id, account_id, child_id),
  foreign key (conversation_id, account_id, child_id) references family.tutor_conversations (conversation_id, account_id, child_id) on delete cascade
);
create index idx_family_tutor_messages_conversation on family.tutor_messages (conversation_id, created_at);
create index idx_family_tutor_messages_account on family.tutor_messages (account_id, child_id);

create table family.tutor_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  account_id uuid not null,
  child_id uuid not null,
  message_id uuid,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  storage_key text not null unique check (storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$'),
  created_at timestamptz not null default now(),
  check (message_id is null or status = 'ready'),
  foreign key (conversation_id, account_id, child_id) references family.tutor_conversations (conversation_id, account_id, child_id) on delete cascade,
  foreign key (message_id, account_id, child_id) references family.tutor_messages (message_id, account_id, child_id) on delete cascade
);
create index idx_family_tutor_attachments_conversation on family.tutor_attachments (conversation_id);
create index idx_family_tutor_attachments_message on family.tutor_attachments (message_id);
create index idx_family_tutor_attachments_account on family.tutor_attachments (account_id, child_id);

alter table family.tutor_conversations enable row level security;
alter table family.tutor_conversations force row level security;
alter table family.tutor_messages enable row level security;
alter table family.tutor_messages force row level security;
alter table family.tutor_attachments enable row level security;
alter table family.tutor_attachments force row level security;
revoke all on family.tutor_conversations from public, anon, authenticated, app_user, nca_super;
revoke all on family.tutor_messages from public, anon, authenticated, app_user, nca_super;
revoke all on family.tutor_attachments from public, anon, authenticated, app_user, nca_super;

create policy tutor_conversations_own on family.tutor_conversations as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_conversations_own_only on family.tutor_conversations as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_conversations_one_child on family.tutor_conversations as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

create policy tutor_messages_own on family.tutor_messages as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_messages_own_only on family.tutor_messages as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_messages_one_child on family.tutor_messages as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

create policy tutor_attachments_own on family.tutor_attachments as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_attachments_own_only on family.tutor_attachments as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy tutor_attachments_one_child on family.tutor_attachments as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, update, delete on family.tutor_conversations to family_app;
grant select, insert, delete on family.tutor_messages to family_app;
grant select, insert, update, delete on family.tutor_attachments to family_app;

-- 4. The private bucket. Only the server reaches it (the storage door, src/lib/storage/supabase-file-storage.ts); no
-- policy on storage.objects names it, so no browser key can read or list it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-tutor', 'family-tutor', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
