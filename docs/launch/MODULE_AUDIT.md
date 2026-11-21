# Module audit for the first pilot (supervisor, 21 Nov 2026, C534)

**Written by:** the supervisor. **For:** Noor and the build lead. **Delivers:** one verdict per module, from evidence
in the repository, not from memory. **How:** the registry and site status (`src/content/module-status.ts`), whether a
page and API exist, harness screens, tests, and the end-to-end school day (`scripts/pilot/school_day.mjs`, latest output
in `docs/launch/school_day_last_run*.txt`).

Verdicts: **READY** (proven end to end by the school day), **WORKS-UNCHECKED** (page, API and tests exist; not part of
the school day), **PARTIAL** (works, with a named piece missing), **NOT BUILT** (spec only; never offered).

## School app

| Module | Verdict | Evidence and what is missing |
|---|---|---|
| Setup / onboarding | READY | Control creates the school and switches modules (step 1). Logins need Supabase Auth, so the harness writes them directly; on the live site the route makes them. |
| Students (CSV import) | READY | 40 students imported (step 2). Guardians from the CSV: being fixed now (step 2 failed: the import ignored guardian columns). |
| Parents / guardians | PARTIAL | Guardians, verification and School Link work. Consent must be recorded per guardian by the school (law; never automatic). WhatsApp waits on the school's own number. |
| Staff | WORKS-UNCHECKED | Teacher invitation proven (step 3); payroll is not built. |
| Attendance | READY | Marked for 40, seen by the family (steps 4, 7). |
| Timetable | READY | Period set for Class 10-A, seen by the family (steps 3, 7). |
| Homework | READY | Set by the teacher, seen by the family (steps 4, 7). |
| Communication (notices) | READY | Teacher posts, principal approves, family sees it (steps 4, 7). |
| Exams and report cards | READY | CBSE scheme applied, marks for 40, published, seen by the family (steps 3, 4, 7). New schools now get the board's default scheme (migration 20261121100000). |
| Academics ("taught today") | PARTIAL | Live for teachers; lesson plans not built. |
| Fees | WORKS-UNCHECKED | 30 API routes, 14 tests; OFF for the pilot (no payment account yet). |
| Admissions, proxy, PTM, events, complaints, documents, compliance, reports, pulse, recovery | WORKS-UNCHECKED | Pages, APIs and tests exist; not in the pilot set. Switch off for the pilot school. |
| Early Warning, Learning Genome, Curriculum Gap, School Auditor | WORKS-UNCHECKED | Need weeks of real attendance and marks before they say anything useful. Off for the pilot's first month. |
| Teacher Copilot | WORKS-UNCHECKED | Needs a paid AI key; no test of its own. |
| Help centre, raise a ticket | WORKS-UNCHECKED | Pages and 12 tests each. |
| Payroll, Career Graph, Digital Twin, Automation OS | NOT BUILT | Spec only; never shown or offered. |

## Family app

| Feature | Verdict | Evidence |
|---|---|---|
| School Link (code, match, school feed) | READY | Steps 6, 7. |
| AI tutor (text, follow-up, maths order) | PARTIAL | Tests prove the order and the follow-up context (C531). End to end needs a real AI key; a test stand-in is being made to prove the path in the harness (steps 8 to 10). |
| Study (Classes 1 to 3, Class 10 Science and Maths) | WORKS-UNCHECKED | Content checkers pass; on Noor's phone. |
| English, Draw, Future, Parent area | WORKS-UNCHECKED | Harness screens and tests; Future content approved in one click (C530). |

## Control

| Feature | Verdict | Evidence |
|---|---|---|
| Schools, modules, logins | READY | Step 1. |
| Content approval (one click) | READY | C530. |
| AI usage ledger | PARTIAL | Records attempts; proven once a tutor answer reaches it (step 10). |
