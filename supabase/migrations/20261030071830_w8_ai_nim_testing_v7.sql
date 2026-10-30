-- W8-AI: NVIDIA NIM as a provider, testing mode, and family.resolver v7 with longer answers.
--
-- What and why:
-- 1. The `nvidia` provider row (src/lib/ai/adapters/nvidia.ts): NVIDIA's hosted models at their fixed OpenAI-compatible
--    address. Switched on; the founder saves only the key in Control → AI. Not cleared for children's words: that stays
--    the founder's switch, as for every provider. Its model list is read live from the key test, never written here.
-- 2. The setting 'ai.testing_mode', 'on' for the testing phase (the founder's decision): no daily request or voice
--    caps (the counters still count), every provider read as cleared for children's words, the safety pre-check
--    skipped, each profile's max_output_tokens used as saved (src/lib/ai/platform.ts). Switched off in Control → AI
--    before the Play Store release; anything but 'on' reads as off.
-- 3. The minors check on control.ai_profiles reads testing mode as well, so that while it is on Control can save a
--    children's route on a provider not yet cleared (the platform already reads it as cleared). Off, the check is
--    exactly as before; a route saved during testing on an uncleared provider is then refused at every call
--    ('not_cleared_for_minors') until the provider is cleared or the route moved.
-- 4. family.resolver moves from prompt v6 to v7 (the rich answer); a different version Control chose stays.
-- 5. The answer limit goes from 2000 to 8000 tokens on the four profiles that write the long teaching answer; a limit
--    Control already changed stays.
-- 6. Gemini's retired model 'gemini-2.5-flash' is replaced by 'gemini-3.8-flash' wherever a route names it.
-- Plain SQL, no transaction wrapper.

-- 1. NVIDIA NIM
insert into control.ai_providers (provider_id, enabled) values ('nvidia', true)
on conflict (provider_id) do nothing;

-- 2. Testing mode, on
insert into control.settings (key, value) values ('ai.testing_mode', '"on"'::jsonb)
on conflict (key) do nothing;

-- Whether testing mode is on, for every session role the AI platform runs as (a school's staff cannot read
-- control.settings, so the platform asks through this; it says on or off and nothing else).
create function control.ai_testing_mode() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from control.settings where key = 'ai.testing_mode' and value = '"on"'::jsonb)
$$;
revoke all on function control.ai_testing_mode() from public, anon, authenticated, service_role;
grant execute on function control.ai_testing_mode() to family_app, app_user, nca_super;

-- 3. The minors check, with testing mode
create or replace function control.ai_profile_minors_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  p text;
begin
  if not new.carries_child_words then return new; end if;
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id and new.fallback = old.fallback and old.carries_child_words then
    return new;
  end if;
  -- W8-AI: while testing mode is on, every provider counts as cleared (the clearance itself is left as it is).
  if exists (select 1 from control.settings where key = 'ai.testing_mode' and value = '"on"'::jsonb) then
    return new;
  end if;
  for p in select new.provider_id union select f ->> 'provider' from jsonb_array_elements(new.fallback) f loop
    if p is not null and not exists (select 1 from control.ai_providers where provider_id = p and cleared_for_minors) then
      raise exception 'provider % is not cleared for minors', p using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
revoke all on function control.ai_profile_minors_check() from public;

-- 4. family.resolver v6 -> v7
update control.ai_profiles set prompt_version = 'v7' where profile_id = 'family.resolver' and prompt_version = 'v6';

-- 5. Longer answers
update control.ai_profiles set max_output_tokens = 8000
 where profile_id in ('family.resolver', 'family.homework', 'parent_ai.home_help', 'content.prepare') and max_output_tokens = 2000;

-- 6. Gemini's retired model, as the Primary and in any backup
update control.ai_profiles set model = 'gemini-3.8-flash' where provider_id = 'gemini' and model = 'gemini-2.5-flash';
update control.ai_profiles
   set fallback = (
     select jsonb_agg(case when f ->> 'provider' = 'gemini' and f ->> 'model' = 'gemini-2.5-flash' then jsonb_set(f, '{model}', '"gemini-3.8-flash"') else f end order by i)
       from jsonb_array_elements(fallback) with ordinality as e(f, i)
   )
 where exists (select 1 from jsonb_array_elements(fallback) f where f ->> 'provider' = 'gemini' and f ->> 'model' = 'gemini-2.5-flash');
