# 17 — Module Catalog (build contract for every module)

**Status:** canonical from 2026-09-30 (Decision Log C99b). Phases: see
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
show only the modules a role may use (§5). **Built (C121):** the app shell draws
these groups from the registry and the school's entitlements; phones get a
drawer, and the teacher shell a bottom bar (Dashboard, Attendance, Homework,
Daily Pulse, More); every module route is reserved, with a "Coming in phase"
page until the module is built.

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
| 1 | Dashboard (`dashboard`) | Role dashboards (principal, office, finance, academic, teacher); every tile real and drill-down; date range; alerts feed; export | P5 (P1 shell) | Partial |
| 2 | Setup (`setup`) | Academic sessions, classes/sections, subjects, teacher assignment, school profile, branding, grading schemes, calendar defaults, onboarding checklist | P7 (parts live) | Partial |
| 3 | Admissions (`admissions`) | Enquiry → visit → application → test/interview → offer → enrol pipeline; sources; follow-up tasks; conversion analytics; converts to Student | P7 | Planned |
| 4 | Students (`students`) | Profile, CSV import, document scan + OCR autofill, QR ID cards, **sibling mapping** (families with numbered codes, suggestions from guardian phone/email confirmed by the office, link/move/remove, guardian merge without data loss, sibling order by age, Siblings and family panel, list filters and "Link as siblings" bulk action, C116), promotions, transfers, history | done + P7 | Live |
| 5 | Parents (`parents`) | Guardians, verification, DPDP consent, data requests, contact preferences, WhatsApp linkage | P4 | Live |
| 6 | Staff (`staff`) | Staff records, roles, documents, leave requests/approvals, workload, attendance | P5 | Foundation |
| 7 | Academics (`academics`) | Syllabus map, "taught today", lesson plans, coverage %, objectives met | P2 | Partial |
| 8 | Attendance (`attendance`) | Class marking (teacher app), late/leave codes, staff attendance, absence alerts, trends, chronic-absence signal | P2 | Live |
| 9 | Timetable (`timetable`) | Periods, generator with constraints, teacher/class views, clash checker, changes history | P2 view · P7 generator | Planned |
| 10 | Proxy Auto (`proxy`) | Leave-driven substitution suggestions by free period + subject fit; one-tap assign; notify substitute | P5 | Planned |
| 11 | Homework (`homework`) | Set with photo/attachment, due dates, completion by parent reply, class completion stats | P2 | Planned |
| 12 | Homework Recovery (`recovery`) | Spec v0: detects students missing ≥N homework in a window, suggests a catch-up plan, teacher approves, parent informed via Pulse | P2 | Spec v0 |
| 13 | Exams & Report Card (`exams`) | Exam setup, marks entry with validation, grading, report card PDF (templates), publish, Personal Best / Most Improved | P6 | Foundation |
| 14 | Daily Pulse (`pulse`) | Compose from "taught today", Hinglish/Hindi/English, send on WhatsApp, 3–4 understanding replies, teacher follow-up queue, response-rate North Star | P2 compose · P4 send | Foundation |
| 15 | Communication (`communication`) | Notices (school/class), templates, send-gate (consent, quiet hours, budget), delivery states, failure retry, cost view | P4 | Partial |
| 16 | PTM Scheduler (`ptm`) | Slots per teacher, parent booking over WhatsApp, reminders, attendance, notes | P4 | Planned |
| 17 | Events (`events`) | School calendar, holidays, events, RSVPs, reminders | P4 | Planned |
| 18 | Complaints (`complaints`) | Spec v0: parent/staff complaint intake (WhatsApp + web), category, owner, SLA timer, status machine, resolution note, escalation to principal | P4 | Spec v0 |
| 19 | Fees (`fees`) | Heads, structures, concessions (incl. sibling concession), ledger, combined family dues, Razorpay, receipts, reminders (email with a payment link in P3; WhatsApp reminders switch on in P4), reconciliation, clearance gate | P3 | Foundation |
| 20 | Payroll (`payroll`) | Spec v0: salary structures (basic, allowances, deductions), PF/ESI/PT/TDS rules as config, monthly run state machine, payslip PDF, bank export; founder supplies statutory rules | P7 | Spec v0 |
| 21 | Documents & Certificates (`documents`) | ID cards, 7 certificate types (studio exists), request → fee-clearance/waiver → PDF → WhatsApp delivery → audit | P7 | Partial |
| 22 | Compliance Pro · APAAR (`compliance`) | Consent ledger, audit trail, DSR (live); APAAR ID capture/validation, UDISE+ data readiness report, Form 6 fee-regulation advisory | P7 | Partial |
| 23 | Reports (`reports`) | Report builder across modules, scheduled reports by email/WhatsApp, CSV/PDF export | P5 | Planned |
| 24 | Early Warning (`early-warning`) | Attendance + marks + homework + Pulse signals → at-risk score with reasons; teacher/principal action log; parent dispatch gated by legal basis | P5 v1 · P6 v2 | Foundation |
| 25 | Learning Genome (`learning-genome`) | Spec v0: per-student skill map by subject/chapter from marks, Pulse replies and homework; strengths/gaps; shown to teachers, summarised to parents | P6 | Spec v0 |
| 26 | Curriculum Gap Detector (`curriculum-gap`) | Spec v0: planned syllabus vs "taught today" vs assessed topics → flags untaught or unassessed chapters per class | P6 | Spec v0 |
| 27 | Teacher Copilot (`teacher-copilot`) | Spec v0: AI drafts lesson plans, worksheets, Pulse messages and remarks from the syllabus; teacher edits and approves; usage metered | P2 | Spec v0 |
| 28 | Parent AI · What to Do? (`parent-ai`) | Spec v0: weekly "what to do at home" suggestions per child from the Pulse and marks, in the family's language; teacher-reviewed templates | P4 | Spec v0 |
| 29 | School Health Auditor (`school-auditor`) | Spec v0: weekly score across attendance, coverage, fees, communication, compliance with explained deductions and a fix list | P5 | Spec v0 |
| 30 | Career Graph (`career`) | Spec v0: from class 9, interests + subject performance → career clusters and stream guidance; counsellor notes | P7 | Spec v0 |
| 31 | Digital Twin (`twin`) | Spec v0: what-if simulator on the school's own data (fee change, teacher hiring, attendance target) with stated assumptions | P7 | Spec v0 |
| 32 | Automation OS (`automation`) | Spec v0: rule builder (trigger → condition → action) on the jobs pipeline; prebuilt automations; every run audited; human approval for parent-facing actions | P7 | Spec v0 |
| 33 | Help Center (`help-center`) · Raise Ticket (`raise-ticket`) | In-app guides per module; ticket with screenshot, status, founder queue in Control | P1 | Live |


