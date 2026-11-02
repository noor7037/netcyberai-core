-- W17-B3: written items come back into the after-session quiz and are marked by the AI at submit, with a kind note.
-- A written answer may now carry `correct` (true when the marker found it right, false when partly right or not yet,
-- null when it was not marked) and the marker's `note` (one or two short lines). Only the "correct is null" part of the
-- written branch changes; every other rule of the table check is exactly as it was (S5, chapter tests). The note is for
-- a written row only. No data changes: existing written rows stay unmarked.

alter table family.chapter_test_answers drop constraint chapter_test_answers_check;
alter table family.chapter_test_answers add constraint chapter_test_answers_check check (
  (kind = 'mcq' and choice is not null and correct is not null and body is null and attachment_id is null and rubric is null)
  or (kind = 'written' and body is not null and choice is null and attachment_id is null and rubric is not null)
  or (kind = 'photo' and choice is null and correct is null and body is null and rubric is not null)
);

alter table family.chapter_test_answers add column note text check (note is null or char_length(note) between 1 and 300);
alter table family.chapter_test_answers add constraint chapter_test_answers_note_kind_check check (note is null or kind = 'written');

-- The mark is written after the scorer stored the answer, so the family role may change these two columns and no other
-- (the answer's words, choice and rubric stay as sent). The existing own-account policies still decide which rows.
grant update (correct, note) on family.chapter_test_answers to family_app;
