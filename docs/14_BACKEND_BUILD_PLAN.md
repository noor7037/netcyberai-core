# 14 — Backend, Integration & Automation Build Plan (Version 2 phase)

**Status:** Active. Written 2026-09-29 after the Version 1 website freeze.
**Supersedes:** the build order in `11_MASTER_REBUILD_PLAN.md` §7 and
`08_EXECUTION_BIBLE.md` Prompt K (n8n). Every other rule in 01–13 still
applies; the specs of Prompts I, J, L, M are still the specs, re-sequenced
here.
**Read with:** `00_START_HERE.md` → `01_CONSTITUTION.md` →
`10_DECISION_LOG.md` (C87 records this plan) → this file. Read other docs
only for the section a task cites. That rule is how we keep sessions cheap.

---

## 0. Ground truth (verified 2026-09-29, not carried forward; Phase 0 re-measured the rows marked **Phase 0** the same day, Decision Log C94)

| Area | State | Evidence |
|---|---|---|
| Public website (Platform 1) | **Frozen, Version 1.** Live pages, lead forms → `/api/public/leads` → `leads` table | PRs #12–#26 |
| Security core | Strong: RLS (tenant PERMISSIVE + role overlays RESTRICTIVE), single DB choke point, app-minted JWT + refresh rotation, MFA, impersonation, append-only money/consent/audit tables, 10 CI guards | Decision Log C1–C64 |
| Built backend | Students, guardians, consent ledger, DSR, CSV import, OCR scan, QR ID cards, attendance, syllabus progress, subjects, WhatsApp send-gate (mock provider), school WhatsApp config, onboarding, feature flags, invites | `docs/12_CAPABILITY_MATRIX.md` |
| Product screens | `/control`: 4 of 14 pages real, 10 stubs. `/app`: 7 of 24 real, 17 stubs. No `/t` (teacher) or `/p` (parent) route yet | `grep StubPage` |
| Schema only (no API/UI) | Fees (6 tables), exams/marks, pulse messages + replies, at-risk flags, recognition, teacher impact, certificates, templates | capability matrix |
| Database (**Phase 0**) | Supabase **Free** plan, **two** projects, both ap-south-1, PG 17.6.1.166. `netcyberai-dev` (`unodnyyfqhxrbusbkite`) still serves production (Vercel points at it): 47 tables, 2 schools (both `is_test_fixture`), 160 students (all in fixture schools), 19 users, 2 leads, 0 WhatsApp configs. `netcyberai-prod` (`rkpfkqpotmpupbjfambg`, created 2026-09-29, `get_cost` $0/month): built only from `supabase/migrations/`, 47 tables, no data, not connected to Vercel. `pg_cron` + `pg_net` available, not installed | `list_projects`, `get_cost`, row counts |
| Hosting | Vercel (Hobby: non-commercial only, D7 of doc 11) | Vercel API |
| **Defect: missing secret** (**Phase 0**: production fixed by Noor; preview open) | Code reads `SUPABASE_SERVICE_ROLE_KEY` (document storage, invite-by-email). Absent in every target at the first Phase 0 check; set for **production** at 10:13 UTC, and the current production deployment (`efa1094`, built after) carries it. **Preview and development still lack it**, so document upload and invites fail on preview deployments | Vercel env list (names only) and deployment list |
| **Defect: leftover secrets** (**Phase 0**: still open, Noor; count corrected) | **10** diagnostic variable names in **16** entries, not 4: `DIAG_TOKEN` and `PROMPT_E_DIAG_TOKEN` (production, preview, development each), `DIAG_TOKEN_DEMO_ACCESS`, `DIAG_DEMO_PASSWORD`, `DIAG_DEMO_TOTP_SECRET`, `DIAG_TOKEN_H_VERIFY`, `DIAG_TOKEN_G_VERIFY`, `DIAG_TOKEN_F`, `DIAG_TOKEN_F_VERIFY`, `DIAG_TOKEN_F_VERIFY2` (preview, branch-scoped). Every route that read them is gone. `DIAG_DEMO_PASSWORD`/`DIAG_DEMO_TOTP_SECRET` are, by their own comments, the founder demo super_admin's real password and TOTP secret | Vercel env list (names and comments, values not decrypted) |
| ~~Defect: migration drift~~ (**Phase 0**: fixed) | Replaying all 40 repo files into the empty `netcyberai-prod` applied 40/40 without an error. `scripts/catalog_snapshot.sql` then differed in 4 of 18 categories; one reconciling migration (`20260929065533`) applied to both makes all 18 identical (empty diff). Dev's migration **history** still carries its old names (a record, not rewritten); prod's history matches the repo file names 1:1. Re-run after merging `main` (`users_school_staff_read` on both): still 18/18 identical | C94; `scripts/catalog_snapshot.sql` on both projects |
| ~~Advisor warnings~~ (**Phase 0**: fixed except one) | Migration `20260929061317`: EXECUTE on the 3 SECURITY DEFINER functions now only `app_user` (credential functions) or the owner (`rls_auto_enable`); `search_path` pinned on `recompute_fee_status`, `audit_hash_chain`. Security advisor findings: dev 9 → 1 (leaked-password protection, Noor's Auth toggle), prod 0 | `has_function_privilege` before/after, `get_advisors` |
| Local CI (**Phase 0**) | `scripts/ci_local.sh` mirrors all 20 `checks.yml` steps; `scripts/check_ci_mirror.py` (a CI step) fails on drift. `.claude/skills/verify/` and a SessionStart `npm ci` hook added | `bash scripts/ci_local.sh`: 20/20 passed |

---

## 1. Decisions (made, with the reason; recorded as C87)

**B1. Product screens reuse the approved website previews.** The website's
principal dashboard, teacher app, parent app and live-sync components
(`src/components/showcase/*`) are already designed, approved and
interactive. The real `/app`, `/t` and `/p` screens are built from those same
components with a data adapter (fixture → API), not redesigned. The public
website stays frozen; product screens are not "front-end redesign", they are
wiring. This removes the single largest cost in doc 11 (U0/U3/U5 visual
work).

**B2. Two environments on the free plan, now.** Create a new Supabase project
`netcyberai-prod` by replaying the repo's migrations from zero. That both
proves the migrations rebuild the database (catching the drift above) and
separates real school data from test data. The current project becomes
`dev/staging` and keeps fixtures and demo data (doc 11's "demo project",
without a third project). Production moves to Supabase Pro (+ PITR) before
the first real school's data lands.

**B3. No n8n. Scheduling and queues live in Postgres.** A `jobs` outbox table
(`run_at`, `attempts`, `status`, `last_error`, idempotency key) + `pg_cron`
every minute → `pg_net` → HMAC-signed `POST /api/jobs/run` → idempotent
handlers → exponential backoff → `dead` status shown in
`/control/monitoring`. Reason: zero added cost, one repo, one auth boundary,
nothing that can bypass the send-gate, and it moves with Postgres. This
supersedes Prompt K. (Vercel Cron is the fallback trigger if `pg_net` ever
cannot reach the app.)

**B4. WhatsApp: Meta Cloud API directly**, through the existing
`WhatsAppProviderSPI`. Platform-default WABA first, per-school WABA later
(already modelled). A BSP (Gupshup, Interakt, AiSensy) only as a fallback if
Meta verification stalls: they add a monthly fee and per-message markup
`[VERIFY at build]`. The mock provider stays the default outside production.

**B5. Payments: Razorpay Payment Links + webhook** (UPI, cards, netbanking),
test keys first, live after KYC. The webhook follows PRD §3.3 exactly (HMAC →
hash → insert-on-conflict → process once).

**B6. Sign-in for teachers:** password + long-lived installed-PWA session
now. Parents need no login for WhatsApp. OTP later via a WhatsApp
authentication template, not SMS (SMS in India needs DLT registration: weeks
and fees).

**B7. Email: Resend** for transactional mail (invites, password reset, demo
confirmations) and as Supabase Auth's custom SMTP (the built-in sender is
rate-limited and unfit for production).