## 3a. Additions from the founder's E2E review (2026-09-30, C100)

Source: the founder's "what 1000+ schools use daily" list. Picked items join the
module in brackets; dropped or deferred items say why.

| Area | Picked (module, phase) | Dropped / deferred and why |
|---|---|---|
| **Super Admin (Control)** | Schools list, add, suspend/activate, impersonate, storage limit, bulk school import (P5) · Plans, add-ons, subscriptions, payment history, pending orders, coupons, manual payment approval, renewal reminders, **grace period then read-only** on failed payment (P5) · Team roles for NetCyberAI staff, support desk (P1/P5) · Onboarding templates, settings hub, master module menu, notification templates (P1-b) · Reports: login, engagement, comms, fees, attendance, schools (P5) · Comms wallet, comms rates, WhatsApp setup (P4/P5) · Certificate templates (P7) · Cron / pipeline monitor, backup + restore drill (P1/P8) | Stripe/PayPal: Razorpay covers UPI, cards and QR in India, and the provider interface allows adding them later · SMS gateways: DLT registration first, deferred behind the provider interface · Custom domain per school: later (P8+), low value before scale · 6-theme engine: replaced by logo + one accent colour, keeping the brand consistent · CMS for landing pages / blog: the site is in code; Knowledge Base = Help Center · "Software updates" / server screens: managed by the host · Public API docs: when a partner needs them |
| **School Setup** | Session manager, class/section, subjects, subject-teacher and class-teacher mapping, **promotion rules + one-click promote** (Setup, P7 — promote moved earlier to P6 if a session rollover is due), student categories, houses, bulk Excel/CSV import (Setup/Students) | — |
| **Admissions CRM** | Lead dashboard, sources, stages, Kanban board, follow-up reminders, conversion, online admission form with guardian + documents, pending queue, sibling linking (Admissions, P7) | — |
| **Daily operations** | Student 360° profile + 2-second search by name / admission no. / parent phone (Students, P1-b search) · Sibling mapping: suggest from guardian phone/email, office confirms, family view, guardian merge (Students, P1-b, C116) · Attendance daily/monthly, **Present All**, import from sheet, auto message to absent parents (P2/P4) · Staff attendance, leave, loans & advances → payroll (Staff/Payroll) · Timetable visual builder, **clash guard**, workload, my timetable, auto-fill free teacher (Timetable/Proxy) | — |
| **Finance** | Fee structure builder, discounts / scholarships, **sibling concession rule** in Fees settings applied from confirmed family links only, with approval, recalculated when a sibling leaves; combined family dues and one payment link per family (Fees, P3, C116), fine / late-fee rules, collection, bulk generate, 3-copy receipt, payment link + UPI QR, all-years dues, **auto reminders (−3 days, due date, +7 days; by email with a payment link in P3, on WhatsApp from P4)**, expense & income ledger, vendor payments (Fees, P3) · Payroll + payslips from attendance (Payroll, P7) | — |
| **Academics** | Lesson planner, syllabus tracker, **classwork logbook auto-shared with parents the same evening** (Academics + Pulse) · Homework with files, deadlines, online submission, evaluation, **copy to many sections** (Homework) · Study Center: chapter-wise PDFs and video links (new, P6) · Live class links (Jitsi/Zoom link + notify, P2) | Timetable-linked auto-push of material: after Study Center exists |
| **Exams** | Offline and online exams (CBT), question bank with difficulty, bulk marks from Excel, one-click class marksheet PDF, assessment dashboard, grading, report card, **HPC — Holistic Progress Card (NEP)**, admit cards (Exams, P6) | OMR / on-screen marking: needs scanning hardware and workflows; deferred behind Document scan · **Auto rank / topper list:** internal-only and opt-in per school, never sent to parents (non-competitive recognition, C76) |
| **Communication** | Notice board with **one post → WhatsApp + app + board**, family-level messaging (one message per family, P4, C116), calendar, holidays, PTM with back-to-back slots for siblings (P4, C116), certificates (bonafide, TC, ID, admit), complaints & feedback triage, surveys (P4/P7) · Health records: allergies, conditions, emergency contact, consent-gated (Students, P7) | Internal staff chat: WhatsApp already used; deferred · Apps Center: dropped |
| **Reports** | Daily collection, dues, attendance % (students, staff), fee defaulters, lesson-plan completion (Reports, P5 + per module) | Topper list: see Exams |
| **Parent & Student** | **Family App** (new group, P7b): sibling switcher (C116), profile card, dues with Pay Now, today's attendance, attendance calendar, report PDFs, receipts, ID card, notices, events, PTM booking, homework submit (photo/PDF), study material, online exam attempt, complaint | Separate student logins for minors: no. Students use the Family App under the parent's account (DPDP verifiable parental consent; C13/C24 stand for the staff web app). WhatsApp stays the main channel; the app is optional (C84). |

