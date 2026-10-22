-- Checked explanations only (P1 slice 3, Decision Log C300; C230-S).
--
-- In a subject named in `family.reviewed_only_subjects`, a chapter or topic shows a child only an explanation
-- NetCyberAI has checked (content.responses with status 'checked'): never an AI-made one, and none made live. Until one
-- is checked the child is told it is being checked; a typed question, a follow-up and a wrong answer's retry stay live,
-- under the AI platform's checks. Worksheets and offline packs follow the same rule. Control sets the list (Control →
-- Family, the founder with the authenticator, audited). It starts with EVS, the first pilot's subject (C230-S), so the
-- pilot's children see checked explanations from day 1 without anyone setting it by hand.

insert into control.settings (key, value) values ('family.reviewed_only_subjects', '["evs"]'::jsonb)
on conflict (key) do nothing;