**B8. Server-side PDFs with `pdf-lib`** (MIT, no headless browser) for
receipts and report cards, stored in a private Supabase Storage bucket and
delivered by short-lived signed link through the send-gate.

**B9. Parent app (`/p`) is optional and comes after the core loop.**
WhatsApp stays the main channel (C84 positioning). It reuses `ParentApp`.

**B10. Cost and token discipline.** One phase per clean session; small PRs;
`scripts/ci_local.sh` and a project `verify` skill replace re-deriving the
check commands each time; screenshots only at phase gates; read only the doc
section a task cites.

---

## 2. Phases

Each phase ends with: CI green, real evidence (queries, requests,
screenshots where UI changed), a Decision Log entry, one PR, founder merges.
Sessions are Claude Code sessions, not calendar days.

### Phase 0 — Stabilise and de-risk (1 session) · starts now, no prerequisites

1. **Security migration:** revoke `EXECUTE` on the three SECURITY DEFINER
   functions from `public`, `anon`, `authenticated` (grant only to
   `app_backend`); fix `search_path` on `recompute_fee_status` and
   `audit_hash_chain`. Prove with `has_function_privilege` before/after.
2. **Migration truth:** create `netcyberai-prod`, replay
   `supabase/migrations/` in order, then diff the catalog (tables, columns,
   constraints, policies, functions, grants, triggers) against `dev`. Every
   difference becomes one reconciling migration in the repo. Exit: repo
   replay == live schema, proven by an empty diff.
