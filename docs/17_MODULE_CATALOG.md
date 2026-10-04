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

## 1a. Configuration and filters — every module, every school (C100)

Founder rule: a school configures NetCyberAI to its own way of working, and
finds anything with filters. Built once in P1-b as platform frameworks; every
module plugs in (part of the module definition of done).

- **Settings framework.** Each module declares a typed settings schema
  (defaults, allowed values, who may change it). Per-school values, validated,
  audited, versioned, with "reset to default". The settings screen is generated
  from the schema. Covers numbering formats (admission / receipt / roll no.),
  academic calendar, working days, periods, grading schemes, attendance codes,
  fee rules, late fines, reminder schedules, notification templates, languages,
  branding (logo + one accent colour within the palette), module on/off.
- **Onboarding templates.** A new school starts from a template (board, size,
  levels) that pre-fills classes, subjects, fee heads, grading and calendar;
  the founder maintains templates in Control. One-click school setup.
- **Custom fields.** Schools add typed fields to Student, Guardian, Staff,
  Admission lead (text, number, date, list, yes/no), usable in forms, filters,
  imports, exports and reports.
- **Filters and saved views.** Every list uses one filter engine: field +
  operator + value, AND/OR groups, quick filters (class, section, status,
  session, date range), full-text search, sort, column choice; saved views per
  user or shared per school; role default views; URL-shareable; server-side
  pagination; exports and bulk actions act on exactly the filtered set.
- **Bulk everything.** Every list supports select-all-filtered + bulk action
  with preview, confirmation, a background job for large sets, and an undo
  window where the action allows it.

**Built:** entitlements, the settings engine and custom fields (C112, APIs);
the filter engine with saved views, and bulk actions (C113, PR-2b). A module
plugs in by registering its settings schema (`src/lib/frameworks/settings-schemas.ts`)
and, with C113, its list (`lists.ts`) and bulk actions (`bulk-actions.ts`). Help Center and Raise
Ticket are always on, whatever the entitlements. A new school starts on the
default plan (`plans.ts`, C114: every module that works today). Onboarding
templates are not built yet (they arrive with the Control onboarding screens).

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
| 4 | Students (`students`) | Profile, CSV import, document scan + OCR autofill, QR ID cards, **sibling mapping** (families with numbered codes, suggestions from guardian phone/email confirmed by the office, link/move/remove, guardian merge without data loss, sibling order by age, Siblings and family panel, list filters and "Link as siblings" bulk action, C116), promotions, transfers, history | done + P6 | Live |
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


## 3a. Additions from the founder's E2E review (2026-09-30, C100)

Source: the founder's "what 1000+ schools use daily" list. Picked items join the
module in brackets; dropped or deferred items say why.

