-- G1 (Decision Log C369): two more AI providers, and the address of the one whose address is the founder's choice.
--
-- vertex_ai: Google Vertex AI in express mode (an API key; Gemini models). Not cleared for minors here: the founder
-- clears a provider in Control → AI with the terms page he read, as for every provider.
--
-- openai_compatible: any service that speaks OpenAI's Chat Completions, at the base URL the founder sets in Control.
-- base_url holds that address. The server checks it in full before it is saved and again at every call (https only,
-- public addresses only, no redirect: src/lib/ai/adapters/endpoint-guard.ts); this check is the database's floor: an
-- https address of sensible length with no user name or password in it. It is not a secret (a key is never part of
-- it), and is written only by Control (nca_super), audited before and after like every other AI change.
--
-- No new function, table or grant: the column takes the table's existing rights.

alter table control.ai_providers
  add column base_url text check (base_url is null or (base_url ~ '^https://[^/?#@\s]+(/[^?#@\s]*)?$' and length(base_url) <= 500));

insert into control.ai_providers (provider_id) values ('vertex_ai'), ('openai_compatible')
on conflict (provider_id) do nothing;
