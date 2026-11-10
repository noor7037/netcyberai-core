-- W23-B (C494): word help, the meaning and translation of a word or sentence a child tapped, in the child's language.
--
--   content.word_help     the shared answer cache, the way content.responses is the resolver's: one row per normalised
--                         text, a hash of the sentence it came from (or '' for none) and the language asked for. No
--                         account, no child: the same text in the same language is answered for every family. Families
--                         read it and add rows (the server adds one only after the answer passed its checks); nobody
--                         changes or removes one through the family role, Control's staff can (nca_super).
--   family.ai_daily.word_helps   fresh (not cached) word helps one account took today, beside the tutor's requests.
--   control.ai_profiles   the family.word_help workload (a child's words: a provider cleared for minors only); it follows
--                         the tutor's chain until Control gives it one (platform.ts chainFrom).
--   control.settings      the family's daily allowance of fresh word helps, read live.
-- The child's own switches (wordHelp, tapToRead, autoScroll, meaningLang) live in family.child_settings.settings, a JSON
-- object, so they need no column.

create table content.word_help (
  word_id uuid primary key default gen_random_uuid(),
  text_norm text not null check (char_length(text_norm) between 1 and 200 and text_norm !~ '[[:cntrl:]]'),
  context_hash text not null default '' check (context_hash = '' or context_hash ~ '^[0-9a-f]{64}$'),
  to_lang text not null check (to_lang in ('en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as')),
  meaning text check (meaning is null or char_length(meaning) between 1 and 400),
  translation text check (translation is null or char_length(translation) between 1 and 600),
  provider text not null check (length(provider) between 1 and 40),
  model text not null check (length(model) between 1 and 80),
  created_at timestamptz not null default now(),
  check (meaning is not null or translation is not null)
);
create unique index uq_content_word_help_key on content.word_help (text_norm, context_hash, to_lang);

alter table content.word_help enable row level security;
alter table content.word_help force row level security;
revoke all on content.word_help from public, anon, authenticated, app_user;
create policy word_help_family_read on content.word_help as permissive for select to family_app using (true);
create policy word_help_family_add on content.word_help as permissive for insert to family_app with check (true);
create policy word_help_family_only on content.word_help as restrictive for all to family_app using (true) with check (true);
grant select, insert on content.word_help to family_app;
grant select, insert, update, delete on content.word_help to nca_super;

alter table family.ai_daily add column word_helps integer not null default 0 check (word_helps >= 0);

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values ('family.word_help', null, null, 'v1', true, 400)
on conflict (profile_id) do nothing;

insert into control.settings (key, value) values ('family.word_help.daily_requests', '300'::jsonb)
on conflict (key) do nothing;
