# Brief for the build lead (supervisor, 2026-10-24)

Supervisor → build lead. Where the ecosystem stands today, what is yours next and in which order, and what waits on
the founder. Rules: CLAUDE.md (Token discipline, Parallel agents, PR activity). This replaces the "Yours next" list of
`BUILD_LEAD_BRIEF_2026-10-23.md`; its decisions and "Do not" list still hold.

## Where it stands (checked 2026-10-24)

| Part | State |
|---|---|
| School platform, P1 to P6 | Closed out |
| P7 school operations | Built, except APAAR capture (C245) and Payroll, Career Graph, Digital Twin, Automation OS (C230): all wait on the founder |
| P8 launch hardening | Last, by design (C103): the cutover, real-data rehearsal, drills, legal |
| Family M1, M2 | Done |
| Family M3, the school connected | In progress: School Link, today's attendance, attendance and fees, the school's syllabus, homework (#285, #287) |
| Family M6, English | The 90-day course is built (C274); the duet (E3) waits for its accuracy gate |
| Family M2b, M4, M5, M7 | Not started (M2b has its plan, `M2B_PLAN.md`) |
| Live site | On the test project; the server key was fixed on 2026-10-24 (invitations go through) |

## Yours now, in this order

1. **Open ends of 2026-10-23, if not done yet:** app version 2 to the founder (that brief's item 1), and the demo
   school's office user and the demo parent's link (its item 3). Say in one line which are done.
2. **ch04.t02 (en), evidence first.** Every failed run ended `finish: stop`, 2 objects, nothing rejected. The scanner
   (`jsonObjectScanner`, `src/lib/family/blocks.ts`) drops two things without a trace: an object that never closes
   (an unescaped quote leaves it "inside a string") and an object over `OBJECT_MAX_CHARS`. Add to `PrepareDetail`
   (`src/lib/family/prepare.ts`): the last 400 characters of an answer that was not kept, whether the scanner ended
   inside an unclosed object, and how many objects it dropped for size. Staff-prepared lines hold no child's words, so
   keeping the tail is allowed. Rerun the line once, then fix by the cause found. No JSON repair (C321).
3. **M3: the school's part for a linked family, one module per PR, in this order:**
   1. notices and events;
   2. the timetable;
   3. published marks and report cards: only what the school published, never a draft. A parent marks policy may
      already exist (`parent_scope_marks`), so read it first.

   Each one follows homework (#287, C329):
   - widen the table's `_no_parent` and staff read rules with `alter policy`;
   - write every staff `with check` out in full;
   - add restrictive no-update and no-delete rules for a parent;
   - reuse `guardian_student_ids()` and `guardian_class_ids()` and never duplicate them;
   - put a reader in `src/lib/school-link/` that runs inside `withGuardianContext`;
   - add a section under the matched child in `SchoolSection.tsx`;
   - write a test on the model of `test/family/school-homework.test.ts`: own child only, no cross-school reach, every
     parent write refused, withdrawn consent hides the data, staff unchanged.

   Each PR gets one security review and a QA pass.
4. **M3, the rest** (`07`, M3 row), after item 3. One short plan row in `07` first; ask the supervisor if a design choice
   is open.
   - Tonight's practice (L10).
   - The Daily Pulse in the app (R9). A parent's reply must land in the teacher's queue exactly as a WhatsApp reply does.
   - PTM → the 14-day plan (R5).
   - Push to the app.
   - Moving C230-D's school-side parent logins to family accounts.
5. **M2b, the two parts that need nothing from the founder.** Once item 3.1 is merged, run them as two sub-agents in
   separate files (`M2B_PLAN.md` "Order"):
   - M2b-1, the server;
   - M2b-3, the Android tooling and the Kotlin rule engine with JVM tests.

   M2b-4 onwards waits on the founder's Play account and phone brands.
6. **Small:** the harness entry `app-account-leave-alone` waits for `[data-my-leave-how]` inside a closed InfoTip (#288).
   Fix the entry, not the screen.

## What saves you a cycle

- **The Supabase tool hangs on any `drop`.** It waits for a destructive-statement confirmation that never comes and
  times out after 60 s. Widen with `alter policy`; add with `create`.
- **A function's EXECUTE right is checked when the query is planned, not when it runs.** A function used inside a policy
  must be executable by every role the policy applies to. Today that is `app_user`; `nca_super` bypasses row rules.
- **Migrations:** test project first, rename the file to the recorded version, and match the md5 of the stored
  statements.
- **Two PRs adding the next Decision Log row** conflict once the first merges. Put your row where it cannot collide, or
  merge `main` in before asking for the merge.
- **Never subscribe to a PR, comment on one, or schedule a check-in** without the founder's explicit yes (CLAUDE.md).

## Waits on the founder (the supervisor asks; do not ask again)

| Input | Unblocks |
|---|---|
| Family Plus monthly price; Razorpay sign-up | M7 checkout |
| Google Play developer account (organisation, D-U-N-S), the pilot phone brands and one phone of each, pilot parents' written consent | M2b-4 to M2b-8, the Play listing |
| Payroll rules; confirming the spec v0 of Career Graph, Digital Twin, Automation OS (`29`, C230) | Those four P7 modules |
| APAAR: one of the three ways in C245 | APAAR capture |
| Meta Business verification and the WhatsApp number | P4 live sending |
| Review of the 27 prepared explanations in Control → Content → Responses | Children see them |
| A native Hindi reviewer for the Family app's new words | Hindi copy sign-off |
| Lawyer (privacy, terms, DPDP children's consent); written permission for real data | P8 |
