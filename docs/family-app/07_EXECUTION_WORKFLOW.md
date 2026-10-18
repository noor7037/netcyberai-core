# 07 — Execution workflow

## 1. Waves

Each wave is one stacked set of PRs, built by a lead with up to three agents (CLAUDE.md "Parallel agents"), gated and
merged by the supervisor. Decision Log rows are reserved per wave.

| Wave | Delivers | Done when |
|---|---|---|
| **FA-1 Foundation** | Family accounts, consent ledger, email-code sign-in, the family session and guard; the module registry; School Link (issue, redeem, read, unlink) with C230-D's logins migrated; the PWA shell and home from the registry; Control → Family overview and flags. Also C242's leftovers (sessions edit, retired subjects, APAAR yes/no). | A parent signs up, consents and adds two children with no school. A school's code links one child; unlinking removes school data in the same request. Control shows counts and flags. |
| **FA-2 School modules** | C1 Today at school, C3 fees and receipts (11b), C4 attendance calendar (11c), C5 report cards, notices and events (11d), C9 how to help at home | docs/31's acceptance for 11b–11d, for linked children only; a standalone child sees none of it. |
| **FA-3 Study core I** | `content` schema and the CBSE/NCERT catalog for classes 6–10; Control's content review queue; reviewed explainers (S3); syllabus (S2); revision plan (S5); daily practice (S4, within gate L2's limits); C2 Tonight's practice | A child picks subjects, gets a plan to a date and a daily set from published banks only; a linked child gets practice on today's taught topics. |
| **FA-4 Study core II** | Doubt help with the pre-processor and caps (S6); weekly summary by email and in the app (S7); Learning Vault (S8); exam-day kit (S9) | `02` §8 items 3, 4 and 8 for these screens; the pre-processor test passes. |
| **FA-5 Opportunities and the rest of the school** | Scholarships and exams with the weekly candidate job, Control's review queue and the nightly archive (S10); PTM booking (11e), homework hand-in (11f), study material (11g) | Only approved opportunities show, expired ones archive themselves; docs/31's acceptance for 11e–11g. |
| **FA-6 Launch** | Plus and subscriptions (after the founder's price and gateway decisions); Google Play listing (if decided); a launch audit of accessibility, performance and security | `02` §8 complete and gates L1–L5 closed. |
| After launch | Student device pairing, photo scan of syllabus and homework, voice answers, more boards, states and Hindi-medium content | By evidence from use, one wave at a time. |

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
| Before a PR | `tsc`, the slice's tests, the checkers it touches (including `check_family_boundary.py`), pictures at 360/390/1440 |
| Before merge | The full gate on the top, both databases equal, GitHub `verify` green, no model name or co-author line anywhere |
| After merge | `/api/health` ok, no new runtime errors, the founder's test list in the report |

## 4. Content operations (weekly, from FA-3)

1. A job drafts explainers and question banks for catalog topics that have none, through the AI interface (no child
   data), into Control's queue as `draft`.
2. A reviewer opens each draft beside the official chapter link, corrects it, and marks it `reviewed`; a second
   reviewer or the founder publishes it.
3. "Report a mistake" items return the row to `draft` with the report attached; the family sees the row withdrawn until
   it is fixed.
4. The opportunities job (FA-5) scans official sources weekly into candidates; nothing is shown before approval;
   expired items archive themselves nightly.

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
