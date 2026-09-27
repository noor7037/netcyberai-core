# 12 — Capability Matrix (reference mockups vs the real product)

Built 2026-09-27 from three sources: the founder's supplied references
(`NetCyberAI_Dashboard_Final_V2.html`, `NetCyberAI_Parent_WhatsApp_iPhone_Mockup.html`),
the repository as it stands on `main` + this branch, and the live
Supabase schema. Status is decided by evidence in code, never by the
mockup:

- **Live**: schema + API/server logic + UI, tenant-scoped, audited where the rule requires it.
- **Backend only**: schema and server logic exist, no usable screen yet.
- **Schema only**: tables exist, no API and no screen. Not usable.
- **Not built**: nothing behind it yet.

Public website rule: anything below **Live** may appear only as a demo
screen with the "Demo school · fictional numbers" label, never as a
live feature.

## School operations

| Capability | Surface | UI | Backend required | Status | Depends on |
|---|---|---|---|---|---|
| Academic sessions | School app | settings | `academic_sessions` | Backend only | schools |
| Classes / sections | School app | classes in students views | `classes`, `api/app/classes` | Live | sessions |
| Subjects + teacher assignment | School app | none yet (API only) | `subjects`, `teacher_subjects`, `api/app/subjects`, `api/app/subjects/assignments` | Backend only (2026-09-27: create/list/assign/unassign, audited, unique subject names) | classes, teachers |
| Students (CRUD, profile) | School app | `/app/students` | `students`, `api/app/students` | Live | classes |
| CSV student import | School app | students page | `csv_imports`, `api/app/students/import` | Live | classes |
| Guardians + verification | School app | student profile | `parents`, `parent_student_map`, `api/app/guardians` | Live | students |
| Consent ledger (DPDP) | School app | student profile | `consent_ledger`, `api/app/students/[id]/consent` | Live | guardians |
| Data subject requests | School app | student profile | `data_subject_requests`, `api/app/dsr` | Live | consent |
| Document scan + OCR | School app | student profile | `captured_documents`, `ocr_extractions`, `api/app/scan` | Live | students |
| QR ID cards | School app | `/id-card` | `student_qr_tokens`, `qr_scan_log` | Live | students |
| Attendance marking | School app | `/app/attendance` | `attendance`, `api/app/attendance` | Live | classes, students |
| Staff directory, leave | School app | stub | `teachers` | Schema only (teachers); leave not built | memberships |
| Admissions pipeline (enquiry → offer) | School app | enrolment queue only | none for early stages | Not built (only `pending_consent` queue) | students |
| Timetable / calendar | School app | none | none | Not built | subjects, teachers |
| Homework | School app | none | none | Not built | subjects |
| Syllabus progress ("taught today") | School app | `/app/syllabus` | `syllabus_progress`, `api/app/syllabus` (GET, PUT upsert) | Live (2026-09-27; one record per class+subject+day; teacher limited by RLS to own assigned pairs, proven live) | subjects |
| Exams, marks, report cards | School app | stubs | `exams`, `marks` | Schema only | subjects |
| Reports | School app | stub | none | Not built | all of the above |

## Finance

| Capability | Surface | UI | Backend required | Status | Depends on |
|---|---|---|---|---|---|
| Fee heads, structures, items | School app | stub | `fee_heads`, `fee_structures`, `fee_structure_items` | Schema only | sessions, classes |
| Student fee obligations / ledger | School app | stub | `fees_ledger` | Schema only | fee structures |
| Payments, reconciliation | School app | stub | `payments`, `webhook_events` | Schema only (Razorpay keys unconfirmed, task 89) | ledger |
| Concessions | School app | none | `fee_concessions` | Schema only | ledger |
| Reminders on WhatsApp | Parent | none | send-gate + templates | Not built (gate exists) | ledger, consent |
| Receipts (PDF) | Parent | none | none | Not built | payments |
| Financial clearance → certificate gate | School app | none | `certificate_requests` | Schema only | ledger |

## Communication

