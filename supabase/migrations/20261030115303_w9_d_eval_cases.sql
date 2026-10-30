-- W9-D (C409, docs/39 §4): the Quality Lab's curriculum cases.
--
-- The Lab's hand-written cases stay in the repository (data/ai-lab/*.json, G4). The cases built from the syllabus (a
-- question for each unit, question type and language, from a fixed template, no model call) are many and follow the
-- syllabus, so they are kept here. case_key is the stable key: 'cur-' and sixteen hex digits taken from the board,
-- class, subject, unit, question type, language and the template's version, so adding the same set again inserts
-- nothing. The key is also the case id a run names (control.ai_eval_runs.case_ids, ai_eval_results.case_id).
--
-- Control's own table, the platform role's only (nca_super, the founder with the authenticator, through the Lab's
-- route guard), as control.ai_eval_runs. Made-up questions from syllabus titles: no child's words, nothing personal.

create table control.ai_eval_cases (
  case_key text primary key check (case_key ~ '^cur-[a-f0-9]{16}$'),
  board_id text not null check (board_id ~ '^[A-Z][A-Z0-9-]{1,15}$'),
  class_level smallint not null check (class_level between 1 and 12),
  subject text not null check (subject ~ '^[a-z][a-z_]{1,39}$'),
  unit_key text not null check (unit_key ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  question_type text not null check (question_type in ('definition', 'concept', 'why_how', 'comparison', 'problem', 'derivation', 'process', 'experiment', 'history', 'case', 'application')),
  band text not null check (band in ('lkg_1', 'c2_5', 'c6_8', 'c9_10', 'c11_12')),
  language text not null check (language in ('en', 'hi')),
  -- The case as the Lab runs it: { system, messages, expect, rubric, tags }; the application checks its shape.
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and pg_column_size(spec) <= 8000),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index ai_eval_cases_scope on control.ai_eval_cases (board_id, class_level, subject);
create index ai_eval_cases_recent on control.ai_eval_cases (created_at desc, case_key);

alter table control.ai_eval_cases enable row level security;
alter table control.ai_eval_cases force row level security;

-- No policy for any role: the platform role bypasses row level security and is the only one granted anything.
revoke all on control.ai_eval_cases from public, anon, authenticated, service_role, app_user, family_app;
grant select, insert on control.ai_eval_cases to nca_super;
