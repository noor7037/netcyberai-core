-- W17-A1, the Sarvam provider (India: Hindi speech to text, child voices, a chat model). Placeholder timestamp: the lead
-- renames it to the version it is applied as.
--
-- The provider row 'sarvam' in Control → AI, with an API key of its own. Not cleared for minors here: the founder clears a
-- provider in Control → AI with the terms page he read, as for every provider. Nothing is stored by the adapter: no table,
-- column, function or grant is created here.

insert into control.ai_providers (provider_id) values ('sarvam')
on conflict (provider_id) do nothing;
