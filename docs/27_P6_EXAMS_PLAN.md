# 27 — P6 plan: exams and learning intelligence

**Status:** plan for review (Decision Log C211). No code in this PR.
**Scope:** roadmap `16` §4 phase P6: Exams & Report Card, Personal Best /
Most Improved, Curriculum Gap Detector, Learning Genome, Early Warning v2.
**Done when** (`16` §4): report cards are published, and growth and gaps are
computed from real marks.
**Every screen** follows `19` §5: `ModulePage`, today cards, English and
Hindi, a tour, a "Show me how" guide, teaching empty states, logo tokens, AA
contrast, 44 px targets, and no invented numbers. Every grade, flag and
number follows `21`: where it came from, the rule and its version, and who
decided.

## 1. Where we start (one read of the code and both databases, 2026-10-14)

- **Exams and marks are bare tables.** `exams` has `exam_id, school_id, name,
  date, session_id`. `marks` has `exam_id, student_id, subject_id, score,
  max_score`. There is no screen, no route, no grading, and no rule on a
  mark. Row level security on marks holds only a parent scope. A teacher
  reads every mark of the school, and so does an accountant.
- **Test database:** 1 exam and 414 marks (seeded earlier), 6 subjects, 20
  teacher-subject rows, 1 academic session, no syllabus units, no "taught
  today" rows, no Pulse replies. **Production:** no school, so no rows. Every
  P6 migration must keep the test database's rows valid: backfill, never
  drop.
- **What P6 reads from P2 to P5:**
  - `syllabus_units` (the syllabus map: class, subject, chapter, topic, in
    order).
  - `syllabus_progress.unit_id` ("taught today").
  - `pulse_messages.source_progress_id` and `pulse_response_log.tier` (the
    "understood / needs help" replies to a taught unit).
  - `homework_status`, `attendance`.
  - `teacher_subjects`, `teacher_own_class_ids()`.
  - The settings framework (`src/lib/frameworks/settings-*`), the PDF
    helpers in `src/lib/pdf`, the job queue.
  - Early Warning v1 and its nightly check (C209, C210).
- **The recognition engine is locked:** `src/lib/recognition.ts` (`01` §6,
  `05` §7). It holds Personal Best's noise floor and `logitDelta`. P6
  imports it and never edits it.
- **Registry:** `exams` is foundation. `learning-genome` and `curriculum-gap`
  are spec-v0. `early-warning` is partial.

## 2. What P6 delivers

1. **Grading schemes as settings.** A school picks a preset and may change
   its bands. Every grade in the app is computed by one function from the
   scheme in force.
2. **Exams.** An exam for some classes and subjects of a session, each paper
   with its maximum marks and the chapters it assesses. Marks are entered by
   the subject teacher, or by the office or the coordinator, with
   validation; absent is never zero.
3. **Report cards.** Publishing an exam for a class freezes its marks and the
   grading scheme used. Each child gets a report card PDF (one, or the whole
   class), with Personal Best and Most Improved, comparing the child only
   with themselves.
4. **Curriculum Gap Detector.** For each class and subject, each unit of the
   syllabus map is shown as taught and assessed, taught but not assessed,
   assessed before it was taught, or skipped.
5. **Learning Genome v1.** For each child, each subject's own trend from
   published marks, and each chapter's "needs help" replies and homework,
   with strengths and gaps by stated rules. Shown to staff.
6. **Early Warning v2.** A marks signal joins attendance, homework and
   "needs help" (rule version 2), in the nightly check.

## 3. Rules that hold everywhere in P6

1. **Grading schemes are settings with presets, never constants.**
   - The only grade table in the code is the presets file
     (`src/lib/exams/grading-presets.ts`), each preset with its source.
   - The scheme in force is the school's setting. A published exam keeps
     the scheme it was published with, so a later change never rewrites a
     report card.
2. **No ranking of named children** (`01` constitution).
   - No rank, position, topper, merit list, percentile, or comparison of one
     child with another, on any screen, report, PDF or CSV. A class view is
     in roll order or name order only.
   - **Personal Best** and **Most Improved** compare a child only with
     themselves: their own earlier exams.
   - The competitive, banded tier of `recognition.ts` is not built (C211).
