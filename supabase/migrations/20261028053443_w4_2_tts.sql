-- Wave 4 slice 2, a server voice (Decision Log C386; C230-AR item 2). Placeholder timestamp: the lead renames it to the
-- version it is applied as.
--
-- 1. The workload: control.ai_profiles row 'family.text_to_speech' (workloads are profiles, docs/37 §3 decision 3). It
--    reads the chapter reader's narration and the live English partner's checked replies, which are made from a child's
--    words, so it carries a child's words: it runs only on a provider the founder has cleared for minors (the trigger on
--    control.ai_profiles). No provider until the founder chooses one in Control. max_output_tokens is not used by a
--    voice (the table's floor is kept).
-- 2. The provider 'google_tts' (Google Cloud Text-to-Speech, an API key of its own). Not cleared for minors here: the
--    founder clears a provider in Control → AI with the terms page he read, as for every provider. OpenAI's voice uses
--    the existing 'openai' row and key.
--
-- Nothing is stored by the voice: no table, column, function or grant is created here.

insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words, max_output_tokens)
values ('family.text_to_speech', null, null, true, 100)
on conflict (profile_id) do nothing;

insert into control.ai_providers (provider_id) values ('google_tts')
on conflict (provider_id) do nothing;
