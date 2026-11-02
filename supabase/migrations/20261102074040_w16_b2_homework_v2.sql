-- W16-B2: family.homework moves from prompt v1 to v2 (the proposal's M8, "Check my work"). v2 is v1 word for word for the
-- hint ladder ("Ask about this") and adds the check mode: a photo of the child's own handwritten working read line by
-- line and marked step by step (src/lib/ai/prompts/family.homework/v2.ts). Nothing in the database changes shape: the
-- checked work is a tutor message like any other (family.tutor_messages, its blocks), under the same row-level policies.
-- A version Control chose by name (not v1) stays as it is.
--
-- Rollback: update control.ai_profiles set prompt_version = 'v1' where profile_id = 'family.homework' and prompt_version = 'v2';
-- Plain SQL, no transaction wrapper.

update control.ai_profiles set prompt_version = 'v2' where profile_id = 'family.homework' and prompt_version = 'v1';
