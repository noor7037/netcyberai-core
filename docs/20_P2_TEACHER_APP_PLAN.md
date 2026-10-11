# 20 — P2 plan: the Teacher app

**Status:** plan for review (Decision Log C130). No code in this PR.
**Scope:** roadmap `16` §4 phase P2 and catalog `17` rows 7 (Academics),
8 (Attendance), 9 (Timetable, view), 11 (Homework), 12 (Homework Recovery),
14 (Daily Pulse, compose) and 27 (Teacher Copilot).
**Done when** (`16` §4): a teacher runs a full school day on a phone,
offline-tolerant.
**Builds on P1-c** (`19_EASE_AND_COLOUR_STANDARD.md`, C105): every P2 screen
renders through `ModulePage`, uses its module's icon tile and group colour,
KPI tile v2 and the §3.4 chart forms, is in English and Hindi, has its tour,
its "Show me how" guide and teaching empty states, and passes the §6 task
test (`19` §5). Teacher targets are 48 px.
**Carries from `17` §3b:** D5 (one tap "taught today" → Pulse draft and
classwork log), D6 (parent "needs help" → teacher queue), and the P7
measurement events ("taught" tap coverage, minutes to mark a class).

## 1. Where we start (checked in the code, 2026-10-07)

| Piece | Today |
|---|---|
| Attendance | Live: pick a class, everyone starts present, tap absent or late, submit; corrections need a note; past dates locked. No leave codes, no offline. |
| Taught today | Live at `/app/syllabus`: a status and a required topic per class and subject. No syllabus map, lesson plan or coverage. |
| Teacher scope | Enforced in the database: a teacher reads only their own classes' students, guardians, attendance and progress. |
| Daily Pulse | Tables and a "today" API exist; the screen is a Coming page. |
| Homework, Timetable, Recovery, Copilot | Nothing built. No tables. |
| My Day (`/app/my-day`) | A placeholder page. |
| Phone shell | The app shell has the teacher's bottom bar. It is not installable and does nothing offline (no manifest, no service worker). |

## 2. The teacher's day as screens (phone first, 360 to 390 wide)

Bottom bar: **Today · Attendance · Homework · Pulse · More**. Every screen
works with one thumb, 44 px targets, and shows a small sync line ("All saved"
or "3 waiting to send").

1. **Today** (`/app/my-day`, the teacher's home: the role home of `19` rule
   2, built from the "today cards" contract). Today's periods in order,
   from the timetable: time, class, subject. Each period has its next action
   as one button: Mark attendance → Taught today → Set homework. Above the
   list: what is still open today (attendance not marked for 5A, 2 homework
   to check, 1 recovery suggestion).
2. **Attendance.** The period's class opens directly. One button, **Present
   all**, then tap only the exceptions: absent, late, on leave. Submit. A
   change later the same day is a correction with a reason (as today).
3. **Taught today.** For the period: pick the chapter and topic from the
   class's syllabus map (or type one), mark taught / partly / not taught, add
   a line for the logbook. Shows coverage for that class and subject.
4. **Homework.** Set: title, instructions, due date, optional photo.
   **Copy to other sections** in the same step. Check: the class list with
   "everyone did it", then tap who did not. Shows completion per class.
5. **Pulse.** The day's message is drafted from what was taught and the
   homework set, in Hinglish, Hindi or English. The teacher edits and marks it
   ready. In P2 it is saved as ready; sending to parents switches on in P4
   with WhatsApp, and the screen says so.
6. **More.** My timetable (week), Homework Recovery (students who missed
   homework repeatedly, with a suggested catch-up plan to approve), Teacher
   Copilot (drafts to edit and approve), Student search (own classes), Help.

The office gets one new screen: **Timetable entry** (a grid per class, or a
CSV import), because the generator is P7 and the teacher's Today needs data.

## 3. Order of PRs

**Moved into P2 from the P1c-3b review (Decision Log C137), to be done with
5b (attendance):**

- **Class teacher and attendance.** Today a teacher may read and mark
  attendance only for classes they teach a subject in
  (`teacher_scope_attendance`). A class teacher who teaches no subject in
  their own class cannot mark its attendance, although the students policy
  already treats them as that class's own. P2 makes the two agree: the class
  teacher can mark their own class. Policy change, tested as `app_user`,
  test database first.
- **The day is India's.** The attendance API takes "today" from the UTC
  date; My Day and the dashboards use the date in India. Between midnight
  and 5:30 a.m. India time they disagree. P2 moves attendance onto the same
  India date (one shared helper), with a test at the boundary.

Each is one slice under ~1,500 lines, with screenshots at 390 and 1440, and
stops for review. Migrations go to the test database first, after the PR is
open, then production, then the catalog snapshot.

