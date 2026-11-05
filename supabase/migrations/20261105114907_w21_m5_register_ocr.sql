-- W21-M5 (docs/42 Medium: Students OCR): the office photographs a page of the school's paper admission register and the
-- app reads its rows into the student import's checked rows, through the new gateway workload students.register_ocr
-- (src/lib/ai/platform.ts). Its control.ai_profiles row, shaped as the W16-A1 rows were: no provider here, so it runs on
-- exams.read_pages's chain (the registry's chainFrom) until Control sets its own. It reads children's names, dates of
-- birth and addresses, so it carries a child's words: only a provider cleared for minors may serve it (the trigger on
-- control.ai_profiles, C368, and the platform's own check on the whole chain).
--
-- The office's request runs as app_user, which reads only the school profiles (C284, C349, C363). The new profile joins
-- that list. No new table, function or grant; nothing of the register is stored (the rows go back to the office's
-- screen and are written only through the existing import, csv_imports and students).

insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, carries_child_words, max_output_tokens)
values ('students.register_ocr', null, null, 'v1', true, 4000)
on conflict (profile_id) do nothing;

alter policy ai_profiles_staff_read on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions', 'students.register_ocr'));
alter policy ai_profiles_staff_only on control.ai_profiles
  using (profile_id in ('copilot.draft', 'parent_ai.home_help', 'exams.read_pages', 'exams.mark', 'exams.write_questions', 'students.register_ocr')) with check (false);