3. **One rule in one place.**
   - The grade comes from `grade()`.
   - The percent comes from `percent()` (absent and exempt are not marks).
   - Personal Best and Most Improved come from `recognition.ts`.
   - Taught and assessed come from the syllabus map, "taught today" and the
     exam's chapters.
   - No screen re-derives any of these.
4. **A published result does not change.** Marks of a published class and
   exam are frozen by the database. Only the principal may reopen it, with
   a reason; the reopening is audited, and it is published again. The
   report card says which publication it is.
5. **Fees are never a learning signal.** No fee figure sits beside marks.
   An accountant reads no mark.
6. **Teachers see their own classes.**
   - A teacher reads the marks, gaps and genome of their own classes
     (`teacher_own_class_ids()`).
   - A teacher enters marks for the class and subject they teach
     (`teacher_subjects`) or, as class teacher, for their class.
   - The office and the academic coordinator see every class.
7. **Nothing new reaches a parent in P6.** Report cards are printed or
   handed over. Telling guardians that report cards are ready uses the
   existing class notice (P4, through the send-gate). Early Warning stays
   staff-only (C209). The Learning Genome is not sent.
8. **Rules only.** No language model in grading, gaps, the genome or Early
   Warning. A test reads those folders and finds no import of the AI
   provider.
9. **Every threshold is a setting with its value shown where it is used.**
   Examples: the pass mark, Early Warning's drop in points, and the genome's
   "needs help" count. Personal Best's noise floor is the constitution's,
   read from `recognition.ts`.

## 4. Slices, in order

Each is one PR with tests on the whole schema as the app's database role, a
real-browser run of its screens at 390 and 1440, and the review `CLAUDE.md`
sets. Migrations go to the test database, are checked, then go to
production, in this order, by the lead only.

