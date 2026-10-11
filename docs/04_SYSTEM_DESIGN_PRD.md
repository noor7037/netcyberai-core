# PHASE 1 — SYSTEM DESIGN & PRODUCT REQUIREMENTS DOCUMENT

**Document ID:** NCA-PRD-P1
**Repo path:** `docs/04_SYSTEM_DESIGN_PRD.md`
**Governs:** the Phase 1 build. `08_EXECUTION_BIBLE.md`'s prompts cite
this document by section for every requirement they implement.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md).
**Supersedes:** the standalone "CTO Recommendation" blueprint (never
committed to this repo — confirmed absent, see `10_DECISION_LOG.md`)
and the `00`–`11` fragments where they conflict. Those remain valid as
reasoning history; this is the operative specification.

**Carries forward, in full:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md),
[`02_AI_BUILDER_INSTRUCTIONS.md`](02_AI_BUILDER_INSTRUCTIONS.md),
[`03_ARCHITECTURE_PLAIN.md`](03_ARCHITECTURE_PLAIN.md),
[`09_ACCEPTANCE_CHECKLIST.md`](09_ACCEPTANCE_CHECKLIST.md),
[`../db/schema.sql`](../db/schema.sql),
[`../db/rls_policies.sql`](../db/rls_policies.sql),
[`../src/lib/recognition.ts`](../src/lib/recognition.ts),
[`archive/00_NetCyberAI_Revised_Understanding.md`](archive/00_NetCyberAI_Revised_Understanding.md),
[`05_BUSINESS_LOGIC.md`](05_BUSINESS_LOGIC.md).
**`12_RECONCILED_PLATFORM_FEATURE_MAP.md`** — cited here as carried
forward in the original version of this document — **is confirmed
absent from this repo.** Its §0 mismatch-resolution log could not be
reconstructed from source; `10_DECISION_LOG.md` is its practical
replacement going forward, built from this consolidation's own
conflict resolution rather than from the missing file.

**Build authorization:** Phase 1 implementation is authorized —
`01_CONSTITUTION.md` §6, Amendment 1 (founder override, 2026-09-16).
This document was written while still gated; the gate lifted after.

---

# SECTION 0 — REVISIONS TO PRIOR ASSUMPTIONS

Four corrections to earlier documents in this pack. Recorded rather
than silently applied.

## 0.1 Market scope — CORRECTED

**Prior framing (wrong):** "The Palwal Test" — a geographic constraint
implying the product targets a semi-urban, low-infrastructure region.

**Why it was wrong:** it conflated an engineering floor with a market
definition. It also mischaracterised the region. Palwal has schools
across the full infrastructure spectrum, and NCR generally is not a
low-capability market. A prospect reading that framing would
reasonably conclude the product is built for schools that can't afford
better — which is both inaccurate and commercially damaging.

**Corrected framing: the FLOOR DEVICE STANDARD.**

The constraint was never geographic. It is a floor: build so the
product works on the worst device and connection in the addressable
market, and it works everywhere above that automatically. A system
that is fast on a ₹7,000 Android on 3G is instantly fast on a ₹70,000
iPhone on fibre. The reverse is not true.

**Addressable market: all of India.** Tier 1 through tier 4, urban and
rural, CBSE/ICSE/State/IB. No tier is excluded, no tier is the primary
target, and no public-facing material describes the product as being
for any particular region's limitations.

**Floor Device Standard (the engineering contract):**

| Dimension | Floor | Implication |
|---|---|---|
| Device | 2GB RAM Android, 720p, budget chipset | No heavy client JS, no large bundles |
| Viewport | 360 px | Every layout works at 360 without horizontal scroll |
| Network | Intermittent 3G, packet loss | Payload budgets, offline queue, retry |
| Input | Touch, gloved or damp hands, outdoors | 44×44 px minimum targets |
| Ambient | Direct sunlight | WCAG AA minimum, AAA for critical states |
| Literacy | Mixed English / Hindi / regional | Hinglish default for parents, language toggle |
| IT support | None on site | Nothing that requires a technician to keep alive |

## 0.2 Device matrix — CORRECTED

**Prior assumption (wrong):** "mobile-only" for all roles.

**Why it was wrong:** it optimised the floor and ignored the ceiling.
Some tasks are genuinely desktop tasks — a 500-row import with error
reconciliation, batch report-card approval, fee reconciliation against
a bank statement, a multi-column analytics review. Forcing those onto
a phone makes the product worse, not more disciplined. Many schools,
particularly tier 1–2, have office desktops and will use them.

**Corrected: every surface is responsive across phone, tablet, and
desktop. Mobile is the floor, not the ceiling.**

| Role | Primary device | Secondary | Design priority |
|---|---|---|---|
| Teacher | Phone | Tablet | Phone-first, absolute. Assume no desktop access at all. |
| Principal | Phone | Desktop, tablet | Phone for decisions and approvals; desktop for analytics depth |
| School admin | Desktop | Phone | Desktop for bulk operations; phone for lookups and approvals |
| Accountant | Desktop | Phone | Desktop for reconciliation; phone for payment confirmation |
| Academic coordinator | Tablet | Desktop, phone | Tablet for timetable and allocation work |
| NetCyberAI staff (Platform 2) | Desktop | Phone | Desktop-first; phone for alerts, incidents, and impersonation audit |
| Parent | WhatsApp | — | No app, no portal, no login in Phase 1 |

**Breakpoint contract:** `360 / 768 / 1024 / 1440`. Every screen is
specified at 360 and at 1440. A layout that only works at one end is
incomplete, not shipped.

## 0.3 ERP substrate — ELEVATED, not merely accepted

**Prior framing:** differentiators are the product; ERP modules are
"substrate."

**Corrected:** that ordering is right for *positioning* and wrong for
*engineering priority*. A school will not adopt a product that sends
delightful WhatsApp messages but cannot produce a fee receipt, mark a
register, or generate a report card. The operational modules are not a
grudging concession — they are the **precondition for the
differentiators to have any data to work with.**

Concretely: Recognition requires marks and attendance. The Pulse
requires syllabus state. The Impact Card requires class attendance and
syllabus completion. Fee recovery requires a fee ledger. **Every
differentiator is downstream of an operational module.** Build order
follows that dependency, not the pitch deck.

Positioning stays: NetCyberAI is not sold as an ERP. Engineering
priority reflects that the ERP layer is load-bearing.

## 0.4 Scanner and QR — NEW SUBSYSTEM

Accepted, with scope decisions recorded in Section 6. Two capabilities
that were absent from every prior document and are correctly added now
rather than retrofitted later, because both have schema implications
from day one.

---

# SECTION 1 — ARCHITECTURAL INVARIANTS & SYSTEM BOUNDARIES

## 1.1 Topology

Next.js 14 App Router **modular monolith**, three isolated route-group
surfaces, one shared design system, one tenant-aware backend.

```
apps/web/
  src/app/
    (public)/        Platform 1 — marketing & acquisition           ->  /
    (admin)/control/ Platform 2 — multi-tenant control plane        ->  /control/...
    (school)/app/    Platform 3 — school operational workspace      ->  /app/...
  src/modules/       domain modules, enforced boundaries
  src/lib/           shared: auth, db, design tokens, site config
```

**Corrected 2026-09-16 (Decision Log C22):** a route group (`(x)`) adds
no URL segment on its own — `(admin)/dashboard/page.tsx` and
`(school)/dashboard/page.tsx` would both resolve to `/dashboard` and
collide. Route groups organise code; the explicit `control/` and
`app/` segments inside them are what actually produce
`01_CONSTITUTION.md` §4's `/control` and `/app` URLs and make the
collision structurally impossible.