| PR | Delivers | Data model change | Acceptance test |
|---|---|---|---|
| **5a. Phone shell and offline base** | Installable app (manifest, icons, service worker that keeps the app shell); the device store and the outbox (§4) with their tests; the sync line; Today on what exists already (my classes, attendance done or not). | None. | Installs from Chrome on Android and opens to Today with the network off, showing the last data and "offline". Signing out clears the device store. Outbox tests: order kept, a retried operation is applied once, a failed one stays visible. |
| **5b. Attendance on the phone** | Present all; late and leave codes; offline marking that syncs; the same-day edit window as a school setting. **Fix:** the attendance API stamps a mark with the UTC date today, which is the wrong day between midnight and 05:30 in India; marks, "today" and the edit window use India's date (the dashboards already do, C131). **Measurement:** minutes to mark a class (first tap to submit), recorded per submission with no student detail. | `attendance.status` gains `leave`, plus an optional `leave_code`; `client_operations` (one row per operation id, so a replay is harmless). | Mark a class with the network off, reconnect: every mark is saved once. The same class marked on two devices: the first is kept, the second is shown the difference and becomes a correction with a reason. A teacher cannot mark another teacher's class (as `app_user`). A mark saved at 00:30 India time is stored under that India day (test with a fixed clock). The minutes-to-mark event is written once per submission. |
| **5c. Timetable (view) and entry** | Office: periods from settings, a grid per class, CSV import, a clash guard (a teacher or a class in two places at once is refused). Teacher: my week; Today lists real periods. | `timetable_entries` (class, weekday, period, subject, teacher), tenant RLS, teacher reads own and own classes'. | Entering a clash is refused with the two entries named. A CSV with a clash imports nothing and lists the rows. A teacher sees their week; Today shows today's periods in order. |
| **5d. Academics: syllabus map, taught today, logbook (D5)** | Syllabus map per class and subject (chapters and topics, typed or imported); **one tap "taught today"** from the map, which also writes the classwork log entry and prepares the day's Pulse draft (finished in 5f); lesson note; coverage %. **Measurement:** "taught" tap coverage: periods with a taught-today mark over periods on the timetable, per teacher and class per day. | `syllabus_units`; `syllabus_progress` gains `unit_id` and `note`. Existing rows stay valid. | Coverage is taught units over planned units, and matches a hand count in the test. Taught today works offline and syncs. A topic typed by hand still saves (no map needed). One tap creates exactly one classwork log entry and one Pulse draft seed, and a second tap for the same period changes them instead of adding more. Tap coverage for a seeded week matches a hand count. |
| **5e. Homework** | Set with photo (through `FileStorage`), due date, **copy to many sections**; check completion; completion per class. | `homework`, `homework_targets` (one per section), `homework_status` (per student), `homework_attachments`. | One homework copied to three sections makes three assignments that can be checked separately; editing the original does not change sent copies without asking. Completion marked offline syncs once. A teacher cannot set homework for a class they do not teach. |
| **5f. Daily Pulse compose (D5, D6 queue)** | The draft seeded by "taught today" (5d) plus the homework set; three languages; edit; mark ready; list of ready messages. Sending stays off until P4. **D6:** the teacher's "needs help" queue: an item per student whose parent replied "needs help", with a suggested follow-up, and the outcome recorded when the teacher acts. Parent replies arrive in P4, so in P2 the queue, its states and its screen are built and tested with entries created by the teacher or the office; the reply → queue link switches on in P4, and the outcome feeds Early Warning in P5. | `pulse_messages` gains `status` (draft, ready, sent), `language`, `created_by`; `pulse_followups` (student, reason, suggested follow-up, status: open, done, not needed; outcome note; decided by), tenant RLS, teacher sees own classes only. | A ready message contains the day's topic and homework. Nothing is sent: no job is enqueued and the screen says sending starts with WhatsApp. Only the class's teacher or the office can edit it. A follow-up moves open → done or not needed with an outcome, each move audited; a teacher cannot see another class's follow-ups (as `app_user`). |
| **5g. Homework Recovery v1** | Finds students who missed N homework in a window (both are school settings); suggests a catch-up plan; the teacher approves or dismisses; approved plans are queued for the parent message in P4. | `recovery_plans` (student, window, items, status, decided by). | With seeded homework results the list is exactly the students over the threshold. Approve and dismiss are audited. Nothing reaches a parent in P2. |
| **5h. Teacher Copilot v1** | Drafts a lesson plan, a worksheet, a Pulse message or a remark from the syllabus map; the teacher edits and approves; nothing is saved or sent without approval; usage metered per school. Behind an `AIProvider` interface. | `ai_usage` (school, user, kind, tokens, when); no prompt or draft text stored. | With the stand-in provider: a draft appears, can be edited, and is saved only on approve. A school over its monthly limit is refused with a clear message. No student name or guardian detail is in what is sent to the provider (test on the request). |