| Capability | Surface | UI | Backend required | Status | Depends on |
|---|---|---|---|---|---|
| WhatsApp send-gate (consent, pilot, quiet hours, budget) | Server | none | `src/lib/whatsapp/gate.ts`, `communication_log` | Live (server) | consent |
| Absence alert to parent | Parent | via attendance | `src/lib/attendance/attendance.ts` → gate | Live (sends only when the school's pilot flag allows) | attendance, consent |
| School WhatsApp config | School app | settings | `school_whatsapp_configs`, `api/app/whatsapp-config` | Live | — |
| Templates | Server | none | `whatsapp_templates` | Schema only | provider approval |
| Notices / class notices | School app | stubs | none | Not built | gate |
| Delivery / failure state visible to school | School app | none | `communication_log`, `webhook_events` | Backend only (logged, no screen) | gate |

## Learning intelligence

| Capability | Surface | UI | Backend required | Status | Depends on |
|---|---|---|---|---|---|
| Daily Learning Pulse (compose, send) | Parent | stub | `pulse_messages` | Schema only; `api/app/pulse/today` is a feature-flag gate demo | syllabus progress, gate |
| Parent reply (3 tiers) | Parent | none | `pulse_response_log` (tier 1..3) | Schema only | Pulse, inbound webhook |
| Teacher follow-up from replies | School app | none | none | Not built | parent replies |
| At-risk signals | School app | none | `at_risk_flags` | Schema only | attendance, marks |
| Personal Best / Most Improved | Parent, school | stub | `recognition_events` | Schema only | marks |
| Class Top-3 (opt-in, secondary) | School app | none | `recognition_events` | Schema only | marks, school opt-in |
| Teacher Impact Card (private) | Principal + teacher | stubs | `teacher_impact_metrics` | Schema only | Pulse, marks |
| Parent feedback | Parent | none | `parent_feedback` | Schema only | Pulse |

## Documents

| Capability | Surface | UI | Backend required | Status | Depends on |
|---|---|---|---|---|---|
| Certificate request + clearance/waiver | School app | none | `certificate_requests` | Schema only | fees ledger |
| PDF generation + WhatsApp delivery + audit | Parent | none | none | Not built | certificates, gate |

## Platform (Control Plane)

| Capability | Status |
|---|---|
| Sign-in, MFA step, multi-school selection, switch school | Live |
| Super admin: schools, features, invites, onboarding stage, impersonation | Live |
| Public lead intake (6 sources) → Control Plane onboarding list | Live (browser → API → DB verified in pieces; see Decision Log) |
| Billing plans, messaging cost, monitoring, audit-log viewer | Stubs |

## Reference conflicts (Constitution wins)

| Reference shows | Decision |
|---|---|
| "Next.js + Firebase + Firestore RLS + Cloud SQL" subtitle | Rejected: PostgreSQL on Supabase is canonical. |
| Parent sees a ranked list of 10 named classmates ("#7 of 60", "Top 3") | Rejected: exposes other children; Personal Best is primary, Top-3 is opt-in and school-side. |
| Fee delay list mixing toppers, parent names and phone numbers | Rejected: fees are never paired with academic standing or shown with contact details on a dashboard tile. |
| Four understanding states, Devanagari Hindi | Shown on the website as designed (C75). Schema decision pending: widen `pulse_response_log.tier` to 1..4 and add a Hindi body column when the Pulse is built (build step 3). |
| "Open Parent App" as the next step | Rejected as primary: WhatsApp-first, no forced app. |
| Learning Genome, Digital Twin, Career Graph, "9 agents", Payroll | Shown since C74 inside the labelled demo only, never as live product; status "Needs specification" until the founder's module spec exists. |
| Numbers such as "Proxy auto 90 sec vs 45 min", "842 guidance sessions" | Unsourced; not used. |

## Founder dashboard: all 33 modules (C74)

Per-module status for the principal dashboard reference is kept in code,
in `src/content/module-status.ts`, and published on `/product-tour#modules`.
Summary: Live 3 (Students, Parents & Guardians, Attendance) · Partly live 6
(Setup, Academics, Communication, Documents, Compliance, Help Center) ·
Foundation built 5 (Staff, Exams, Fees, Early Warning, Daily Pulse) ·
Planned 8 (Admissions, Timetable, Homework, Events, Reports, PTM, Proxy,
Raise Ticket) · Needs specification 11.

**Module intake list (needs the founder's specification before build):**
Payroll, Complaints & Feedback, Learning Genome, Teacher Copilot, School
Health Auditor, Parent AI, Homework Recovery, Curriculum Gap Detector,
Automation OS, Career Graph, Digital Twin. For each: who uses it, the
inputs it reads, the decision or output it produces, who approves it, and
what a parent or teacher must never see.

## Build order (dependency-first)

1. ~~Subjects + teacher-subject assignment~~ (API done 2026-09-27; office screen still to build).
2. ~~Syllabus progress: "taught today"~~ (done 2026-09-27: API + teacher screen).
3. Pulse compose from syllabus progress → send through the existing gate → reply ingestion into `pulse_response_log` → class/topic signal.
4. Fees: structures → ledger → reminders through the gate → payments → receipts.
5. Exams and marks → Personal Best → at-risk signals.
6. Certificates behind financial clearance or waiver.
7. Admissions early stages, homework, timetable, reports.