**Why modular monolith, not microservices:** the prior blueprint listed
18 services. With a solo or small team, 18 deployables means 18
failure modes, 18 deployment pipelines, and distributed transactions
across a fee ledger. Domain boundaries are enforced in the codebase
(module-level import rules), not by network hops. Extract a service
only when a specific scaling or team-boundary problem demands it.

**Module boundary rule:** a module may import from `lib/` and from its
own directory. Cross-module access goes through a published interface,
never a direct table read. Violations fail the build.

## 1.2 Domain modules

```
identity        tenancy        student         guardian
admission       staff          academic        attendance
exam            fee            compliance      communication
pulse           recognition    impact          capture
integration     reporting      billing         support
audit           monitoring
```

`capture` is new — the scanner/OCR/QR subsystem (Section 6).
`pulse`, `recognition`, `impact` are the differentiator modules and are
deliberately separate from `communication`.

## 1.3 The fourth surface: WhatsApp

WhatsApp is not a notification setting inside Platform 3. It is a
delivery surface with its own economics (per-message billing),
regulatory constraints (template pre-approval, category rules), and
consent obligations. It is specified as a first-class surface in
Section 5.

**Permanent architectural prohibition: WhatsApp Groups.** A group
discloses every parent's phone number to every other parent, has no
consent basis under DPDP, and makes per-child messaging impossible.
All parent communication is 1-on-1.

## 1.4 Exclusions — permanent bans and deferred items

*(Corrected 2026-09-16, Decision Log C23: the original version of this
section put a permanent ban and a commercial deferral in one table,
and one row — Library — contradicted itself by saying "Defer until a
paying school makes it a condition" under a "Permanent exclusions"
heading. Split below into what it actually meant: two different kinds
of "no," with different revisit conditions.)*

### Permanent bans — architectural or ethical, never revisited

| Excluded | Rationale |
|---|---|
| Cafeteria RFID wallets | Card stock, readers, POS terminals, possible prepaid-instrument regulatory exposure. |
| Facial recognition | Biometric processing of children. Regulatory exposure disproportionate to benefit. |
| On-premise hardware / school-side desktop agents | Cannot be kept alive without IT staff. A dead local agent is a silent failure by construction. |
| IoT campus metering | Requires physical meters and a maintained network. |
| Blockchain credentials | A signed PDF with a QR verification endpoint solves this at a fraction of the complexity. |
| Autonomous tool-calling AI agents | Deterministic rule engines and templates do this work correctly, cheaply, and auditably. |
| WhatsApp Groups for parent communication | See §1.3 — no consent basis, discloses every parent's number to every other parent. |

### Deferred — commercial, revisitable under conditions

| Deferred | Rationale |
|---|---|
| Native iOS/Android apps | Storage exhaustion on floor devices; install friction kills parent adoption; two more release pipelines. PWA covers the need for now. |
| Transport / GPS tracking | Hardware, driver devices, telematics contracts, live-location liability. |
| Inventory | Not a trust-gap problem. No pull from target buyers yet. |
| Library | Same. |
| Hostel | Same. |
| Payroll | Salary data adjacent to teacher records; high blast radius, low differentiation. |
| Full LMS | Different product, different buyer, different competitors. |
| Parent / student self-service portals | Parents are served over WhatsApp; a portal nobody logs into is dead weight with a live attack surface (Decision Log C13). Revisitable if adoption data ever demands it. |

**Condition for un-deferring anything in the second table:** a paying
school makes it a contractual condition, **and** it passes the Floor
Device Standard, **and** it does not require hardware the school must
maintain. All three, not any one.

**Clarification on "no AI agents":** this excludes autonomous agents
with tool access. It does **not** exclude deterministic template
generation (Pulse, Weekly Brief), deterministic scoring (Recognition,
at-risk, Impact Card), or bounded inference behind a validation gate
(OCR field extraction). Those are rule engines and are core.

## 1.5 Constitutional invariants

Non-negotiable across every module.

1. Every operational table carries `school_id`, enforced by RLS.
2. No dummy data outside the allowlisted demo fixture.
3. No fabricated claims — no statistic without a traceable source.
4. Zero silent failures — every block, drop, or degradation is logged
   with a reason.
5. No public teacher leaderboard.
6. No student ranking as the default recognition mechanism.
7. No per-parent engagement score visible to staff.
8. Consent precedes processing of a child's data.
9. Financial records are never physically deleted.
10. Published results are never silently changed.

---

# SECTION 2 — MULTI-TENANCY & IDENTITY

## 2.1 Tenant isolation

Shared PostgreSQL, Row-Level Security, `school_id` on every
operational table.

**Canonical column name: `school_id`.** Any prior document saying
`tenant_id` refers to this column. One name, everywhere.

Per-request session context, set at the start of **every transaction**
(not once per connection — a pooler in transaction mode will otherwise
silently lose it, which manifests as RLS hiding all rows):

```sql
select set_config('app.current_tenant_id', $1, true);
select set_config('app.current_role',      $2, true);
select set_config('app.current_user_id',   $3, true);
```

Three database roles: `nca_super` (BYPASSRLS, NetCyberAI staff only),
`app_user` (NOBYPASSRLS, all application traffic), `audit_writer`
(INSERT-only on `audit_log`).

## 2.2 Identity model

```
User → Membership → School → Role → PermissionSet
```

A user may hold memberships in multiple schools (a teacher at two
branches, an account manager across tenants). Role is per-membership,
never global — except `super_admin`, which is platform-scoped.

**Phase 1 roles:** `super_admin` · `school_admin` · `principal` ·
`teacher` · `accountant` · `academic_coordinator` · `parent` (no
login — served over WhatsApp, per §1.4).

**Not in Phase 1 (Decision Log C24):** `student` stays in the
`user_role` enum for Phase 2, but no student login and no
student-facing surface ships in Phase 1. This corrects a
self-contradiction in the original version of this section, which
listed a student role here while §1.4 deferred student portals
entirely — there was nothing for a Phase 1 student to log into.

**Authorization is enforced server-side on every request.** UI
visibility is a convenience, never a control. A hidden-but-reachable
endpoint is an open endpoint.

## 2.3 Session & security

- Access token 15 min; refresh token rotating, httpOnly, revocable
- `users.token_version` — increment to invalidate every issued token
  for that user immediately
- MFA mandatory for `super_admin`, configurable per school for
  `principal` and `school_admin`
- Password reset, email verification, phone OTP
- **Impersonation:** time-boxed, reason recorded before access is
  granted, written to `audit_log` as `ImpersonationStarted` /
  `ImpersonationEnded`, and **visible to the impersonated school**.
  Support access that the customer cannot see is not support, it is
  surveillance.

---

# SECTION 3 — DOMAIN STATE MACHINES

## 3.1 Admissions

```
Enquiry → Application → Document Verification
  → Interview / Assessment → Offer → Confirmation
  → Enrolled (student master created, status='pending_consent')
```

Every transition records actor, timestamp, and reason. Enrolment
creates the student record in `pending_consent`, never `active`.

**Scanner integration:** document verification uses the capture
subsystem (Section 6) — scan the birth certificate or prior TC, OCR
pre-fills the application, a human confirms before commit.

## 3.2 Attendance

```
Capture (teacher, or QR secondary mode)
  → Same-day correction window (10 min, no note required)
  → Correction with mandatory audit note
  → Period Lock (immutable)
  → Anomaly detection (threshold breach)
  → Consent + eligibility gate
  → 1-on-1 WhatsApp dispatch
```

Rules: attendance is never edited without audit history · corrections
require permission · historical attendance is immutable after period
lock · absence notification passes the single send gate (consent,
opt-out, quiet hours, budget) before dispatch.

**Primary capture mode: present-all, tap absentees.** Roughly ten
seconds for a class of forty. This is the fastest method available and
is not replaced by QR — see Section 6.3.

## 3.3 Fees

