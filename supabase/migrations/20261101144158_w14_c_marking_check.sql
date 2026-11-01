-- W14-C (the founder's live test of 31 Oct): AI answer-sheet marking quality.
--   1. marking_marks.check_reason: why a question's AI marks disagree with the AI's own words (marks 0 while the reason
--      says correct, full marks while it says wrong, marks above the question's, steps that do not add up to the
--      marks, sure with no reason). Written by the marking job (src/lib/marking/store.ts) as short codes, shown beside
--      the mark on the review screen; its script then waits in "Needs a look" (the 'unsure' flag).
--   2. marking_transcripts: per script marked, the exact request (the prompt version, the instructions with the
--      questions as sent, the page count; never the pictures) and the AI's raw answer, for audit. Read like the
--      script's marks by the school's staff; never by a parent (no guardian path, unlike marking_marks).
--   3. exams.mark's prompt version is v2 (src/lib/ai/prompts/exams.mark/v2.ts) where Control still has v1.

-- 1.
alter table marking_marks add column check_reason text;
alter table marking_marks add constraint marking_marks_check_reason check (check_reason is null or char_length(check_reason) <= 200);

-- 2.
create table marking_transcripts (
  transcript_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  sheet_id uuid not null,
  paper_id uuid not null,
  prompt_version text not null,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, sheet_id, paper_id) references marking_sheets(school_id, sheet_id, paper_id) on delete cascade,
  constraint marking_transcripts_version check (char_length(prompt_version) between 1 and 32),
  constraint marking_transcripts_request check (jsonb_typeof(request) = 'object' and octet_length(request::text) <= 200000),
  constraint marking_transcripts_response check (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 200000)
);
create index marking_transcripts_sheet on marking_transcripts (school_id, sheet_id, created_at);

revoke all on marking_transcripts from public, anon, authenticated, service_role, nca_super;
grant select, insert on marking_transcripts to app_user;

alter table marking_transcripts enable row level security;
alter table marking_transcripts force row level security;
create policy marking_transcripts_tenant_isolation on marking_transcripts using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy marking_transcripts_readers on marking_transcripts as restrictive for select using (public.may_read_marking(paper_id));
create policy marking_transcripts_writers on marking_transcripts as restrictive for insert with check (public.may_mark_paper(paper_id));
create policy marking_transcripts_no_parent on marking_transcripts as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 3.
update control.ai_profiles set prompt_version = 'v2' where profile_id = 'exams.mark' and prompt_version = 'v1';
