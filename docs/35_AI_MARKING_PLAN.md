# 35 — AI answer-sheet marking and learning intelligence

**Written by** the build lead, for the supervisor and Noor. **Asked by** Noor directly (2026-10-27, with Acadine's
screenshots as reference), to build end to end and hand the PRs to the supervisor for review and merge.
**Status:** the plan and the build record (Decision Log C347–C354), built 2026-10-27 as PRs #317 to #320 and AM-4 and AM-5 (§8). **Binding rules:** `CLAUDE.md`, `16` §3, `17`
§1a/§4/§5, `19` §5, `21`, and P6's rules in `27` §3, which all hold here unchanged.

## 1. What a school gets

A teacher marks a whole class's handwritten answer sheets in one sitting:

1. **Questions.** For a paper of an exam (P6), the teacher lists its questions once: number, marks, which part of
   the paper it counts to (Theory, Internal…), its chapter or topic from the class's syllabus map, the question,
   the answer key or model answer, and the marking steps. Internal choice ("attempt any 2 of 3") is a group.
2. **Scripts.** The teacher uploads the class's scripts as PDFs or photos: one file per child, or one scanner file
   with every child in order. The browser turns every page into a picture; nothing needs a scanner or any device.
3. **Reading.** The AI reads each page: whose script it starts (name, roll number, exam number), its printed page
   number, whether it is blank or cannot be read. The pages become one script per child, matched to the class's
   candidates. Duplicate files, missing pages, unreadable pages, two scripts for one child and scripts that match no
   one are shown for the teacher to settle; everything else needs nothing.
4. **Marking.** The AI marks each script against the questions: marks per question with the steps it gave credit
   for, a note for the child, the kind of mistake, how sure it is, and where on the page the answer is. It also
   drafts the child's strengths, what to improve and what to practise. **These are provisional.**
5. **Review.** The teacher sees the scanned pages with the marks in the margin beside each answer, and the questions
   beside them. They change any mark or note and approve one script, or approve every script that has no flag in
   one press. A flagged or uncertain script is approved only one at a time.
6. **Approval writes marks.** Approving rolls the question marks up into the paper's marks (per part, internal choice
   counted) through the same code as typed marks (`saveMarks`), in the teacher's own name. From then on everything
   P6 has works unchanged: entry progress, the class result in roll order, publishing (marks frozen), report cards,
   Personal Best, Early Warning, the Learning Genome, and School Link's results for families.
7. **Families.** Once the school publishes the class (P6, C215), a linked family sees, for their own child only:
   each paper's marks question by question, the teacher's notes, the checked pages with the marks in the margin,
   strengths, what to improve and what to practise. The child sees the same in the child's own view when the school
   allows it. A parent without the app gets a WhatsApp message with a private link to the same page, sent only when
   a person in the office presses Send after seeing who will get it.
8. **Learning intelligence.** Because every question names its chapter or topic, approved marks show, from evidence:
   each child's topics and chapters, the kinds of mistake that keep coming back, progress across exams, the class's
   weakest topics and questions, and the children who may need support (by the school's own line, in roll order,
   never ranked). Each finding links to the questions it comes from.

## 2. What stays true (the rules)

| Rule | How it holds |
|---|---|
| AI marks are provisional | Only a person's approval writes `marks`. The database refuses a mark written in a job's session (a policy on `marks`). |
| One path for marks | Approval calls `saveMarks` (P6): its checks, its freeze after publishing, its audit row. |
| Grading stays rules only (`27` §3 rule 8) | The AI code lives in `src/lib/marking/`; `src/lib/exams`, the genome and Early Warning import no AI, as their tests hold. |
| No ranking (`27` §3 rule 2, C76) | Every list is in roll order; no rank, position or comparison of one child with another reaches anyone. |
| Published means frozen (C215) | A sheet of a published class cannot be changed or approved; families see sheets only of a publication in force. |
| A child's words go only to a cleared provider | The marking tasks carry a child's words: the platform's minors check applies (a provider cleared in Control and eligible in code). |
| Thresholds are settings (`27` §3 rule 9) | "Ask me to check below this confidence", "may need support below this percent": the school's settings, shown where used. |
| Nothing names a child to the AI beyond the page | The request carries the questions, the class level and the subject; the roster and names are matched in code, never sent. |
| Teachers see their own classes | Every table follows `exam_papers`: the office and the coordinator every class, a teacher their own; writes by whoever may enter that paper's marks. |
| Families see their own child only | The guardian's own consented child, and only of a publication in force (C333's functions, reused). |