Double-entry discipline. Blueprint sub-tabs accepted in full, plus the
`05_BUSINESS_LOGIC.md` §2 schema (`fee_heads`, `fee_structures`,
`fee_structure_items`, `fee_concessions`, `payments`).

**Financial controls:**
- No physical deletion of a successful payment, ever
- Corrections are reversals or adjustment entries, never edits
- Receipt identifiers are immutable
- Refunds require explicit authorization, recorded
- `fees_ledger.status` is **derived** from `sum(payments)` against
  `amount_paise` — never set directly. A fee is never marked paid
  because a payment page opened or a gateway order was created.
- Sibling concessions derive only from explicit `parent_student_map`
  links. Never surname or address matching — a wrongly applied
  discount is a money error, and money errors destroy trust faster
  than any other bug class.

**Gateway webhook idempotency:**
```
receive webhook
  → verify HMAC signature
  → compute payload_hash
  → INSERT ... ON CONFLICT (payload_hash) DO NOTHING
  → if inserted: process
  → if conflict: return 200, do not re-process
```

**Form 6 advisory (`05_BUSINESS_LOGIC.md` §3):** CPI + 5% cap,
salary-linked alternative formula acknowledged, advisory only and
never blocking, mute permitted and audited, CPI read from
`compliance_config` and never hardcoded. Advisory state:
`within_advisory` / `above_advisory` / `unknown`. When CPI is
unconfigured the state is `unknown` and the system says so rather than
guessing a number.

**The filing deadline is configuration too, not just the CPI figure**
(Decision Log C18). Haryana has extended the standing 1 February
deadline in practice in multiple past years — treating any single date
as a constant would be exactly the unverified-number failure this
project's anti-fabrication rule exists to prevent.
`compliance_config.filing_deadline` and `.filing_deadline_source` carry
this the same way `.cpi_percent` and `.cpi_source` do. Deadline state:
`before_deadline` / `past_deadline` / `unknown` when unconfigured.

## 3.4 Examinations

```
Draft Schedule → Marks Entry → Verification
  → Principal Approval → Report Card Batch Generation → Published
```

Published results are read-only. A correction creates a new version
with audit trail and an explicit re-publication event. Never a silent
edit.

## 3.5 Consent (DPDP)

```
Not Required → Pending → Requested → Verified Guardian
  → Active → Withdrawn → Expired / Tombstoned
```

**Purpose set, restructured (Decision Log C20)** — the original set
below covered `core_records`, `daily_pulse`, `recognition`, and
`weekly_brief`, but nothing covered absence alerts, fee notices, class
notices, or at-risk messages, which every other section of this
document assumes pass through the consent gate. Restructured to a
DPDP-defensible split:

| Purpose | Covers | Default |
|---|---|---|
| `core_records` | Holding the student record itself | Required for service |
| `operational_communication` | Fee notices, receipts, absence alerts, certificates, school/class notices | Required for service — necessary to deliver what the school contracted |
| `daily_pulse` | Pulse + comprehension prompt | Opt-in, off |
| `recognition` | Recognition messages | Opt-in, off |
| `weekly_brief` | Weekly Confidence Brief | Opt-in, off |
| `at_risk` | Parent-facing at-risk alerts | Opt-in, off, **plus** `schools.at_risk_parent_dispatch_enabled` (§4.5) — both required |

Each purpose independently withdrawable. Verification method recorded
(`dob_on_record`, `school_attested`, `digilocker_token`,
`otp_plus_attestation`).

`consent_ledger` is append-only. Withdrawal is a new row, never a
mutation.

**The student's status follows the ledger (C142).** A student leaves
`pending_consent` and becomes `active` in the same transaction as the
grant that completes the two required purposes (`core_records` and
`operational_communication`), each granted by a verified guardian.
Withdrawing either required purpose returns an `active` student to
`pending_consent`; granting it again restores `active`. Only that
withdrawal moves a student back: one who was made `active` before this
rule, with no consent on record, stays `active`. Every move
writes an audit row (`student.activated`,
`student.returned_to_pending_consent`). `inactive` and `transferred`
are the office's decisions and are never moved by consent. The database
enforces it: only the principal or school admin changes a status, and
none becomes `active` without the required consents
(`student_required_consents_granted`, trigger
`students_status_follows_consent`).

**No outbound message and no recognition scoring touches a student in
`pending_consent`.** This is enforced in the send gate and in the
recognition job, not by convention.

## 3.6 Communication & Pulse

```
Draft → Audience resolution → Consent check
  → Template validation (Meta rules, char limits)
  → Approval if required → Budget check → Quiet hours
  → Rate limit → Queue → Dispatch → Delivery webhook → Audit
```

**One send gate for the entire system.** Human-composed messages, the
Pulse, fee reminders, recognition, at-risk alerts, TC delivery — all
pass through the same function. It is the only module holding the
provider token. Every failure writes a `communication_log` row with
the blocking reason (`blocked_pilot`, `blocked_consent`,
`blocked_budget`, `blocked_quiet_hours`, `blocked_no_template`) and
returns without sending.

---

# SECTION 4 — THE DIFFERENTIATORS

These are the product. Everything in Section 3 exists so these have
data to operate on.

## 4.1 Daily Learning Pulse

**Trigger:** teacher marks syllabus state for a period.

**Invariants:**
- A topic flagged `not_taught` generates **no Pulse and no
  comprehension prompt**. Asking a parent whether their child
  understood a lesson that did not happen destroys trust in one
  message.
- `delayed` and `partial` states are reflected in the message text.
  The Pulse never claims a topic was taught when it wasn't.
- Exception-based: if nothing noteworthy occurred, no message. The
  Pulse is not a daily obligation to fill.

**Generation:** deterministic Hinglish template. The template *is* the
send-time validation the Constitution requires for factual assertions
reaching parents. LLM narrative stays behind `ENABLE_LLM_NARRATIVE`,
default off, introduced first for the Weekly Brief where a template
reads mechanical.

**Comprehension loop:** 3-tier reply buttons, within Meta's character
limit:

| Tier | Label | Chars |
|---|---|---|
| 1 | `Samajh nahi aaya` | 16 |
| 2 | `Thoda samjha` | 12 |
| 3 | `Achhe se samjha` | 15 |

**Constitutional constraint:** responses are a **learning signal about
the child**, routed to the teacher as per-topic comprehension data.
There is no per-parent engagement score visible to any staff member.
Aggregate school-level response rate is the North Star metric. Per-parent
attribution as a score is banned — it would penalise night-shift
workers, single parents, non-literate parents, and shared-phone
households, which is to say exactly the families the product most
needs to reach.

## 4.2 Weekly Confidence Brief

Sunday evening. Aggregates the week: attendance, marks, homework,
recognition. Produces a short narrative plus three dinner-table
questions. First candidate for LLM narrative generation, behind the
flag, after the validation gate exists.

## 4.3 Recognition Engine

**Personal Best (primary, non-competitive).** Any student improving
beyond a 5-point noise floor on any tracked axis against their own
prior-fortnight baseline. No ranking. Every qualifying parent receives
a message. This is the mechanism that reaches a broad share of
parents — a ranking formula structurally cannot, because ranking is
zero-sum.

**Most Improved (competitive, banded).** Logit-delta —
`logit(new/100) − logit(old/100)` — symmetric at both ends of the
scale, within **baseline quartile bands**. One winner per class per
band. A student who started at 40% competes against peers who started
near 40%.

The Constitution v1.0 formula `(new−old)/(100−old)` is **provably
inverted** for its stated purpose: 85→90 scores 33.3%, 40→55 scores
25.0%. It rewards the already-strongest student and degenerates toward
infinity as the baseline approaches the ceiling. It is banned. Do not
resurrect it. Reference implementation and tests:
[`../src/lib/recognition.ts`](../src/lib/recognition.ts) — values there are documented defaults, not constants (Amendment 1).

