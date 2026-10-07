> **Supervisor note (2026-10-07, Decision Log C104).** Stored verbatim as the founder supplied it.
> It is a plan, not a governing document. Founder decisions on 2026-10-07 override it where they
> differ: (1) the whole ecosystem is built first, then a real-data rehearsal, then the first school
> (roadmap `16` §1 stands; the brief's first-school gate is declined); (2) every module and every item
> in this brief stays in scope, nothing is cut; (3) the website demo is a labelled mock-up and keeps
> its fictional data; (4) §5 (projector) is replaced by the founder's classroom-kit plan, recorded in
> C106. How each item maps to a module and phase: `17_MODULE_CATALOG.md` §3b.

# NetCyberAI — Strengthening Brief
### From Noor (founder) to Claude Code: what to analyse, what to pick, what to change, and what to build so NetCyberAI is easier to sell, easier to adopt, and solves more of a school's real problems

**Date:** 2026-10-03
**Audience:** Claude Code (executor), and the supervisor who reviews every PR.
**Status:** this is my instruction, not a finished spec. I want you to read the whole project, test every statement in this brief against what is really in the repository, and then act on what is correct.

**Evidence tags used in this brief**
`[VERIFIED]` checked in a public source in the last few days · `[VENDOR CLAIM]` a vendor's own statement, not independently checked · `[REASONING]` inference · `[GAP]` information we do not have · `[ESTIMATE]` planning number, recalibrate with real velocity · `[VERIFY]` check before using · `[NEEDS NOOR]` my decision required.

---

## 0. How to use this brief

### 0.1 What I want you to do, in order

1. **Read everything first.** Every Markdown file under `docs/`, every migration, the schema, the RLS policies, the code under `src/`, the scripts and CI checks, and the public website content in the repo. Do not rely on any summary of the project, including mine.
2. **Measure before you trust.** Any number, status or claim in this brief (and in the docs) that you act on must be re-checked against the code, database and live site. Report every discrepancy. A figure carried forward without a live source is treated as invented.
3. **Compare this brief with the repository.** For each item in §4 and §6, decide: *already built*, *partly built*, *conflicts with a rule*, *correct and missing*, or *wrong*. Write that verdict down.
4. **Pick what is correct and change what needs changing.** Update documentation where it is stale, fix website content that contradicts our own rules, and build the missing items in the order in §7. Do it in small, reviewable PRs.
5. **Challenge me where I am wrong.** If something in this brief conflicts with the project's governing rules, with the data model, or with the evidence, say so in one line, say why, propose the better option, and do not silently follow either side.

### 0.2 Rules of engagement (binding)

| Rule | Meaning |
|---|---|
| Governing documents win | The repository's constitution, its inline amendments, the product spec and the business-logic spec are authoritative. This brief is a plan. If it conflicts with them, flag it and ask me. |
| No invented numbers | If a figure has no live source, write `[GAP]` and say what is missing. Never fill a gap with a plausible guess. |
| No fictional data outside the labelled demo | No hardcoded arrays, no sample metrics in real screens. Empty states with a visible TODO instead. |
| Tenant safety | Every new table carries `school_id`, RLS and role overlays, and is added by a numbered migration (test database first, then production). Never edit the baseline schema file. |
| Side effects only through the pipeline | Messages, emails, PDFs, payments and AI calls go through the jobs outbox; every parent-facing message goes through the send-gate. |
| AI is advisory | A person approves anything that reaches a parent or changes a record. No autonomous tool-calling agents. |
| Configuration, not constants | Deadlines, rates, thresholds are configuration with a source and a recorded date. |
| Proof in every PR | Tests, screenshots at 390 and 1440 px, security and code review, push after every major step, never merge your own PR. |
| Decision log | Every decision you take or change is logged with its reason. |
| Stop and ask | Stop and ask me before: spending money, anything legal, deleting data, public claims, price numbers, hardware purchases, or changing a permanent ban. |

### 0.3 What you may do without asking, and what needs me

| You may implement (in branches, for PR review) | `[NEEDS NOOR]` before it ships |
|---|---|
| Documentation updates and contradictions fixes | Any price or fee number on the site |
| Website content fixes in §4.A that remove claims we cannot support | Money-back or outcome wording (lawyer first) |
| New migrations, APIs, screens and tests for items in §4 and §6 | Any change to a permanent ban in the constitution |
| Free public tools, build-journal pages, changelog | Hardware purchases or supplier contracts |
| Instrumentation and measurement | Contacting schools, vendors, lawyers or regulators |
| Draft text for amendments (as a clearly marked proposal) | Publishing any case study or customer number |

---

## 1. Who I am and what I am building (my understanding, so you can correct it)

I am Noor, founder of NetCyberAI. NetCyberAI is the parent company. The first product is a school platform whose name is not decided yet. It is built as a multi-tenant, WhatsApp-first platform on Postgres with row-level security, a send-gate that controls every parent message, an append-only ledger for money, consent and audit, document capture with human-reviewed OCR, and a module catalogue of 33 modules plus a later parent/student app.

The thesis I wrote down: a parent who sees daily proof that their child is being taught and looked after stays confident, engages, pays on time and recommends the school. The differentiators I have designed are a daily learning message driven by a one-tap teacher input, consent-first messaging, recognition that compares a child with their own last result instead of ranking them, a compliance workflow for Indian schools, and an exception-first principal view.

**What I also know about our state (please verify):** a few modules are live (students, guardians and consent, attendance, document scan, QR cards, syllabus "taught today", the send-gate), several are schema-only (fees, exams, pulse tables), and most of the AI modules are only specified. The production database is prepared but not cut over; there is no real school on the platform yet; WhatsApp sending, payments and legal review are waiting on external approvals.

**What I want from the strengthening work:**
- Every school should be able to say "yes, this replaces my ERP" because the day-to-day operational work is covered, **and** "this solves problems my ERP does not".
- A principal should recognise their own pain within a minute of seeing it.
- Adoption should be easy: little onboarding effort, low switching fear, quick first value.
- Everything we claim must be provable.

---

## 2. Market reality check (what the evidence says)

I did not assume the market is empty. These are the facts that shape the plan.

### 2.1 Competitors already do much of what a "feature list" would claim

| Category | What I found | Tag |
|---|---|---|
| Large school ERPs | One vendor markets 50+ modules, AI features, WhatsApp notifications and teacher/parent/student apps, and states it is used by 1,800+ schools. Another states 1,500+ premium schools. Another markets WhatsApp, SMS and email messaging with parent and teacher apps. | `[VENDOR CLAIM]`; the pages exist |
| WhatsApp-first ERP | At least one vendor markets "WhatsApp AI" with a 20-module ERP and claims it can read incoming parent messages and analyse conversations, and claims legacy ERPs cost ₹1–5 lakh a year | `[VENDOR CLAIM]` |
| Smart-class hardware + content | Providers market offline curriculum content, teacher training and usage dashboards that work with interactive panels, smart TVs and projectors; one claims 100,000+ schools | `[VENDOR CLAIM]` |
| Fee-recovery specialists | Dedicated tools market defaulter lists and recovery workflows | `[VENDOR CLAIM]`; pages exist |
| SQAAF / accreditation | At least one product markets AI-assisted SQAAF evidence and audit readiness | `[VERIFIED]` pages exist |

**Conclusion:** module count, WhatsApp, an AI label, and smart-class hardware are **not** moats. A message such as "AI-powered all-in-one school platform" is already being used by competitors.

### 2.2 The market's real structure `[VERIFIED]` (national UDISE+ 2024-25 and Haryana)

| Fact | Why it matters |
|---|---|
| 14.71 lakh schools, 24.69 crore students, 1.01 crore teachers; private unaided schools are about 3.40 lakh (23%) | Large, fragmented market |
| Average private-unaided enrolment is about 289 students | Revenue per school is small; the pricing ceiling is low |
| 93.6% of schools have electricity; 64.7% have computers; 63.5% have internet | Digital infrastructure is uneven but improving |
| In Haryana, 63.9% of private unaided schools reported a functional smart classroom, smart board, virtual classroom or smart TV; 94.5% of Haryana private unaided schools have internet | **The gap in our home state is not hardware; most private schools already own some.** |
| School ERP price cues: about ₹100–500 per student per year; ₹9,000 to about ₹60,000 per year for suites | Price anchors we must respect |
| Teachmint (a funded incumbent) reported ₹74 crore operating revenue and a ₹46.6 crore loss in FY25 | A realistic base rate for how hard this market is |

### 2.3 Pains that are documented, not assumed `[VERIFIED]`

- **RTE reimbursement:** the Bombay High Court recorded 133 writ petitions from schools in about seven months of 2026; the per-child rate has been frozen at ₹17,670 since 2016-17; in Madhya Pradesh about ₹800 crore is owed across roughly 20,000 schools (about ₹4 lakh each); in Haryana school associations publicly say dues have been unpaid for years. `[VERIFY dates of the Haryana reports]`
- **Identity data:** generating a student's APAAR ID depends on the UDISE+ name matching Aadhaar; mismatches block IDs, and CBSE relaxed APAAR in candidate-list filing because of mismatches and missing consent.
- **CBSE workload:** SARAS 7.0 opened in Feb 2026; SQAAF self-assessment is annual (1 April to 31 December); CBSE told schools to correct incomplete mandatory-disclosure data, especially teacher qualifications.
- **Teacher eligibility:** the Supreme Court made TET mandatory for in-service teachers (with exceptions); review petitions were refused and the compliance period runs to 31 Aug 2028 `[VERIFY with the order]`.
- **Data protection:** the DPDP Rules were notified on 13 Nov 2025; core obligations start around mid-May 2027; educational institutions are exempt from parental-consent and tracking restrictions for educational purposes.
- **WhatsApp costs (India rate card):** marketing ₹0.8631, utility ₹0.1150, authentication ₹0.1150 per message plus 18% GST; from 1 Oct 2026 service replies are billable at the utility rate after 1,000 free per business number a month. `[VERIFY on Meta's live card before publishing any price]`

### 2.4 Fee pendency: what we know and do not know

Vendor blogs publish precise-looking splits ("42% forgot", "20–40% defaulters"). I could not find a neutral source, so **those numbers must never appear in our material** `[VENDOR CLAIM]`. The consistent qualitative theme is friction: reminders arrive late or not at all, the amount is unclear, paying is inconvenient, receipts are doubted, and staff cannot call everyone. Genuine hardship exists too (a COVID-era Delhi survey reported widespread non-payment tied to income loss). We will measure real causes in pilots.

---

## 3. Strategic conclusions

### 3.1 What is and is not a moat

| Not a moat | Potential moat |
|---|---|
| 33 modules | **Closed loops** from school evidence → validation → AI → human approval → action → response → better evidence |
| WhatsApp as a channel | Consent-first messaging with a complete audit trail |
| An "AI" label | School-specific longitudinal data and workflow history (needs time and schools) |
| HPC / report cards | Deep Indian compliance workflows maintained as versioned rules (APAAR/UDISE+, SQAAF, disclosure, RTE, Form 6) |
| Smart-class hardware | Teacher-friendly daily workflow that reduces work instead of adding it |

### 3.2 Three loops to build around (not 33 separate modules)

| Loop | Chain | Primary payer value |
|---|---|---|
| **Learning loop** | Teacher taps "taught today" → parent message → parent reply (understood / partly / needs help) → teacher queue → suggested follow-up → outcome recorded | Parent confidence, retention |
| **Governance loop** | Documents and records → validation against versioned rules → exceptions → principal action → audit-ready evidence | Fewer compliance surprises |
| **Revenue loop** | Dues → reminder decision → payment link → payment → receipt → reconciliation → follow-up list | Faster collection |

### 3.3 Two doors into a school

1. **Replace door:** the school switches to NetCyberAI as its system of record. Requires ERP parity (all locked modules) and an exit kit.
2. **Overlay door:** the school keeps its ERP and uses NetCyberAI for what its ERP does not do (daily parent loop, compliance desk, RTE desk, fee follow-up). Data enters by scheduled CSV/XLSX upload; I do **not** assume ERP APIs exist `[GAP: which ERPs prospects use and what they export]`.

Sell the overlay first where there is resistance, then migrate class by class.

### 3.4 Positioning (for the website and sales)

"Your ERP records what happened. NetCyberAI tells the school what needs to happen next, and every answer comes with its evidence."

Internally I keep the constitution's focus on learning monitoring and parent engagement; externally the story is "operating layer with proof".

---

## 4. The strengthening portfolio

**Priority key:** **P0** before the first real school sees the product · **P1** within the first three months of real use · **P2** after the first schools are live · **P3** after real data exists · **C** conditional on a gate.
For every item: check the repository first and report *built / partly / missing / conflicting* before you start.

### 4.A Trust and truth (fix what weakens credibility now)

| ID | Work | Why it strengthens us | Acceptance | Pri |
|---|---|---|---|---|
| T1 | **Remove rank framing from public material.** The WhatsApp mockup and any tour/demo screen must not show "#7 of 60", ranked lists of named children, or Top-3 pushes. Replace with Personal Best framing. If I still want rank features, draft a constitution amendment with a consent design for showing one child's position to other families, and wait for my confirmation. | We cannot advertise what our own rules forbid, and a principal who reads our own blog on recognition will see the contradiction | Grep of site content finds no rank-with-names; mock uses Personal Best | P0 |
| T2 | **Keep fictional data out of crawlable pages.** Move the sample dashboard and tour data to a client-only route or iframe that AI and search crawlers are disallowed from; label every placeholder in text. Extend the visibility rules already in the repo from the demo path to the homepage and product tour. | Prevents invented figures (open rate, session counts, "agents", speed claims) becoming "facts" in search and AI answers | Crawler-visible HTML contains no invented metric; `robots` and `llms` rules updated; SEO audit script extended to enforce it | P0 |
| T3 | **"Open rate" → "response rate".** Reply-button taps are measurable; read receipts are not reliable. | Honest metric | Zero "open rate" strings in product and site | P0 |
| T4 | **Replace outcome promises.** Remove "money back if no overall growth" and "expect higher outcomes if 80% use it". Draft a measurable pilot commitment instead (reporting cadence, delivery and response reporting, no lock-in, exit with data). Mark `[NEEDS NOOR]` and `[LAWYER]`. | Unmeasurable guarantees create legal and trust risk | Proposed wording in a PR, not published | P0 |
| T5 | **Generate module status from one source of truth.** The public module counts and badges must be computed from the status data, not typed by hand; no module shows "live" unless code, database and UI exist. | Prevents claim drift | One data file drives the tour; CI check fails on mismatch | P0 |
| T6 | **Align persona claims with scope.** Student-facing items (doubt support, personal learning plan) labelled "planned"; parent app labelled "optional, later". | Consistent story | Content updated | P1 |
| T7 | **Update the WhatsApp cost model** in the docs and in code: record message category, billable flag, estimated cost and GST per message; model utility and marketing scenarios; shared-number free allowance caveat; show the rate and its verification date wherever a price appears. | A 7.5× cost swing is the largest pricing risk | Cost view in Control; docs updated; marketing-category scenario tested | P0 |
| T8 | **Pricing page.** Replace "custom quote" with a starting price per student per month plus a worked WhatsApp cost example with its date. The numbers come from me after three willingness-to-pay conversations. | A buyer cannot self-qualify without a price | Template ready; numbers `[NEEDS NOOR]` | P1 |
| T9 | **Cap free migration wording.** "Live within 24 hours of receiving a clean list; free migration up to a stated size." | Unbounded free labour will break a one-person company | Wording updated | P1 |

### 4.B The Pilot Slice (what a real school can live on)

Build what is needed for one school to run a real day, in this order, and stop to get a school at the end. If the repository's build-order document already says this, follow it; if the roadmap says "complete everything before any school", flag the conflict to me and propose an amendment to gate on a first school.

| ID | Work | Acceptance | Pri |
|---|---|---|---|
| P1 | Production cutover and observability (error reporting, structured logs, uptime check) | Health check green; restore drill performed and timed on the paid tier before real student data | P0 |
| P2 | Teacher PWA: offline attendance ("present all, tap absent"), visible sync, audit row | Works on a 2 GB budget Android over throttled 3G | P0 |
| P3 | "Taught today" → Pulse draft (deterministic templates, Hinglish/Hindi/English) → send-gate → reply buttons → follow-up queue | `not_taught` sends nothing; reply tap lands in the response log | P0 |
| P4 | WhatsApp provider adapter, inbound webhook with signature check, delivery states visible to school | Test message reaches only the founder's number; block reasons logged | P0 |
| P5 | Minimal fee loop: structures → ledger → payment link/UPI QR → idempotent webhook → receipt → reminders at −3 / due / +7 | Duplicate webhook cannot double-credit; payments append-only | P0 |
| P6 | Principal exception dashboard on real data only | Every tile computed and drillable; zero fictional numbers inside the app | P0 |
| P7 | **Measurement built in:** "taught" tap coverage, response rate, delivery rate and time-to-send, cost per student per month, onboarding hours per school, teacher minutes to mark a class | Weekly export; no per-parent engagement score anywhere | P0 |
| P8 | Consent collection over WhatsApp and on paper; imports quarantined until consent | A student without consent receives nothing (negative test) | P0 |

**Kill/adjust rule:** if after 30 days at a real school fewer than half of scheduled class-periods have a "taught" tap, or the school will not accept the cost of the daily message, simplify the teacher input or the message and re-test. Do not add modules to compensate.

### 4.C Proof and provenance (the cross-cutting layer)

I want every important claim in the product to carry its evidence. I do **not** want a new "OS" module or a big abstraction before it is needed. Implement this as a **standard**, applied first where it matters most (compliance, identity, RTE, fee risk, learning signals).

| ID | Work | Detail | Acceptance | Pri |
|---|---|---|---|---|
| E1 | **Provenance standard** | Every record that drives a flag, report or message stores: source (document / system / person), evidence links, validation status and who/when, rule version, whether AI assisted, who approved and when. Reuse the existing audit and document tables; add only what is missing. | Written standard in the docs; migration for any missing columns; examples in three modules | P1 |
| E2 | **"Why this?" drawer** | Any red flag, risk marker or recommendation opens its evidence, rule and history | Works for compliance, identity and fee-follow-up flags | P1 |
| E3 | **Proof page for the principal** | A page listing important claims ("teacher qualification records complete"), the evidence count, exceptions, last check, approver | Drill-down from every number; empty states honest | P2 |
| E4 | **Versioned rule sets** | Compliance, RTE and fee rules stored with `effective_from`, source and recorded date; outputs show which version they used | Changing a rule creates a new row, not an edit | P1 |

### 4.D Differentiating features to merge into the school platform (inside existing modules; nothing removed)

| ID | Feature | What it does | Stakeholders | Module home | Pri |
|---|---|---|---|---|---|
| D1 | **Fee Recovery Engine** | Reminders timed before the due date; payment link in the message; receipt back on WhatsApp; daily follow-up list ranked by amount, age and parent history; promise-to-pay tracker; hardship routed to a human concession workflow, not more reminders; later an explainable risk score (rules first, a model only if it beats the rules) | Accountant, principal, parent | Fees, Communication, Early Warning | P0 minimal, P1 list, P3 score |
| D2 | **Compliance Desk** | Dated, sourced obligation calendar; mandatory-disclosure builder (including teacher qualifications); SQAAF evidence tracker; Haryana Form 6 draft; reminders to the principal | Principal, admin | Compliance Pro | P1 |
| D3 | **Student Data Integrity** | Register vs reference mismatch finder (name, date of birth, guardian); fix list; parent correction request on WhatsApp (consent-checked); re-check; feeds APAAR/UDISE+ and candidate-list readiness. Aadhaar: last four digits and name-match only, never images | Admin, parent | Compliance Pro, Students | P1 |
| D4 | **RTE Claim Desk** | RTE tagging; evidence file per child; claim sheet in the state's layout; dues ageing; exception list; evidence pack for associations. Preparation only; no lending; never submit on a school's behalf | Principal, accountant | Fees, Students, Compliance | P1 |
| D5 | **Teacher Work Completion** | One tap "taught today" creates the Pulse draft and the classwork log; homework status and assessment evidence attach; the assistant drafts plans, worksheets, remarks and competency-aware question papers for the teacher to edit; HPC observation notes captured by text or voice and mapped to competencies for approval | Teacher | Academics, Teacher Copilot, Exams | P1–P2 |
| D6 | **Learning loop completion** | Parent reply "needs help" creates a teacher queue item with a suggested follow-up and records the outcome; response data feeds Early Warning later | Teacher, parent | Daily Pulse, Early Warning | P1 |
| D7 | **Consent & Trust Kit** | Consent ledger visible to the school; WhatsApp consent collection; data-processing agreement template; breach playbook; per-tenant export; honest marketing (no "certified") | Principal, owner | Parents, Compliance | P0–P1 |
| D8 | **Staff qualification and eligibility tracker** | Qualifications, TET/CTET status, expiry reminders; feeds disclosure | Principal, admin | Staff, Compliance | P1 |
| D9 | **Admissions leakage fix** | Enquiry capture (WhatsApp and web form), stages, follow-up tasks, visit booking, conversion by source | Principal, owner | Admissions | P2 |

Everything else in the module catalogue stays in scope; see §6 for ordering and §7.4 for how I want the locked list protected.

### 4.E Acquisition engine (how schools find us and say yes)

**The loop:** search or AI answer → free tool → gap report → demo → founding school → real data → measured outcome → consented case study → public proof → more schools. Directories of startups are not where Indian school principals look, so I will not build around them `[REASONING]`.

| ID | Work | Detail | Pri |
|---|---|---|---|
| A1 | **Free diagnostic tools (no login, client-side processing)** | (1) Student Data Integrity Checker (CSV: duplicates, name/DOB/guardian mismatch, missing identifiers; extends the existing import checker) · (2) Mandatory-disclosure completeness checker · (3) SQAAF readiness planner · (4) Section and classroom rule check (verify the rule text first) · (5) RTE dues ageing calculator (user enters the rate; no default rate) · (6) Form 6 fee-hike calculator (CPI and deadline entered from the current notification) · (7) WhatsApp message cost calculator with the verification date · (8) DPDP readiness checklist (wording lawyer-reviewed) · (9) HPC evidence completeness checker | P0–P1 |
| A2 | **School Operations Gap Map** | A principal answers what they use today (ERP, attendance, fees, exams, parent communication, compliance, documents, WhatsApp). The output shows gaps, the NetCyberAI equivalent, a migration path, and an overlay option. Opt-in contact at the end. | P1 |
| A3 | **Opt-in "send me this result"** | Separate from the calculation so the "nothing is sent to us" promise stays true; creates a lead tagged with the tool source | P0 |
| A4 | **Founding Schools programme** | Application and diagnostic, not a waitlist: public page → school diagnostic → demo → data-readiness check → pilot environment → real usage → measured results → case study. The number of founding schools is my decision, not a marketing claim. | P1 |
| A5 | **Build journal and changelog** | A public, dated record of what was shipped, the problem it solves, and (once real) verified metrics. Internally a feedback loop: feature → schools using it → feedback → issues → changes. Customer count, messages delivered, compliance issues resolved are published only when measured. | P1 |
| A6 | **Partner channels** | Affiliation consultants (they own the CBSE filing relationship), school associations (RTE dues are their active grievance; verify current contacts), and parents' referral form after the first pilot | P1 |
| A7 | **Outreach hygiene** | No cold WhatsApp to unknown numbers; use published institutional contacts; lawyer to confirm outreach rules | P1 |
| A8 | **Lead and CAC tracking** | Source, stage, hours spent, outcome; computes real acquisition cost | P1 |

### 4.F Switching and overlay (lower the cost of saying yes)

| ID | Work | Acceptance | Pri |
|---|---|---|---|
| S1 | **ERP Exit Kit** — inventory, field mapping (stored for reuse per source ERP), import checker, consent collection, parallel run for one class, class-by-class go-live, export at any time | A school can move one class without losing its old system; mappings reusable | P1 |
| S2 | **Overlay import** — scheduled CSV/XLSX upload of students, fees and attendance from an existing ERP so the Pulse, compliance, RTE and fee follow-up work without owning those records. I do not assume ERP APIs. `[GAP: formats]` | Documented import contract; one real ERP export mapped | P1 |
| S3 | **Per-tenant export** (promised publicly) | One export covers every tenant table; restore-into-isolation path documented | P0 before first paid school |
| S4 | **Parity gap register** — for each row of a typical ERP checklist, show which module covers it and its status; keep it current | Generated from module status | P1 |

### 4.G Classroom layer (conditional; see §5 for the critique and gate)

| ID | Work | Pri |
|---|---|---|
| C1 | **Classroom Player (software-first):** runs on whatever display the school already owns; offline-first; a lesson being played creates "taught today" evidence automatically; teacher-entered tallies for quick concept checks; no student devices in phase 1 | C |
| C2 | **Learning Path layer** over the school's own curriculum for **one board, one grade band, three subjects (Mathematics, Science, English), 20–30 concepts**, before anything bigger | C |
| C3 | **Optional hardware kit**, partner-sourced, loaned under a deposit, pilot only | C |

### 4.H Operational readiness (things that block adoption even when software is good)

| ID | Item | Owner | Pri |
|---|---|---|---|
| O1 | Pricing method: floor = messaging + hosting + support; ceiling = ERP anchors unless ROI is shown; three willingness-to-pay conversations per week during the pilot build | Noor | P0 |
| O2 | Legal pack: pilot agreement, data-processing agreement, privacy, terms, outcome wording, hardware loan terms if C3 happens | Noor + lawyer | P0 |
| O3 | Security review before the first paid school; incident and breach playbook | Noor + supervisor | P0 |
| O4 | Support model (who answers a principal at 9 pm), response times, escalation | Noor | P1 |
| O5 | Training and customer-success playbook for the first 30 days in a school | Noor + executor | P0–P1 |
| O6 | Data residency and AI provider decision, and a consent purpose for processing student-linked text with a model | Noor + lawyer | before any AI feature touches student text |
| O7 | Languages beyond Hinglish and accessibility review | Executor | P2 |
| O8 | Name and brand architecture for the first product | Noor | before the first school |

### 4.I Other ideas: separate products under the parent company (not in the school platform)

| Product | Audience | Why separate | Gate to start |
|---|---|---|---|
| **TET prep for in-service teachers** (WhatsApp-first, individual consent, own data store) | Teachers with a deadline | Different buyer and data | Pilot Slice gate passed (or a two-week spike), coverage confirmed for one state, lawyer view on content |
| **Consent / verification API** | School-software vendors | Different buyer; regulated-role question; free government rails may suffice | 3 vendors state a price unprompted + DigiLocker route feasible + lawyer confirms not a regulated role |
| **Inclusion desk** | Schools with special-needs students | Sensitive data; unproven willingness to pay | 5 schools commit + special-educator adviser |
| **Campus compliance check** | Consultants, lenders | Different buyer | 3 buyers |
| **Coaching-centre edition** | Tuition centres | Configuration of the core, lower price, strong incumbents | 3 unprompted requests |
| **Internal-exam scan toolkit** | Schools running mocks | AI grading is politically sensitive; build only scanning/matching | 2 school requests after Exams ships |

**Do not build (evidence-based):** generic AI tutor, doubt chatbot, early-literacy app, coding platform, handwriting-OCR API for boards (a funded Indian lab now offers Indic handwriting recognition at ₹0.50 a page and CBSE says evaluation is human), school credit-scoring API, RTE bridge lending (needs a lender and legal structure), procurement marketplace, startup directory or launch marketplace, face-recognition attendance (banned).

---

## 5. My own idea, put under adversarial review: projector + power backup + syllabus + three free months

### 5.1 What I proposed

Give every school one projector, a screen, and a power-backup set (battery and inverter) where power is unreliable, for roughly ₹15,000 of hardware; design our own interactive syllabus for English, Science and Mathematics; give three months of the full platform free; then charge about ₹30 per student per month (₹1 per student per day), or ₹50, and expect about ₹20,000 invested per accepted school.

### 5.2 Verdict (I asked to be challenged, so this is blunt)

**Not as designed. Yes, as a controlled, software-first experiment at one school, after the Pilot Slice works.** The idea has a real insight (a physical, teacher-facing entry point is easier to sell than "switch your ERP") but several load-bearing assumptions are untested or contradicted by evidence. Treat the original as a hypothesis, not a plan.

### 5.3 What is right

- Principals understand a classroom tool faster than a back-office platform; a teaching tool can open the door.
- Classroom activity can become first-party learning evidence, which our platform currently lacks.
- A lesson being played can create the "taught today" evidence automatically, which would remove the single biggest adoption risk in the daily parent message (the teacher's daily tap).
- Unreliable power is a real obstacle in some schools; most schools do have power (93.6%) but outages are not captured in public data `[GAP]`.

### 5.4 What is wrong or unproven

| # | Assumption | Problem | Evidence / reasoning |
|---|---|---|---|
| 1 | "Schools lack the hardware, so provide it" | In Haryana, 63.9% of private unaided schools already report a functional smart classroom, smart board, virtual classroom or smart TV (national private-school internet access is also much higher than government) | `[VERIFIED]` Haryana private-unaided figure from the 2024-25 UDISE+ report as reported by a state newspaper. **The gap is content, teacher workflow and usage, not the device.** |
| 2 | ₹15,000 covers projector, screen, battery and inverter | Battery listings I found: 60 Ah tubular roughly ₹6,000–16,000 depending on brand and seller; 100 Ah roughly ₹12,000–16,000; inverter and a classroom-grade projector are extra | `[VERIFIED listings, prices vary]`; inverter and projector prices `[GAP: get three quotes]` |
| 3 | A 30–50 W projector is enough | Classroom-grade brightness in daylight is commonly cited at about 3,000 ANSI lumens or more (guidance ranges 2,000–5,000 depending on light control and screen size); cheap low-power LED projectors are typically far dimmer. High-lumen lamp or laser projectors draw much more power. | `[VERIFIED guidance]`; the wattage of a bright projector is `[REASONING: confirm from datasheets]` |
| 4 | A 42/60/90 Ah battery gives useful backup | Runtime depends on load. With stated assumptions (12 V lead-acid, 50% usable depth of discharge, 85% inverter efficiency): at an **80 W** total load a 60 Ah battery gives ≈ 3.8 h; at a **330 W** load (a bright lamp projector plus a mini PC) a 60 Ah battery gives ≈ 0.9 h and 100 Ah ≈ 1.5 h; at **130 W** (a smart TV plus a box) 60 Ah ≈ 2.4 h and 100 Ah ≈ 3.9 h | `[ESTIMATE]` from stated assumptions; confirm with real load measurements |
| 5 | One projector per 500-student school | About 10–14 sections share one resource; it is a scheduling problem, so most classes get little | `[REASONING]` |
| 6 | "Three free months will show results" | Learning gains are not provable in three months on one display; unmeasured claims break our own rule against fabricated outcomes | Rule in our constitution; pilot design in §5.7 |
| 7 | "If they see results they will pay ₹30" | No willingness-to-pay evidence; ERP suites are advertised at about ₹100–500 per student per year; ₹30 a month is ₹360 a year per student, at the high end for a budget school | `[VERIFIED]` price cues; WTP `[GAP]` |
| 8 | "We design the entire syllabus" | A full K–12 content library is a large content business, with writing, review, translation, animation, licensing and annual updates. Established providers already sell offline curriculum content with teacher training and dashboards, and national platforms provide free content. | `[VERIFIED]` providers exist `[VENDOR CLAIM]` on scale |
| 9 | Hardware ownership | Inventory, installation, warranty, theft, damaged batteries, electrical safety, GST invoicing and repossession become a second business | `[REASONING]` |

### 5.5 The economics, so nothing is hand-waved

**Revenue for a 500-student school**

| Price | Monthly | Annual | Year 1 with 3 free months (9 paid) |
|---|---|---|---|
| ₹30 / student / month | ₹15,000 | ₹1.80 lakh | ₹1.35 lakh |
| ₹50 / student / month | ₹25,000 | ₹3.00 lakh | ₹2.25 lakh |

**The WhatsApp category swing decides whether ₹30 works at all** (Pulse messages only, 11,000 a month, including GST)

| Pulse category | Messaging cost / month | Left from ₹15,000 | Left from ₹25,000 |
|---|---|---|---|
| Utility (₹0.115) | ≈ ₹1,493 | ≈ ₹13,507 | ≈ ₹23,507 |
| Marketing (₹0.8631) | ≈ ₹11,203 | ≈ ₹3,797 | ≈ ₹13,797 |

**Cost to win a school, with every assumption shown (these are illustrative assumptions, not facts)**

| Input | Software-only pilot on the school's own display | Pilot with a hardware kit |
|---|---|---|
| Hardware not recovered | ₹0 | ₹20,000 (assumed) |
| Installation, training, travel | ₹0 beyond onboarding hours `[GAP]` | ₹10,000 (assumed) |
| Messaging in 3 free months (utility) | ≈ ₹4,479 | ≈ ₹4,479 |
| **Cost per pilot** | **≈ ₹4,500 + hours** | **≈ ₹34,500 + hours** |

Cost to win one paying school = cost per pilot ÷ conversion rate. For the kit pilot:

| Pilot → paid conversion | Cost per paying school | Payback at a contribution of ≈ ₹10,500/month* |
|---|---|---|
| 50% | ≈ ₹69,000 | ≈ 6.6 months |
| 33% | ≈ ₹103,500 | ≈ 9.9 months |
| 20% | ≈ ₹172,400 | ≈ 16.4 months |

\*Contribution assumes ₹30 per student, utility-category messaging (₹1,493) and a further 20% of revenue (₹3,000) for AI, support and payments `[assumption]`. If the daily message is classed as marketing, contribution falls to about ₹800 a month and the kit never pays back at ₹30. These numbers also exclude my own time, sales cost and churn. The point is the shape: **the model works only with a high conversion rate, a utility-category message, a low-cost kit, and low churn, and none of these is yet known.**

### 5.6 What to build instead (my decision, subject to your analysis)

1. **Software-first Classroom Player** that runs on the display the school already owns (interactive panel, smart TV, projector, or a laptop). It is offline-first, plays lessons from a local cache, records which lesson was played and for which class, and creates the "taught today" evidence automatically.
2. **A thin Learning Path layer, not a syllabus.** Keep the school's own board and curriculum. Start with **one board, one grade band, three subjects, 20–30 concepts**. Each concept follows: explain → visualise → ask → teacher enters the class tally (for example how many chose A, B, C, D) → reveal the misconception → practise → short check → record the result. No student devices in phase 1.
3. **Reuse and license before authoring.** Check licences on openly available curriculum material; write only what is missing; AI may draft, a subject reviewer must approve each item; track source and licence per learning object.
4. **Optional hardware for pilots only:** partner-supplied, **loaned**, with a refundable deposit, a signed loan agreement, an asset register, and warranty and replacement handled by the partner. NetCyberAI never holds inventory.
5. **Display options to test in the one pilot:** (a) the school's existing smart board or TV; (b) a 43–55 inch smart TV on a trolley (brighter in daylight and simpler than a projector); (c) a classroom-grade projector with a screen; (d) battery backup sized from measured load, not guessed capacity. Pick by measured readability in the school's own daylight.
6. **Replace "three months completely free"** with a commitment: a 30-day free pilot with written success criteria, a refundable deposit for any hardware, and an annual contract decision at the end. Free attracts the uncommitted.

### 5.7 The one controlled experiment (gate: Pilot Slice working at a real school)

| Step | Detail |
|---|---|
| 1 | One school, one grade band, Maths + Science + English, 20–30 concepts agreed with the teachers |
| 2 | Baseline: short assessment per concept before teaching; teacher preparation time sample; homework completion; parent response rate |
| 3 | Two sections use the Classroom Player; one comparable section does not (or use the prior cycle) |
| 4 | Six to eight weeks of use; two teachers trained; usage logged |
| 5 | Post-check on the same concepts and a delayed re-check after several weeks |
| 6 | Measure: concept mastery, lesson completion, teacher minutes saved, participation, homework completion, parent responses, attendance, intervention closure, support minutes, cost per school |
| 7 | Decide in writing before starting what result would make us continue, change, or stop; publish only what is measured, and only "in our pilot…" |

**Continue** if teachers keep using it unprompted, a buyer commits, and the economics in §5.5 hold with real numbers. **Reposition** if schools like it but will not pay. **Stop** the classroom direction if the school's existing display plus a competitor's content already satisfies them and we cannot show a measurable advantage.

### 5.8 Where it fits in the product

It is an extension of Academics and Teacher Copilot (not a new back-office module) and feeds Daily Pulse, Homework, Curriculum Gap Detector, Learning Genome and Early Warning. It is a **Wave-3 candidate** except for the Classroom Player spike. It does not change the first-school gate.

---

## 6. Execution order (waves) — everything in scope stays; order is by dependency and evidence

**Protect the locked scope.** The module catalogue's 33 modules, the frameworks (settings, custom fields, filters, bulk actions, entitlements) and the later parent/student app all stay in scope. Do not delete or rename any module in this work. Modules marked "needs specification" (Learning Genome, Digital Twin, Career Graph, Automation OS, Parent AI, School Health Auditor, Curriculum Gap Detector, Homework Recovery, Complaints, Payroll, Teacher Copilot) must be specified by me before their build starts; until then they appear on the public site only as "planned", with no figures.

| Wave | Contents | Gate to leave the wave | Indicative size `[ESTIMATE]` |
|---|---|---|---|
| **W0 — Truth and hygiene** (start now) | T1–T9; run the full read-through and write the gap report (§9); documentation index and fix of duplicate numbering and stale statements (for example the WhatsApp rate section); module status generated from one source; AI-visibility rules extended to the homepage and tour; opt-in capture for free tools (A3) | Gap report accepted by me; no contradiction left between site, docs and rules | 1–2 weeks |
| **W1 — Pilot Slice** | P1–P8, D7 basics, D1 minimal loop, O1–O3, O5, O8 | Acceptance list in §6.1 passed at one real school | 12–14 weeks |
| **W2 — First schools** | D2, D3, D4, D8, D1 follow-up list, D5 (copilot drafts, competency-aware paper), D6, E1, E2, E4, A1 tools, A2, A4–A8, S1–S4, **C1 Classroom Player spike (software-only, two weeks)** | 3 schools live; at least one paying or committed; one consented case study | +14–18 weeks |
| **W3 — Operations parity** | Exams and report cards with HPC support, timetable + proxy + leave, admissions (D9), certificates behind fee clearance, payroll (statutory rules as configuration, accountant review), reports, E3 proof page | The parity register shows no "planned" row for the core ERP checklist | +24–30 weeks |
| **W4 — Intelligence** | Fee risk score (only if it beats the plain rules on real data), Parent AI, Learning Genome, Curriculum Gap, Career Graph, School Health Auditor, Digital Twin, approval-gated automations; C1–C3 experiment if its gate passes | Each AI feature shows an evaluation result from real school data | +20–26 weeks |
| **W5 — Extensions** | Parent/student app, group/trust view, software-only transport and library lists only if I amend the permanent rejection | School demand | demand-gated |
| **Hardening (parallel, before real data)** | Paid database tier with point-in-time recovery, restore drill performed and timed, security review, lawyer sign-off, hosting decision | Signed launch checklist | ≈ 4 weeks |

**Honest size warning:** the full catalogue plus the items above is roughly 100 executor-weeks of build `[ESTIMATE]`. That is why the first school is gated at the end of W1. Recalibrate every estimate after W1 using real velocity, and tell me.

### 6.1 Pilot Slice acceptance (adds to the repository's own acceptance list)

- Tenant isolation suite green after the cutover; production on a paid tier with backups; restore drill performed and timed.
- No student without a consent record receives any message (negative test).
- Offline attendance works on a budget Android; sync visible; first absence alert per student per day always sends; every blocked or failed message has a logged reason.
- A `not_taught` period produces no parent message.
- The daily message's WhatsApp category is recorded from the provider's review; cost per message is logged with GST.
- Payment webhook is idempotent; payments are append-only.
- The principal dashboard shows only computed values; no fictional number inside the app.
- Lawyer-reviewed privacy, terms, data-processing agreement and pilot agreement are in place.

### 6.2 Deadline-driven ordering inside W2 `[VERIFY each date before publishing]`

Form 6 (standing deadline 1 February) and the disclosure helper (CBSE refresh in February) come first; then identity reconciliation; then the RTE Claim Desk before Haryana's 1 April seat-upload; then the fee follow-up list and the exit kit so a school can go live before the April session. If W1 slips, ship the matching free tools first: each costs about a week and creates leads.

### 6.3 Separate products stay behind their gates

Start none of the §4.I products before the W1 gate, except spikes of two weeks or less; at most one separate product in build at a time; separate data stores for any individual-consumer product; shared code in an internal package, never copied.

---

## 7. Measurement, proof and claim discipline

### 7.1 What to measure from the first pilot day

| Metric | Why |
|---|---|
| "Taught today" tap coverage (class-periods tapped ÷ scheduled) | Tells us whether the daily loop is viable |
| Parent response rate (reply-button taps ÷ delivered) | North-star signal |
| Delivery rate and time from marking to alert | Core trust |
| Cost per student per month by message category | Pricing truth |
| Reminder → payment within 7 days; days to collect; share paid by due date | Revenue-loop proof (never the judge of a parent) |
| Teacher minutes to mark a class; staff minutes per fee cycle | Efficiency claims |
| Onboarding hours and support minutes per school | Real acquisition and servicing cost |
| Consent withdrawals and opt-outs | Early warning |
| Free-tool visits → "send me this result" → demo → pilot → paid | Funnel (aggregate counts only) |

No per-parent engagement score may exist anywhere.

### 7.2 Claim policy

| We may say | We may not say |
|---|---|
| "Messages go only to families with a consent record." | "DPDP-certified", "legally immune" |
| "Every blocked or failed message is logged with a reason." | "100% delivery" |
| "In our pilot, …" with the method and sample size stated | Any improvement, saving or recovery figure that was not measured |
| "Export your data any time" (after it is built) | Fee-default percentages from vendor blogs |
| Rates shown with their verification date | A fixed messaging price with no date |

### 7.3 How to measure efficiency honestly

For each workflow, time five repetitions the old way (baseline), then the new way; record who timed and when. Efficiency gain = (baseline − new) × monthly frequency. Show it publicly only with that provenance.

### 7.4 Documentation hygiene I want from you in W0

1. Add a single index document mapping every document to a layer (rules, strategy, specification, build, operations, history), with the order in which a new session should read them and which document wins in a conflict.
2. Fix duplicate numbering and update all links in one commit.
3. Generate a short "state of truth" page (what is live, gated, planned, and open gaps) from the data, so no session has to read the whole decision log to know the state.
4. Update the stale WhatsApp-rate language and any statement that describes the October 2026 rate change as upcoming.

---

## 8. Decisions I owe you, gaps, and evidence

### 8.1 My decisions (please list them back to me with a recommendation)

1. Approve gating the roadmap on a first school (amend the roadmap's "complete everything before any school" statement) and the wave order in §6.
2. Rank framing: fix the site now (recommended) or amend the constitution with a consent design.
3. Allow software-only transport and library lists later (amend the permanent rejection) or not.
4. Name the first pilot school; decide the number of founding schools.
5. Starting price and messaging pass-through wording (after three willingness-to-pay conversations).
6. Whether the Classroom Player spike runs in W2, and who supplies hardware if C3 ever runs.
7. Product name and brand architecture.
8. Specifications for the "needs specification" modules, in the order their phase arrives.

### 8.2 Open gaps `[GAP]`

Which ERPs my prospects use and what they export · Haryana's current RTE claim format and portal fields · exact CBSE application windows · TET coverage rules by state · whether the daily message is classed as utility or marketing · AI provider and data residency · a consent purpose for processing student-linked text with a model · statutory payroll rules · real hours per onboarding · real support load · actual outage patterns at pilot schools · three quotes for a classroom-grade display, battery and inverter · what affiliation consultants charge.

### 8.3 Evidence ledger

| Fact | Tag |
|---|---|
| 14.71 lakh schools, 24.69 crore students, 1.01 crore teachers; ≈3.40 lakh private unaided (23%) | `[VERIFIED]` national school-data report |
| 93.6% electricity, 64.7% computers, 63.5% internet nationally | `[VERIFIED]` |
| Haryana: 63.9% of private unaided schools have a functional smart classroom / board / virtual classroom / smart TV; 94.5% have internet | `[VERIFIED]` as reported by a state newspaper from the 2024-25 report |
| Average private-unaided enrolment ≈ 289 | `[VERIFIED]` |
| School ERP price cues (₹100–500 per student per year; ₹9,000–₹60,000 per year) | `[VERIFIED]` vendor pricing pages |
| Competitor scale claims (1,800+ / 1,500+ / 100,000+ schools) | `[VENDOR CLAIM]` |
| WhatsApp-first ERP claiming to read incoming messages | `[VENDOR CLAIM]` |
| Bombay HC: 133 RTE writs in about seven months of 2026; ₹17,670 frozen since 2016-17 | `[VERIFIED]` |
| MP RTE dues ≈ ₹800 crore across ≈ 20,000 schools | `[VERIFIED]` |
| Haryana RTE dues dispute reported by school associations | `[VERIFIED]`, dates `[VERIFY]` |
| CBSE: 32,558 schools; SARAS 7.0 opened Feb 2026; SQAAF annual 1 Apr–31 Dec | `[VERIFIED]` |
| APAAR needs name match with Aadhaar; CBSE relaxed APAAR in candidate lists | `[VERIFIED]` |
| DPDP Rules notified 13 Nov 2025; core ≈ mid-May 2027; educational institutions exempt for educational purposes | `[VERIFIED]` verify against the Gazette |
| TET mandatory for in-service teachers; compliance to 31 Aug 2028 | `[VERIFIED]` verify against the order |
| Meta India rates ₹0.8631 / ₹0.115 / ₹0.115; service replies billable after 1,000 free from 1 Oct 2026 | `[VERIFIED]` verify on the live card |
| Battery listings: 60 Ah ≈ ₹6,000–16,000; 100 Ah ≈ ₹12,000–16,000 | `[VERIFIED]` marketplace listings, vary |
| Classroom projector brightness guidance 2,000–5,000 ANSI lumens depending on light control | `[VERIFIED]` guidance; wattage of bright projectors `[REASONING]` |
| Teachmint FY25: ₹74 crore operating revenue, ₹46.6 crore loss | `[VERIFIED]` |
| Fee-default percentages from vendor blogs | `[VENDOR CLAIM]` — do not use |

---

## 9. What I want back from you (format)

After you have read the whole project, send me **one gap report** before changing anything large:

```
1. READ: list of everything you read (docs, code areas, migrations, site content)
2. DISCREPANCIES: every place a document, the site, the database or this brief disagrees with the code
3. VERDICT TABLE: for every ID in §4 — built / partly built / missing / conflicting / wrong, with evidence
4. CONFLICTS WITH GOVERNING RULES: each in the shape "this is wrong because X; the better way is Y; we should do Y because Z"
5. PROPOSED PR PLAN: ordered PRs for W0, then W1, with size, risk and tests
6. WHAT I NEED FROM NOOR: decisions, keys, legal, money
7. GAPS you could not close and why
```

Then execute W0 in small PRs. For every PR: what changed, what was verified and how, screenshots at 390 and 1440 px, tests, and which IDs it closes. Stop and ask before anything on the "needs Noor" list. If something in this brief turns out to be wrong, say so plainly and correct the plan; the aim is a platform schools adopt because it solves real problems and can prove it.
