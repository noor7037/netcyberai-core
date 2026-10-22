-- A model id may start with "@" (Decision Log C230-U): Cloudflare Workers AI names its models "@cf/<vendor>/<model>",
-- for example @cf/meta/llama-4-scout-17b-16e-instruct. Only a leading "@" is added; the rest of the rule is as before
-- (src/lib/ai/control.ts MODEL holds the same pattern).

alter table control.ai_profiles drop constraint ai_profiles_model_check;
alter table control.ai_profiles add constraint ai_profiles_model_check check (model is null or model ~ '^@?[A-Za-z0-9._:/-]{1,80}$');