3. **Repo tooling:** commit `scripts/ci_local.sh` (the full CI mirror) and a
   `.claude/skills/verify/SKILL.md`; add a SessionStart hook (`npm ci`) so
   each new session starts ready.
4. **Docs:** capability matrix status refresh; this plan's §0 table updated.
5. **Founder, in the dashboards (≈15 min):** delete the 10 leftover
   diagnostic env vars (16 entries, listed in §0) and change the founder demo
   super_admin's password and TOTP, since both sat in a Vercel variable; set
   `SUPABASE_SERVICE_ROLE_KEY` (production done; preview still missing); turn on leaked-password
   protection in Supabase Auth; enable branch protection on `main` (require
   the `verify` check).

**Phase 0 status (2026-09-29, C94):** steps 1–4 done; step 5 is the founder's.

### Phase 1 — Platform plumbing (1–2 sessions)

- `jobs` outbox + `pg_cron`/`pg_net` trigger + `/api/jobs/run` (B3), DLQ,
  retry policy, unit tests, a check script that forbids job handlers from
  calling a provider except through the send-gate.
- Transactional email adapter (Resend) + Supabase Auth custom SMTP.
- Error monitoring (Sentry, free tier) wired to server and client.
- API conventions: `zod` validation at every route boundary, one error shape,
  one pagination shape (documented once, reused).
- **Data adapter layer** for the showcase components: each component takes
  its data as props from a typed view model, so the same UI renders fixture
  data on the website and API data in the product (B1).

### Phase 2 — Teacher PWA `/t` (2 sessions)

- Route group `(teacher)`, installable manifest, persistent session.
- `TeacherApp` wired to real APIs: Today (periods, cover), Attendance (API
  exists) with **offline queue** and visible sync state, Syllabus "taught
  today" (API exists), Marks entry (new endpoint on existing `marks`).
- Exit: a fixture teacher on a 360px phone marks attendance offline, goes
  online, and the rows appear with audit entries.

### Phase 3 — WhatsApp live + the parent-trust loop (2–3 sessions)

- Meta Cloud API provider adapter; inbound webhook (HMAC verify, idempotent
  `webhook_events`); delivery-status updates into `communication_log`;
  template registry synced with Meta approval status.
- Absence alert goes live for a school whose `pilot_allow_outbound` is on.
- **Daily Learning Pulse:** compose from syllabus progress → scheduled 6:30 pm
  (school timezone) through `jobs` → send-gate → parent reply buttons →
  `pulse_response_log` (decide tier 1..3 vs 1..4 first; Decision Log) →
  class/topic signal to teacher and principal.
- Exit: on the pilot school, a real attendance mark produces a real WhatsApp
  on a consenting parent's phone, and a reply appears in the teacher app.

### Phase 4 — Principal workspace and Control Plane on real data (1–2 sessions)

- `/app/dashboard` from `PrincipalDashboard` with real KPIs (attendance today,
  absentees, pulse response rate, consent coverage, fees once Phase 5 lands),
  every query tenant-scoped and excluding `is_test_fixture` in cross-school
  aggregates.
- `/control`: leads inbox (convert lead → school onboarding), schools,
  monitoring (jobs, DLQ, message failures, webhooks), messaging cost,
  audit-log viewer.

### Phase 5 — Fees and payments (2–3 sessions) · Prompt I spec unchanged

- Structures → student ledger → Razorpay payment links → webhook (no
  double-credit, proven) → receipts (B8) → reminder sequence through `jobs` +
  send-gate → defaulters → reconciliation → Form 6 advisory surface (IN-HR).
- Trigger-based audit on money corrections (Prompt I text). No delete path
  for payments (grep proof).

### Phase 6 — Exams, Personal Best, at-risk (2 sessions)

- Exam setup, marks workflow (Draft → Submitted → Verified → Approved →
  Published, published immutable), Personal Best (`src/lib/recognition.ts`),
  at-risk signals (attendance + marks), report-card PDF.

### Phase 7 — Launch hardening (1–2 sessions)

- Production on Supabase Pro + PITR, restore drill timed; Vercel Pro; uptime
  monitor + alerts; per-tenant full data export (Constitution promise);
  retention jobs; security review of the whole diff since Phase 0; legal
  sign-off on `/privacy` and `/terms`; pilot-school runbook; `13_LAUNCH_CHECKLIST.md`
  rows closed one by one, each unlocking its website claim.

**Milestones.** *Pilot-capable* = Phases 0–4 (teacher marks attendance on a
phone → parent gets WhatsApp → principal sees it). *Revenue* = Phase 5.
*Launch* = Phase 7. Roughly 12–17 sessions in total.

**Demand-driven backlog (after the first pilot school, ordered by what it
asks for):** admissions pipeline, homework, timetable, staff and leave,
certificates behind fee clearance, Weekly Confidence Brief, recognition,
Teacher Impact Card, parent app `/p`, UDISE+/APAAR, wider Hindi.