**Class Shine (tertiary, opt-in, default OFF).** Top-3 per class,
framed as "students who shone," never "Rank 1/2/3." The principal must
actively enable it.

**Consistency Badge.** Portal-only, no WhatsApp dispatch.

**Guards on competitive tiers:** minimum 2 assessments in both
windows, minimum score movement above noise, exclusion of students
below 60% attendance in the window (their delta is an absence artefact).

**Fairness audit** is a shipped surface, not a principle: what share
of students received at least one Personal Best this cycle? If it
collapsed to a top few, the thresholds are wrong.

## 4.4 Teacher Impact Card

**Visibility:** the teacher themselves, plus `principal` /
`school_admin`. Never teacher-to-teacher. Never parent-visible. Never
ranked publicly. Enforced at RLS, not in the UI.

**Permitted inputs:** class attendance during their periods · syllabus
completion vs plan · parent feedback average · at-risk students
improved under their instruction.

**Banned inputs:** staff punctuality, leave taken, login frequency,
hours in app. These convert a growth instrument into a surveillance
instrument, which Constitution §1 prohibits by name.

**Parent feedback rate limit:** one submission per parent per teacher
per month, enforced by a unique constraint on
`(school_id, parent_id, teacher_id, month)` — structural, not
application logic. This is what prevents the channel becoming a
complaint dump.

## 4.5 At-Risk Detection

Triggers (configurable): attendance below 75% over a rolling 30 days,
**or** last 2 assessments in a subject below 40%.

**Three audiences, three tones, one fact set:**

| Audience | Framing | Granularity |
|---|---|---|
| Principal | Risk, aggregate | "6 students in Class 8 crossed the threshold this week" |
| Teacher | Actionable, per student, one next step | "Aarav: 68% attendance. Suggested: counsellor follow-up" |
| Parent | Supportive, specific, non-comparative | "We noticed Aarav has missed a few days. Can the school help?" |

**Parent message prohibitions:** no class average, no rank, no
comparison to any other student, no language implying fault.

**DPDP sequencing:** an at-risk detector is behavioural monitoring of a
child. It may compute and surface to **staff** (legitimate educational
role) before it may **dispatch to parents**.
`schools.at_risk_parent_dispatch_enabled` defaults to `false` and
stays off until the consent basis is confirmed.

---

# SECTION 5 — WHATSAPP DELIVERY SURFACE

## 5.1 Economics

Per-message billing, category-dependent, subject to change by Meta.
Every rate shown anywhere carries its verification date.

Illustrative, at the rate referenced in Constitution §7
(₹0.1150 + 18% GST ≈ ₹0.1357 — **re-verify before this informs any
pricing decision**):

- 500 students × 22 school days ≈ 11,000 messages/month ≈ **₹1,493**
- 2,000 students ≈ 44,000 messages/month ≈ **₹5,970**

This is a per-school variable operating cost that scales with student
count. It must be priced into plans before the feature is sold.

## 5.2 Cost governor

```
on send request:
  if projected_spend + cost > school.monthly_budget_paise:
      if priority == 'transactional':      # receipt, OTP, TC,
                                            # first-absence-alert-of-day
          send; log budget_exceeded_transactional
      elif message_type == 'daily_pulse':
          queue for the weekly consolidated send (see below)
          log blocked_budget
      else:                                 # recognition, brief
          hold until budget resets; surface to staff in Platform 3
          log blocked_budget
  if projected_spend > 0.8 * budget:
      alert principal (once per threshold crossing)
```

Alert before the cap, not after.

**Transactional class, final (Decision Log C19):** receipt · OTP ·
certificate delivery · **the first absence alert per student per day**
only. A parent not knowing their child failed to arrive at school is a
child-safety matter and always sends. Follow-up or repeated-pattern
absence notifications are not transactional and are subject to the
governor like any other non-critical message — an unbounded
transactional class scaling with absence rate would be a budget hole.

**Budget-breach fallback, corrected (Decision Log C13) — there is no
parent portal to degrade to** (§1.4, §2.2: parents have no login in
Phase 1). The original "degrade to portal-only" fallback is redefined:
- **Pulse** queues and batches — hold the day's messages, send one
  consolidated weekly message instead of daily. One message instead of
  five, not zero.
- **Recognition** holds until the budget resets, and is surfaced to
  **staff** in Platform 3 so the school can recognise the student in
  person (assembly, notice board) instead of the signal disappearing.
- **Consistency Badge** (`01_CONSTITUTION.md` §5) was already
  portal-only with no parent dispatch; it becomes staff-visible in
  Platform 3 and folded into the Weekly Confidence Brief text — no
  separate message, no additional cost.

`communication_log` records `billing_category`,
`inside_service_window`, `billable`, `est_cost_paise`, `gst_paise` on
every row. Cost is observable per school, per template, per month from
day one — not reconstructed from a Meta invoice later.

## 5.3 Template governance

Every template registered, categorised (utility / marketing /
authentication / service), validated against Meta's character and
formatting rules before submission, and tracked through approval
status. A message with no approved template is blocked as
`blocked_no_template`, never silently dropped.

---

# SECTION 6 — CAPTURE SUBSYSTEM (SCANNER, OCR, QR)

New in this document. Two distinct capabilities, specified together
because they share the `capture` module and both have schema
implications from day one.

## 6.1 Document scan & OCR autofill

**Purpose:** eliminate manual typing during admission, student record
creation, and document verification. Tap "Upload document" → choose
camera or gallery → capture → OCR extracts fields → **form pre-fills**
→ human confirms → commit, with the source image attached.

**Flow:**
```
Capture (camera / gallery)
  → Client-side compress (target ≤ 500 KB, floor-device friendly)
  → Upload to object storage, scoped /{school_id}/documents/
  → OCR extraction → structured candidate fields + per-field confidence
  → PRE-FILL A FORM (never a direct write)
  → Human reviews, corrects, confirms
  → Commit to canonical record + link source document
  → Audit event
```

**Hard constraint — OCR never writes directly to a student master
record.** It pre-fills a form a human confirms. OCR on Indian school
documents — handwritten admission forms, faded photocopies, regional
scripts, varied state TC formats — is good enough to save typing and
not good enough to trust unattended. A silently wrong admission number
or date of birth is a data-integrity bug with a very long tail.

**Field confidence is surfaced.** Low-confidence fields are visually
flagged so the human's attention goes where it is needed rather than
being spread evenly across a pre-filled form. A form that looks
complete gets skimmed; a form with three flagged fields gets read.

**Supported document types (Phase 1):** birth certificate · previous
school TC · previous report card · address proof · guardian ID
(restricted, see below) · student photograph · caste/category
certificate · medical record.

**AADHAAR CONSTRAINT — non-negotiable.**

Do **not** store full Aadhaar images or full Aadhaar numbers. Store:
- last 4 digits (`aadhaar_last4`)
- name-match result (boolean + method)
- verification timestamp and method

Rationale: a database holding full Aadhaar scans across hundreds of
schools is a serious liability, a breach magnet, and disproportionate
to the operational need — which is identity confirmation, not identity
storage. UIDAI guidance and general data-minimisation principles both
point the same way. The capture flow may *read* an Aadhaar to
extract last-4 and perform a name match, then must discard the image.

**Storage:** `/{school_id}/documents/{student_id}/{doc_type}/{uuid}`,
RLS-equivalent access rules on the bucket, signed time-limited URLs,
never public. Retention follows the school's configured policy and the
DPDP deletion workflow.