## 3. The decisions (Decision Log)

- **C347 — AI marking is part of Exams.** A monthly page limit in the school's plan (`exams.ai_marking_pages`), set
  by Noor in Control → Billing plans; the school's own switch and lines are Exams settings. No limit set means off, as Copilot (C284). Not a new module: it marks P6's papers and feeds P6's
  marks. Scripts are pictures from a phone or a scanner file: no hardware (CLAUDE.md "out of scope" holds).
- **C348 — Candidates and exam numbers.** An exam's candidates are its classes' rolls (P6's own rule, `ON_ROLL`)
  minus the children the office withdraws from it, counted from the rows every time, never typed. A school that uses
  exam numbers (seat numbers) turns them on per exam: each candidate gets one number, unique in the exam, issued by
  the database in class and roll order, and a child who joins a class later gets the next one at once. Numbers are
  never reused or changed; official roll numbers are never touched. Students do not "register": a school's internal
  exam is sat by its classes.
- **C349 — AI configuration stays in Control → AI.** Two new tasks (profiles): `exams.read_pages` and `exams.mark`,
  each with its provider, model, fallbacks, prompt version, output limit and switch. Keys stay sealed. **Vendor hosts
  and wire formats stay in code** (an adapter per vendor): a free-typed endpoint or parameter map in Control would let
  a child's answer sheet go to any address and skip the per-vendor minors check (C249, C230-U). A new vendor is a
  reviewed adapter.
- **C350 — Pages are pictures made in the browser.** The browser turns each PDF page (pdf.js, `pdfjs-dist`, loaded
  only on the upload screen) and each photo into a JPEG of at most 2000 px, uploaded a few at a time under the
  host's 4.5 MB request limit. The server checks every JPEG, keeps one copy per page under the school's folder, and
  hands it out only as a short-lived link. Every vision provider reads JPEG, and the review screen draws on it.
- **C351 — Results reach families only as published.** School Link's results gain the question-level detail and the
  checked pages, read as the guardian. A private report link (a long random value kept only as a hash, 30 days,
  ended by reopening) serves parents without the app; one WhatsApp template, `exam_result_ready`, carries it. Sending
  is a person's act after a preview; one message per child and guardian per publication, kept unique by its key.
- **C352 — Learning intelligence from approved marks.** Topic and chapter mastery, mistake kinds and progress come
  from approved question marks joined to the syllabus map, worked out when read (nothing stored), in the Learning
  Genome and a paper's class view. Rules only; no AI in analytics.

## 4. Data model (one migration, `am_1_answer_marking`)

| Table | One row is | Notes |
|---|---|---|
| `exams` (+2 columns) | `numbering` (`roll` or `seat`), `seat_prefix` | Exam numbers on or off |
| `exam_withdrawals` | a child withdrawn from an exam, with a reason | Office only |
| `exam_seat_numbers` | a candidate's exam number | Issued by the database only |
| `marking_setups` | a paper's AI marking setup: language, general guidance, internal choice counts | One per paper |
| `marking_questions` | a question of a paper | Part, marks, unit, question, key, steps |
| `marking_uploads` | one upload (one file per child, or one combined scan) | Its own pages |
| `marking_pages` | one page picture | Hash, size, what was read, its script |
| `marking_sheets` | one child's script for a paper | Match, state, flags, AI and approval |
| `marking_marks` | a question's mark on a script | AI's and the teacher's, kept apart |

Functions: `exam_candidate_counts(exam)`, `issue_exam_seat_numbers(exam)` (and its triggers),
`guardian_marking_sheets()` for School Link.

## 5. How the work is split (C198, Noor's word of 2026-10-27: up to six agents)

| PR | Builder | Delivers | Acceptance test |
|---|---|---|---|
| **AM-1 Core** | Lead | The migration; contracts; the rules: questions, roll-up with internal choice, identity matching, page grouping, approval through `saveMarks`, candidates and exam numbers | Tests on the whole schema as `app_user`: a teacher of another class reads nothing; a job's session cannot write marks; approval writes the rolled-up marks; a published class refuses approval; candidates count from rows; a late joiner gets the next number |
| **AM-2 Pipeline** | Agent (Opus) | The two AI tasks and prompts; page upload; the jobs (read, group, mark); the monthly limit; failures recoverable | A whole class's pages, read and marked by a stand-in model's answers, end as matched, marked scripts; a bad answer fails one script, not the class; a retry runs once |
| **AM-3 Teacher screens** | Agent (Sonnet) | Questions, upload (PDF in the browser), progress, review list, the script review screen, approval; candidates and exam numbers on the exam screen | Harness pictures at 390 and 1440, English and Hindi, axe clean; a teacher approves a script and the paper's marks show it |
| **AM-4 Families** | Agent (Opus) | School Link detail, child view, report link, the template and the send step with delivery | A guardian sees only their own child's published sheet; a reopened class hides it; a link of another child opens nothing; a resend sends nothing twice |
| **AM-5 Intelligence** | Agent (Sonnet) | Learning Genome topics and mistakes; a paper's class view; Control's marking monitor | Every number traces to its questions; no AI import; roll order |

Migrations are the lead's: one at a time, to the test database, md5 checked, renamed to the recorded version.

## 6. What needs Noor (after the merge)

1. **An AI provider for marking.** In Control → AI, choose a provider and model for `exams.mark` and
   `exams.read_pages`. Reading handwriting needs a strong vision model; the provider must be cleared for children in
   Control (Anthropic is eligible in code; OpenAI is not). If the Anthropic key is not saved yet, it is one paste.
2. **A monthly page limit** for the plan(s) that include AI marking, in Control → Billing plans. No limit, no marking.
3. **The WhatsApp template** `exam_result_ready`: approve its words (English, and Hindi after a Hindi reader's look) in
   Control → Message templates, then Submit to Meta (C345). Until Meta approves it, the office's "Tell parents" step says
   the words are not approved and sends nothing; linked Family app families still get their push.

## 7. Not in this wave (follow-ups, each needing a decision)

- Re-evaluation requests by families (`family-app/07` "Exam transparency": a second reviewer, deadlines, both
  versions kept).
- How long scanned scripts are kept after publication (a retention rule for the supervisor; until then they stay
  with the exam).
- Admit cards as PDFs (the exam numbers exist; the printed card is a layout task).
- Online tests (CBT), OMR bubble sheets and question-paper generation (in Acadine's pictures, not in the brief).

## 8. What was built (2026-10-27)

| PR | Slice | Migration on the test project |
|---|---|---|
| #317 | AM-1 core: tables, rules, matching, approval through `saveMarks`, exam numbers, families' read rules, report-link functions, Control's monitor function | `am_1_answer_marking` 20261026222306, `am_1_review` 20261026223956, `am_1_parent_rules` 20261026225012 |
| #318 | AM-2 pipeline: the two AI tasks and prompts, page uploads, the read, group and mark jobs, long jobs (C353) | none |
| #319 | AM-3 teacher screens: questions, upload (PDF in the browser), progress, review in the margin, approval; candidates and exam numbers | none |
| #320 | AM-6 intelligence: the Learning Genome by topic, a paper's class view, Control's AI marking monitor | none |
| #321 | AM-4 families: the checked paper in the Family app (parent and child view), the exam timetable, the private report link | `am_4_guardian_choice_counts` 20261026233953 |
| AM-5 | The office's "Tell parents on WhatsApp", the `exam_result_ready` template (needs #315 and #316 first) | none |

Two security reviews (#317, #318) found a script edited after approval reaching families, AI spending through "Mark
again", and words on a script asking for full marks; each is closed (the PRs list them). Open decisions for the
supervisor: C354 (no Aadhaar check on answer-sheet pages), how long scanned scripts are kept, and whether the office may
end and remake a family's report link before the next publication.
