-- W16-A1: the Tutor's agent registry (src/lib/ai/agents/registry.ts) names four new gateway workloads; each gets its
-- control.ai_profiles row, shaped as family.summary was added (C406), so Control lists it and routes it. No provider
-- here: Control routes each one (decision 7: on by default, C398; a workload with no provider answers "not switched on").
--   family.quiz           the quiz made from a session at its end (W16-B1); reads the session's words
--   family.parent_report  the weekly parent report (W16-B3); counts and chapter names only, never a child's words
--   family.qc             the quality check beside an answer (W16-A5); reads the answer and the child's question
--   family.voice_call     the realtime call (decision 3): a slot. The code has no adapter for it, so no provider can be
--                         saved for it until one is built
-- A workload that carries a child's words runs only on a provider cleared for minors (the trigger on
-- control.ai_profiles, C368). Prompt versions are filled by the waves that build each one.
--
-- The new job types (tutor.quiz, tutor.parent_report, ai.ops_daily) need no change to row level security: only the
-- platform (nca_super) enqueues them, and jobs_enqueue already admits it. No new table, function or grant.

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values
  ('family.quiz', null, null, 'v1', true, 1200),
  ('family.parent_report', null, null, 'v1', false, 1200),
  ('family.qc', null, null, 'v1', true, 400),
  ('family.voice_call', null, null, 'v1', true, 2000)
on conflict (profile_id) do nothing;
