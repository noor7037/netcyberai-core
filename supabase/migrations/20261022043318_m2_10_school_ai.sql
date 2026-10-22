-- Copilot and Parent AI on the AI platform (docs/family-app/03 §7, 07 §1 M2 platform row; Decision Log C284; slice
-- M2-10). Until now they answered only through a stand-in outside production; with this, the key the founder enters in
-- Control → AI makes them work, under the same profiles, fallbacks, kill switches and metering as the Family app.
--
-- School staff (app_user) may read exactly the two school profiles and the provider list (no secret is in either),
-- open a sealed key (ciphertext only: the key that opens it lives in the server's environment) and add to the AI
-- counts. Nothing else in control.* is theirs. Neither profile carries a child's words: a Copilot or Parent AI request
-- names a class level, a subject and a topic, never a person (src/lib/ai/provider.ts DraftRequest). The school's own
-- monthly limit (ai_usage, plan limits) still decides how much each school may draft.

grant usage on schema control to app_user;

create policy ai_profiles_staff_read on control.ai_profiles as permissive for select to app_user
  using (profile_id in ('copilot.draft', 'parent_ai.home_help'));
create policy ai_profiles_staff_only on control.ai_profiles as restrictive for all to app_user
  using (profile_id in ('copilot.draft', 'parent_ai.home_help')) with check (false);
create policy ai_providers_staff_read on control.ai_providers as permissive for select to app_user
  using (true);
create policy ai_providers_staff_only on control.ai_providers as restrictive for all to app_user
  using (true) with check (false);
grant select on control.ai_profiles, control.ai_providers to app_user;

grant execute on function control.ai_sealed_credential(text) to app_user;
grant execute on function control.count_ai_usage(date, text, text, text, integer, integer, integer, bigint, bigint) to app_user;

insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words) values
  ('copilot.draft', null, null, false),
  ('parent_ai.home_help', null, null, false)
on conflict (profile_id) do nothing;
