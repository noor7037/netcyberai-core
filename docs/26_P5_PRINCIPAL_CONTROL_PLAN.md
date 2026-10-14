# 26 — P5 plan: the principal and Control on real data

**Status:** plan for review (Decision Log C199). No code in this PR.
**Scope:** roadmap `16` §4 phase P5: the principal's Dashboard on real data,
Reports, Staff (leave), Proxy Auto, School Health Auditor, Early Warning v1,
and in Control: billing plans, messaging cost, monitoring. Also the three
follow-ups from C198: a complaint about the principal also goes to the
school admin; PTM slots for subject teachers; the old `/app/class-notices`
stub is removed.
**Done when** (`16` §4): the principal's dashboard shows only real data and
every tile drills down.
**Every screen** follows `19` §5: `ModulePage`, today cards, English and
Hindi, a tour, a "Show me how" guide, teaching empty states, logo tokens, AA
contrast, 44 px targets, no invented numbers. Every flag and number follows
`21`: where it came from, the rule and its version, who decided.

## 1. Where we start (checked in the code and both databases, 2026-10-14)

| Piece | Today |
|---|---|
| Dashboard | `/app/dashboard` is real but small: one screen shared by the principal and the school admin (`OfficeDashboard.tsx`, nine queries under RLS; nothing from `src/demo-fixture`). Four tiles (attendance today, active students, teaching staff, fees overdue), four attention items, four charts. Tiles open a module's front page only; the charts and "Recent activity" open nothing. No date range, no export. Words are English only (allowlisted). "Attendance marked today" leaves out students on leave. Every other role is sent to My Day. |
| What a dashboard could read | Attendance, fees (one overdue rule in `src/lib/fees/overdue.ts`), Daily Pulse sends and answers, follow-ups, homework, message states, the month's WhatsApp spend (`schoolSpend`), complaints, PTM, events, notices, consent, tickets. Each has its tables and row level security; none has one shared function that a dashboard, a report and a check can all call. |
| Reports | A "coming" page. No report, no server-side CSV or PDF (the only CSV and PDF helpers are browser code for the website's free tools). Only the Students list is in the filter engine. |
| Staff | `/app/staff` shows accounts and invitations. **No leave table, no staff attendance, nothing that says a teacher is away.** The module is `foundation`, so no school has it switched on. A teacher's menu has no School & People group (`17` §5). |
| Who teaches what | Three places: `classes.class_teacher_id` (a user), `timetable_entries.teacher_user_id` (a user; the weekly timetable, written by the app since P2), and `teacher_subjects` (a `teachers` row; **no screen creates `teachers` rows**, only seeds do). |
| Proxy Auto | A "coming" page. The timetable is a weekly template with no dates, so a cover for one day has nowhere to live. |
| School Health Auditor | A "coming" page, `spec-v0`: one line in `17` (a weekly score with explained deductions and a fix list). No list of checks exists. |
| Early Warning | `at_risk_flags` exists (reason `attendance`, `marks` or `both`; tenant policy only; no reasons detail, evidence or rule version) and `schools.at_risk_parent_dispatch_enabled` (false). Nothing computes a flag. No marks are recorded (Exams is P6). The legal basis for telling a parent is still an open gap (`00`). |
| Control: billing plans | A stub page. Plans are a constant in code (`plans.ts`: one plan, `standard`, every module that works). No table holds a plan, a price, a paid-until date or a payment. `school_entitlements.plan` is free text; access mode (full, grace, read-only, suspended) is set by hand and changes only when read. |
| Control: messaging cost | Live since C197: rates from Meta's own page, a rolling 30-day table by school and category, each school's month and limit. No past month, no export, no "over or near the limit" list. The two halves count differently (billable when sent, over 30 days; delivered, in the calendar month) and the page does not say so. |
| Control: monitoring | Shows jobs and two onboarding lists. Not on any screen: refused webhook notices, uncertain and failed sends, messages held for "which school", a school whose nightly fee run did not happen, template approval, whether scheduled work ran. Application errors are not stored in the database. |
| C198 follow-ups | A complaint about the principal: the school admin can already read it, but the principal can note, reassign and close it, and at its due time nothing changes hands while the screen says it "was passed to the principal". PTM slots are made for class teachers only. `/app/class-notices` is still a stub page. |
| Databases | Test: 2 schools, both test schools, 160 students, 13 teachers, 8 classes (all with a class teacher), 11 `teachers` rows, 20 `teacher_subjects`, **0 timetable entries**, attendance up to 2026-09-23, 138 dues, 84 payments, 2 nightly fee runs, 0 Pulse messages, 0 homework, 0 flags, 0 complaints, 2,184 seeded log rows, 2 jobs, 17 audit rows, both schools on `standard`. Production: no school, no user, no row of school data. Both have 112 tables. Migrations recorded: test 107, production 104, files in the repo 104 (the three extra on test are early test-only rows, such as the two `mcp_ddl_capability_probe` rows). |
| CI | GitHub Actions is not starting checks (the account's free minutes, C198). The full `scripts/ci_local.sh` is the gate until it is back, and each PR says so. |

## 2. What P5 delivers

- **One set of school facts.** `src/lib/insights/`: each number the principal
  sees (attendance, fees, Pulse, homework, messages, complaints, consent and
  the rest) is computed by one function, under the reader's own row level
  security, for a date range. The dashboard, the reports and the auditor all
  call it, so they cannot disagree.
- **The principal's dashboard on real data.** Tiles, an attention list and
  charts for a chosen range (today, 7 days, 30 days), each opening the screen
  with the rows behind the number, each with "Why this?": the rule, the
  source and the time it was counted. English and Hindi. A CSV of what is on
  screen.
- **Reports.** A fixed list of reports per role (collection, dues, attendance,
  absentees, messages, Pulse and homework coverage, staff leave), each a table
  with a date range and a CSV export of exactly the rows shown, audited.
- **Staff leave.** A member of staff asks for leave on their own account
  page; the principal or school admin decides; approved leave is on the
  calendar the timetable and Proxy Auto read.
- **Proxy Auto.** For each period an absent teacher would have taught, the
  free teachers in the order of the rule; a person assigns with one tap; the
  substitute sees the cover on My Day and in their timetable.
- **School Health Auditor v1.** A list of checks over the school's own setup
  and data, by rules, each with its evidence and a link to the fix, and a
  dated record of each check-up.
- **Early Warning v1.** Flags for staff only, by rules, from attendance,
  homework and Pulse, with reasons, evidence, an action log, and nothing sent
  to a parent.
- **Control.** Plans as settings (name, price, period, modules, limits) with
  no price in code; a school's paid-until date, payments recorded by hand,
  grace then read-only on dates; messaging cost by month with an export;
  monitoring of everything that can silently stop.
- **The C198 follow-ups.**

## 3. Rules that hold everywhere in P5

1. **Only computed values.** A tile, a report cell, a score or a count is
   read from the school's own rows at the moment it is shown, or it is not
   shown. Nothing reads `src/demo-fixture`. A thing not set up says "not set
   up", never zero.
2. **One rule, one place.** A number that appears on two screens is computed
   by the same function (`src/lib/insights/`, and the existing
   `src/lib/fees/overdue.ts`, `src/lib/whatsapp/cost.ts`,
   `src/lib/recovery/recovery.ts`). No second definition.
3. **A reader's own row level security decides what they see.** No screen in
   the school app reads as the platform role. An accountant gets no learning
   data; a teacher and a coordinator get no fee data. A tile the role cannot
   read is absent, not empty.
4. **Staff data is never a ranking.** Leave, covers and "not marked" lists
   are for running the day. They never feed the Teacher Impact Card, are
   never sorted into best and worst, and are read only by the person
   themself and the office (`01`, `04` §4.4). The academic coordinator,
   who arranges cover, sees only whether a teacher is away or present on a
   day, never the kind or the reason of their leave (C210).
5. **Children are never ranked or compared, and fees are never a learning
   signal.** Early Warning uses attendance, homework and Pulse only. No fee
   figure sits beside a child's learning on any tile or report (`12`).
6. **Nothing from Early Warning reaches a parent in P5.** The legal basis is
   open (`00`). The school's switch stays off and nothing reads it yet.
7. **A person decides.** Leave, a cover, a plan change, a payment recorded,
   closing a flag: each is one person's tap, with who and when. The app
   proposes; it never assigns or sends by itself.
8. **Plans are settings.** A plan's name and price live in the database and
   are typed in Control. No rupee amount and no plan name is in code, in a
   message file or on the website because of this phase
   (`scripts/check_claims.py` stays as it is).
9. **Rules only.** The auditor and Early Warning call no language model. Each
   rule has a version, stored with what it produced.
10. **The founder's workload rule (C103)** holds: nothing here asks Noor for
    a dashboard task beyond §6.

## 4. Slices, in order

Each is one PR with tests on the whole schema as the app's database role,
a real-browser run of its screens, and one review at the level `CLAUDE.md`
sets (database, access or personal data: medium with a security read).
Migrations go to the test database, are checked, then production, in this
order, by the lead only.

| PR | Delivers | Data model change | Acceptance test |
|---|---|---|---|
| **8a. The C198 follow-ups** | A complaint about the principal cannot be noted, reassigned or closed by the principal; overdue, it becomes the school admin's, shows on the admin's My Day, and the parent is told it was passed to the school office. A meeting can include subject teachers: each teacher who teaches the class in the timetable gets a row of times. `/app/class-notices` is deleted. | `ptm_events.with_subject_teachers`. One new template version for the escalation wording. | The principal's session cannot change a complaint about the principal; at its due time it is the school admin's. A meeting with subject teachers gives each a row of times, and a parent still gets one invitation a class teacher. `/app/class-notices` answers 404. |
| **8b. Staff: leave** | "My leave" on every staff member's account page: ask (dates, kind, reason), see the answer, withdraw. On Staff, the office sees requests waiting and the leave calendar, and decides. A My Day card for requests waiting. Staff becomes partly live. | `staff_leave` (who, from, to, kind, reason, status, decided by, when, note). | A request is decided by the principal or school admin, never by the person who asked. Only that person and the office can read it (row level security). A day is "on leave" only while a request covering it is approved. |
| **8c. Proxy Auto** | For a date: every period an absent teacher would teach, with the free teachers in order (teaches that subject first, then fewest periods that day, then fewest covers that week). One tap assigns; the cover can be undone. The substitute's My Day and timetable show it. | `substitutions` (date, period, class, subject, absent teacher, substitute, who assigned, when). | Every suggested teacher is free that period, not on leave and not already covering. A period is covered once and a teacher covers one class a period (the database refuses a second). Nothing is assigned without a person's tap. |
| **8d. School facts and the principal's dashboard** | `src/lib/insights/`. The dashboard rebuilt on it: range (today, 7 days, 30 days); tiles for attendance, fees, Pulse, homework, messages and budget, complaints, consent, leave and covers; an attention list; charts with a table view; every tile and chart opens the screen filtered to its rows; "Why this?" with the rule, source and time; CSV of the screen; English and Hindi. | None. | Tile by tile on the full schema, the number equals the count of rows on the screen it opens. No file under the dashboard imports the demo fixture. A role gets only the tiles its own row level security can read. |
| **8e. Control: billing plans** | Plans in the database: name, price, period, modules, limits, in use or retired. A school's subscription: plan, paid until, payments recorded by hand with a reference. Past paid-until: grace for the days the plan sets, then read-only, on dates, each audited, with the school told on its own screen. Schools listed by plan and state. The old constant becomes the seed for a first plan. | `plans`, `school_subscriptions`, `subscription_payments`. | No plan name or price is in `src`: the list comes from the table. Applying a plan switches on exactly its modules. A school one day past paid-until is in grace, and after the plan's grace days is read-only, by the nightly check and not only when someone looks. |
| **8f. Control: messaging cost by month** | A month picker; each school's month (delivered spend, on its way, held, limit) for any past month; schools over or near their limit; CSV export; one sentence on screen that says what each figure counts. | None. | A past month's spend equals the sum of that month's delivered, billable messages (counted by hand in the test). The export has the rows on the screen. |
| **8g. Control: monitoring** | One page for what can silently stop: dead and stuck jobs, refused webhook notices, uncertain and failed sends, messages held for "which school", a school with no nightly fee run for yesterday, templates not approved, the health check. Counts and ages only. | None. | A dead job, a refused notice, an uncertain send and a missed nightly run each appear on the page from seeded rows. The page shows no parent's name, number or message words. |
| **8h. Reports** | A list of reports by role. Finance: daily collection, dues and defaulters. Office and coordinator: attendance by class and month, absentees, homework and Pulse coverage, messages by state. Office: staff leave. Each: date range, table, total, CSV of exactly those rows, audited. Reports becomes partly live. | None. | Each report's total equals the sum of its rows and the dashboard's number for the same range. An accountant gets no learning report; a coordinator no fee report. Each export writes an audit row and has the rows on screen. |
| **8i. School Health Auditor v1** | The checks of §5, by rules: each passes, needs attention (with how many and a link to the screen that fixes it), or is "not set up". "N of M checks pass", in words, never a made-up score. A dated record of each check-up, with the trend. The auditor becomes partly live. | `school_health_runs` (school, date, rule version, result of each check). | A failing check names its count and opens the fixing screen; after the data is fixed the next check-up passes it. A check with nothing set up says so. No model is called. |
| **8j. Early Warning v1** | Flags for the office and the coordinator, and for a teacher their own classes: attendance under the school's threshold over 30 days; homework not done (the Homework Recovery rule); an open "needs help" follow-up. Each flag: reasons, evidence, rule version; a next step and its outcome logged by a person; closes itself when the signals clear. Thresholds are school settings. Early Warning becomes partly live. | `at_risk_flags` gains reasons, evidence, rule version and role policies; `at_risk_actions`. | A flag stores its reasons, evidence and rule version and closes when the signal clears. A teacher reads only their own classes' flags. Whatever the school's switch or a child's consent, no message is written for a parent. |

After 8j the lead runs the full `ci_local.sh` once on the top of the stack,
brings `17` and the website's module status up to date, and writes the
report.

## 5. Decisions the plan makes, unless told otherwise

- **Who decides leave:** the principal or the school admin; never one's own
  request (the principal's is decided by the school admin, and the other way
  round). Whole days only. Kinds: casual, sick, other. No balances and no
  carry-over in v1: they belong with Payroll (P7).
- **Where a teacher asks:** on "My account", which every role has. Staff
  stays an office menu (`17` §5, as C192 did for Parents).
- **A teacher is a user.** Leave, covers and PTM slots key on the user, as
  the timetable does. "Who teaches a class" for PTM and Proxy Auto is read
  from the timetable, the one source the app itself writes.
- **Subject teachers at a meeting** are chosen per meeting (off by default).
  A parent still gets one invitation a class teacher and books that teacher
  by reply; a subject teacher's time is booked by the school on the screen.
  One message a subject teacher would multiply cost and cannot say which
  teacher a reply means.
- **A cover does not widen what a substitute can read.** For the covered
  period they see the class and subject. Attendance and "taught today" for
  that class stay with the class's own teacher and the office.
  `teacher_own_class_ids()` is not changed in P5.
- **The substitute is told in the app** (My Day and timetable), not by a
  message.
- **The dashboard is the office's** (principal and school admin). Other roles
  keep My Day; their own dashboards wait for a need.
- **Reports are a fixed list in v1.** No free report builder and no scheduled
  reports yet. No PDF: CSV opens everywhere.
- **Auditor v1 checks** (rule version 1): every class has a class teacher;
  every active student has a guardian; every guardian's number can receive
  WhatsApp; consent recorded for every active student; attendance marked on
  each of the last five working days; the timetable has no empty period on a
  working day; every class has a fee structure in force; no due is overdue by
  more than thirty days without a follow-up; no message held back in the last
  seven days; a message budget is set; no complaint is overdue; no leave
  request has waited more than two days. "N of M checks pass" counts only
  checks that apply.
- **Early Warning v1 thresholds** (school settings, rule version 1):
  attendance below 75% over the last 30 days, counted only when at least
  ten days were marked (`05` §4); homework as Homework Recovery already counts it; one open
  "did not understand" or "homework help" follow-up. Students waiting for
  consent are not flagged.
- **Billing in P5** is plans, a paid-until date and payments recorded by
  hand. Online collection of NetCyberAI's own fee, invoices, coupons and
  add-ons are not in P5: they need the prices first.
- **Grace:** the days of grace are a field of the plan. The school sees a
  plain line on its own screens in grace and when read-only.
- **A new module switched on** by a migration reaches the existing (test)
  schools, as C198 (4) accepted.

## 6. What needs Noor

One thing, in Control → Billing & Plans, whenever he is ready:

1. **The plans' names and prices in rupees** (and the period each price is
   for). Until then one plan, named by the supervisor, with no price, keeps
   every school working.

Nothing else.

## 7. Limits of what I can verify

- The test database has no timetable, no Pulse, no homework and no
  complaints, and production has no school. Every number is proven on seeded
  rows in the tests and the harness, not on a real school's month.
- Early Warning's thresholds and the auditor's checks are a first version by
  rule. Whether they flag the right children and the right gaps is known only
  with a real school's data.
- Application errors are reported outside the database (C111). Monitoring
  shows what the database knows; it cannot list a crash.
- Whether scheduled work ran is read from the rows it leaves (a nightly run
  per school), not from the scheduler itself.
- Hindi wording is unreviewed until a Hindi reader checks it.

## 8. How the work is split (C198, "Parallel agents")

- **The lead** writes this plan, builds 8a, reserves Decision Log numbers
  (C199 this plan; C200 to C209 for 8a to 8j), applies every migration in PR
  order, edits the shared docs, merges each agent's branch into the stack
  and opens the PRs in order.
- **Wave 1, three agents, each in its own worktree:** (A) 8b then 8c: the
  same tables, so one agent; (B) 8d; (C) 8e, 8f, 8g: Control only.
- **Wave 2, three agents:** 8h, 8i and 8j, each on the facts of 8d and the
  leave table of 8b.
- **Shared files** (the module registry, the message files, the guard table,
  tours, help, My Day cards, the grants test, the policy checker, the harness)
  get one marked block a slice before the agents start, so two agents never
  write the same lines.
- **One full `ci_local.sh`** on the top of the stack; reviews run in
  parallel, one per PR.
