-- W2 item 1, the safety check (Decision Log C314; C230-U): the profile family.moderation. It runs Llama Guard on a
-- child's typed words before they are sent and on every block of a live answer before it is shown; when it is switched
-- off or cannot run, no live answer is shown. It carries a child's words, so the database refuses a provider here until
-- the founder clears that provider for minors (control.ai_profile_minors_check): the founder chooses it in Control → AI
-- after clearing Workers AI, with the model @cf/meta/llama-guard-3-8b.
insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words, max_output_tokens)
values ('family.moderation', null, null, true, 100)
on conflict (profile_id) do nothing;
