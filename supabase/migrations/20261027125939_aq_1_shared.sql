-- AQ-1 (docs/36, C361): one question list for four ways of sitting.
--
--   1. marking_questions gains a choice question's options, the correct answer (choice keys, or a number and its
--      tolerance), difficulty and section. Options only on an objective question; a correct answer only where rules
--      can mark it.
--   2. exam_papers gains how the paper is sat: written (an answer book), bubble (a bubble sheet for the choice
--      questions, the answer book for the rest), online (the Family app). It is fixed once a script exists.
--   3. marking_uploads gains its kind: scripts, or bubble sheets.
--   4. marking_sheets gains where a script came from (scan, bubble, online). Only an online script has no upload; a
--      script's source never changes; a bubble sheet's printed number and an online sign-in are ways a script is
--      matched to its child.
--   5. marking_setups gains the marks taken off for a wrong choice answer (0 to 10, one decimal). A wrong answer's question mark is
--      that many below nothing, and a part's score is never below 0 (src/lib/marking/rollup.ts), so every view that
--      adds question marks up agrees without knowing about it.
--   6. marking_marks: a question mark may be below nothing, by at most 10 (the most wrong_marks can be). Which
--      questions may be is the app's rule (src/lib/marking/answers.ts).

-- 1.
alter table marking_questions add column options jsonb not null default '[]'::jsonb;
alter table marking_questions add column correct jsonb;
alter table marking_questions add column difficulty text;
alter table marking_questions add column section text;
alter table marking_questions add constraint marking_questions_options check (
  jsonb_typeof(options) = 'array'
  and jsonb_array_length(options) in (0, 2, 3, 4, 5, 6)
  and (jsonb_array_length(options) = 0 or kind = 'objective')
  and octet_length(options::text) <= 4000
  and not (options @? '$[*] ? (!(@.key like_regex "^[A-F]$") || @.text.type() != "string")')
);
alter table marking_questions add constraint marking_questions_correct check (
  correct is null
  or (kind = 'objective' and jsonb_array_length(options) > 0 and jsonb_typeof(correct -> 'keys') = 'array'
      and jsonb_array_length(correct -> 'keys') between 1 and 6
      and not (correct @? '$.keys[*] ? (!(@ like_regex "^[A-F]$"))'))
  or (kind = 'numerical' and jsonb_typeof(correct -> 'value') = 'number'
      and (correct -> 'tolerance' is null or (jsonb_typeof(correct -> 'tolerance') = 'number' and (correct ->> 'tolerance')::numeric >= 0)))
);
alter table marking_questions add constraint marking_questions_difficulty check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));
alter table marking_questions add constraint marking_questions_section check (section is null or section ~ '^[A-H]$');

-- 2.
alter table exam_papers add column sitting text not null default 'written';
alter table exam_papers add constraint exam_papers_sitting check (sitting in ('written', 'bubble', 'online'));

create function exam_papers_sitting_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.sitting is distinct from old.sitting
     and exists (select 1 from marking_sheets s where s.school_id = old.school_id and s.paper_id = old.paper_id) then
    raise exception 'how a paper is sat is fixed once a script of it exists' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger exam_papers_sitting_fixed before update of sitting on exam_papers
  for each row execute function exam_papers_sitting_fixed();

-- 3.
alter table marking_uploads add column kind text not null default 'scripts';
alter table marking_uploads add constraint marking_uploads_kind check (kind in ('scripts', 'bubble'));

-- 4.
alter table marking_sheets add column source text not null default 'scan';
alter table marking_sheets add constraint marking_sheets_source check (source in ('scan', 'bubble', 'online'));
alter table marking_sheets alter column upload_id drop not null;
alter table marking_sheets add constraint marking_sheets_upload check ((upload_id is null) = (source = 'online'));
alter table marking_sheets drop constraint marking_sheets_matched_by;
alter table marking_sheets add constraint marking_sheets_matched_by
  check (matched_by in ('seat', 'roll', 'name', 'teacher', 'bubble', 'online', 'none'));

create function marking_sheets_source_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.source is distinct from old.source then
    raise exception 'where a script came from never changes' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger marking_sheets_source_fixed before update of source on marking_sheets
  for each row execute function marking_sheets_source_fixed();

-- 5.
-- One decimal place, as every question mark.
alter table marking_setups add column wrong_marks numeric(3,1) not null default 0;
alter table marking_setups add constraint marking_setups_wrong_marks
  check (wrong_marks >= 0 and wrong_marks <= 10 and wrong_marks * 10 = trunc(wrong_marks * 10));

-- 6.
alter table marking_marks drop constraint marking_marks_ai;
alter table marking_marks add constraint marking_marks_ai
  check (ai_marks is null or (ai_marks >= -10 and ai_marks * 10 = trunc(ai_marks * 10)));
alter table marking_marks drop constraint marking_marks_marks;
alter table marking_marks add constraint marking_marks_marks
  check (marks is null or (marks >= -10 and marks * 10 = trunc(marks * 10)));
