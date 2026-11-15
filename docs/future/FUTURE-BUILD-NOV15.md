# Future tab, step 1: one-time full build (15 Nov 2026)

Government listings only (Central, Delhi, Haryana, CBSE, NCERT). Nothing was pushed, and no migration was applied to the live database. No fake listing is seeded anywhere except the throwaway screenshot database.

## What Noor does, in order
1. **Approve the migration** `supabase/migrations/20261115100000_future_listings.sql` (one file; see below).
2. **Import the 54 listings as pending** (they show to nobody): `DATABASE_URL=<the database you mean> npx tsx scripts/future/import-seed.ts`. Run twice is safe; it never overwrites a decision.
3. **Review in Control → Content → "Review the Future listings".** Approve, edit or reject each one. Start with the "Low confidence (under 0.8)" filter: 36 of the 54 are there. Approving a low-confidence listing needs a note saying what you checked. Only approved listings reach families.
4. **Switch on official sites** in the same page, section "Official sites for Apply". Sites on .gov.in, .nic.in, .ac.in, .edu.in and .res.in always work. These seven are OFF until you switch them on: bseh.org.in, nid.edu, iiseradmission.in, n-csc.in, academic.cbseit.in, registration.buniyaadhry.com, iapt.org.in. Until a site is on, the card has no Apply button.
5. **Choose prompt v18** in Control → AI for the tutor's friendly redirect.

## What was built (one commit per step)
1. **Migration**: `content.future_listings`, `future_sources`, `future_candidates`, `future_apply_domains` (7 domains, all off), a door `content.future_submit_candidate`, the daily enqueue + pg_cron entry (00:15 IST), and two widened checks so push marks and parent switches can hold the two new reminder kinds. States map DL→IN-DL, HR→IN-HR, ALL stays; pre-primary codes −2/−1/0 are kept (a Nursery child sees only pre-primary rows). `content.hub_entries` is untouched and its entries still show under the new cards.
2. **Importer** `src/lib/future/seed-import.ts` + `scripts/future/import-seed.ts`, seed copied to `data/future/`. Idempotent. One seed row had an `http://` source; it is stored as `https://` (reviewer to confirm). Hindi names of all 73 document types are written by hand (`data/future/documents_hi.json`).
3. **Control review queue**: filters, confidence badge, source sentence for every date, apply-link status, edit (including Hindi), approve, reject, domain switches; every change audited.
4. **Family Future tab** (all three sections): two-level grouping (your state, Central Government, Boards and exam bodies, Institutions, then type), colour by type from the lesson tints, status chips, "Plan ahead" row, "Your exams" for closed forms with a date still ahead, search, class and state filtering, days-left badge, verified-on date, tap-to-expand details with a tick-box documents list and prepare steps, Apply opening an official site in a new tab with the site named first. Hindi and English throughout. Status is recomputed from the dates on every read, so a closed item can never show as open.
5. **Daily expiry** (`src/lib/future/expire.ts`, job `future.expire`): moves status, archives (never deletes), keeps an item while an exam or result date is ahead, copies a yearly series forward as `expected` and `pending` (no dates, no Apply). Listings with no dates at all are not copied.
6. **Reminders** 30, 7 and 1 days before the last date, and "new for your class", through the existing web push and notifications centre; the parent can switch each off. Nothing is stored per reminder: a closed, withdrawn or unapproved listing stops sending at once, and a deadline moved later starts the steps again. Fixed words, no names.
7. **Hooks for the weekly agent only**: the registry table, the candidates table with a field-by-field diff, the single submit door, `src/lib/future/agent-hooks.ts` (diff helper and an entry point that refuses to run). No scraper.
8. **Tutor**: prompt **v18** (v17 with the bare refuse line replaced by a redirect that carries the nearest school topic and two questions). The answer shows one friendly line and two tappable questions. The text is parsed safely (no markup, links or long text). The plain refusal line is also rewritten kindly, English and Hindi. The built prompt is tested for every class.

