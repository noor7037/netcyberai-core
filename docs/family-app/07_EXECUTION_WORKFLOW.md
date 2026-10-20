# 07 — Execution workflow

## 1. Waves

**Revised 2026-10-20 (C230-I).** The learning loop is dynamic, and it depends on the shared AI platform, so a platform
wave (P-AI) now precedes it. English, careers and opportunities are full experiences, sequenced by their
dependencies.

Each wave is one stacked set of PRs, built by a lead with up to three agents (CLAUDE.md "Parallel agents"), gated and
merged by the supervisor. Decision Log rows are reserved per wave.

| Wave | Delivers | Depends on | Done when |
|---|---|---|---|
| **FA-1 Foundation** | Family accounts, consent ledger, email-code sign-in, the family session and guard; the registry with entitlement classes (`03` §2); School Link (issue, redeem, read, unlink) with C230-D's logins migrated; the PWA shell and home; Control → Family overview and flags. Also C242's leftovers. | — | A parent signs up, consents and adds two children with no school; a school's code links one child; unlinking removes school data in the same request; Control shows counts and flags. |
| **P-AI AI platform** (platform lead; can run beside FA-2) | Capability adapters and feature profiles (`03` §7); sealed credentials; routing with fallbacks; prompt versions with rollout; budgets and quotas; health; the minors and zero-retention check; Control → AI; Copilot and Parent AI moved onto it; `ai_usage` extended | FA-1 not required | A profile's provider can be switched in Control without code; a profile carrying children's words refuses a provider not marked for minors; over a cap, a clear message; Copilot works as before. |
| **FA-2 School information** | C1 Today, C3 fees and receipts (11b), C4 calendar (11c), C5 reports, notices and events (11d), C9 home help, C10 Daily Pulse with in-app replies into the existing follow-up queue | FA-1 | docs/31's acceptance for 11b–11d for linked children only; a Pulse reply lands in the teacher's queue exactly as a WhatsApp reply does. |
| **FA-3 Learning loop I** | Syllabus model: the catalog (CBSE 6–10), the school's syllabus through School Link, family upload of index pages with extraction and confirmation (`03` §9); entitlements (one free subject); the Concept Resolver for topic, search and text inputs with blocks: explanation, worked example, math, diagram, graph, timeline, check, practice, English moment, sources; the verification layer; the cache and promotion to reviewed; topic progress; Tonight's practice; Control's review queue | FA-1, P-AI | A child picks or uploads a syllabus and asks about a topic in their free subject; every block renders from data; numeric steps are recomputed; progress moves only on checked answers; another subject asks for Plus. |
| **FA-4 Learning loop II** | Photo and screenshot input (vision, OCR fallback, PII and Aadhaar screen, 24-hour storage); geometry, number line, fraction model and outline-map blocks; vetted simulation embeds once licensed (L7); the misconception-to-mastery loop; the revision plan; the video finder (`03` §8); the weekly summary; data-saver mode and offline practice | FA-3 | A photo of a question returns a response or a clear refusal; a wrong answer brings a targeted explanation and a revisit; a video shows only when suitable, with the honest note; the data-saver mode loads text only. |
| **FA-5 Pathways and the rest of school** | Opportunities and the readiness tracker (sources, weekly fetch, extraction, verification, reminders, archiving); the career pathway explorer v1 (vetted graph, core occupations); the Learning Vault with verification links; the exam-day kit and past-paper practice; PTM booking (11e), homework hand-in (11f), study material (11g) | FA-1, P-AI (FA-3 for past papers) | Only verified opportunities show, "likely eligible" with conditions, and stale ones are hidden; every career step shown has a source; docs/31's acceptance for 11e–11g. |
| **FA-6 English and Plus** | The 90-day English programme v1 (core track, CEFR-aligned items, day 0/45/90 assessments, weekly checkpoints, mastery rule); Family Plus and subscriptions after the price and gateway decisions; school-sponsored Plus | FA-3, P-AI | Progress shows assessed results, not completed lessons; a subscription unlocks every subject; a sponsoring school's families get Plus without paying. |
| **FA-7 Launch** | Launch audit (accessibility, performance, security, DPDP checklist); YouTube API compliance (L6); Google Play listing if decided | All above | `02` §15 met and gates L1–L7 closed. |
| After launch, by evidence | English practice partner pilot (voice, `02` §6.3); domain English packs; board answer-writing feedback; exam transparency (answer-sheet rubrics and re-evaluation requests, an ERP P6 extension first; see below); admission dossier export; child-started study timer; the parent's voice question in Hindi ("what did my child learn this week?"); more boards, states and languages; recruitment notices; student device pairing | — | One wave at a time, each with its own gates. |

**Exam transparency:**
- It needs the school side first: optional scanned scripts per exam, rubric display, and a re-evaluation request flow
  (requested → acknowledged → under review → upheld or revised, with both versions kept, a deadline set by the school,
  a reviewer who is not the first evaluator, and an audit row at each step).
- It covers school-internal exams only; board re-evaluation is the board's own process, which we link to.
- It starts only when a pilot school wants it.

## 2. The loop for every wave

1. **Supervisor** writes the wave prompt from `08` (template W): scope, files, acceptance, models, gates. The
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

## 3. Gates inside a wave

| Gate | Pass condition |
|---|---|
| Before a slice | Its acceptance test is written; its files do not collide with another agent's |
| Before a migration | Applied to the test database first; RLS forced; no foreign key into `public.*` from family or content schemas |
| Before a PR | `tsc`, the slice's tests, the checkers it touches (including `check_family_boundary.py`), pictures at 360/390/1440; for AI paths, the pre-processor, block-safety and minors tests |
| Before merge | The full gate on the top, both databases equal, GitHub `verify` green, no model name or co-author line anywhere |
| After merge | `/api/health` ok, no new runtime errors, the founder's test list in the report |

## 4. Content operations (from FA-3)

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
- Migrations only add; a destructive change ships in two steps (stop using, then drop in a later wave).
- Each family module has its flag in Control: a module misbehaving in production is switched off there first, then
  fixed.

## 6. Incidents

| Signal | First action |
|---|---|
| Health not ok, or runtime errors on `/api/family/**` | Switch the module's flag off in Control; read the logs; fix in a single-slice PR |
| A family reports another child's data | Switch the family app off in Control; preserve logs; root-cause RLS; tell the founder at once (DPDP breach duty) |
| AI cap reached | The message is already shown; review usage by kind in Control before raising the cap |
| Wrong content reported | The row is withdrawn automatically; a reviewer fixes and republishes |