If a slice grows past the limit it is split, and the split is said in its PR.

**Every PR above also ships, per `19` §5:** the screen through `ModulePage`
(the CI check from P1c-2 fails otherwise); its module icon tile and group
colour; its "today" cards for the role home and its "+ New" actions (the
contracts from P1c-3); English and Hindi; its first-visit tour (at most 3
steps), its "Show me how" Help Center guide and empty states that teach;
plain-language errors from the catalogue (P1c-2); and the task test for its
top 5 tasks, with the tap count recorded in the PR.

**Measurement (`17` §3b P7), built with the feature that produces it:**

| Metric | Recorded in | How |
|---|---|---|
| Minutes to mark a class | 5b | One row per submission: class, date, seconds from opening the roster to submit. No student detail. |
| "Taught" tap coverage | 5d | Taught-today marks over timetable periods, per class per day (needs the timetable from 5c). |

Both go to one small `usage_events` table (school, kind, class, day, value)
with tenant RLS, written by the server. There is **no per-parent or
per-student engagement score** anywhere (`17` §3b). The weekly export is P5.

## 4. Offline tolerance

**Works without network**

- Opening the app and Today, with the last data fetched.
- Rosters of the teacher's own classes.
- Marking attendance, taught today, homework completion.
- Writing homework and Pulse text. A photo waits on the device until online.

**Needs network:** first sign-in, Copilot, search, uploads, anything in the
office screens.

**How it is kept on the device**

- A small store in the browser (IndexedDB), separate per school and person.
- It holds only what the day needs: class names, student names and roll
  numbers, today's timetable, and the outbox. No guardian phone numbers, no
  documents, no marks.
- Signing out clears it. If operations are still waiting, the app says so
  first and offers to send them.

**How it syncs**

- Every change made on the phone is an operation with its own id, the date
  it is for, and the time it was made. It goes into the outbox first, then
  to the server.
- The outbox is sent in order when the app is opened, comes back online, or
  the teacher taps "Send now". (Background sync is not available on iPhones,
  so it does not rely on it.)
- The server records each operation id. The same operation arriving twice is
  applied once.
- The sync line always tells the truth: saved, waiting (with a count), or
  failed with the reason and a retry. Nothing is dropped silently.

**Conflicts**

| Case | Rule |
|---|---|
| Attendance for a student already marked for that date | The first saved mark stays. If the late one differs, the teacher sees both and can save theirs as a correction with a reason. Never a silent overwrite. |
| Attendance sent after the day's edit window | Not applied as a mark. Offered as a correction with a reason. |
| Taught today, same class and subject, two devices | The later one wins; both are in the audit log. |
| Homework completion for the same student | The later one wins; both audited. |
| The session ended while offline | Operations stay on the device and are sent after the next sign-in by the same person. Another person signing in on that phone does not see or send them. |
| The phone's clock is wrong | The server uses its own time for "when received" and accepts the phone's date only within one day. |

## 5. The 10 daily time-killers (`17` §3a): what P2 delivers

| # | Time-killer | In P2 |
|---|---|---|
| 1 | Bulk import / attendance / marks / receipts | **Attendance:** Present all (5b). **Timetable:** CSV import (5c). Marks and receipts come with their phases. |
| 5 | Timetable clash guard | **Yes, on entry and import** (5c). The generator is P7. |
| 6 | Homework copy to many sections | **Yes** (5e). |
| 7 | Student 360 search | Built in P1; reachable from More, limited to the teacher's own classes. |
| 10 | Logbook auto-share with parents | **The logbook is recorded** (5d) and the day's message is drafted from it (5f). The automatic share to parents switches on in P4 with WhatsApp. |
| 2, 3, 4, 8, 9 | Promotion, fee reminders, report card, payment link, one notice to every channel | Not P2 (P7, P3/P4, P6, P3, P4). |

## 6. What needs Noor

Nothing for 5a to 5g.

For **5h (Copilot)** only, because they cannot exist without him:

1. An `ANTHROPIC_API_KEY`. Needed when 5h is ready to switch on, not before:
   5h is built and tested on a stand-in provider.
2. A monthly spending limit for AI per school (money is the founder's
   decision). Until it is given, Copilot stays off for every school.

## 7. Defaults I will use unless told otherwise

- Leave codes: sick, family, school activity, other. A school can edit the
  list in settings.
- Attendance edit window: the same day, until midnight India time. After
  that, a correction with a reason.
- Homework Recovery: 3 missed in the last 10 school days.
- Languages for Pulse: Hinglish first, as on the website.

## 8. Order relative to P1-c

P1-c comes first (C104–C106): P1c-1 (visual foundation, merged), P1c-2
(`ModulePage`, its CI check, the error catalogue), P1c-3 (language switch,
search, "+ New", role homes with the today-cards contract), P1c-4 (tours,
"Show me how", teaching empty states), P1c-5 (truth and hygiene). P2 starts
after them, so 5a builds the teacher's Today on the role-home contract rather
than inventing its own.