**OCR provider:** `[GAP]` — to be selected. Evaluation criteria:
Devanagari and regional script accuracy, handwriting tolerance,
per-page cost at volume, data residency (must not egress India for
children's documents), and whether it can run on-demand rather than
requiring a persistent service.

## 6.2 QR on student ID cards

**Purpose:** instant, authenticated access to a student record by
scanning their ID card with any phone. No typing, no search, no
admission-number recall.

**SECURITY INVARIANT — the QR encodes an opaque random token, never
PII.**

```
QR payload:  nca:s:{random_token}          # 128-bit, unguessable
NOT:         name, admission no, class, phone, DOB, school name
```

Rationale: an ID card is lost in a market, a bus, a playground. If the
QR encodes identifying data, any stranger with a phone reads a child's
name, school, class, and guardian contact. That is a child-safety
problem before it is a data-protection problem. With an opaque token,
a stranger scanning gets a string that resolves to nothing without an
authenticated, authorized session.

**Resolution flow:**
```
Scan → token → server lookup
  → verify scanner is authenticated
  → verify scanner's school_id matches the token's school_id
  → verify scanner's role permits viewing this student
      (teacher: own classes only · principal/admin: whole school)
  → return scoped student view
  → log the scan (who, when, which student, from where)
```

Every scan is logged. A record of who looked up which child, and when,
is both an audit requirement and a safeguarding one.

**Token lifecycle:** rotatable. If a card is lost, reissue the card
with a new token and revoke the old one — the lost card becomes inert.
Tokens are per-student, not per-card-print, unless revoked.

**Card printing:** generated from the school's student data, QR plus
whatever visual identity the school wants. This is a real convenience —
schools already print ID cards, and generating them from canonical data
removes a manual step.

## 6.3 QR attendance — scope decision

Your proposal contained two modes. They are not equally good, and
they need separating.

### Mode A — teacher scans each student's card. REJECTED as the primary method.

**Reasoning, not preference:** the existing method is present-all-plus-
tap-absentees, which takes roughly ten seconds for a class of forty.
Scanning forty QR codes individually — focus, read, confirm, next —
takes two to four minutes per period, per day. Fifteen to twenty times
slower than what already exists, for the same output.

Teachers abandon slower tools. The register stops being marked, or
gets marked from memory at the end of the day, and attendance data
quality collapses — which then poisons the at-risk detector, the
Impact Card, and Recognition's attendance axis. A change that degrades
the most-used input in the system fails regardless of how modern it
feels.

### Mode B — fixed scanner / gate-based capture. ACCEPTED as a secondary mode.

**Why this isn't the RFID ban in disguise, and the distinction is
real:** RFID requires card stock, dedicated readers, and an issuance
pipeline — hardware a school must buy, install, and maintain. QR
requires printed ID cards schools already produce and any Android
phone or cheap tablet already on site. The cost and maintenance
profile is fundamentally different. The ban was about hardware
dependency, not about the concept of scanning.

**Known failure mode — proxy scanning.** One student scans five
friends' cards at the gate. Unsupervised QR gate attendance is
self-reported attendance wearing a uniform. Mitigations, in order of
strength: staff supervision at the scan point · scan-rate anomaly
detection (five scans in four seconds from one device flags) ·
photo-on-scan for spot verification · reconciliation against
classroom register, with divergence surfaced to the principal.

**Do not present gate attendance as equivalent to classroom
attendance.** They are different records with different reliability.
Schema distinguishes them (`capture_method`), reports distinguish
them, and the principal sees both.

### Where QR attendance is genuinely superior — ACCEPTED

- **Exam hall verification** — confirming the right candidate is at the
  right desk. Scan-per-student is appropriate because verification is
  the point and the volume is per-exam, not per-period.
- **Trip and event check-in** — headcount on a bus, at a venue,
  returning. High-stakes, low-frequency, and manual counting is
  genuinely error-prone here.
- **Library / lab access** — where a school wants a log.
- **Gate entry** — where a school wants it and supervises it.

### Summary

| Use case | Method | Status |
|---|---|---|
| Daily classroom attendance | Present-all, tap absent | **Primary, unchanged** |
| Gate entry | QR, fixed scanner | Secondary, supervised, flagged as distinct record |
| Exam hall verification | QR, per student | Accepted |
| Trip / event check-in | QR, per student | Accepted |
| Student lookup | QR scan → profile | **Accepted, ship it** |

QR-scan-to-open-student-profile is excellent independent of
attendance and should ship regardless of what a school does with gate
scanning.

## 6.4 Capture schema

```sql
create table student_qr_tokens (
  token_id     uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  student_id   uuid not null references students(student_id),
  token        text not null unique,          -- 128-bit random, opaque
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   uuid references users(user_id),
  revoke_reason text
);
create index idx_qr_school_student on student_qr_tokens(school_id, student_id);
create unique index idx_qr_active on student_qr_tokens(token) where revoked_at is null;

create table qr_scan_log (
  scan_id      uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  token_id     uuid references student_qr_tokens(token_id),
  student_id   uuid references students(student_id),
  scanned_by   uuid not null references users(user_id),
  purpose      text not null check (purpose in
                 ('lookup','gate_entry','exam_verify','event_checkin','library','lab')),
  result       text not null check (result in
                 ('resolved','revoked_token','unknown_token','unauthorized','cross_tenant_denied')),
  device_hint  text,
  scanned_at   timestamptz not null default now()
);
create index idx_scan_school_time on qr_scan_log(school_id, scanned_at desc);
create index idx_scan_student on qr_scan_log(school_id, student_id, scanned_at desc);

create table captured_documents (
  document_id   uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  student_id    uuid references students(student_id),
  staff_id      uuid references users(user_id),
  doc_type      text not null,
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  ocr_status    text not null default 'pending'
                  check (ocr_status in ('pending','processing','done','failed','skipped')),
  ocr_confidence numeric,
  uploaded_by   uuid not null references users(user_id),
  uploaded_at   timestamptz not null default now(),
  verified_by   uuid references users(user_id),
  verified_at   timestamptz,
  retention_until date
);
create index idx_docs_school_student on captured_documents(school_id, student_id);

create table ocr_extractions (
  extraction_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  document_id   uuid not null references captured_documents(document_id),
  field_name    text not null,
  extracted_value text,
  confidence    numeric,
  accepted      boolean,                      -- did the human keep it?
  corrected_value text,                        -- what they changed it to
  reviewed_by   uuid references users(user_id),
  reviewed_at   timestamptz
);
create index idx_ocr_school_doc on ocr_extractions(school_id, document_id);
```

Attendance gains a capture-method discriminator:

```sql
alter table attendance
  add column capture_method text not null default 'manual'
    check (capture_method in ('manual','qr_gate','qr_exam','qr_event','import'));
```

`ocr_extractions.accepted` and `corrected_value` are deliberate: they
build a correction dataset showing which fields OCR gets wrong, which
tells you where to improve or where to stop offering extraction
entirely.

---

# SECTION 7 — INFORMATION ARCHITECTURE

## 7.1 Platform 1 — Public website

**Navigation:** Home · Solutions · Features · Pricing · Resources ·
About · Contact · Login · Get Started · Book a Demo

**Features menu — differentiators lead, substrate supports:**

*Differentiators:* Daily Learning Pulse · Weekly Confidence Brief ·
Student Recognition (Personal Best) · Teacher Impact Card · Form 6 fee
advisory · **Scan & autofill** · **QR student ID**

*Operational:* Student information · Admissions · Attendance · Fees ·
Exams & report cards · Communication · Reports & exports · Compliance
(DPDP) · Integrations

**Solutions:** For principals · school administrators · finance teams ·
academic coordinators · multi-school groups. Each: problem → workflow
→ solution → outcome → CTA. No numeric outcome claims until a real
consented case study exists.

**Pricing:** plan comparison · student-count calculator · feature
limits · implementation cost · **messaging cost disclosure** · pilot
plan · quote CTA.

**Resources:** documentation · FAQs · case studies (empty until real) ·
implementation guide · privacy & compliance · **Form 6 filing guide** ·
support.

**Do not build:** public analytics dashboard · public school data ·
parent/teacher registration · public student profiles · full CRM ·
self-service provisioning · **live-KPI dashboard simulation** (a fake
dashboard with fake numbers is a fabricated claim in animated form).

## 7.2 Platform 2 — Admin control plane

**Navigation:** Dashboard · Schools · Users · Onboarding ·
**Messaging & Cost** · Monitoring · Analytics · Billing & Plans ·
Compliance · Integrations · Support · Audit Logs · System Settings

**Dashboard KPIs** carry a role discriminator rendered differently:
`north_star` (Pulse open rate) · `sell_metric` (fee collection %,
visually de-emphasised) · `secondary` (everything else). This is
Constitution §3 implemented in the UI rather than left as a principle.

Plus: total/active/trial/suspended schools · students · users · MRR ·
outstanding invoices · message volume & failure rate · sync failure
rate · consent completion · open tickets · active incidents ·
**messaging spend vs budget** · **schools over budget**.

**School detail — 21 sub-tabs:** (corrected from "19" — see Decision
Log C36; the list below always had 21 entries)
Overview · Profile · Users · Students · Staff · Admissions ·
Academics · Attendance · Exams · Fees · Communication ·
**Pulse & Engagement** · **Recognition** · **Teacher Impact** ·
**Capture & Documents** · Compliance · Integrations · Usage ·
Billing · Reports · Audit

**Capture & Documents** (new): document volume and storage · OCR
accuracy by field and doc type · QR tokens issued / revoked · scan log
· anomaly flags (rapid-scan patterns).

**Messaging & Cost** (top-level): spend overview · budget caps ·
degradation events · template registry · rate configuration with
verification dates · free-tier tracking · delivery health.

**Onboarding workflow — with the consent gate:**
```
Lead → Approved → Tenant Created → School Admin Invited
  → Data Imported (students → pending_consent)
  → Data Validated
  → CONSENT COLLECTION          ← gate, not a checkbox
  → Configuration
  → Training
  → Pilot Outbound Approved by Principal
  → Go-Live
```

Consent completion meter on the onboarding screen, with an explicit
warning against staff bulk-marking consent to clear it — that creates
worse exposure than no record at all.

**Monitoring** additions: Pulse dispatch health · template approval
status · webhook DLQ depth · **blocked-send counts by reason** ·
**QR scan anomalies** · **OCR failure rate**.

## 7.3 Platform 3 — School workspace

### Role shells

| Shell | Roles | Primary device |
|---|---|---|
| Office | principal, school_admin | Phone for decisions, desktop for depth |
| Finance | accountant | Desktop primary |
| Academic | academic_coordinator | Tablet primary |
| **Teacher** | teacher | **Phone. Assume no desktop, ever.** |

### Office navigation
Dashboard · Students · Admissions · Staff · Attendance · Academics ·
Exams · Fees · Communication · **Pulse** · **Recognition** ·
**Teacher Impact** · **Documents & ID Cards** · Reports · Compliance ·
Settings

### Teacher navigation — maximum 6 items, phone-first
**My Day** · **Attendance** · **Syllabus** · **Marks** ·
**My Impact** · **Class Notices**

Plus a persistent **scan** action in the app bar — opens the camera,
resolves a student QR to their profile. Available from anywhere.

- **My Day** — today's periods in order. Each row: class, subject, two
  taps (attendance, syllabus state). Nothing else above the fold.
- **Attendance** — present-all default, tap to mark absent. 10-minute
  undo, audit note required after.
- **Syllabus** — planned topic pre-filled. Four buttons:
  `Taught` / `Delayed` / `Partial` / `Not taught`. **This single tap
  is the most important control in the product** — it triggers the
  Pulse and prevents the Pulse from ever claiming a topic was taught
  when it wasn't.
- **Marks** — exam → class → subject → grid, autosave.
- **My Impact** — own Impact Card, self-view, framed as growth. No
  rank, no comparison to colleagues.
- **Class Notices** — compose to own class parents, rate-limited,
  consent-checked, through the single send gate.

### Office dashboard — exception-first

A KPI grid is a desktop layout; on a phone a principal scrolls past
it. Ordered:

1. **Needs your decision today** — approvals, TC requests, correction
   requests, marks awaiting approval, fee waivers. Top of screen.
2. **Today** — attendance %, staff present, absentees not yet
   communicated.
3. **This week** — fee collection, Pulse open rate, new admissions.
4. **Warnings** — consent pending, message budget state, Form 6
   advisory, at-risk count.
5. **Analytics** — one tap down.

On desktop (≥1024px) the same content expands to multi-column with
charts inline. Same information architecture, different density.

### Module sub-tabs

**Students:** All · Active · New admissions · Pending documents ·
Class-wise · Section-wise · At-risk · Fee defaulters · Attendance
concerns · **Consent pending** · Inactive
*Profile tabs:* Profile · Guardians · Enrollment · Attendance ·
Academics · Exams · Fees · **Documents** · Communication · Consent ·
**Recognition** · **Pulse responses (per-topic)** · **ID card & QR** ·
Activity

**Attendance:** Today · Student · Staff · Class-wise · Absence list ·
Late arrivals · Leave · Corrections · **Capture method breakdown** ·
**Absence communication log** · Analytics · Settings

**Academics:** Sessions · Terms · Classes · Sections · Subjects ·
Curriculum · Syllabus · **Syllabus exceptions** · Homework ·
Assignments · Teacher allocation · Calendar

**Exams:** Types · Schedule · Subjects · Marks entry · Verification ·
Approval · Grading · Report cards · Published · **QR hall
verification** · Analytics

**Fees:** Dashboard · Heads · Structures · Installments · Assignments ·
Invoices · Payments · Receipts · Outstanding · Defaulters ·
Concessions · Scholarships · Refunds · Reconciliation ·
**Form 6 advisory** · Reports · Settings

**Communication** (human-initiated only): Dashboard · Compose ·
Templates · Audiences · Scheduled · Sent · Failed · Replies ·
Approvals · Analytics · **Cost & budget** · Channel settings

**Pulse:** Today's Pulse · History · Exception states · Response
signal · Templates · Settings

**Recognition:** Current fortnight · Personal Best · Most Improved
(banded) · Consistency badges · Class Shine · Assembly invitations ·
**Fairness audit** · Settings

**Teacher Impact:** Impact metrics · Parent feedback (rate-limited) ·
Visibility audit

**Documents & ID Cards** (new): Document library · Pending
verification · OCR review queue · **ID card generation** · **QR token
management** · Scan log · Retention

**Compliance:** Consent dashboard · Pending · Granted · Withdrawn ·
Guardian verification · Data access requests · Correction requests ·
Deletion requests · Retention · **Form 6 advisory** · Incidents ·
Reports

**Settings:** School profile · Branding · Academic session · Classes ·
Roles · Permissions · Attendance settings · Fee settings · Exam
settings · Communication settings · **Pulse settings** ·
**Recognition settings** · **Message budget & quiet hours** ·
**Capture & QR settings** · Consent settings · Integrations ·
Security · Audit logs

---

# SECTION 8 — PLAN & PRICING MAP

Plans gate modules via `plan_modules` feature flags, enforced at the
API authorization layer — never merely hidden in the UI, since a
hidden-but-reachable endpoint is an open endpoint.

## 8.1 Tiers

| | **Starter** | **Growth** | **Campus** | **Enterprise** |
|---|---|---|---|---|
| **Target** | Small schools, first digitisation | The core product | Established schools wanting full ops | Multi-branch groups |
| **Students** | up to 300 | up to 1,000 | up to 3,000 | unlimited |
| Student information | ✓ | ✓ | ✓ | ✓ |
| Attendance | ✓ | ✓ | ✓ | ✓ |
| Fees & receipts | ✓ | ✓ | ✓ | ✓ |
| Communication (manual) | ✓ | ✓ | ✓ | ✓ |
| Reports & export | ✓ | ✓ | ✓ | ✓ |
| DPDP consent | ✓ | ✓ | ✓ | ✓ |
| Admissions pipeline | — | ✓ | ✓ | ✓ |
| Exams & report cards | — | ✓ | ✓ | ✓ |
| **Daily Learning Pulse** | — | **✓** | ✓ | ✓ |
| **Recognition Engine** | — | **✓** | ✓ | ✓ |
| **Weekly Confidence Brief** | — | — | ✓ | ✓ |
| **Teacher Impact Card** | — | — | ✓ | ✓ |
| At-risk detection | — | — | ✓ | ✓ |
| **Scan & OCR autofill** | — | ✓ | ✓ | ✓ |
| **QR ID cards & lookup** | — | ✓ | ✓ | ✓ |
| QR secondary attendance | — | — | ✓ | ✓ |
| **Form 6 fee advisory** | — | — | ✓ | ✓ |
| Academic module | — | — | ✓ | ✓ |
| Staff & leave | — | — | ✓ | ✓ |
| Multi-branch | — | — | — | ✓ |
| API access | — | — | ✓ | ✓ |
| Message quota / month | 2,000 | 12,000 | 40,000 | negotiated |
| Support | Email | Email + WhatsApp | Priority | Dedicated AM |

## 8.2 Packaging rationale

**Growth is the product.** Starter exists as an on-ramp for a school
that wants to digitise records before committing; it deliberately
excludes the Pulse and Recognition, because those are what Growth is
for. Do not let Starter accumulate features — a Starter that does
everything removes the reason to upgrade.

**Pulse and Recognition are the Growth boundary.** They are the
differentiators, they carry per-message cost, and they are what a
principal is actually buying. Placing them at Growth makes the upgrade
conversation about the product rather than about a student-count
threshold.

**Scan & OCR sits at Growth, not Campus.** It reduces onboarding
friction, which increases the chance a Growth school successfully
completes setup. Gating it higher would be optimising revenue against
adoption.

**Form 6 advisory sits at Campus.** It is genuinely valuable and
genuinely narrow — it applies to Haryana schools, and a school large
enough to worry about fee-hike scrutiny is a Campus-sized school. As
other state compliance modules are added, they join the same tier.

**QR secondary attendance at Campus** because gate scanning implies a
scale and staffing level that smaller schools do not have.

## 8.3 Messaging cost

Message quota is included in the plan. Overage is billed at cost plus
a stated margin, disclosed on `/pricing`, with the current rate and
its verification date shown.

Every school has `monthly_budget_paise`. On breach the cost governor
degrades non-transactional messages and alerts the principal at 80%.
**A school is never silently billed past its cap, and never silently
stops receiving messages** — one of the two happens, visibly, by
policy.

## 8.4 Pilot mode

Orthogonal to plan tier. A pilot school has `is_pilot = true` and
`pilot_allow_outbound = false`. Every outbound send is blocked and
logged as `blocked_pilot` until the principal explicitly approves
templates and enables outbound. This is a trust mechanism: the school
sees exactly what would have been sent before anything reaches a
parent.

---

# SECTION 9 — BUILD SEQUENCE

Sequenced by dependency, not by pitch order. Each stage produces
something verifiable, and each is a genuine stopping point.

## Stage 0 — Public website (Phase 0)
**Status:** shipped. See [`09_ACCEPTANCE_CHECKLIST.md`](09_ACCEPTANCE_CHECKLIST.md)
for the pass record with actual command output.

Marketing surface, blog, `/demo` sandbox, SEO/GEO, trust pages. This is
what generated the demand Amendment 1 built on.

## Stage 1 — Foundation
1. Supabase project, region India, [`../db/schema.sql`](../db/schema.sql) +
   [`../db/rls_policies.sql`](../db/rls_policies.sql) applied, plus the
   four migrations in `08_EXECUTION_BIBLE.md` Prompt A
   (`not_taught` rename, `memberships` table, nullable budget, the
   three added schema pieces)
2. Capture subsystem migrations (Section 6.4)
3. `05_BUSINESS_LOGIC.md` §2 fee tables, §3 compliance config, §4
   at-risk, §5 pulse
4. Auth: Supabase Auth, role + `school_id` in session claim, MFA for
   super_admin, token_version revocation
5. **Two-school tenant isolation test suite** — this is the gate. No
   further work until cross-tenant reads provably fail under every
   role.
6. Audit log with hash chain, append-only grants

**Verification:** RLS test suite green; no table without `school_id` +
policy; audit chain intact.

**Prerequisites from Noor:** Supabase project URL and service key.

## Stage 2 — Platform 2 control plane
School onboarding wizard · plan and feature-flag assignment · pilot
whitelist · user management · impersonation with audit · system
settings.

Built before Platform 3 because a school tenant must exist before
anything can be built inside one.

**Verification:** onboard a school end to end; confirm feature flags
gate at the API layer, not just the UI; confirm impersonation is
time-boxed, reason-logged, and school-visible.

## Stage 3 — Student master & capture
Student records · guardians · enrolment · class/section structure ·
CSV import with validation and `pending_consent` quarantine ·
**document scan + OCR review queue** · **QR token issuance and ID card
generation** · scan-to-profile.

Capture ships here, not later, because it is what makes Stage 3's data
entry tolerable. Building student records without it means every pilot
school types 500 rows by hand and forms an opinion about the product
before reaching anything else.

**Verification:** import 500 rows, land in `pending_consent`, per-row
error report; scan a document, OCR pre-fills, human corrects, commits
with source attached; scan a QR, correct student resolves, cross-tenant
scan denied and logged.

**Prerequisites:** OCR provider selection; sample documents from a real
school (redacted).

## Stage 4 — Consent & compliance
Consent ledger · purpose-scoped requests · guardian verification ·
withdrawal · data access/correction/deletion workflows · retention.

**Before any messaging.** Consent must exist before the system can
lawfully send, and building messaging first creates pressure to ship
the gate as an afterthought.

**Verification:** a `pending_consent` student is invisible to every
outbound path and to recognition scoring — tested, not asserted.

## Stage 5 — Attendance & the send gate
Attendance capture (present-all/tap-absent primary, QR secondary) ·
corrections with audit · period lock · **the single send gate** ·
WhatsApp integration · template registry · cost governor ·
`communication_log` with billing columns · absence notification.

The send gate is built once, here, and everything downstream uses it.

**Verification:** every blocked-send reason produces a logged row;
budget cap degrades correctly; pilot mode blocks all outbound;
transactional priority still sends at cap.

**Prerequisites:** Meta WhatsApp Cloud API credentials; approved
templates (allow 1–3 business days for Meta review); confirmed current
per-message rates.

## Stage 6 — Fees
Fee heads · structures · assignments · invoices · payments (partial,
multi-method) · receipts · concessions with approver · reconciliation ·
Razorpay with idempotent webhooks · fee reminder sequence through the
send gate · Form 6 advisory.

**Verification:** payment recorded → ledger status derives correctly →
receipt generated → WhatsApp receipt logged; duplicate webhook does not
double-credit; no path physically deletes a payment.

**Prerequisites:** Razorpay keys (test then live); real fee concession
types from an actual school.

## Stage 7 — Academics, exams, syllabus
Sessions · classes · subjects · curriculum · **syllabus state capture
(the four-button control)** · teacher allocation · exams · marks entry
· verification → approval → publication · report cards · QR hall
verification.

Syllabus state capture ships here because the Pulse depends on it
entirely.

**Verification:** published results are read-only; a correction creates
a new version with audit trail; syllabus exception states persist and
surface to the principal.

## Stage 8 — The differentiators
**Now the data exists.**

Daily Learning Pulse (deterministic Hinglish templates, exception-based,
`not_taught` suppression) · 3-tier comprehension loop · Recognition
Engine (Personal Best + banded Most Improved) · Teacher Impact Card ·
Weekly Confidence Brief · at-risk detection with tone differentiation.

**Verification:** `not_taught` generates no Pulse; Personal Best
reaches a broad share of students (fairness audit); Most Improved bands
correctly; Impact Card is invisible teacher-to-teacher under RLS; no
per-parent score appears anywhere.

## Stage 9 — Reporting, billing, support, hardening
Report definitions with role-scoped export · full data pack ·
subscription and invoicing · usage tracking · support tickets ·
monitoring dashboards · DR drill (PITR restore tested, not assumed).

**Verification:** full [`09_ACCEPTANCE_CHECKLIST.md`](09_ACCEPTANCE_CHECKLIST.md)
pass with command output; restore drill completed and timed.

## Sequencing principles

- **Isolation before features.** Stage 1's tenant test is a hard gate.
- **Consent before messaging.** Stage 4 precedes Stage 5.
- **Data before intelligence.** Stages 3–7 feed Stage 8. Building
  differentiators first means building against empty tables.
- **The send gate is built once.** Every message path uses it.
- **Each stage is a stopping point.** If the pilot tells you something
  unexpected at Stage 5, you can act on it without unwinding Stage 8.

---

# SECTION 10 — NON-FUNCTIONAL REQUIREMENTS

## 10.1 Performance (Floor Device Standard)

| Metric | Target |
|---|---|
| API p95 | < 500 ms |
| API p99 | < 1,000 ms |
| First contentful paint, 3G | < 2.5 s |
| Time to interactive, floor device | < 4 s |
| JS bundle, initial route | < 200 KB gzipped |
| Attendance save round-trip | < 800 ms |
| QR scan → profile resolve | < 1 s |

Server-side pagination on every list. Indexed search. Redis caching
for dashboard aggregates. Asynchronous report generation and imports.
Lazy-loaded detail tabs.

## 10.2 Client constraints

360 px guaranteed · zero horizontal scroll · 44×44 px touch targets ·
WCAG AA minimum, AAA for critical states · zero layout shift ·
system font stack with Devanagari fallback, no webfont download ·
offline queue with visible pending state for teacher writes.

Responsive across `360 / 768 / 1024 / 1440`. Every screen specified at
both ends.

## 10.3 Reliability

Daily automated backups with PITR · **restore drills quarterly, timed
against target** · webhook dead-letter queues · exponential backoff on
third-party APIs · idempotent jobs · health checks per module ·
incident process · import rollback.

RTO < 4 h, RPO < 1 h for Phase 1. Deliberately conservative for a small
team; revise upward in ambition as the team grows.

## 10.4 Security

HTTPS everywhere · encryption at rest · Argon2/bcrypt password hashing ·
MFA for platform admins · session expiry and refresh rotation ·
server-side authorization on every request · audit logging ·
export restrictions by role · secret management via environment, never
source · **no Aadhaar image storage** · signed time-limited URLs for
all documents · QR tokens opaque and revocable.

## 10.5 Compliance

Purpose-scoped consent · guardian verification · withdrawal ·
access/correction/deletion workflows · configurable retention ·
audit evidence export · incident records · India data residency ·
no third-party analytics or session replay on authenticated routes.

---

# SECTION 11 — ACCEPTANCE MATRIX

Phase 1 is not complete because screens exist. It is complete when
these work, verified with output, not asserted.

| # | Workflow | Definition of Done |
|---|---|---|
| 1 | Tenant isolation | Two-school suite: every cross-tenant read fails under every role. A deliberately buggy query missing `school_id` returns zero rows because RLS caught it. |
| 2 | Onboarding | School created; admin invited; 500 students imported to `pending_consent`; per-row error report; duplicates prevented; re-import corrects. |
| 3 | Capture | Document scanned → OCR pre-fills → human corrects → commits with source attached and `ocr_extractions` recording accepted vs corrected. No OCR value reaches a master record unconfirmed. No Aadhaar image stored. |
| 4 | QR | Token is opaque; scan resolves only for authenticated, authorized, same-tenant users; cross-tenant scan denied and logged; revoked card inert; every scan logged. |
| 5 | Consent | `pending_consent` student is invisible to all outbound and to recognition scoring. Withdrawal is a new ledger row, never a mutation. |
| 6 | Attendance | Recorded, corrected with audit, locked after period; absence notification passes consent, quiet hours, and budget before dispatch. |
| 7 | Send gate | Every block reason produces a logged row. Pilot mode blocks all outbound. Budget cap degrades non-transactional and still sends transactional. No path reaches the provider except through the gate. |
| 8 | Fees | Structure → assignment → invoice → payment (incl. partial) → receipt → derived status → WhatsApp receipt logged. Duplicate webhook does not double-credit. No path deletes a payment. |
| 9 | Form 6 | Advisory computes from configured CPI; `unknown` state when unconfigured; never blocks; mute writes an audit row. |
| 10 | Exams | Draft → entry → verify → approve → publish. Published is read-only; correction versions with audit. |
| 11 | Pulse | `not_taught` produces no Pulse and no prompt. `delayed`/`partial` reflected in text. Buttons within character limit. Template-generated, no LLM in the default path. |
| 12 | Response loop | Responses stored; surfaced as per-topic teaching signal; **no per-parent score exists in any UI, export, or report**. |
| 13 | Recognition | Personal Best reaches a broad share (fairness audit); Most Improved bands by baseline quartile; the banned headroom formula appears nowhere. |
| 14 | Impact Card | Invisible teacher-to-teacher under RLS; parent feedback rate limit enforced by unique constraint; banned inputs absent from the computation. |
| 15 | At-risk | Three tones verified; parent message contains no comparison or rank; parent dispatch off by default. |
| 16 | Reporting | Role-scoped; full data pack exports real records; no cross-tenant leakage in any export. |
| 17 | Audit | Every privileged action logged; hash chain intact; no update/delete grants on `audit_log`. |
| 18 | DR | PITR restore drill completed, timed, within RTO. Not asserted — performed. |
| 19 | Floor device | Every screen at 360 px, no horizontal scroll, 44 px targets, tested on a real budget Android, not emulation. |
| 20 | Cost | Every `communication_log` row has billing category and cost; spend observable per school per month; governor degrades at cap. |

---

# SECTION 12 — OPEN ITEMS

Nothing below is invented or assumed. Each needs a human answer.

- ~~`[GAP]` Phase 0 acceptance confirmed against checklist with actual
  command output.~~ **Resolved 2026-09-16** — see
  `09_ACCEPTANCE_CHECKLIST.md`.
- ~~`[GAP]` Bridge Rule status — no pilot data recorded. Phase 1 build
  remains unauthorized until met or explicitly overridden in
  writing.~~ **Resolved 2026-09-16** — overridden in writing,
  `01_CONSTITUTION.md` §6 Amendment 1. The North Star metric this gate
  was measuring changed too (Amendment 3); its target is a new `[GAP]`,
  listed in `00_START_HERE.md`.
- `[GAP]` OCR provider selection (Devanagari accuracy, handwriting
  tolerance, per-page cost, India residency).
- `[GAP]` Current-year CPI figure and official source.
- `[GAP]` Current Form 6 deadline and official field list.
- `[GAP]` WhatsApp interactive button character limit and current India
  per-message billing rules, verified at build time.
- `[GAP]` Real fee concession types from an actual target school.
- `[GAP]` Legal basis for parent-facing at-risk dispatch under DPDP.
- `[GAP]` Final plan pricing (₹ amounts) — tiers are structured above;
  numbers are yours to set.
- `[GAP]` ID card physical format and print workflow — do schools print
  in-house or use a vendor?
