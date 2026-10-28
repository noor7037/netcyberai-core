-- E1, the live spoken-English tutor beside the English course (docs/37 §4 Wave 3; Decision Log C382). Placeholder
-- timestamp: the lead renames it to the version it is applied as.
--
-- 1. The workload: control.ai_profiles row 'family.english_conversation' (docs/37 §3 decision 3: workloads are
--    profiles). It carries a child's words, so it runs only on a provider the founder has cleared for minors (the
--    trigger on control.ai_profiles). No provider until the founder chooses one in Control. Speech to text stays the
--    existing 'family.voice_input' profile.
-- 2. family.english_live_sessions: one practice talk of a child. The topic, the track it was pitched at, the rolling
--    summary of the older turns (made by the same workload, never shown to the child) and the position of the last
--    turn folded into it, and, once ended, the recap (what was practised and the words that were new).
-- 3. family.english_live_turns: what the child said, as the child corrected it before sending (at most 300
--    characters), and the tutor's short reply. The recording itself is never kept anywhere.
--
-- Own account only, twice (a permissive and a restrictive policy), like every family table (M1-1); on a child's own
-- phone, that one child only. A turn names its session, account and child, so it can never sit in another child's
-- session. Removed with the child and so with the account (the foreign keys cascade); the parent may clear a session.
-- No function is created here.

insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words, max_output_tokens)
values ('family.english_conversation', null, null, true, 600)
on conflict (profile_id) do nothing;

create table family.english_live_sessions (
  session_id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  child_id uuid not null,
  topic text not null check (topic ~ '^[a-z][a-z_]{1,23}$'),
  track text not null check (track in ('a', 'b', 'c', 'd')),
  status text not null default 'open' check (status in ('open', 'ended')),
  summary text check (summary is null or char_length(summary) between 1 and 500),
  summarised_upto smallint not null default 0 check (summarised_upto between 0 and 40),
  recap jsonb check (recap is null or (jsonb_typeof(recap) = 'object' and octet_length(recap::text) <= 4000)),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((status = 'open' and ended_at is null) or (status = 'ended' and ended_at is not null)),
  unique (session_id, account_id, child_id),
  foreign key (account_id, child_id) references family.children (account_id, child_id) on delete cascade
);
create index idx_family_english_live_sessions_child on family.english_live_sessions (account_id, child_id, started_at desc);

create table family.english_live_turns (
  turn_id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  account_id uuid not null,
  child_id uuid not null,
  position smallint not null check (position between 1 and 40),
  child_text text not null check (char_length(child_text) between 1 and 300),
  reply text not null check (char_length(reply) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (session_id, position),
  foreign key (session_id, account_id, child_id) references family.english_live_sessions (session_id, account_id, child_id) on delete cascade
);
create index idx_family_english_live_turns_account on family.english_live_turns (account_id, child_id);

alter table family.english_live_sessions enable row level security;
alter table family.english_live_sessions force row level security;
alter table family.english_live_turns enable row level security;
alter table family.english_live_turns force row level security;
revoke all on family.english_live_sessions from public, anon, authenticated, service_role, app_user, nca_super;
revoke all on family.english_live_turns from public, anon, authenticated, service_role, app_user, nca_super;

create policy english_live_sessions_own on family.english_live_sessions as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_live_sessions_own_only on family.english_live_sessions as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_live_sessions_one_child on family.english_live_sessions as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

create policy english_live_turns_own on family.english_live_turns as permissive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_live_turns_own_only on family.english_live_turns as restrictive for all to family_app
  using (account_id = family.current_account()) with check (account_id = family.current_account());
create policy english_live_turns_one_child on family.english_live_turns as restrictive for all to family_app
  using (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid)
  with check (nullif(current_setting('app.current_child_id', true), '') is null or child_id = nullif(current_setting('app.current_child_id', true), '')::uuid);

grant select, insert, update, delete on family.english_live_sessions to family_app;
grant select, insert, delete on family.english_live_turns to family_app;
