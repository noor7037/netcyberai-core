-- W17-A4: the provider 'google_stt' (Google Cloud Speech-to-Text, an API key of its own, as 'google_tts' has). Placeholder
-- timestamp: the lead renames it to the version it is applied as. Not cleared for minors here: the founder clears a
-- provider in Control -> AI with the terms page he read, as for every provider.
--
-- Nothing is stored by the speech call: no table, column, function or grant is created here.

insert into control.ai_providers (provider_id) values ('google_stt')
on conflict (provider_id) do nothing;