| PR | Delivers | Data model change | Acceptance test |
|---|---|---|---|
| **9a. Grading and marks entry** (C212) | Exams settings: the grading scheme (presets: marks only; CBSE nine-point, `A1` to `E`; custom bands) and the pass mark. `/app/exams`: make an exam (name, session, term, classes), its papers (class, subject, maximum marks, date, the chapters it assesses), and entry progress. Marks entry by paper on a phone (score, absent, exempt), saved as a draft, then "entered" by the teacher. The class result: each child's marks, percent and grade, in roll order. A teacher's My Day card shows "marks to enter". | `exams` gains a status, a term, and who made it. New `exam_papers` (exam, class, subject, maximum, date, unit ids, entered by, entered at). `marks` gains the paper, absent or exempt, who entered and when, with a check `0 <= score <= max`. Backfill the test database's exam and 414 marks into papers. RLS: a teacher reads their own classes, and writes their own subjects or their class as class teacher. The office and coordinator do everything. The accountant reads nothing. | A school picks a preset and changes a band; the grade follows. A teacher enters marks only for their own class and subject: the app and the database refuse another. A mark above the maximum or below zero is refused by both. Absent is not zero and is left out of the percent. The class result shows each child's percent and grade by the school's scheme, in roll order. No grade table exists outside the presets file. |
| **9b. Report cards, publish, Personal Best and Most Improved** (C213) | Publish an exam for a class (office or coordinator): marks are frozen and the scheme is kept. The principal can reopen with a reason (audited). Report card PDF for one child or the whole class: subjects with marks, maximum and grade; total and percent; attendance for the session; a class teacher's remark; Personal Best (a subject where the child beat their own best by the constitution's noise floor); Most Improved (the child's own subject with the largest `logitDelta` against their previous published exam). The office and the class teacher download. | `exam_publications` (exam, class, version, scheme snapshot, published by and at, reopened by, when and why). A trigger freezes the marks of a published class and exam. `report_remarks` (child, exam, text, by). | After publish, no mark of that class and exam can change (app and database) until the principal reopens it with a reason. Each child's PDF shows marks, grades by the kept scheme, and their own Personal Best and Most Improved. No rank, position or comparison with another child appears anywhere: a test reads the source and the PDF text. A child with no earlier exam gets neither line, and the card says why. |
| **9c. Curriculum Gap Detector** (C214) | `/app/curriculum-gap`: for a class and subject, each unit of the syllabus map once, as taught and assessed, taught but not assessed, assessed before it was taught, or skipped (an earlier unit not taught while a later one was), each with the dates it rests on, and a count per state. The office and coordinator see every class, a teacher their own. "Not set up" without a map. | None (reads `syllabus_units`, `syllabus_progress`, `exam_papers`). | For a class and subject with a map, every unit appears once in the right state with its dates. Teaching it, or adding it to a paper, moves it. A class with no map says "not set up", never zero. A teacher sees only their classes. |
| **9d. Learning Genome v1** (C215) | For one child (from the student's page or `/app/learning-genome`):<br>• Per subject: their own percent in each published exam, as a line, and homework done.<br>• Per chapter: "needs help" and "understood" replies to its taught units.<br>• Strengths: subjects at or above the child's own average by the noise floor.<br>• Gaps: chapters with at least the "needs help" setting's count, or subjects below the pass mark.<br>Each number says where it comes from. Staff only: the office, the coordinator, and the child's own teachers. | None, or a settings entry only. | For a child with marks, replies and homework, every number equals its source rows. Strengths and gaps follow the stated rules and compare the child only with themselves. No other child's data appears. A teacher of another class is refused by the app and the database. No model is called. |
| **9e. Early Warning v2** (C216) | The marks signal, rule version 2: in a published exam the child's percent fell by at least the setting's points against their own previous published exam, or is below the pass mark in at least the setting's number of subjects. The evidence names the exams, papers and percents. The nightly check (C210) and "Check now" use it. Version 1 flags stay readable. | `early_warning_flags.reasons` admits `marks`. | After a publish, the next check opens or updates a flag with the marks reason and its evidence for a child whose own marks fell past the line. A child above it is not flagged. Fees are never a signal. Nothing reaches a parent. |

## 5. Decisions the plan makes, unless told otherwise

- **Presets.** "Marks only" (no grades) and "CBSE nine-point": `A1` 91–100,
  `A2` 81–90, `B1` 71–80, `B2` 61–70, `C1` 51–60, `C2` 41–50, `D` 33–40,
  `E` 32 and below, from the CBSE scheme of studies for classes IX and X.
  "Custom" starts from either and is edited by the principal or the school
  admin. A state board is added as a preset when a school names it.
- **Marks** are per paper, to one decimal place, and never more than its
  maximum. Absent and exempt are not marks and are left out of percents.
  Grace marks are not built.
- **Who enters:** the paper's subject teacher (`teacher_subjects`), the
  class teacher, the office or the coordinator. A paper is "entered" when
  every child on the roll has a mark, absent or exempt.
- **Most Improved** is the child's own most improved subject. A child with
  no earlier published exam has no Personal Best or Most Improved line, and
  the card says it is their first.
- **Report cards** are PDFs from `src/lib/pdf`, one template in v1. They are
  not sent by WhatsApp.
- **Curriculum gap states** are computed when the screen is read, not
  stored. "Skipped" means a unit before the latest taught unit (by its place
  in the map) that was never taught.
- **The Learning Genome** is computed when it is read; nothing is stored.
  Thresholds are settings of the module.
- **Early Warning v2** only adds a reason. The thresholds are settings, and
  the rule version on each flag says which rules made it.

## 6. What needs Noor

Nothing blocks P6. If a first school follows a state board, a page from
that board giving its grade table is the one input to add as a preset.

## 7. Limits of what I can verify

- Whether the presets and thresholds suit a real school is unknown until a
  school uses them; they are settings for that reason.
- PDF output is checked by its text and by a picture in the harness, not by
  a printer.
- Hindi wording is unreviewed by a Hindi reader.

## 8. How the work is split (C198, "Parallel agents")

- **9a** is built first: every other slice reads its tables.
- Then **9b, 9c and 9d** are built in parallel, one agent each: separate
  modules, screens and files.
- **9e** follows the P5 close-out's nightly check and 9a.
- The lead keeps the migrations serial, reserves the Decision Log numbers
  C211 to C216, edits `docs/10`, `16`, `17` and this file, and keeps the
  PR order.
- One full `ci_local.sh` on the top of the stack.