## 9. Limits of what I can verify

- I can check screens in a desktop browser at phone sizes and test the
  offline logic in code. I cannot hold a real phone: installing on Android
  and behaviour on an iPhone need a person to try once (the supervisor or a
  design-partner teacher). I will say exactly what to tap when 5a is ready.
- Preview deployments cannot sign in until the final cutover (`18` §0), so
  signed-in checks run on the development previews and the database tests,
  as in P1.

## 10. Closing check (2026-10-13, C155)

Every acceptance line of §3, against what is in the repository. "Tested"
means an automated test on the whole schema as the app's database role, or
a real-browser run in the harness, named in the slice's PR.

| Slice | Acceptance line | State |
|---|---|---|
| 5a | Outbox: order kept, a retried operation applied once, a failed one stays visible | Tested (`test/offline/outbox.test.ts`). |
| 5a | Opens with the network off, showing the last data and "offline" | Tested on a production build in a desktop browser with the server stopped (`scripts/harness/offline-prod.mjs`). **Open:** not yet installed and opened on a real Android phone. |
| 5a | Signing out clears the device store | Built; checked by a source test only. **Open:** no browser test of sign-out. |
| 5b | Mark a class offline, reconnect: every mark saved once | Tested, in the browser too. |
| 5b | Two devices: the first is kept, the second sees the difference and saves a correction with a reason | Tested. |
| 5b | A teacher cannot mark another teacher's class | Tested, and refused by the database directly. |
| 5b | A mark at 00:30 India time is stored under that India day | Tested with a fixed clock. |
| 5b | Minutes-to-mark written once per submission | Tested. |
| 5b | The same-day edit window as a school setting | **Open.** The teacher's rule is fixed (10 minutes free, then a note, the same India day). What is a setting is the office's window for past days (C146). |
| 5c | A clash is refused with the two entries named; a CSV with a clash imports nothing and lists the rows | Tested, in the browser too. |
| 5c | A teacher sees their week; Today shows today's periods in order | Tested. |
| 5d | Coverage matches a hand count; tap coverage for a seeded week matches a hand count | Tested. Tap coverage is per class and day (C149). |
| 5d | Taught today works offline and syncs; a typed topic saves with no map; one tap makes exactly one log entry and one draft, a second tap changes them | Tested, in the browser too. |
| 5e | One homework copied to three sections makes three assignments checked separately; editing the original does not change sent copies without asking | Tested. |
| 5e | Completion marked offline syncs once; a teacher cannot set homework for a class they do not teach | Tested, in the browser too. |
| 5e | Set with a photo through `FileStorage` | Tested against the in-memory store. In the deployed app a file is kept only after the database cutover (docs/18 §0); until then the homework is saved without it and the screen says so (C153). |
| 5f | A ready message contains the day's topic and homework; nothing is sent; only the class's teacher or the office can edit it | Tested, in the browser too. |
| 5f | A follow-up moves open → done or not needed with an outcome, audited; a teacher cannot see another class's | Tested. |
| 5g | The list is exactly the students over the threshold; approve and dismiss are audited; nothing reaches a parent | Tested, in the browser too. |
| 5h | With the stand-in: a draft appears, can be edited, is saved only on approve; a school over its limit is refused; nothing about a person is sent to the provider | Tested, in the browser too. |
| 5h | Drafts a remark | **Not built, by decision** (C153): AI-drafted remarks about a student wait for the consent-purpose decision (O6). |
| 5h | A real model behind `AIProvider` | **Open.** Only the stand-in exists. The real provider is added and tested when the founder supplies a key; Copilot is off for every school until then. |

**Done when** (`16` §4): "a teacher runs a full school day on a phone,
offline-tolerant." Built and tested: My Day, attendance, timetable, taught
today, homework, the day's message, the needs-help queue, recovery.
Attendance, taught today and homework completion work with no network and
sync once.

**Open items carried out of P2**

1. Install on a real Android phone, open offline, and sign out (5a). Needs a
   person with a phone; no founder dashboard task.
2. The teacher's same-day edit window as a school setting (5b).
3. Hindi on every P2 screen, and the Hindi and Hinglish Pulse templates, are
   unreviewed (founder's approval, as for P1).
4. These need the network: setting or changing homework, changing the
   syllabus map or the timetable, corrections of a saved mark, Pulse edits,
   Copilot.
5. A real AI provider, and the founder's key and monthly limit (5h).
6. Files in the deployed app wait for the cutover (docs/18 §0).
7. Not built in P2 and not on the plan's acceptance lines: reordering or
   editing a syllabus topic; deleting a homework or its file; a school's own
   leave list; tracking an approved recovery plan to completion.

