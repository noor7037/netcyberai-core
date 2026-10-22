# 07 — Execution workflow

## 1. Milestones

**Revised 2026-10-20 (C230-L).** The waves of C230-I are regrouped into seven milestones, M1–M7. The learning loop
now comes before school information: it is the founder's core intent and works for every family, while school
information needs pilot schools on real data. School Link stays early (M3) because schools are the free distribution
channel. Each feature's verdict and milestone is in `11`; Control and the content library are in `10`.

Each milestone is one stacked set of PRs, built by the lead with up to three agents (CLAUDE.md "Parallel agents"),
gated and merged by the supervisor. Decision Log rows are reserved per milestone. The lead stops after each
milestone's stack and reports before the next starts.

| Milestone | Delivers (feature ids from `11`) | Was | Depends on | Done when |
|---|---|---|---|---|
| **PA Prototype audit** | Done: `prototype-audit/AUDIT.md` (#197). Its §2–§4 failures become checks in the milestone gates; no prototype code or data is used (`11`) | PA | — | Merged |
| **M1 The signature slice** | Family accounts with email-code sign-in, the family session and guard, the consent ledger (`study_core`); the parent PIN guarding the parent area (docs/34 §9.1, C230-N); add a child in under 60 seconds (first name, class 6–10, CBSE, language, explanation style, state); child switcher (R10); settings and privacy (P2); the shell with the five tabs, each shown only when its first module is live; the registry with entitlement classes and one free subject per child. The AI platform, thin: the text adapter, sealed credentials, the `family.resolver` profile, the minors check, the pre-processor, caps and Control → AI. The content library, thin: the catalog schema, CSV import, two-person review and publish, staff preview, with CBSE 2026-27 Maths and Science for classes 6–10 drafted from the official curriculum and approved by a reviewer. Understand for chapter, topic and typed questions (L1 text, L2 diagram, E1), checks with a hint first and practice (L4 core), progress only on checked answers, and the parent's calm card. Control → Apps v1 and Control → Family counts (`10` §9). The Android native shell (Capacitor) showing the live Family app; an internal test build once the Play account exists (docs/34 §8) | FA-1 thin, P-AI thin, FA-3 thin | — | The founder, on his own phone, in Hindi: signs up, adds a child, picks a Science topic, gets a streamed response, answers a check wrongly, gets a different explanation, and sees the progress the next day; Control switches the module off and on, and switches the AI provider, without code; every §3 gate passes, and the quality evaluation (§3) records its pass rate in English, Hindi and Hinglish |
| **M2 The daily habit** | Photo and screenshot input and the homework helper (L1 photo, L3); interactive diagrams and simulations (L2); the full mastery loop (L4); the adaptive plan (L5); worksheets (L7); the video finder (L8); offline and data-saver packs (L9); voice input with `voice_practice` consent; the learning-first routine (R6 step 1); the family reward jar (R7); the weekly summary and talk question (R9). Platform: catalog import from PDF, topic-pack review queues, Control → Apps health, usage and alerts; Copilot and Parent AI moved onto the AI platform | FA-4, rest of P-AI | M1 | A photo of a question returns hints or a clear refusal; a wrong answer brings a targeted explanation and a revisit; a video shows only when suitable, with the honest note; the data-saver loads text only; Copilot works as before |
| **M2b Focus Lock** (C230-N) | The native lock in the Android app (docs/34 §9): parent PIN rules, apps and lock times chosen by the parent, calls always open, the block screen listing pending study, unlock when the server confirms today's plan is complete, the parent session that re-locks by itself, tamper alerts, per-brand set-up steps; a child's own phone linked by a one-time code; Play's monitoring and permission declarations | — | M2 | On the founder's test phones of at least the brands pilot families use: a locked app is blocked with the pending list; completing the plan opens it; calls always work; the parent PIN opens a session that re-locks; 5 wrong PINs bring a wait; revoking a permission or force-stopping the app alerts the parent; nothing about app use leaves the phone (a test on the outgoing requests) |
| **D1 Design pass** (C230-P; part 1 built before M2, C230-Q) | The Family app raised to the mockups' bar (`mockups/`, `09`): the home as in the overview board (greeting band and child switcher, the ask box with type, photo and voice, today's plan, subject tiles in subject colours, tonight's talk question, the week's progress); one colour per subject across chips, edges and headers, AA-checked; a bundled open-licence picture set in place of device emoji, so every phone shows the same pictures, plus simple SVG scenes for English lessons; motion from transforms and opacity only (press, lift, progress fill, a celebration only for mastery), all off under reduced motion; every empty state designed | — | M2 | Each screen's PR shows it beside its mockup; no screen is a blank page; Lighthouse and the 200 KB budget still pass; the founder signs off on his own phone |
| **M3 The school connected** | School Link (S1) with C230-D's logins migrated; school information (S2); Tonight's practice (L10); PTM → 14-day plan with teacher follow-up (R5); the Daily Pulse in the app (R9). Schools adopt catalog versions in Setup, and the Teacher app's syllabus map points at catalog topics (`10` §4.3) | FA-1 (Link), FA-2, part of FA-5 | M1 | A school's code links one child; unlinking removes school data in the same request; docs/31's acceptance for 11b–11g for linked children only; a Pulse reply lands in the teacher's queue exactly as a WhatsApp reply does; a school's adopted map and a standalone family reach the same topic pack |
| **M4 The future** | Exam runway (F1), scholarships and readiness (F2), career compass (F3), pathways (F4), Board 30-day plan (L6), exam-day kit and past papers (L11) | FA-5 | M1, M2 (the plan engine) | Only verified items show, "likely eligible" with conditions, and stale ones hide; every career step has a source; every mock item is reviewed and answer-checked; the counsellor's pilot review is recorded |
| **M5 The lifetime record** | Vault (R1), health record (R2), admission dossier (R3) | Vault from FA-5 | M1 | "Verified by school" only with a `/verify` link; health data never reaches AI or a school; a dossier link expires and can be revoked |
| **M6 English** | The 90-day programme (E2); the duet (E3) after its accuracy gate | FA-6 (English) | M1, M2 (voice) | Progress shows assessed results, not completed lessons; no speech score is shown before the Indian-accent measurement |
| **M7 Plus and launch** | Family Plus and packs (P1) after the price and gateway decisions; school-sponsored Plus; Control → Integrations for every service; the launch audit (accessibility, performance, security, DPDP); video API compliance; the Google Play production listing (decided, C230-M; docs/34 §8) | FA-6 (Plus), FA-7 | All above | `02` §15 met and gates L1–L7 closed |
| After launch, by evidence | E4 practice partner pilot, E5, L12, S3, R4, the R7 sponsor pool, R8 exchange pilot, the child-started study timer, the parent's voice question in Hindi, more boards, states and languages, recruitment notices | — | — | One at a time, each with its own gates |