### The 10 daily time-killers — built first inside their phase

1 Bulk import / attendance / marks / receipts · 2 One-click promotion ·
3 Auto fee reminders · 4 Auto report card (marks → grade → PDF for a class) ·
5 Timetable clash guard · 6 Homework copy to many sections · 7 Student 360
search · 8 Payment link / UPI QR · 9 One notice → every channel ·
10 Logbook auto-share with parents. Each is a must-have acceptance item of
its phase, not a later polish.

## 3b. Additions from the Strengthening Brief (2026-10-07, C104)

Source: [`reference/2026-10-03_STRENGTHENING_BRIEF.md`](reference/2026-10-03_STRENGTHENING_BRIEF.md),
written from the founder's conversations with schools and teachers. **Every
item is adopted; nothing in the catalog is removed or renamed.** A module is
only ever dropped after the founder has watched 2–5 real schools not use it.
IDs are the brief's.

| ID | What it adds | Module home | Phase |
|---|---|---|---|
| **D1** Fee Recovery Engine | Reminders before the due date with the pay link; receipt back on WhatsApp; daily follow-up list ranked by amount, age and history; promise-to-pay tracker; hardship routed to a concession approval by a person, never more reminders; later an explainable risk score (rules first, a model only if it beats the rules) | Fees, Communication, Early Warning | P3 (list, promise, hardship) · P4 (WhatsApp) · P6 (score) |
| **D2** Compliance Desk | Dated, sourced obligation calendar; mandatory-disclosure builder incl. teacher qualifications; SQAAF evidence tracker; Haryana Form 6 draft (advisory exists); principal reminders | Compliance Pro | P7 |
| **D3** Student Data Integrity | Register vs reference mismatch finder (name, DOB, guardian); fix list; consent-checked parent correction request on WhatsApp; re-check; APAAR / UDISE+ / candidate-list readiness. Aadhaar: last four digits and name match only, never images | Students, Compliance Pro · APAAR | P7 (checker from P1 import rules) |
| **D4** RTE Claim Desk | RTE tagging; evidence file per child; claim sheet in the state layout; dues ageing; exception list; association evidence pack. Preparation only, never submitted on a school's behalf | Fees, Students, Compliance Pro | P3 (tagging) · P7 (desk) |
| **D5** Teacher Work Completion | One tap "taught today" → Pulse draft + classwork log; homework and assessment evidence attach; Copilot drafts plans, worksheets, remarks, competency-aware papers; HPC observation notes by text or voice, approved by the teacher | Academics, Daily Pulse, Teacher Copilot, Exams | P2 · P6 (HPC, papers) |
| **D6** Learning loop completion | Parent reply "needs help" → teacher queue item with a suggested follow-up → outcome recorded → feeds Early Warning | Daily Pulse, Early Warning | P2 (queue) · P4 (replies) · P5 (signal) |
| **D7** Consent & Trust Kit | Consent ledger view (exists), consent over WhatsApp, DPA template, breach playbook, per-tenant export, no "certified" wording | Parents, Compliance Pro | P4 · P7 (export) · P8 (legal texts) |
| **D8** Staff qualification & eligibility | Qualifications, TET/CTET status, expiry reminders; feeds disclosure (D2) | Staff | P5 |
| **D9** Admissions leakage fix | Enquiry from WhatsApp and web form, stages, follow-up tasks, visit booking, conversion by source | Admissions | P7 |
| **E1** Provenance standard | Every record behind a flag, report or message stores source, evidence links, validation status and who/when, rule version, AI-assisted yes/no, approver and when; reuses audit and document tables | All modules (standard written in P1-c) | P1-c (standard) · each phase (columns) |
| **E2** "Why this?" drawer | Every flag, risk marker or recommendation opens its evidence, rule and history | App design system (`19` §3.3) | P1-c (component) · P5 (all flags) |
| **E3** Proof page | Important claims with evidence count, exceptions, last check, approver; drill-down from every number | Dashboard, School Health Auditor | P5 |
| **E4** Versioned rules | Compliance, RTE and fee rules stored with `effective_from`, source and recorded date; a change adds a row (today `compliance_config` is one row per school and is overwritten) | Fees, Compliance Pro | P3 (fee rules) · P7 (compliance) |
| **P7** Measurement | "Taught" tap coverage, response rate, delivery rate and time-to-send, cost per student per month by category, onboarding hours, teacher minutes per class; weekly export; **no per-parent engagement score anywhere** | Every phase emits its own metrics; Reports exports | P2 onward · P5 (export) |
| **T5** Status from one source | Public module badges computed from `module-status.ts`; CI fails if a module marked live lacks its route, API and table | Website + registry | P1-c |
| **T7** WhatsApp cost model | Each message records its template category, billable flag, estimated cost and GST from `message_rate_table` (with verification date); utility vs marketing scenarios tested; cost view in Control | Communication, Control | P1-c (data) · P5 (view) |
| **T8 / T9** Pricing and migration wording | Price-per-student template with a dated WhatsApp cost example; free-migration cap wording. Numbers come from the founder | Website | When the founder gives the numbers |
| **A1** Free diagnostic tools (9) | Student Data Integrity Checker (extends the import checker) · disclosure completeness · SQAAF readiness planner · section and classroom rule check · RTE dues ageing (user enters the rate) · Form 6 fee-hike calculator (reuses the Form 6 advisory) · WhatsApp cost calculator with verification date · DPDP readiness checklist (lawyer wording before publishing) · HPC evidence completeness. Client-side, no login | Website free tools | Side PRs between phases, in that order |
| **A2** School Operations Gap Map | Principal answers what they use today; output: gaps, NetCyberAI equivalent, migration path, overlay option; opt-in contact | Website | Side PR |
| **A3** "Send me this result" | Opt-in, separate from the calculation; lead tagged with the exact tool | Website + leads | With A1 |
| **A4** Founding Schools programme | Application and diagnostic page (number of schools is the founder's call) | Website | Before P8; wording founder-approved |
| **A5** Build journal / changelog | Public dated record of what shipped and the problem it solves; metrics only once measured | Website | From P1-c, updated by every PR |
| **A8** Lead and acquisition cost | Source, stage, hours spent, outcome, computed cost per school | Control | P5 |
| **S1** ERP Exit Kit | Inventory, saved field mappings per source ERP, import checker, consent collection, parallel run for one class, class-by-class go-live | Setup, Students | P7 |
| **S2** Overlay import | Scheduled CSV/XLSX of students, fees and attendance from an existing ERP | Setup | P7 |
| **S3** Per-tenant export | One export of every tenant table; restore-into-isolation documented | Compliance Pro | P7 (before P8) |
| **S4** Parity gap register | Typical ERP checklist rows → covering module and status, generated from module status | Website / Reports | P5 |
| **C1** Smart Class lesson link | A lesson opened on the classroom projector from Academics; finishing it is one tap to "taught today" (C106) | Academics | P7 (planned) |

Not part of the school platform (brief §4.I, separate products behind their
own gates): TET prep, consent/verification API, inclusion desk, campus
compliance check, coaching-centre edition, exam scan toolkit. The brief's
do-not-build list (generic AI tutor, doubt chatbot, credit scoring, RTE
lending, marketplaces, face recognition) is recorded; face recognition is
already a permanent ban (C23).

## 4. App design system (all dashboards and apps)

- **Binding standard (C105):** [`19_EASE_AND_COLOUR_STANDARD.md`](19_EASE_AND_COLOUR_STANDARD.md)
  — "a non-technical person learns everything in one sitting", the ten
  ease-of-use rules, and the colourful dashboard standard (module icon tiles,
  KPI tile v2, ring / gauge / gradient-area / heat-grid charts, validated
  six-colour order). Where this section and `19` differ, `19` wins.
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

- **2026-10-07** — C104–C106: Strengthening Brief adopted in full as §3b
  (every item mapped to a module and phase; nothing removed); ease-of-use and
  colour standard `19` made binding (§4); classroom kit recorded as a
  founder-run offering with a planned Smart Class lesson link (C1).
- **2026-10-07** — C129: Help Center is live (§3 row 33): 12 task guides in
  English and Hindi (Hindi not yet reviewed), search, related guides.
- **2026-10-07** — C126–C128: Raise Ticket is live (§3 row 33): status
  machine, founder queue in Control, screenshots, founder email.
- **2026-10-05** — C102: Fees moves before Exams. Phases renumbered in §3 and
  §3a (Fees P3; WhatsApp + parent loop P4; Principal/Control P5; Exams P6;
  School ops P7; Family App P7b and Launch P8 unchanged). Older entries below
  keep the numbers of their day.
- **2026-09-30** — Created (C99b) from the website demo's 34 navigation items; 8-group
  navigation; Spec v0 for 11 modules that had no specification.
- **2026-10-01** — C116: sibling mapping (Students, §3 row 4) built; sibling
  items for P3, P7 and P7b recorded in §3a.
- **2026-09-30** — C112/C113: P1-b frameworks built (§1a); Parent AI and
  own-classes Student 360 search added for teachers (§5).
- **2026-09-30** — C100: configuration and filters frameworks (§1a); the
  founder's E2E list mapped module by module (§3a), with the drops and their
  reasons; Family App group; time-killers made phase acceptance items.
