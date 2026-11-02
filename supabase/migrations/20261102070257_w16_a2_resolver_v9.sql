-- W16-A2: family.resolver moves from prompt v8 to v9 (docs/39 §6): v8 with the live drawing board (a `board` block
-- drawn step by step in time with the explanation's sentences), the citation (exactly one `sources` block naming the
-- chapter whenever the library's passages were given, none otherwise) and the three Class 8 Science simulations
-- (`scene` blocks with `sim`). The new blocks are checked by src/lib/family/blocks.ts like every other block; nothing
-- in the database changes shape. A version Control chose by name (not v8) stays as it is.
--
-- Rollback: update control.ai_profiles set prompt_version = 'v8' where profile_id = 'family.resolver' and
-- prompt_version = 'v9';
-- Plain SQL, no transaction wrapper.

update control.ai_profiles set prompt_version = 'v9' where profile_id = 'family.resolver' and prompt_version = 'v8';