**Exam transparency:**
- It needs the school side first: optional scanned scripts per exam, rubric display, and a re-evaluation request flow
  (requested → acknowledged → under review → upheld or revised, with both versions kept, a deadline set by the school,
  a reviewer who is not the first evaluator, and an audit row at each step).
- It covers school-internal exams only; board re-evaluation is the board's own process, which we link to.
- It starts only when a pilot school wants it.

## 2. The loop for every milestone

1. **Supervisor** writes the milestone prompt from `08` (template W): scope, files, acceptance, models, gates. The
   founder pastes it into the build session.
2. **Lead** reserves Decision Log rows, writes the shared parts first (migrations, registry, contracts), then briefs
   agents with template S, at most three at a time, never two on the same table, route or shared component.
3. **Agents** build their slice and iterate on their own tests and `tsc`; the lead reviews every diff.
4. **Lead** applies migrations in PR order (the test database, checked, then production, with md5 and a policy
   read-back on both), takes harness pictures, runs the reviews `CLAUDE.md` sets, and opens the stack, every PR on
   base `main`.
5. **Supervisor**:
   - runs the full `ci_local.sh` on the top;
   - compares both databases' fingerprints;
   - reads the risky diffs;
   - answers open decisions in a Decision Log row;
   - merges in order;
   - checks production health and runtime errors.
6. **Founder** tests what the report asks him to, and closes the gates only he can.

## 3. Gates inside a milestone

| Gate | Pass condition |
|---|---|
| Before a slice | Its acceptance test is written; its files do not collide with another agent's |
| Before a migration | Applied to the test database first; RLS forced; no foreign key into `public.*` from family or content schemas |
| Before a PR | `tsc`, the slice's tests, the checkers it touches (including `check_family_boundary.py`), pictures at 360/390/1440; for AI paths, the pre-processor, block-safety and minors tests |
| Before merge | The full gate on the top, both databases equal, GitHub `verify` green, no model name or co-author line anywhere |
| After merge | `/api/health` ok, no new runtime errors, the founder's test list in the report |
| Before a milestone is done | Harness pictures of every family screen at 360, 390 and 1440 px, in English and Hindi, reduced motion on and off, compared with the mockups' intent; scripts that fail the run: axe (no serious or critical issue), no sideways scroll, Hindi completeness, nothing moves under reduced motion, Lighthouse mobile budgets (`09` §4); quality evaluations with recorded pass rates: AI responses on 40 topics per language on the reviewer rubric (correct, class level, hint first, apt example, natural Hindi, numbers check), every mock item reviewed and answer-checked, speech feedback measured on Indian-accented samples before any score shows, the career compass reviewed by a counsellor. Nothing is claimed beyond the measured rate |

## 4. Content operations (from M1; the library is in `10` §4)

| Stream | Cadence | Work | Who |
|---|---|---|---|
| Promoted responses | Weekly | Control ranks unreviewed resolver responses by use and reports; a reviewer checks each beside the official chapter, edits, approves | Subject reviewers |
| Reported mistakes | Within 2 school days | The response is withdrawn on report; fixed and re-approved | Subject reviewers |
| Catalog | Each academic year | Import or update the board's official curriculum; confirm family-uploaded structures proposed for the catalog | A curriculum reviewer |
| Video picks | Weekly | Pin or reject candidates for high-use topics; refresh data within the provider's rules | Subject reviewers |
| Opportunities | Weekly per source, plus on change | Verify drafted fields against the official notice; publish; archive. About 15–60 minutes a source a week, depending on how often it changes | An opportunities reviewer |
| Career pathways | Each year per pathway, and on regulator notices | Recheck prerequisites and restrictions against official sources | A careers reviewer |
| English programme | Each term | Review items and the rubric; calibrate assessments against a sample of human-scored answers | An English reviewer |

Coverage grows only as fast as reviewers can keep it true: a source or a pathway without a reviewer is not shown.

## 5. Release and rollback

- Every merge to `main` deploys; Vercel can roll back to the previous production deployment in one step.
- Migrations only add; a destructive change ships in two steps (stop using, then drop in a later milestone).
- Each family module has its flag in Control: a module misbehaving in production is switched off there first, then
  fixed.

## 6. Incidents

| Signal | First action |
|---|---|
| Health not ok, or runtime errors on `/api/family/**` | Switch the module's flag off in Control; read the logs; fix in a single-slice PR |
| A family reports another child's data | Switch the family app off in Control; preserve logs; root-cause RLS; tell the founder at once (DPDP breach duty) |
| AI cap reached | The message is already shown; review usage by kind in Control before raising the cap |
| Wrong content reported | The row is withdrawn automatically; a reviewer fixes and republishes |