---

## 3. Founder-owned long-lead actions (start now, in parallel)

External approvals are the real critical path; code is not.

| Action | Why now | Blocks |
|---|---|---|
| Meta Business verification → WhatsApp Business Account → business phone number → display-name approval | Multi-day external review `[VERIFY current timeline]` | Phase 3 |
| Draft the first templates with me (absence alert, Daily Pulse, fee reminder, receipt), then submit | Each template needs Meta approval | Phase 3, 5 |
| Razorpay account + KYC; share **test** keys | Live keys only after KYC | Phase 5 |
| Resend account + DNS records (SPF, DKIM) on the domain | Email deliverability | Phase 1 |
| Choose the pilot school; get its student list and consent forms process agreed | Real data drives the order of the backlog | Phase 3 onward |
| Lawyer review of `/privacy`, `/terms`, parent consent wording (DPDP) | Launch blocker | Phase 7 |
| Vercel Pro and Supabase Pro (+ PITR) | Commercial use; backups | before the pilot's real data |

---

## 4. Tools, platforms, connectors and skills

| Item | Purpose | Phase | Owner | How to connect |
|---|---|---|---|---|
| GitHub | Code, PRs, CI (`checks.yml`) | now | connected | Founder: branch protection on `main` |
| Vercel | Hosting, previews, env vars | now | connected (MCP) | Founder: env hygiene (Phase 0), Pro before pilot |
| Supabase | Postgres, Auth, Storage, Vault, pg_cron/pg_net | now | connected (MCP) | `netcyberai-prod` created in Phase 0 (schema only, not yet connected to Vercel); Pro before pilot |
| Meta WhatsApp Cloud API | Messages to parents | 3 | Founder: verification; Claude: adapter + webhook | Access token + phone number id into Vault via the existing config panel |
| Razorpay | Fee payments, UPI | 5 | Founder: account/KYC; Claude: integration | Test keys + webhook secret as env vars |
| Resend | Transactional email, Auth SMTP | 1 | Founder: account + DNS; Claude: adapter | API key env var; SMTP in Supabase Auth settings |
| Sentry | Error monitoring | 1 | Claude (founder creates free project) | DSN env var; Vercel integration |
| Uptime monitor (Better Stack or UptimeRobot, free tier) | Availability alerts | 7 | Founder | Point at `/api/health` (added in Phase 1) |
| Playwright + Chromium | End-to-end and visual verification | all | preinstalled | Scripts committed under `scripts/e2e/` from Phase 1 |
| npm: `zod`, `pdf-lib`, `@sentry/nextjs`, `resend` | Validation, PDFs, monitoring, email | 1, 5 | Claude | Added only in the phase that uses them |
| Claude Code skills | `run` (launch/drive the app), `code-review` + `security-review` (before every merge), `session-start-hook` (Phase 0, once), `simplify`, `fewer-permission-prompts` | all | Claude | Invoked by name; project `verify` skill added in Phase 0 |
| **Not used** | n8n (B3), Redis/queue services (B3), SMS gateways (B6), a BSP unless Meta stalls (B4), any GPL code (doc 11 D1) | — | — | — |

**Skills the work needs** (for hiring or review later): PostgreSQL with RLS
and SQL migrations; Next.js App Router + TypeScript; webhook security (HMAC,
idempotency); WhatsApp Business policy and templates; payment reconciliation;
DPDP compliance (legal, not code); PWA/offline patterns.

---

## 5. Session protocol (keeps tokens and time down)

- **One phase (or one PR inside a phase) per new session.** Long sessions
  re-send their whole history on every turn; a clean session reads only what
  it needs from the repo.
- Opening message for every session:

  > Read `docs/00_START_HERE.md` and `docs/14_BACKEND_BUILD_PLAN.md`. Execute
  > Phase N, step M only. Follow the Constitution and the Decision Log. One
  > PR. Do not subscribe to PR activity.

- Verification uses `scripts/ci_local.sh` and the `verify` skill once they
  exist (Phase 0), never a re-derived command list.
- UI changes in product screens are wiring of approved components (B1):
  screenshots at the phase gate, not per commit.

---

## 6. Exact starting point

**Phase 0, step 1 (security migration) can start in the next session, today.**
It needs nothing external. Steps 2–4 follow in the same session. Step 5 is
the founder's 15 minutes in the Vercel, Supabase and GitHub dashboards, and
can happen before or during that session. In parallel, start the Meta and
Razorpay applications (§3): they gate Phases 3 and 5.

## 7. Change log

| Date | Change |
|---|---|
| 2026-09-29 | Created after the Version 1 website freeze (Decision Log C87). |
| 2026-09-29 | Phase 0 steps 1–4 done; §0 re-measured (Decision Log C94). |