## Decisions I made that you may want to change
- **Apply and "Ask a parent"**: Apply opens the official site for a child too, with a line "Ask a parent to help with the form".
- **A copied-forward listing is pending**, so you review it before any family sees "Expected".
- **Family boundary**: the shared listing code lives under `src/lib/family/future-*.ts`; the checker's allowlist names the three staff files that use it. Two RLS allowlist entries were added.

## Results
- Tests added: 73 (future tab 20, review queue and agent hooks 8, expiry 6, reminders 2 plus 5 push cases, tutor v18 and redirect 8 plus 2 resolver cases). Class-by-class test: for each of Nursery, LKG, UKG and Classes 1 to 12, in Delhi, Haryana and Karnataka, and for each of the three hubs, the family query returns exactly the approved listings for that class and state, and exactly the plan-ahead rows; closed ones are hidden; Delhi and Haryana rows never reach Karnataka; Hindi renders for every class.
- What each child sees on 15 Nov 2026 (apply now / plan ahead), 6 of 54 listings hidden as over:

| Class | Delhi | Haryana | Karnataka |
|---|---|---|---|
| Nursery | 4 / 0 | 2 / 0 | 2 / 0 |
| LKG | 4 / 0 | 2 / 0 | 2 / 0 |
| UKG | 5 / 0 | 3 / 0 | 3 / 0 |
| Class 1 | 7 / 0 | 7 / 0 | 6 / 0 |
| Class 2 | 7 / 0 | 7 / 0 | 6 / 0 |
| Class 3 | 7 / 1 | 7 / 1 | 6 / 1 |
| Class 4 | 7 / 4 | 7 / 3 | 6 / 3 |
| Class 5 | 10 / 2 | 9 / 2 | 8 / 2 |
| Class 6 | 8 / 2 | 8 / 2 | 7 / 2 |
| Class 7 | 9 / 9 | 9 / 8 | 8 / 6 |
| Class 8 | 15 / 4 | 14 / 4 | 11 / 4 |
| Class 9 | 12 / 8 | 12 / 9 | 11 / 6 |
| Class 10 | 16 / 14 | 16 / 15 | 13 / 14 |
| Class 11 | 13 / 15 | 14 / 17 | 12 / 15 |
| Class 12 | 27 / 0 | 28 / 1 | 26 / 0 |

- Screenshots (Class 1, 8, 10, 12; English and Hindi; the three sections; 390 px): `docs/screenshots/future/`. They use illustrative test listings in the throwaway harness database, never the real seed.
- Full `ci_local.sh` (once): all 23 checker, type-check and secret steps passed; unit tests 5,872 passed, 3 failed. Two were mine and are fixed and re-run green (the audit-privacy test: reviewer notes are no longer written to the audit log, only whether one exists; the picked-words test for the new Control page). The third is the old parent-report test above. `next build` is not part of `ci_local.sh` unit step order after tests, so it was not reached by that run; see below.
- Harness: 288 phone/desktop pictures of the 24 requested screens rendered with 0 problems (no sideways scroll, targets 44 px, axe, Hindi complete).

## Known gaps
- Hindi for eligibility, benefit, fee and prepare steps is not written (the seed has English only). The card says "This part is in English." until a reviewer adds Hindi in the queue. Titles and document names have Hindi.
- Dates from press or secondary sources stay low confidence; the queue shows their quotes.
- `test/family/parent-report.test.ts` has one failing test ("teacher's doubts") that fails on the untouched branch too; I did not change it.
- There is no ESLint in this repo; "lint" here means the checkers in `scripts/` and `tsc`.
- The ★ tracker of the plan was not asked for and is not built.

## Pending for step 2 (the weekly agent)
Fill `content.future_sources` (tiers 1 to 3); fetching with robots.txt and rate rules; extraction with a source sentence per date; calling `content.future_submit_candidate`; apply-link re-check (2xx after redirects, still on the allowlist, not parked) writing `apply_url_status`; the Monday review digest; re-checking from an Indian IP the sites the build box could not reach (NSP, edudel, NCERT, awards.gov.in); the other 34 states and UTs; the private-organiser allowlist.
