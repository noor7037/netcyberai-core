# 17 — Module Catalog (build contract for every module)

**Status:** canonical from 2026-09-30 (Decision Log C99). Phases: see
[`16_MASTER_ROADMAP.md`](16_MASTER_ROADMAP.md).
**Sources of truth for intent:** the public website and demo —
`src/demo-fixture/principal-dashboard.ts` (34 navigation items: Dashboard + 33 modules, nav, visuals),
`src/content/module-status.ts` (current status), `src/content/catalog.ts`
(product pages), `src/components/showcase/*` (Principal dashboard, Teacher app,
Parent app, WhatsApp: the visual reference for the real product).

Status key: **Live** · **Partial** · **Foundation** (tables exist) ·
**Planned** · **Spec v0** (specified here by the supervisor; founder confirms
before its phase).

---

## 1. Principles that override any module text below

- **Constitution limits stay:** no parent or student login in the web app
  (C13, C24; the optional Parent App is separate, C84); no child ranked
  against named classmates for parents (C76); fees never paired with academic
  standing (capability matrix). AI output is advisory: a person approves every
  action that reaches a parent or changes a record (Amendment 3).
- **Demo numbers are not product claims.** Badges such as "9 agents",
  "90 sec", "47 at-risk" come from the demo; the real product shows computed
  values only.

## 2. Navigation — 8 groups (sidebar sections that collapse like drop-downs)

Replaces the demo's 5 uneven groups (17 items under one heading). Role shells
show only the modules a role may use (§5).

| Group | Modules |
|---|---|
| **1. Home** | Dashboard |
| **2. School & People** | Setup · Admissions · Students · Parents · Staff |
| **3. Teaching & Learning** | Academics · Attendance · Timetable · Proxy Auto · Homework · Homework Recovery · Exams & Report Card |
| **4. Parent Engagement** | Daily Pulse · Communication · PTM Scheduler · Events · Complaints |
| **5. Finance** | Fees · Payroll |
| **6. Records & Compliance** | Documents & Certificates · Compliance Pro · APAAR · Reports |
| **7. AI Intelligence** | Early Warning · Learning Genome · Curriculum Gap Detector · Teacher Copilot · Parent AI · School Health Auditor · Career Graph · Digital Twin · Automation OS |
| **8. Help** | Help Center · Raise Ticket |

## 3. Modules

