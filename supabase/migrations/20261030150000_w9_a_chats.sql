-- W9-A, chats with memory (docs/39 §3 "Chat"; Decision Log C406). Placeholder timestamp: the supervisor renames it to
-- the version it is applied as.
--
-- 1. family.tutor_conversations becomes a list of chats per child and subject (was one conversation, S2, C375): the
--    unique (child_id, subject) goes. A chat carries its title (the first question, 60 characters), its child turns
--    (turn_count; at 30 it is 'full' and takes no more), a running summary (at most 1,200 characters, rewritten every
--    5 child turns by the family.summary workload; summary_turns is the turn_count it was written at), its status
--    ('open', 'full', 'archived': a 16th open chat in a subject archives the oldest; src/lib/family/tutor.ts) and when
--    it was last used (last_at). Archived chats stay readable by the parent in the Learning Vault and go with the child.
-- 2. Existing rows are backfilled: status 'open', the title from their first child message (left 60), turn_count from
--    their child messages, last_at from updated_at.
-- 3. The workload family.summary (control.ai_profiles), shaped as family.moderation was added: it reads the child's own
--    questions, so it carries a child's words and runs only on a provider cleared for minors (the trigger on
--    control.ai_profiles). No provider here: Control routes it. Prompt v1 (src/lib/ai/prompts/family.summary/v1.ts).
--
-- Row level security is unchanged: the three policies of S2 (own account, permissive and restrictive; on a child's own
-- phone that child only) cover the new columns; no new table, function or grant.

alter table family.tutor_conversations drop constraint if exists tutor_conversations_child_id_subject_key;

alter table family.tutor_conversations
  add column title text check (title is null or char_length(title) between 1 and 60),
  add column turn_count integer not null default 0 check (turn_count >= 0),
  add column summary text check (summary is null or char_length(summary) <= 1200),
  add column summary_turns integer not null default 0 check (summary_turns >= 0),
  add column status text not null default 'open' check (status in ('open', 'full', 'archived')),
  add column last_at timestamptz not null default now();

update family.tutor_conversations c
   set title = nullif(left(btrim(f.body), 60), ''),
       turn_count = f.n,
       last_at = c.updated_at
  from (select m.conversation_id,
               count(*)::int as n,
               (array_agg(m.body order by m.created_at, m.message_id))[1] as body
          from family.tutor_messages m
         where m.role = 'child'
         group by m.conversation_id) f
 where f.conversation_id = c.conversation_id;
update family.tutor_conversations set last_at = updated_at where turn_count = 0;

create index idx_family_tutor_conversations_chats on family.tutor_conversations (child_id, subject, status, last_at desc);

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values ('family.summary', null, null, 'v1', true, 400)
on conflict (profile_id) do nothing;
