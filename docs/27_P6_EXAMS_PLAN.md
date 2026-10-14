# 27 — P6 plan: exams and learning intelligence

**Status:** plan for review (Decision Log C211). No code in this PR.
**Scope:** roadmap `16` §4 phase P6: Exams & Report Card, Personal Best /
Most Improved, Curriculum Gap Detector, Learning Genome, Early Warning v2.
**Done when** (`16` §4): report cards are published, and growth and gaps are
computed from real marks.
**Founder decisions, 2026-10-14:** schools record their board, and grading
is a scheme builder with presets for CBSE and CISCE only, each from the
board's official document (sections 3 and 5). Plans are priced per student,
and Personal Best is a Compass feature (C212, its own slice before P6; the plans are Starter, Growth and Compass, C219). P6
does not touch the public website.
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

1. **Boards and grading schemes.**
   - A school records its board.
   - Its grading scheme is built in a scheme builder: bands, pass marks,
     components (theory, practical, internal), terms and the report card
     layout.
   - A scheme starts from its board's preset or from nothing.
   - Every grade in the app is computed by one function from the scheme in
     force.
2. **Exams.** An exam for some classes and subjects of a session, each paper
   with its maximum marks and the chapters it assesses. Marks are entered by
   the subject teacher, or by the office or the coordinator, with
   validation; absent is never zero.
