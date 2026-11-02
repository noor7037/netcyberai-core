-- W17-A2: the provider 'elevenlabs' (voices, speech to text and speech to speech; an API key of its own). Placeholder
-- timestamp: the lead renames it to the version it is applied as.
--
-- Not cleared for minors here: the founder clears a provider in Control -> AI with the terms page he read, as for every
-- provider. Its free plan is not for commercial use; Control shows that beside the switch (terms note
-- paid_plan_for_commercial_use). Nothing is stored by the adapter: no table, column, function or grant is created here.

insert into control.ai_providers (provider_id) values ('elevenlabs')
on conflict (provider_id) do nothing;
