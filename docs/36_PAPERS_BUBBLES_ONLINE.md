# 36 — Question papers, bubble sheets, online tests and the checked paper as a PDF

**Written by** the build lead, for the supervisor and Noor. **Asked by** Noor directly (2026-10-27): the four parts of
Acadine's pictures that `docs/35` §7 left out, "built all": question papers made from what was taught, by the exam's
type and the chapters' weight, in one click or by hand, for every subject; bubble (OMR) sheets; online tests; the checked
sheet as a PDF on WhatsApp. **Status:** the plan and the build record (Decision Log C361–C367), built as PRs #335 to #339
(§8). **Binding rules:** `CLAUDE.md`, `16` §3, `17` §1a/§4/§5, `19` §5, `21`, P6's rules in `27` §3 and every rule of
`docs/35` §2, which all hold here unchanged.

## 1. What a school gets

Everything below extends P6's papers and `docs/35`'s AI marking. A paper's questions are one list: the paper maker
writes it, the AI marker, the bubble reader and the online test read it, and approval writes marks through `saveMarks`
as today. Nothing is typed twice.

1. **Question papers, in one click or by hand.**
   - **One click.** On a paper of an exam, "Make the paper"; on the exam, "Make every paper" (every class and subject at
     once, each paper its own job).
   - **What it covers is what was taught.** The class's "taught today" log (`syllabus_progress`, P2 5d) for that
     subject decides the chapters, by the exam's type (C357's list):
     - a weekly, monthly, unit or periodic test covers what was taught since the last paper of the same type;
     - a sessional or half-yearly covers what was taught this session;
     - an annual or mock covers the whole syllabus map.
     A school changes this per type. When nothing was logged as taught, the paper's own chapters (`unit_ids`) are used,
     else the whole map, and the screen says which.
   - **The chapters' weight.** By default each chapter's share of the marks follows the periods spent on it; the school
     may choose equal shares, or the teacher types the marks per chapter.
   - **The paper's shape** is the exam type's blueprint, an Exams setting: total marks, time, sections (A, B, C…), each
     with its kind of question, count, marks each and internal choice, and the mix of easy, medium and hard. Defaults
     follow the common board patterns (for example a half-yearly of 80 marks in five sections); the school edits them.
   - **Where the questions come from.** First the school's own question bank (written by its teachers, or kept from
     earlier papers), skipping questions the class had in its last papers; the rest are written by the AI for the
     chapter, topic, class and difficulty, each with its answer key and marking steps. The request carries the syllabus,
     the class level, the subject and the language; never a child's name or work.
   - **By hand.** The teacher replaces, edits, moves, adds or removes any question, picks from the bank, or writes the
     whole paper (the questions screen of `docs/35`, extended). A paper is the teacher's once they keep it: kept questions
     go to the bank, and AI-written questions never reach a printed paper unkept.
   - **Print.** The question paper as a PDF (the school's header, instructions, time, marks and sections) and its marking
     scheme for teachers, made in the browser like every PDF of the app.
2. **Bubble (OMR) sheets.**
   - For a paper's choice questions, print one bubble sheet per candidate in roll order: name, roll and exam number
     printed, and the sheet's own number pre-shaded as bubbles (no QR or other label: CLAUDE.md). Blank sheets, where
     the child shades the roll number, serve a late joiner.
   - Scan them with the same phone scanner (C230-AJ) or as a PDF. The browser finds the four corner marks, straightens the
     sheet and reads every bubble by its darkness: one clear mark is an answer; two marks or a smudge is flagged, never
     guessed.
   - Marks follow the key, and the paper's marks for a wrong answer if the school sets any (never below 0 for a part).
     They are provisional: the teacher reviews and approves as any script, and the sheet's picture is kept as long as any
     page (C230-AJ).
   - A paper may mix: choice questions on the bubble sheet, the rest in the answer book. Both are one script per child.
3. **Online tests.**
   - A paper can be sat online. The teacher sets when it opens and closes and how many minutes it lasts, and opens it.
   - A child of a linked family (School Link, a verified guardian) sees it in the Family app's child mode: start, one
     question at a time with a palette (answered, not answered, marked to review), every answer saved as it is given, a
     timer kept by the server, then submit, or the time runs out and what was saved is submitted.
   - Leaving the test screen is counted and shown to the teacher. No camera, no microphone.
   - Choice and number answers are marked by rules; written answers by the marking AI (`exams.mark`); the teacher
     reviews and approves as any script; the child and family see the result at publication, as every result.
4. **The checked paper as a PDF.**
   - "Tell parents on WhatsApp" (AM-5) makes, in the office's browser, each child's checked papers of the publication as
     one PDF: a first page with marks per paper and question, strengths, what to improve and practise, then the checked
     pages with the marks in the margin.
   - The message carries the PDF and the private link (C351). The PDF goes to Meta only for a message the send-gate
     passes, and our copy is deleted once sent (at most seven days).
   - A family can download the same PDF in the app. A child whose pictures are already deleted (the school's days) gets
     the link-only message, as today.

## 2. What stays true (the rules)

| Rule | How it holds |
|---|---|
| Every rule of `docs/35` §2 | Unchanged: approval writes marks through `saveMarks`; no rank; published means frozen; roll order |
| A paper is the teacher's | AI-written questions are drafts until the teacher keeps the paper; only kept questions print or enter the bank |
| No child's words in paper making | `exams.write_questions` carries the syllabus, class level, subject and language only; it is not a minors task, but its provider must be cleared in Control |
| Bubble and rule marks are provisional | They fill the AI's columns of `marking_marks`; a person's approval writes marks |
| A child sees only their own tests | A verified guardian's consented child, of a test of the child's own class, open now; one attempt; times from the server |
| A child's written answers go only to a cleared provider | Online written answers are a child's words: `exams.mark` and its minors check, as scripts |
| Nothing is guessed | A double mark, a smudge or an unread bubble is flagged for the teacher, never chosen |
| No hardware, no labels | Bubble sheets are printed paper read by the phone's camera; no QR, NFC or device (CLAUDE.md) |
| A PDF of a child's work is not left lying about | Made in the browser; kept on our storage only until sent (seven days at most); sent to Meta only after the send-gate; never a public link |

## 3. The decisions (Decision Log)

- **C361 — One question list for four ways of sitting.** `marking_questions` gains choice options, the correct
  answer (choice keys, or a number with its tolerance), difficulty and section; a paper names how it is sat (`written`,
  `bubble`, `online`); a script names where it came from (`scan`, `bubble`, `online`). The pipeline, review, approval,
  families and the genome read the same rows, so a new way of sitting adds no second results path.
- **C362 — Papers from what was taught.** Scope by exam type from the taught log; weight by periods taught, equal or
  typed; shape from the exam type's blueprint (an Exams setting with board-pattern defaults); one job per paper
  (`papers.make`, a long job as C353), one click for every paper of an exam. Rules only decide scope, weight and
  shape; the AI only writes questions to fill the shape.
- **C363 — The school's question bank.** Per grade and subject, by chapter and topic; teacher-written, kept from papers
  or AI-written; drafts until kept; a question used in the class's last two papers of the subject is skipped. A new AI
  task, `exams.write_questions`, no child's words, configured in Control → AI like every task.
- **C364 — Bubble sheets read in the browser by rules.** The sheet's layout is ours (four corner marks, a bubble grid,
  the sheet number pre-shaded), so reading is geometry and darkness, not AI: fast, free and exact, with flags for
  anything unclear. The teacher's device reads; the reading is provisional like any AI mark.
- **C365 — Online tests in the Family app.** Sat in child mode by a verified guardian's child; the server keeps the
  time and saves every answer; one attempt; leaving is counted; marked as scripts are. Sitting in a school lab (children
  signing in on school computers) is a new sign-in surface for children and waits for the supervisor (§7).
- **C366 — The checked paper as a PDF on WhatsApp.** A new template, `exam_result_pdf`, with a document header; the
  PDF is made in the browser at the person's Send, uploaded to Meta's media only when the send-gate passes, and our copy
  deleted when sent. The link-only `exam_result_ready` stays for a child without pictures.

## 4. Data model

One shared migration by the lead (`aq_1_shared`), then one per slice, applied by the lead one at a time to the test
project, md5 checked, renamed to the recorded version.

| Migration | Table or change | Notes |
|---|---|---|
| `aq_1_shared` | `marking_questions` + `options`, `correct`, `difficulty`, `section`, `bank_id` | Options only on an objective question |
| | `exam_papers` + `sitting` (`written`, `bubble`, `online`) | |
| | `marking_uploads` + `kind` (`scripts`, `bubble`) | |
| | `marking_sheets` + `source` (`scan`, `bubble`, `online`); `upload_id` empty only for `online`; `matched_by` + `bubble`, `online` | |
| | `marking_setups` + `wrong_marks` | Taken off per wrong choice answer; a part never below 0 |
| | `control.ai_profiles` + `exams.write_questions` | No child's words |
| `aq_2_papers` | `question_bank`, `paper_generations` | Bank per grade and subject; one running generation per paper |
| `aq_3_bubbles` | `bubble_sheets` | One printed sheet per candidate and paper, numbered by the database |
| `aq_4_online` | `online_tests`, `online_attempts`, `online_answers`; the guardian's functions | One attempt per child and test |
| `aq_5_pdf` | `result_pdfs` | Our copy of a child's PDF until it is sent |

## 5. How the work is split (C198, C230-AI: up to five agents, each on the model its task needs)

| PR | Builder | Delivers | Acceptance test |
|---|---|---|---|
| **AQ-1 Shared** | Lead | The shared migration; contracts; the rules for choice and number answers, wrong marks and the roll-up | Tests as `app_user`: options only on objective questions; a sheet without an upload only online; roll-up takes wrong marks off a part but never below 0 |
| **AQ-2 Papers** | Agent (opus: AI writing and a cross-module design) | Blueprints in Exams settings; scope and weight from the taught log; the bank; `papers.make`; "Make the paper" and "Make every paper"; editing; printing | A class with a taught log gets a paper whose chapters and marks follow the log and the blueprint; bank questions come first; a used question is skipped; nothing unkept prints |
| **AQ-3 Bubbles** | Agent (opus: reading children's sheets on a device) | Sheet layout and print; the reader in the scan worker; bubble uploads; marks by rules; review of a bubble script | Made-up sheets, photographed at angles and in poor light, read with no wrong answer: every unclear bubble flagged |
| **AQ-4 Online** | Agent (opus: children's data, a family-to-school path) | The test's times and opening; the Family app's test screen; autosave, timer, submit; marking; the teacher's view of attempts | A child of another class or family sees nothing; an answer after the deadline is refused; a second attempt is refused; a timed-out test is marked from what was saved |
| **AQ-5 PDF** | Agent (opus: messaging) | The PDF in the browser; the document header in the Meta adapter; `exam_result_pdf`; the send; the family's download | A send the gate refuses uploads nothing to Meta; a resend sends nothing twice; our copy is gone after sending |

AQ-2 to AQ-5 touch different files and run side by side on top of AQ-1. Shared files (`en.ts`, `hi.ts`, the job
handlers) take each slice's lines in its own block. Migrations, Decision Log rows and the PR order are the lead's.

## 6. What needs Noor (after the merge)

1. **The WhatsApp template** `exam_result_pdf`: approve its words in Control → Message templates and Submit to Meta, once
   Meta has the payment method (C360). Until Meta approves it, families get the link-only message.
2. Nothing else: question writing starts on the provider the marking tasks use (Workers AI, C230-AL), changeable in
   Control → AI.

## 7. Not in this wave (follow-ups, each needing a decision)

- **Online tests in a school lab:** children signing in on the school's computers with an exam number and a slip code.
  A new sign-in surface for children (the kind C230-AF reviewed), so it waits for the supervisor.
- An instant score for a practice test before publication (today every result waits for publication, C215).
- Two or more sets (A, B) of a paper with the questions in another order.
- Admit cards as PDFs (exam numbers exist since C348).

## 8. What was built (2026-10-27)

Merge in this order (each branch contains the ones before it; every PR has base `main`):

| PR | Slice | Migration on the test project |
|---|---|---|
| #335 | AQ-1 shared: options, correct answers, sections, wrong marks; sitting and source; the rules (`answers.ts`) | `aq_1_shared` 20261027125939, `aq_1_function_rights` 20261027131521 |
| #336 | AQ-2 papers: blueprints by exam type, scope and weight from the taught log, the bank, `papers.make`, "Make the paper" and "Make every paper", editing, keeping, printing | `aq_2_papers` 20261027140145 |
| #337 | AQ-4 online: the test's times and opening, the Family app's test screen, autosave, server time, submit, marking, the teacher's attempts | `aq_4_online` 20261027140926 |
| #338 | AQ-5 PDF: the checked paper as a PDF made in the browser, `exam_result_pdf` with a document header, media given to Meta only past the gate, our copy deleted once sent, the family's download | `aq_5_pdf` 20261027141053 |
| #339 | AQ-3 bubbles: the sheet layout and printing, the reader in the scan worker, bubble uploads, marks by rules, mixed papers | `aq_3_bubbles` 20261027141234 |

Each migration was read by the lead, applied to the test project one at a time, md5 matched and renamed to its recorded
version; `/api/health` stayed ok. Production is untouched (C103). The builders' own choices are C367.

**Open for the supervisor:** a monthly limit on AI-written questions (today only one making per paper at a time); a
school-lab sitting for online tests (§7); an instant score for practice tests (§7); a dedicated blueprint editor (the
settings list holds the 30 default rows); the PR sizes, above the ~1,500-line guide for database slices because each
slice was asked for as one PR.
