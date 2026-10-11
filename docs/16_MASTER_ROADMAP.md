# 16 — Master Roadmap and Operating Model

**Status:** canonical from 2026-09-30 (Decision Log C99b). Supersedes the phase
order of `14_BACKEND_BUILD_PLAN.md` §2 where they differ; `14` stays the source
for Phase 0 evidence and founder long-lead actions.
**Companion:** [`17_MODULE_CATALOG.md`](17_MODULE_CATALOG.md) — every module,
its navigation group, capabilities, phase and status.

---

## 1. Founder intent (Noor, 2026-09-30)

Build the complete NetCyberAI platform first, at enterprise quality, before any
school is onboarded. Every module shown on the public website and in the product
demo is built with full capabilities. Internal dashboards and apps use the logo
colour system, are animated, graphically clear and fast, and fit phones as well
as the website does. Hosting and paid-plan decisions (stay on Vercel + Supabase
Pro, or migrate) are taken after the build and before the first school.

**Reaffirmed 2026-10-07 (C104).** The whole ecosystem is built first, at the
highest quality, because the first impression is the last. Before the first
school, the platform is tested on real data (P8 real-data rehearsal). Nothing
in `17` is removed or narrowed: every module was chosen from conversations
with schools and teachers, and a module is only dropped after the founder has
watched 2–5 real schools not use it. The founder keeps talking to schools
while we build; that feedback shapes each phase. Everything is designed for
non-technical users who must learn it in one sitting
([`19_EASE_AND_COLOUR_STANDARD.md`](19_EASE_AND_COLOUR_STANDARD.md), C105).

## 2. Operating model

| Who | Does |
|---|---|
| **Claude Code (executor)** | Builds one phase per PR: code, migrations (test DB then live DB), tests, screenshots, reviews. Never merges. |
| **Supervisor (chat)** | Reviews every PR, merges when sound, verifies production after deploy, writes the next instruction, keeps this file and `17` current. |
| **Noor (founder)** | Keys, content, legal and money decisions. Items needing Noor are always listed first. |

**Always Noor's decision:** spending money, legal, deleting data, public claims.

## 3. Standing engineering rules

1. **Enterprise standard.** Every business process is an explicit state machine;
   every transition is audited (IDs only, C41), idempotent and retry-safe; every
   side effect goes through the jobs pipeline (C97); the founder can see every stage.
2. **Portability.** Standard Postgres and SQL migrations only. Every external
   service sits behind an interface in `src/lib` (`EmailSender`, `JobQueue`,
   `WhatsAppProvider`, `PaymentProvider`, `FileStorage`, `AuthOracle`,
   `AIProvider`, `ErrorReporter`). No vendor SDK in business logic. Config only
   from env or the database. Moving host is a configuration change.
3. **Multi-tenant safety.** RLS on every tenant table, role narrowing
   RESTRICTIVE, `check_rls_policies.py` allowlist, cross-tenant tests.
4. **Module definition of done** (applies to every module in `17`):
   settings schema + filters + bulk actions via the §1a frameworks ·
   data model + RLS + tests · API with audit · UI with loading / empty / error /
   no-permission states · works at 360, 390, 768, 1024, 1440 · English + Hindi
   strings · demo-school seed data · charts have a table view · catalog row in
   `17` updated to *Live*.
5. **Proof in every PR:** unit + flow tests (PGlite for DB flows), `ci_local.sh`
   20/20, screenshots at 390 and 1440, one `/code-review` (medium) +
   `/security-review`, at most 2 subagents, push after every major step.
6. **Challenge rule.** Any executor may overrule an earlier decision, document or
   instruction when it finds something better: say so in one line, do it, log it.
7. **Two databases (C111; from the P1-a cutover).** `netcyberai-prod` holds real
   data and serves the live site; the old project is the **test database** for
   previews, fixtures and demos, and never holds real data. Migrations are
   test-first: `apply_migration` on the test database, checks there, then prod,
   then the catalog snapshot on both. Runbook: `18_PRODUCTION_CUTOVER.md`.

## 4. Phases (order fixed by the founder, 2026-09-30; Fees moved before Exams, 2026-10-05, C102)