3. **Report cards.** Publishing an exam for a class freezes its marks and the
   grading scheme used. Each child gets a report card PDF (one, or the whole
   class). Where the school's plan includes it (C212), the card has
   Personal Best and Most Improved, comparing the child only with
   themselves.
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
   - Presets exist only for CBSE and CISCE.
   - Each preset copies the board's official published document, with the
     document's URL in the preset and in the PR. Where the document leaves
     something out, the preset leaves it out and says so.
   - State boards get no invented preset. Control adds a board preset when a
     school from that board signs, copied from the board's official
     circular, with its URL.
   - There is no grade table in the code: the CBSE and CISCE presets are
     rows seeded by 9a's migration (`board_presets`), and Control adds
     others the same way.
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
| **9a. Boards and the grading scheme builder** (C213) | **Board:** a school records its board (Control, and the school's settings).<br>**Presets:** CBSE and CISCE (ICSE, ISC), each with its document's URL and words (section 5). Control adds a board preset for a state board: name, document, URL, its bands and pass marks.<br>**Scheme builder** (Exams settings; the principal and the school admin):<br>• bands (from–to percent, grade, meaning);<br>• the pass mark of a subject, and optionally of each component;<br>• components (theory, practical, internal) with their share of the maximum;<br>• terms (names, and which exams count);<br>• the report card layout (which columns and sections show).<br>A scheme starts from the board's preset or empty. The builder shows gaps and overlaps, quoting the board's own words where a preset copies a gap. `grade()` and `percent()` live in one place. | A school's board. `board_presets` (a platform table: Control writes, every school reads). The school's scheme as a dated, versioned setting of `exams`. | A CBSE school starts from the CBSE preset and sees its source. It changes a band and the grade follows. A CISCE school sees the grades and pass mark of the Regulations and is asked for the mark ranges the Regulations do not give. Control adds a state board preset with its circular's URL, and a school of that board starts from it. No grade table exists in the code except the two presets, each with its URL. |
| **9b. Exams and marks entry** (C214) | `/app/exams`:<br>• make an exam for a term (name, session, classes);<br>• its papers (class, subject, date, the chapters it assesses), each with the scheme's components and their maxima;<br>• entry progress.<br>Marks are entered per paper and component on a phone (score, absent, exempt), saved as a draft, then marked "entered". The class result shows each child's marks, percent and grade, in roll order. A teacher's My Day card shows "marks to enter". | `exams` gains a status, a term and who made it. New `exam_papers` (with components and maxima, unit ids, entered by and at). Marks per paper and component, with absent or exempt, who entered and when, and a check `0 <= score <= max`. Backfill the test database's exam and 414 marks. RLS: a teacher reads their own classes and writes their own subjects (or their class as class teacher). The office and coordinator do everything. The accountant reads nothing. | A teacher enters marks only for their own class and subject: the app and the database refuse another. A mark above a component's maximum or below zero is refused by both. Absent is not zero and is left out of the percent. The class result shows each child's percent and grade by the school's scheme, in roll order. |
| **9c. Report cards, publish, Personal Best and Most Improved** (C215) | Publish an exam for a class (office or coordinator): marks are frozen and the scheme is kept. The principal can reopen with a reason (audited).<br>Report card PDF for one child or the whole class, laid out as the scheme says: subjects with components, marks, maximum and grade; total and percent; attendance for the session; a class teacher's remark.<br>Where the plan has the feature (C212):<br>• Personal Best: a subject where the child beat their own best by the constitution's noise floor;<br>• Most Improved: the child's own subject with the largest `logitDelta` against their previous published exam.<br>The office and the class teacher download. | `exam_publications` (exam, class, version, scheme snapshot, published and reopened by, when, why). A trigger freezes the marks of a published class and exam. `report_remarks`. | After publish, no mark of that class and exam can change (app and database) until the principal reopens it with a reason. Each child's PDF shows marks and grades by the kept scheme and its layout; with the feature, their own Personal Best and Most Improved, and without it neither line. No rank, position or comparison with another child appears anywhere: a test reads the source and the PDF text. |
| **9d. Curriculum Gap Detector** (C216) | `/app/curriculum-gap`: for a class and subject, each unit of the syllabus map once, with the dates it rests on, as one of:<br>• taught and assessed;<br>• taught but not assessed;<br>• assessed before it was taught;<br>• skipped (an earlier unit not taught while a later one was).<br>A count per state. The office and coordinator see every class, a teacher their own. "Not set up" without a map. | None (reads `syllabus_units`, `syllabus_progress`, `exam_papers`). | For a class and subject with a map, every unit appears once in the right state with its dates. Teaching it, or adding it to a paper, moves it. A class with no map says "not set up", never zero. A teacher sees only their classes. |
| **9e. Learning Genome v1** (C217) | For one child:<br>• per subject: their own percent in each published exam, and homework done;<br>• per chapter: "needs help" and "understood" replies to its taught units;<br>• strengths and gaps by settings, comparing the child only with themselves.<br>Each number says where it comes from. Staff only: the office, the coordinator, the child's own teachers. | None, or a settings entry only. | For a child with marks, replies and homework, every number equals its source rows. No other child's data appears. A teacher of another class is refused by the app and the database. No model is called. |
| **9f. Early Warning v2** (C218) | The marks signal, rule version 2: in a published exam the child's percent fell by at least the setting's points against their own previous published exam, or is below the pass mark in at least the setting's number of subjects. The evidence names the exams and percents. The nightly check and "Check now" use it. | `early_warning_flags.reasons` admits `marks`. | After a publish, the next check opens or updates a flag with the marks reason and its evidence for a child whose own marks fell past the line. A child above it is not flagged. Fees are never a signal. Nothing reaches a parent. |

## 5. Decisions the plan makes, unless told otherwise

- **Presets, as each board's document says (read 2026-10-14):**
  - **CBSE**, from *Secondary School Curriculum 2025–26, Classes IX–X*,
    section 4 (https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Curriculum_Sec_2025-26.pdf):
    - **Components:** an 80-mark annual examination and 20 marks of internal
      assessment (periodic assessment 5, multiple assessment 5, portfolio 5,
      subject enrichment 5).
    - **Pass mark:** "33 percent in total in each of these components", a
      condition the document says was relaxed by a 2018 notification. That
      notification could not be read, so the per-component pass mark is
      left for the school to set.
    - **Class IX grading scale**, which the document says the school awards:
      91–100 `A1`, 81–90 `A2`, 71–80 `B1`, 61–70 `B2`, 51–60 `C1`, 45–50
      `C2`, 33–40 `D`. The table is printed this way in both the 2024–25 and
      2025–26 editions: marks 41 to 44 and below 33 are in no band. The
      preset copies the table as printed and the builder shows the gap; the
      school closes it.
    - **Class X** grades are positional (octiles of all the Board's passed
      candidates). A school cannot compute them, and they rank children, so
      the preset does not offer them.
  - **CISCE**, from *ICSE Regulations, Year 2028*
    (https://cisce.org/wp-content/uploads/2026/01/1.-Regulations.pdf) and
    *ISC Regulations, Year 2028*
    (https://cisce.org/wp-content/uploads/2026/01/1.-Regulations-1.pdf):
    - **ICSE:** pass mark 33 percent a subject; grades 1 to 9, 1 the highest.
      1 and 2 are "very good", 3 to 5 a pass with credit, 6 and 7 a pass,
      8 and 9 a failure.
    - **ISC:** pass mark 35 percent; 1 to 6 a pass with credit (1 and 2 "very
      good"), 7 and 8 a pass, 9 a failure.
    - SUPW and Community Service are graded A to E (A to D a pass).
    - The Regulations give no mark range for the grades, so the preset has
      none: the school enters them, or shows marks only.
  - **State boards:** none until a school from that board signs; Control
    then adds its preset from the board's official circular.
- **Marks** are per paper, to one decimal place, and never more than its
  maximum. Absent and exempt are not marks and are left out of percents.
  Grace marks are not built.
- **Who enters:** the paper's subject teacher (`teacher_subjects`), the
  class teacher, the office or the coordinator. A paper is "entered" when
  every child on the roll has a mark, absent or exempt.
- **Most Improved** is the child's own most improved subject. A child with
  no earlier published exam has no Personal Best or Most Improved line, and
  the card says it is their first.
- **Report cards** are PDFs from `src/lib/pdf`: one template whose columns
  and sections follow the scheme's layout. They are not sent by WhatsApp.
- **Curriculum gap states** are computed when the screen is read, not
  stored. "Skipped" means a unit before the latest taught unit (by its place
  in the map) that was never taught.
- **The Learning Genome** is computed when it is read; nothing is stored.
  Thresholds are settings of the module.
- **Early Warning v2** only adds a reason. The thresholds are settings, and
  the rule version on each flag says which rules made it.

## 6. What needs Noor

Nothing blocks P6. When a school from a state board signs, that board's
official circular with its grade table is entered in Control by NetCyberAI
staff, not by Noor.

## 7. Limits of what I can verify

- Whether the presets and thresholds suit a real school is unknown until a
  school uses them; they are settings for that reason.
- PDF output is checked by its text and by a picture in the harness, not by
  a printer.
- Hindi wording is unreviewed by a Hindi reader.

## 8. How the work is split (C198, "Parallel agents")

- **9a**, then **9b**: every other slice reads their tables.
- Then **9c, 9d and 9e** are built in parallel, one agent each: separate
  modules, screens and files.
- **9f** follows the P5 close-out's nightly check and 9b.
- The PR order is: the P5 close-out (C210), pricing (C212), then 9a to 9f.
- The lead keeps the migrations serial and edits `docs/10`, `16`, `17` and
  this file. Decision Log numbers C211 and C213 to C218 are reserved for
  this plan; C212 is the pricing slice.
- One full `ci_local.sh` on the top of the stack.
