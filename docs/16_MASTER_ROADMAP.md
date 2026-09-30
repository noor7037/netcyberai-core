# 16 — Master Roadmap and Operating Model

**Status:** canonical from 2026-09-30 (Decision Log C99). Supersedes the phase
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
   data model + RLS + tests · API with audit · UI with loading / empty / error /
   no-permission states · works at 360, 390, 768, 1024, 1440 · English + Hindi
   strings · demo-school seed data · charts have a table view · catalog row in
   `17` updated to *Live*.
5. **Proof in every PR:** unit + flow tests (PGlite for DB flows), `ci_local.sh`
   20/20, screenshots at 390 and 1440, one `/code-review` (medium) +
   `/security-review`, at most 2 subagents, push after every major step.
6. **Challenge rule.** Any executor may overrule an earlier decision, document or
   instruction when it finds something better: say so in one line, do it, log it.

## 4. Phases (order fixed by the founder, 2026-09-30)

| # | Phase | Scope (modules from `17`) | Founder inputs | Done when |
|---|---|---|---|---|
| **P1** | Platform foundations | Live site on its own production DB (cutover); observability (errors, logs, uptime); module registry + per-school entitlements; app navigation (8 groups, `17` §2); app design system (`17` §4); i18n EN/HI; file storage; audit-log viewer; API rate limiter; Help Center; Raise Ticket | Sentry DSN; uptime alert contact | Every later module plugs into registry, nav, entitlements, i18n and design system without new plumbing |
| **P2** | Teacher app (PWA) | Attendance, Homework, Academics ("taught today", lesson plan), Timetable (view), Daily Pulse compose, Homework Recovery v1, Teacher Copilot v1 | `ANTHROPIC_API_KEY` for Copilot | A teacher runs a full school day on a phone, offline-tolerant |
| **P3** | WhatsApp live + parent loop | Communication, Daily Pulse send + replies, Parents, PTM Scheduler, Events, Complaints, Parent AI v1, delivery states | Meta Business verification, WABA number, approved templates | Parents receive, reply, and every message state is visible to the school |
| **P4** | Principal + Control on real data | Dashboard (principal, real), Reports, Staff (leave), Proxy Auto, School Health Auditor, Early Warning v1, Control: billing plans, messaging cost, monitoring | Plan names and ₹ prices | Principal dashboard shows only real data, every tile drills down |
| **P5** | Exams + learning intelligence | Exams & Report Card, Personal Best / Most Improved, Curriculum Gap Detector, Learning Genome, Early Warning v2 | Grading schemes used by target boards | Report cards published; growth and gaps computed from real marks |
| **P6** | School operations + advanced AI | Setup (complete), Admissions pipeline, Timetable generator, Documents & Certificates, Compliance Pro · APAAR, Payroll, Career Graph, Digital Twin, Automation OS | Payroll rules (salary heads, statutory); APAAR access | All website modules exist; AI modules run on real data with human approval |
| **P7** | Fees and payments | Fees (heads, structures, concessions, ledger), Razorpay, receipts, WhatsApp reminders, clearance gate for certificates | Razorpay KYC + keys; real concession types | Payment → ledger → receipt → reminder loop reconciles to the rupee |
| **P8** | Launch hardening | Backup-restore drill, load test, security audit, legal sign-off, hosting / plan decision and migration if chosen, first school onboarding runbook | Lawyer; hosting decision | Signed launch checklist (`13_LAUNCH_CHECKLIST.md`) |

Payroll and the AI modules marked *spec v0* in `17` are specified by the
supervisor so they can be built; the founder confirms or edits the spec before
their phase starts.

## 5. Founder long-lead actions (start now)

1. Meta Business verification + WhatsApp number (blocks P3).
2. Razorpay account + KYC (blocks P7).
3. Lawyer: privacy, terms, DPDP children's-data consent (blocks P8).
4. One design-partner school reviewing screens weekly (improves every phase).
5. Pending: `RESEND_API_KEY` in Vercel; delete `DIAG_*` / `PROMPT_E_DIAG_TOKEN` env vars.

## 6. Change log

- **2026-09-30** — Created (C99). Founder moved Fees to the last feature phase
  (P7); Launch hardening stays last (P8) so payment code is audited.
