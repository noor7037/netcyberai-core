-- W16-A4, the call. Placeholder timestamp: the lead renames it to the version it is applied as.
--
-- The workload family.voice_call (control.ai_profiles): the call's realtime voice leg, a live two-way voice the phone
-- opens straight to a provider with a short-lived token the server mints. It carries a child's voice, so it runs only on
-- a provider the founder has cleared for minors (the trigger on control.ai_profiles). No provider until the founder
-- chooses one in Control; until then the call listens, answers and speaks as a chain and nothing is minted.
--
-- Nothing is stored by the call: no table, column, function or grant is created here. A call's turns are counted in the
-- seconds the child already speaks (family.day_counts.voice_seconds), so no counter is added. Idempotent: the same row
-- W16-A1 adds is left as it is.
insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words, max_output_tokens)
values ('family.voice_call', null, null, true, 100)
on conflict (profile_id) do nothing;
