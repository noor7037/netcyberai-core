-- W10-1 (latency): the teaching plan's answer limit. At 300 tokens a model's plan came back cut (297 of 300) and the
-- default plan was used; the plan now answers under one-letter keys (family.plan v1) within 600. Only a limit still at
-- the seeded 300 is raised: one the founder changed in Control is left as he set it. The route revision trigger records
-- the change as a 'set' revision.
-- Rollback: update control.ai_profiles set max_output_tokens = 300 where profile_id = 'family.plan' and max_output_tokens = 600;
update control.ai_profiles set max_output_tokens = 600 where profile_id = 'family.plan' and max_output_tokens = 300;
