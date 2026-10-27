-- AJ-2 (C230-AJ part 2, C357): each exam names one of the school's exam types. The list itself is the school's Exams
-- setting "exam_types" (the configuration framework, docs/17 §1a; defaults in src/lib/contracts/exam-types.ts): a key,
-- an English and a Hindi name, and whether it is hidden. The exam keeps only the key; existing exams become "other".
-- Scans need nothing: they hang off the paper (exam × class × subject), so the type and session follow.

alter table exams add column exam_type text not null default 'other';
alter table exams add constraint exams_exam_type check (exam_type ~ '^[a-z][a-z0-9_]{1,39}$');
create index exams_session_type on exams (school_id, session_id, exam_type);