| # | Phase | Scope (modules from `17`) | Founder inputs | Done when |
|---|---|---|---|---|
| **P1** | Platform foundations | Live site on its own production DB (cutover); observability (errors, logs, uptime); module registry + per-school entitlements; **settings, onboarding templates, custom fields, filters + saved views, bulk actions frameworks (`17` §1a)**; Student 360 search; app navigation (8 groups, `17` §2); app design system (`17` §4); i18n EN/HI; file storage; audit-log viewer; API rate limiter; Help Center; Raise Ticket | Sentry DSN; uptime alert contact | Every later module plugs into registry, nav, entitlements, i18n and design system without new plumbing |
| **P1-c** | Ease and colour foundation (C105) | `19` §4: `ModulePage` template + CI check, role "My Day" homes, Hindi/English switch in the app, global search, "+ New" quick-add, first-visit tours and "Show me how" links, plain-language error catalogue, module icon tiles (33 distinct icons), KPI tile v2, ring / gauge / gradient-area / heat-grid / donut charts, hero band; restyle of the existing screens; truth and hygiene from `17` §3b (T5 status check, T7 message cost data, E1 provenance standard written, docs index and duplicate numbering) | None | Every live screen passes `19` §5; later modules inherit it with no new plumbing |
| **P2** | Teacher app (PWA) | Attendance, Homework, Academics ("taught today", lesson plan), Timetable (view), Daily Pulse compose, Homework Recovery v1, Teacher Copilot v1 | `ANTHROPIC_API_KEY` for Copilot | A teacher runs a full school day on a phone, offline-tolerant |
| **P3** | Fees and payments | Fees (heads, structures, concessions incl. the sibling concession, ledger, combined family dues with one payment link per family), Razorpay, receipts, reminders by email with a payment link (WhatsApp reminders switch on in P4), clearance gate for certificates; the nightly job that marks a pending fee `overdue` once its due date (India date) has passed (until then the screens work it out from the date, C137); a part-paid fee past its due date counted as overdue on its unpaid balance, once payments are recorded (today it shows as "part paid", C140) | Razorpay KYC + keys; real concession types | Payment → ledger → receipt → reminder loop reconciles to the rupee |
| **P4** | WhatsApp live + parent loop | Communication, Daily Pulse send + replies, Parents, PTM Scheduler, Events, Complaints, Parent AI v1, delivery states | Meta Business verification, WABA number, approved templates | Parents receive, reply, and every message state is visible to the school |
| **P5** | Principal + Control on real data | Dashboard (principal, real), Reports, Staff (leave), Proxy Auto, School Health Auditor, Early Warning v1, Control: billing plans, messaging cost, monitoring | Plan names and ₹ prices | Principal dashboard shows only real data, every tile drills down |
| **P6** | Exams + learning intelligence | Exams & Report Card, Personal Best / Most Improved, Curriculum Gap Detector, Learning Genome, Early Warning v2 | Grading schemes used by target boards | Report cards published; growth and gaps computed from real marks |
| **P7** | School operations + advanced AI | Setup (complete), Admissions pipeline, Timetable generator, Documents & Certificates, Compliance Pro · APAAR, Payroll, Career Graph, Digital Twin, Automation OS | Payroll rules (salary heads, statutory); APAAR access | All website modules exist; AI modules run on real data with human approval |
| **P7b** | Family App (parent + student, PWA) | Family App group in `17` §3a: dues + Pay Now, attendance calendar, reports, receipts, notices, PTM booking, homework submit, study material, online exams | Store listing decision (PWA first) | A parent handles fees, homework and notices without calling the school |
| **P8** | Launch hardening | Production cutover (deferred to here, C103) · **real-data rehearsal** on the production database: real records loaded with the data owner's written permission and a data-processing agreement, never on the test database · backup-restore drill, load test, security review, legal sign-off (privacy, terms, DPA, pilot agreement, guarantee wording) · infrastructure decision (public website, school portal and database on one or separate platforms; both databases are already in Mumbai, ap-south-1) · first-school onboarding runbook and 30-day training playbook | Lawyer; hosting decision; real-data permission | Signed launch checklist (`13_LAUNCH_CHECKLIST.md`) |

Every phase also carries its items from `17` §3b (Strengthening Brief) and
must pass `19` §5. Free tools, the Gap Map, the changelog and the Founding
Schools page ship as small side PRs between phases.

Payroll and the AI modules marked *spec v0* in `17` are specified by the
supervisor so they can be built; the founder confirms or edits the spec before
their phase starts.

## 4a. One executor (C101)

Claude Code builds every lane: database, APIs, integrations and all screens.
Typed contracts in `src/lib/contracts/**` (C110) come first; screens are
built against them, on typed fixtures until the API exists. Decision Log
numbers: supervisor C100–C109, Claude Code from C110.

## 5. Founder long-lead actions (start now)

1. Meta Business verification + WhatsApp number (blocks P4; Fees in P3 sends reminders by email until then).
2. Razorpay account + KYC (blocks P3: now the first founder input needed after P2).
3. Lawyer: privacy, terms, DPDP children's-data consent (blocks P8).
4. Keep sharing what principals and teachers say (the founder already meets
   them); optionally show them a module's 5-task script (`19` §6). Never a blocker.
5. Before P8: written permission for the real data used in the rehearsal.
6. Classroom kit (C106): test one projector in a real classroom at 11 am and
   get quotes for a safe power option; this is the founder's offline work.

## 6. Change log

- **2026-10-07** — C104–C106 (founder): build everything first reaffirmed;
  Strengthening Brief adopted in full (`17` §3b); new **P1-c** ease and colour
  foundation before P2 (`19`); P8 gains the real-data rehearsal and the
  infrastructure decision; classroom kit recorded as a founder-run offering.
- **2026-10-07** — C126–C130: P1 complete except the cutover (deferred to the
  end, C103): Raise Ticket and the Help Center are live. P2 plan:
  `20_P2_TEACHER_APP_PLAN.md`.
- **2026-10-05** — C102 (founder): Fees moves before Exams. New order: P1
  foundations, P2 Teacher app, P3 Fees and payments, P4 WhatsApp + parent
  loop, P5 Principal + Control on real data, P6 Exams + learning
  intelligence, P7 School operations + advanced AI, P7b Family App (after
  Fees, unchanged), P8 Launch. Older entries below keep the numbers of their
  day. C124: founder reasons are founder-only. Cutover still not executed.
- **2026-10-01** — C116 (PR-2c): sibling mapping; C117 hotfix (students and
  guardian policy loop). Cutover still not executed.
- **2026-09-30** — C112/C113 (PR-2a, PR-2b): P1-b frameworks built as APIs;
  cutover still not executed.
- **2026-09-30** — C101: Antigravity dropped (founder); Claude Code is the only
  executor. `AGENTS.md` folded into `CLAUDE.md`.
- **2026-09-30** — C100: P7b Family App added; two-executor lanes (§4a);
  configuration, filters and the founder's E2E list folded into `17`.
- **2026-09-30** — Created (C99b). Founder moved Fees to the last feature phase
  (P7); Launch hardening stays last (P8) so payment code is audited.