| # | Module (id) | Full capabilities to build | Phase | Now |
|---|---|---|---|---|
| 1 | Dashboard (`dashboard`) | Role dashboards (principal, office, finance, academic, teacher); every tile real and drill-down; date range; alerts feed; export | P4 (P1 shell) | Partial |
| 2 | Setup (`setup`) | Academic sessions, classes/sections, subjects, teacher assignment, school profile, branding, grading schemes, calendar defaults, onboarding checklist | P6 (parts live) | Partial |
| 3 | Admissions (`admissions`) | Enquiry → visit → application → test/interview → offer → enrol pipeline; sources; follow-up tasks; conversion analytics; converts to Student | P6 | Planned |
| 4 | Students (`students`) | Profile, CSV import, document scan + OCR autofill, QR ID cards, siblings, promotions, transfers, history | done + P6 | Live |
| 5 | Parents (`parents`) | Guardians, verification, DPDP consent, data requests, contact preferences, WhatsApp linkage | P3 | Live |
| 6 | Staff (`staff`) | Staff records, roles, documents, leave requests/approvals, workload, attendance | P4 | Foundation |
| 7 | Academics (`academics`) | Syllabus map, "taught today", lesson plans, coverage %, objectives met | P2 | Partial |
| 8 | Attendance (`attendance`) | Class marking (teacher app), late/leave codes, staff attendance, absence alerts, trends, chronic-absence signal | P2 | Live |
| 9 | Timetable (`timetable`) | Periods, generator with constraints, teacher/class views, clash checker, changes history | P2 view · P6 generator | Planned |
| 10 | Proxy Auto (`proxy`) | Leave-driven substitution suggestions by free period + subject fit; one-tap assign; notify substitute | P4 | Planned |
| 11 | Homework (`homework`) | Set with photo/attachment, due dates, completion by parent reply, class completion stats | P2 | Planned |
| 12 | Homework Recovery (`recovery`) | Spec v0: detects students missing ≥N homework in a window, suggests a catch-up plan, teacher approves, parent informed via Pulse | P2 | Spec v0 |
| 13 | Exams & Report Card (`exams`) | Exam setup, marks entry with validation, grading, report card PDF (templates), publish, Personal Best / Most Improved | P5 | Foundation |
| 14 | Daily Pulse (`pulse`) | Compose from "taught today", Hinglish/Hindi/English, send on WhatsApp, 3–4 understanding replies, teacher follow-up queue, response-rate North Star | P2 compose · P3 send | Foundation |
| 15 | Communication (`communication`) | Notices (school/class), templates, send-gate (consent, quiet hours, budget), delivery states, failure retry, cost view | P3 | Partial |
| 16 | PTM Scheduler (`ptm`) | Slots per teacher, parent booking over WhatsApp, reminders, attendance, notes | P3 | Planned |
| 17 | Events (`events`) | School calendar, holidays, events, RSVPs, reminders | P3 | Planned |
| 18 | Complaints (`complaints`) | Spec v0: parent/staff complaint intake (WhatsApp + web), category, owner, SLA timer, status machine, resolution note, escalation to principal | P3 | Spec v0 |
| 19 | Fees (`fees`) | Heads, structures, concessions, ledger, Razorpay, receipts, reminders, reconciliation, clearance gate | P7 | Foundation |
| 20 | Payroll (`payroll`) | Spec v0: salary structures (basic, allowances, deductions), PF/ESI/PT/TDS rules as config, monthly run state machine, payslip PDF, bank export; founder supplies statutory rules | P6 | Spec v0 |
| 21 | Documents & Certificates (`documents`) | ID cards, 7 certificate types (studio exists), request → fee-clearance/waiver → PDF → WhatsApp delivery → audit | P6 | Partial |
| 22 | Compliance Pro · APAAR (`compliance`) | Consent ledger, audit trail, DSR (live); APAAR ID capture/validation, UDISE+ data readiness report, Form 6 fee-regulation advisory | P6 | Partial |
| 23 | Reports (`reports`) | Report builder across modules, scheduled reports by email/WhatsApp, CSV/PDF export | P4 | Planned |
| 24 | Early Warning (`early-warning`) | Attendance + marks + homework + Pulse signals → at-risk score with reasons; teacher/principal action log; parent dispatch gated by legal basis | P4 v1 · P5 v2 | Foundation |
| 25 | Learning Genome (`learning-genome`) | Spec v0: per-student skill map by subject/chapter from marks, Pulse replies and homework; strengths/gaps; shown to teachers, summarised to parents | P5 | Spec v0 |
| 26 | Curriculum Gap Detector (`curriculum-gap`) | Spec v0: planned syllabus vs "taught today" vs assessed topics → flags untaught or unassessed chapters per class | P5 | Spec v0 |
| 27 | Teacher Copilot (`teacher-copilot`) | Spec v0: AI drafts lesson plans, worksheets, Pulse messages and remarks from the syllabus; teacher edits and approves; usage metered | P2 | Spec v0 |
| 28 | Parent AI · What to Do? (`parent-ai`) | Spec v0: weekly "what to do at home" suggestions per child from the Pulse and marks, in the family's language; teacher-reviewed templates | P3 | Spec v0 |
| 29 | School Health Auditor (`school-auditor`) | Spec v0: weekly score across attendance, coverage, fees, communication, compliance with explained deductions and a fix list | P4 | Spec v0 |
| 30 | Career Graph (`career`) | Spec v0: from class 9, interests + subject performance → career clusters and stream guidance; counsellor notes | P6 | Spec v0 |
| 31 | Digital Twin (`twin`) | Spec v0: what-if simulator on the school's own data (fee change, teacher hiring, attendance target) with stated assumptions | P6 | Spec v0 |
| 32 | Automation OS (`automation`) | Spec v0: rule builder (trigger → condition → action) on the jobs pipeline; prebuilt automations; every run audited; human approval for parent-facing actions | P6 | Spec v0 |
| 33 | Help Center (`help-center`) · Raise Ticket (`raise-ticket`) | In-app guides per module; ticket with screenshot, status, founder queue in Control | P1 | Partial / Planned |

## 4. App design system (all dashboards and apps)

- **Colours:** only the logo token set in `src/lib/design-tokens.ts`. Group
  tones: School & People = sapphire/royal · Teaching & Learning = royal/azure ·
  Parent Engagement = cyan/turquoise · Finance = tangerine/amber · Records &
  Compliance = emerald · AI Intelligence = grape/violet · alerts = coral ·
  recognition = gold/sunshine. Cinematic surfaces reuse `nca-mesh-dark`,
  `nca-spectrum-bar`, `nca-glass` on midnight. Text contrast AA minimum
  (`check_contrast.py`).
- **Visual reference:** match `src/components/showcase/PrincipalDashboard.tsx`,
  `TeacherApp.tsx`, `ParentApp.tsx` — the real product must look like the demo.
- **Data presentation:** reuse the V4 chart components; one clear message per
  chart, value labels, a table view per chart, empty states that say what to do.
- **Motion:** 150–300 ms purposeful transitions, count-up numbers, skeleton
  loaders, no layout shift; everything off under `prefers-reduced-motion`.
- **Speed budgets:** LCP < 2.5 s on 4G mid-range Android; < 200 KB JS per
  route; interactions < 100 ms; server pagination for lists.
- **Phones:** the product is responsive-native, not scaled. (The website's
  scaled "desktop view" is a showcase choice with 20 px tap targets, C82;
  working screens need 44 px targets.) Tables become card lists, dashboards
  become stacked cards in the same order and colours, the teacher shell keeps
  bottom navigation. Verified at 360, 390, 768, 1024, 1440.

## 5. Role access (summary)

| Role | Groups |
|---|---|
| Principal, School admin | All school groups |
| Teacher | Home, Teaching & Learning, Parent Engagement (own classes), Teacher Copilot, Help |
| Accountant | Home, Finance, Reports, Help |
| Academic coordinator | Home, Teaching & Learning, Exams, AI learning modules, Reports, Help |
| Super admin (Control) | Platform: schools, onboarding, pipeline, plans, entitlements, monitoring, audit |

## 6. Change log

- **2026-09-30** — Created (C99) from the website demo's 34 navigation items; 8-group
  navigation; Spec v0 for 11 modules that had no specification.