| Area | Picked (module, phase) | Dropped / deferred and why |
|---|---|---|
| **Super Admin (Control)** | Schools list, add, suspend/activate, impersonate, storage limit, bulk school import (P4) · Plans, add-ons, subscriptions, payment history, pending orders, coupons, manual payment approval, renewal reminders, **grace period then read-only** on failed payment (P4) · Team roles for NetCyberAI staff, support desk (P1/P4) · Onboarding templates, settings hub, master module menu, notification templates (P1-b) · Reports: login, engagement, comms, fees, attendance, schools (P4) · Comms wallet, comms rates, WhatsApp setup (P3/P4) · Certificate templates (P6) · Cron / pipeline monitor, backup + restore drill (P1/P8) | Stripe/PayPal: Razorpay covers UPI, cards and QR in India, and the provider interface allows adding them later · SMS gateways: DLT registration first, deferred behind the provider interface · Custom domain per school: later (P8+), low value before scale · 6-theme engine: replaced by logo + one accent colour, keeping the brand consistent · CMS for landing pages / blog: the site is in code; Knowledge Base = Help Center · "Software updates" / server screens: managed by the host · Public API docs: when a partner needs them |
| **School Setup** | Session manager, class/section, subjects, subject-teacher and class-teacher mapping, **promotion rules + one-click promote** (Setup, P6 — promote moved earlier to P5 if a session rollover is due), student categories, houses, bulk Excel/CSV import (Setup/Students) | — |
| **Admissions CRM** | Lead dashboard, sources, stages, Kanban board, follow-up reminders, conversion, online admission form with guardian + documents, pending queue, sibling linking (Admissions, P6) | — |
| **Daily operations** | Student 360° profile + 2-second search by name / admission no. / parent phone (Students, P1-b search) · Sibling mapping: suggest from guardian phone/email, office confirms, family view, guardian merge (Students, P1-b, C116) · Attendance daily/monthly, **Present All**, import from sheet, auto message to absent parents (P2/P3) · Staff attendance, leave, loans & advances → payroll (Staff/Payroll) · Timetable visual builder, **clash guard**, workload, my timetable, auto-fill free teacher (Timetable/Proxy) | — |
| **Finance** | Fee structure builder, discounts / scholarships, **sibling concession rule** in Fees settings applied from confirmed family links only, with approval, recalculated when a sibling leaves; combined family dues and one payment link per family (Fees, P7, C116), fine / late-fee rules, collection, bulk generate, 3-copy receipt, payment link + UPI QR, all-years dues, **auto reminders (−3 days, due date, +7 days)**, expense & income ledger, vendor payments (Fees, P7) · Payroll + payslips from attendance (Payroll, P6) | — |
| **Academics** | Lesson planner, syllabus tracker, **classwork logbook auto-shared with parents the same evening** (Academics + Pulse) · Homework with files, deadlines, online submission, evaluation, **copy to many sections** (Homework) · Study Center: chapter-wise PDFs and video links (new, P5) · Live class links (Jitsi/Zoom link + notify, P2) | Timetable-linked auto-push of material: after Study Center exists |
| **Exams** | Offline and online exams (CBT), question bank with difficulty, bulk marks from Excel, one-click class marksheet PDF, assessment dashboard, grading, report card, **HPC — Holistic Progress Card (NEP)**, admit cards (Exams, P5) | OMR / on-screen marking: needs scanning hardware and workflows; deferred behind Document scan · **Auto rank / topper list:** internal-only and opt-in per school, never sent to parents (non-competitive recognition, C76) |
| **Communication** | Notice board with **one post → WhatsApp + app + board**, family-level messaging (one message per family, P3, C116), calendar, holidays, PTM with back-to-back slots for siblings (P3, C116), certificates (bonafide, TC, ID, admit), complaints & feedback triage, surveys (P3/P6) · Health records: allergies, conditions, emergency contact, consent-gated (Students, P6) | Internal staff chat: WhatsApp already used; deferred · Apps Center: dropped |
| **Reports** | Daily collection, dues, attendance % (students, staff), fee defaulters, lesson-plan completion (Reports, P4 + per module) | Topper list: see Exams |
| **Parent & Student** | **Family App** (new group, P7b): sibling switcher (C116), profile card, dues with Pay Now, today's attendance, attendance calendar, report PDFs, receipts, ID card, notices, events, PTM booking, homework submit (photo/PDF), study material, online exam attempt, complaint | Separate student logins for minors: no. Students use the Family App under the parent's account (DPDP verifiable parental consent; C13/C24 stand for the staff web app). WhatsApp stays the main channel; the app is optional (C84). |

### The 10 daily time-killers — built first inside their phase

1 Bulk import / attendance / marks / receipts · 2 One-click promotion ·
3 Auto fee reminders · 4 Auto report card (marks → grade → PDF for a class) ·
5 Timetable clash guard · 6 Homework copy to many sections · 7 Student 360
search · 8 Payment link / UPI QR · 9 One notice → every channel ·
10 Logbook auto-share with parents. Each is a must-have acceptance item of
its phase, not a later polish.

## 4. App design system (all dashboards and apps)

- **Built (C118):** `src/components/app-ui/**` (cards, page header, status
  pills, KPI tiles, chart cards with table view, responsive lists, loading /
  empty / error / no-access states, tone classes for every logo token);
  gallery at `/design-system` in development.
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
| Teacher | Home, Teaching & Learning, Parent Engagement (own classes), Teacher Copilot, Parent AI (own classes, C112), Student 360 search (own classes, enforced by the database; not the Students module); guardians of own classes only (C112), Help |
| Accountant | Home, Finance, Reports, Help |
| Academic coordinator | Home, Teaching & Learning, Exams, AI learning modules, Reports, Help |
| Super admin (Control) | Platform: schools, onboarding, templates, plans and billing, comms wallet, entitlements, support desk, pipeline, monitoring, audit and reports |
| Parent (Family App, P7b) | Own children only: profile, attendance, homework, reports, fees and Pay Now, notices, PTM, complaints |

## 6. Change log

- **2026-09-30** — Created (C99) from the website demo's 34 navigation items; 8-group
  navigation; Spec v0 for 11 modules that had no specification.
- **2026-10-01** — C116: sibling mapping (Students, §3 row 4) built; sibling
  items for P3, P7 and P7b recorded in §3a.
- **2026-09-30** — C112/C113: P1-b frameworks built (§1a); Parent AI and
  own-classes Student 360 search added for teachers (§5).
- **2026-09-30** — C100: configuration and filters frameworks (§1a); the
  founder's E2E list mapped module by module (§3a), with the drops and their
  reasons; Family App group; time-killers made phase acceptance items.
