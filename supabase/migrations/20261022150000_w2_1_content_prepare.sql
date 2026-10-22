-- W2 item 1 (Decision Log C313; C230-T, C230-U): the staff profile content.prepare, prepared responses that no child
-- sees before a person checks them, Workers AI as the adults' tools' default, and the demo pilot's subject.
--
-- 1. content.prepare: NetCyberAI staff prepare the library's explanations in Control (C300) on a profile of their own,
--    with no child's words in it and no family's daily cap. It starts on the resolver's prompt version, so what it
--    prepares matches what a child's explanation would be.
insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words)
select 'content.prepare', null, null, prompt_version, false from control.ai_profiles where profile_id = 'family.resolver'
on conflict (profile_id) do nothing;

-- 2. Who prepared a response. A prepared response reaches a child only once it is checked, in any subject (C230-T:
--    a provider that may serve adults' tools only never reaches a child unchecked). The family role's read policy
--    enforces it, so no query can forget it.
alter table content.responses add column prepared_by uuid;
drop policy responses_family_read on content.responses;
create policy responses_family_read on content.responses as permissive for select to family_app
  using (status <> 'withdrawn' and (prepared_by is null or status = 'checked'));
drop policy responses_family_add on content.responses;
create policy responses_family_add on content.responses as permissive for insert to family_app
  with check (status = 'ai_made' and checked_by is null and checked_at is null and withdrawn_at is null and prepared_by is null);

-- 3. Workers AI (C230-U) as the starting provider of Control's two staff tools that have none yet: Llama 4 Scout, the
--    model AI_PROVIDERS.md names. Nothing runs until its key is entered in Control → AI (which shows that key's state),
--    and Control can change each one. Left alone: the children's profiles (the database refuses a provider there until
--    the founder clears it for minors) and the school apps' Copilot and Parent AI, which would show as ready to
--    teachers before any key exists.
update control.ai_profiles set provider_id = 'workers-ai', model = '@cf/meta/llama-4-scout-17b-16e-instruct', updated_at = now()
 where provider_id is null and not carries_child_words
   and profile_id in ('content.prepare', 'content.syllabus_extract');

-- 4. The demo pilot (C230-T): Class 6 Science is open to every child and shows checked explanations only. This replaces
--    the first pilot's EVS (C230-S).
insert into control.settings (key, value) values ('family.open_subjects', '["science"]'::jsonb), ('family.reviewed_only_subjects', '["science"]'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
