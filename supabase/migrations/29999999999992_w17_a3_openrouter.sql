-- W17-A3: OpenRouter as a provider (src/lib/ai/adapters/openrouter.ts): one key for many vendors' models, several free,
-- reached for text, photos, speech to text and text to speech at OpenRouter's fixed address. Switched on, as NVIDIA's
-- was; the founder saves only the key in Control -> AI. Not cleared for children's words: that stays the founder's
-- switch, as for every provider. Its model list is read live from the key test, never written here.
-- Plain SQL, no transaction wrapper.
insert into control.ai_providers (provider_id, enabled) values ('openrouter', true)
on conflict (provider_id) do nothing;
