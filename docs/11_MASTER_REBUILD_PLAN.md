# 11 — NetCyberAI Master Rebuild Plan (E2E Handoff)

**Status:** Proposed — takes effect when the founder approves it and it is committed to `docs/`.
**Date:** 2026-09-23
**Audience:** Claude Code, any other AI builder, any human engineer joining cold.
**Relation to other docs:** Sits after `10_DECISION_LOG.md` in reading order. Where this doc and `04_SYSTEM_DESIGN_PRD.md` §7 (IA) or `08_EXECUTION_BIBLE.md` (prompt order) disagree, **this doc wins** and the conflict must be logged as a Decision Log entry in the same PR that adopts it.

---

## 0. How to use this document

If you are an AI or engineer starting fresh, read in this order and do not write code until you have:

1. `docs/00_START_HERE.md` — index and open `[GAP]` list.
2. `docs/01_CONSTITUTION.md` — the non-negotiables (including Amendments 1–3).
3. `docs/10_DECISION_LOG.md` — every real bug found so far (C1–C63+). Most of them are traps you would otherwise fall into again.
4. **This document** — what we are building next, in what order, and why.
5. `docs/07_DESIGN_SYSTEM.md` — will be rewritten by Prompt U0 below.
6. Only then: `04_SYSTEM_DESIGN_PRD.md`, `05_BUSINESS_LOGIC.md`, `08_EXECUTION_BIBLE.md` for the details of whichever module you are touching.

Everything marked `[VERIFY]` is something the author believes but did not prove from inside the repo. Check it against the live system before acting on it.

---

## 1. Where the project actually stands (honest status)

### 1.1 What is built and verified (backend / infra — strong)

| Area | State | Evidence |
|---|---|---|
| Public site (Platform 1) | Live on `netcyberai.com`, SEO/AEO tooling in CI | Phase 0 acceptance passed |
| Stack | Next.js 14 App Router, TypeScript, Tailwind, Supabase Postgres (Supavisor pooler, port 6543), Vercel | repo |
| Route groups | `(public)`, `(admin)` → `/control/*`, `(school)` → `/app/*` | repo |
| Tenancy | `school_id` on every operational table; `memberships` (user↔school↔role); GUCs `app.current_tenant_id / current_role / current_user_id` | C-log |
| RLS | Tenant isolation PERMISSIVE + role overlays **RESTRICTIVE** (the permissive-OR bug class fixed 3×) | Pre-F, Prompt H, PR #10 |
| DB choke point | Only `src/lib/auth/db.ts` may `SET LOCAL ROLE` / `set_config` — enforced by `check_choke_point.py` | C34, C40 |
| Auth | App-minted 15-min JWT + rotating httpOnly refresh token (`sessions` table), Supabase Auth used only as identity oracle, MFA, `token_version` revocation | B2 |
| Impersonation | super_admin → any role, start/end proven (zero-row UPDATE bug fixed) | C40 |
| Onboarding stages, feature flags, invites | Built | Prompt E |
| Capture | CSV import (idempotent), OCR pre-fill → human review, opaque QR tokens | Prompt F, C49–C50 |
| Consent & compliance | 6-purpose `consent_ledger` (append-only), guardian verification state machine, DSR 3-step gate, pseudonymization | Prompt G |
| Attendance | Marking + 10-minute free edit / note-required / period-lock correction flow | Prompt H |
| WhatsApp send-gate | Single module; consent, quiet hours, budget, idempotency, template status, provider resolution, attempt logging; `WhatsAppProviderSPI` + mock; per-school WABA (Vault-encrypted) with platform-default fallback | Prompt H, PR #8 |
| Fee engine foundation | 6 tables exist (`fee_heads`, `fee_structures`, `fee_structure_items`, `fee_concessions`, `payments`, `fees_ledger`), currency-neutral (`amount_minor`, `currency`), payments append-only, RESTRICTIVE accounting policies, `recompute_fee_status()` fixed | PR #10 |
| Test data hygiene | `schools.is_test_fixture` column; Alpha/Beta fixtures tagged | PR #11 |
| CI guards | choke point, service role, RLS policies, route guards, append-only grants, stale column refs, contrast (WCAG), fabricated claims, SEO audit | `.github/workflows/checks.yml` |

### 1.2 What is missing (the founder's critique — and it is correct)

1. **UI/UX is not product-grade.** Current `/control` and `/app` screens are text on white with minimal primitives. `07_DESIGN_SYSTEM.md` defined tokens and ~14 primitives but no layout shell, no charts, no data-dense patterns, no motion. For a first sales meeting this is disqualifying.
2. **No demo data.** Dashboards render empty or as static stubs. The PR #11 audit confirmed: recognition, analytics and dashboard pages have **zero real queries** today.
3. **Module coverage is narrow.** Every competitor reviewed (§4) sells admissions, timetable, exams/report cards, homework, HR/leave, events, certificates, reports as table stakes. We have attendance, fees (partial), consent, capture.
4. **No teacher app.** Demos need a teacher marking attendance on a phone.
5. **No parent app structure.**

### 1.2a Live site audit — netcyberai.com (crawled 2026-09-23, Playwright, 1440px + 360px)

**What exists:** 14 public pages plus 15 blog posts in the sitemap. Home, Pricing, Concept Demo (Principal / Teacher / Parent tabs, static fictional data), 6 feature pages, Data Ownership, Blog, Privacy, Terms, Staff login. `/control` and `/app` redirect (307) to `/login`. `robots.txt` blocks AI crawlers from `/demo` as designed. The copy is strong and honest.

**Measured on every page:**

| Check | Result |
|---|---|
| `<img>` elements | **0 on every page.** No product screenshot, illustration, photo or phone mockup anywhere |
| Visual elements (img/svg/video/canvas) | 1 per page (the hamburger icon) |
| Font | system stack only (`-apple-system, Segoe UI, Roboto…`), no brand typeface |
| Background colors in use | 3: off-white, white, Sapphire `#0F4C81` |
| Layout | every page is the same template: text hero → 3 white cards → FAQ accordion → blue CTA band → footer |
| Home page | 329 words, 5 nav links, 4 CTAs, all "Book a demo" |
| Lead capture | **no form anywhere.** Every CTA goes to one `wa.me/919817707037` link, so the site never captures a lead in the system |
| Motion | only default hover transitions, no scroll/entrance animation |
| Charts / data visuals | none, even on the Concept Demo page (principal view is a list of text cards) |
| Login | bare email/password card with marketing header and footer, no brand panel, no OTP/phone option |

**Verdict:** accurate, accessible, fast, and visually generic. It reads like a well-written document, not a product. Keep the copy, SEO structure and honesty rules. **Replace the entire visual layer** (U0 + U2).

### 1.3 Why it happened (so it doesn't happen again)

The sequence was deliberately backend-first: security and data integrity before screens. That was the right order for correctness — it found and fixed ~20 real, silent bugs that would have been catastrophic with live schools. But nothing in the process forced a **visual acceptance gate**, so "done" meant "verified in SQL", never "a principal would want to use this". §8 adds that gate permanently.

---

## 2. Hard decisions (made, not a menu)

### D1 — Do not fork an open-source ERP. Use open source at the component layer.

Checked 2026-09-23 by cloning each repo and reading the actual license file:

| Project | License (verified) | Stack | Verdict |
|---|---|---|---|
| GegoK12 | MIT | Laravel 12, PHP 8.4, Vue 3 | Reference only. Permissive, but porting PHP/Vue into our Next.js/TS/Supabase stack is a rewrite, and it would bypass our RLS/choke-point security model. Use its model list as a domain checklist. |
| Frappe Education | GPL-3.0 | Python / Frappe | Reference only. Copyleft + different stack. |
| Gibbon | GPL-3.0 | PHP | Reference only. |
| RosarioSIS | GPL-2.0 | PHP | Reference only. |
| OpenEduCat | LGPL-3.0 (on Odoo) | Python / Odoo | Reference only. |

**Rule:** reading these for workflow ideas and field lists is fine. **Copying code from any GPL/LGPL project into this repo is forbidden.** Copying from GegoK12 is legally allowed with its MIT notice, but pointless because nothing in PHP transfers.

**What we use instead (all permissive, verified on npm 2026-09-23) — this is how we get speed with 100% ownership:**

| Need | Library | License |
|---|---|---|
| Component system (code copied into our repo = we own it) | shadcn/ui (Radix primitives) | MIT |
| Charts | Recharts; Tremor chart components | MIT / Apache-2.0 |
| Data tables | @tanstack/react-table | MIT |
| Forms + validation | react-hook-form + zod | MIT |
| Motion | framer-motion | MIT |
| Icons | lucide-react | ISC |
| Toasts, command palette, mobile drawer | sonner, cmdk, vaul | MIT |
| URL-synced filters | nuqs | MIT |
| Dates | date-fns | MIT |
| PDF receipts / report cards / ID cards | @react-pdf/renderer | MIT |
| i18n (Hindi/Hinglish) | next-intl | MIT |
| PWA / offline | @serwist/next | MIT |
| Seed data | @faker-js/faker (`en_IN` locale) | MIT |

Every library above is a dependency or copied source we control. No per-seat fees, no license that forces us to publish our code.

### D2 — Demo lives in a separate environment, not in production.

The founder wants rich dummy data and wants to delete it all later. Production can't do this cleanly: `payments`, `consent_ledger`, `audit_log` and `webhook_events` are append-only by design, and deleting audit rows breaks the hash chain. So:

- **Second Supabase project `netcyberai-demo`** (free plan allows 2 active projects — verified on supabase.com/pricing). Same migrations, applied in the same PR as production.
- **`demo` git branch → `demo.netcyberai.com`** on Vercel with its own env vars pointing at the demo DB `[VERIFY: branch-domain assignment on current Vercel plan]`.
- Heavy seed data lives **only** there. "Delete all dummy data" = delete the demo project. Production keeps only the tagged Alpha/Beta fixtures.
- **Trap:** free Supabase projects **pause after 1 week of inactivity** (verified). A paused demo DB in front of a principal is a lost deal. Mitigation: a weekly GitHub Actions keep-alive query, or move the demo project to a paid plan before the first real demo.

### D3 — Teacher app = installable PWA first, native later.

- `/t/*` route group, mobile-first, installable to the home screen (icon, splash, no URL typing, persistent session — which fixes the "log in through the browser every time" complaint).
- Offline attendance queue (IndexedDB) that syncs when online. This follows the Floor Device Standard: budget Android, 3G.
- One codebase, same auth, same RLS, no Play Store review cycle.
- Wrap with Expo/Capacitor later **only if** Play Store presence is needed for credibility. Not before a school asks.

### D4 — Parent app: structure now, build later.

- Reserve the `(parent)` route group and `/p/*` path, the `parent` role in `memberships`, and versioned API contracts (`/api/v1/parent/*`) for: child summary, attendance, fees + pay link, daily pulse, weekly brief, consent management.
- No screens beyond a placeholder. WhatsApp stays the primary parent channel (Constitution). The parent app becomes a companion, not a replacement.

### D5 — Match competitors at "demo depth" broadly, "production depth" narrowly.

Competing on module count is a losing game: at least one competitor (SchoolThinker) is advertising its ERP free for the first 500 schools for 2026–27. We win on the differentiators (WhatsApp daily pulse, fee recovery, principal impact card, consent/DPDP, Hinglish, UX). But a school won't switch if its daily tasks are missing, so:

- **Tier A (production-grade, full read+write, VERIFY-tested):** Students/SIS, Attendance, Fees, Communication, Consent, Dashboards, Admissions, Exams & report cards.
- **Tier B (working but simpler):** Academics setup (sessions, classes, subjects, teacher allocation), Homework, Timetable (manual, conflict detection — no "AI generator" claim), Staff & leave, Events/calendar, Certificates & ID cards, Reports/exports.
- **Tier C (roadmap page only, feature-flagged off):** Transport (no GPS), Library, Inventory/Assets, Hostel, Payroll, Accounting/Tally.
- **Permanently rejected (unchanged):** RFID, biometric/face recognition hardware, IoT, blockchain, WhatsApp Groups, live GPS promises.

**Honesty rule for demos:** a Tier C module is never shown to a school as working. It shows as "On the roadmap" with an "Interested? Tell us" button that records demand. This is `check_claims.py` discipline applied to UI.

### D6 — Premium design is an acceptance criterion, not polish.

See §5. Every UI PR ships with screenshots at 360px and 1440px and waits for the founder's visual approval before merge.

### D7 — Business prerequisites the founder owns.

- **Vercel Hobby is non-commercial only** (verified in Vercel's fair-use guidelines: "Hobby teams are restricted to non-commercial personal use only", and "advertising the sale of a product or service" counts as commercial). `netcyberai.com` already advertises a product. Move to Pro before any paid pilot.
- Razorpay test keys (Prompt I prerequisite).
- Meta WhatsApp Business verification for the platform-default WABA (multi-day external process).

---

## 3. Product surfaces and module map

Five surfaces, one Next.js app, one shared design system, one tenant-aware backend.

| Surface | Path | Users | Device priority |
|---|---|---|---|
| P1 Public website | `/` | visitors, principals, owners, **parents (referral)** | mobile + desktop |
| P2 Control plane | `/control` | NetCyberAI staff (super_admin, onboarding, support) | desktop |
| P3 School workspace | `/app` | principal, school_admin, accountant, academic coordinator | desktop-primary, tablet OK |
| P4 Teacher app (PWA) | `/t` | teacher | phone (360px floor) |
| P5 Parent app (structure only) | `/p` | parent | phone |

### 3.1 P1 — Public website (rebuild)

**Nav:** Product ▾ (Parent Trust, Fee Recovery, School Operations, Compliance) · Solutions ▾ (Principals, Owners/Trusts, Teachers, Parents) · Pricing · Resources · About · Login · **Book a demo** (primary).

| Page | Sections / functions |
|---|---|
| Home | Hero with an **animated live product mock** (real dashboard component with seed data, not a stock image) · three trust gaps (existing copy, restyled) · feature bento grid · "a day in the life" flow (teacher marks attendance → parent WhatsApp → principal dashboard) · WhatsApp message preview carousel (Hinglish) · Form 6 wedge (Haryana, jurisdiction-gated) · pilot program CTA · FAQ · footer |
| Product pages (×4) | problem → workflow → screenshots → outcome → CTA |
| Solutions (×4) | role-specific pain, workflow, modules, CTA |
| **For Parents** (new) | Why your child's school should use this · **"Recommend NetCyberAI to your school" form** (parent name, phone, school name, school phone, city, class of child, marketing-consent checkbox) → becomes a lead in P2 tagged `source=parent_referral` |
| Pricing | plans (Pilot / Standard / Premium / Group), student-count calculator, WhatsApp cost shown separately, CTA |
| Demo booking | form + time-slot preference → lead in P2; confirmation email |
| Resources | FAQ, guides, DPDP explainer, Form 6 guide (existing SEO content) |
| Login | email/phone + password, OTP, MFA, school picker for multi-membership users |

**Rules:** no fabricated testimonials, logos, counts or statistics. Before the first pilot, social proof = "Pilot program — founding schools" framing. `check_claims.py` stays in CI.

### 3.2 P2 — Control plane (`/control`)

Sidebar: Dashboard · Leads · Schools · Onboarding · Users · Monitoring · Billing & Plans · Support · Templates · Compliance · Audit · Settings.

| Module | Sub-tabs | Key widgets / actions | Tier |
|---|---|---|---|
| Dashboard | — | KPIs: schools by status, students, active users (7d), MRR, WhatsApp sent/failed + spend, consent coverage, open tickets · charts: school growth, onboarding funnel, message volume, schools at risk · alert list | A |
| Leads (new) | All · Demo requests · Parent referrals · Contact · Won · Lost | assign owner, status, follow-up date, convert → school (starts onboarding) | A |
| Schools | list (search, filter, saved views, bulk actions) | create school, activate/suspend, change plan, impersonate, feature flags | A |
| School detail | Overview · Profile · Users · Students · Attendance · Fees · Communication (WhatsApp config, spend) · Consent · Usage · Billing · Audit | health score, onboarding progress, last activity, per-school quota/budget | A |
| Onboarding | pipeline board by stage | checklist, owner, blockers, go-live approval, **`pilot_allow_outbound` flip** (deferred wizard, C60) | A |
| Users | platform staff · school admins · invitations · suspended | invite, role, reset MFA, revoke sessions | A |
| Monitoring | Messaging health · Webhooks · Imports · Errors · Security (failed logins, impersonation log) | retry, acknowledge | B |
| Billing & Plans | Plans · Subscriptions · Invoices · Messaging charges | assign plan, limits (students, messages, modules) | B |
| Support | Tickets | create, assign, status, link to school | B |
| Templates | WhatsApp templates (status: draft/submitted/approved) · consent wording · email | versioning | B |
| Compliance | consent coverage by school · DSR queue · retention config | | A |
| Audit | global audit log with filters | export evidence | A |
| Settings | roles, feature flags defaults, security policy | | B |

### 3.3 P3 — School workspace (`/app`)

Sidebar (role-filtered): Dashboard · Students · Admissions · Attendance · Academics · Exams · Fees · Communication · Staff · Calendar · Reports · Compliance · Settings. Tier C modules appear only if their feature flag is on.

| Module | Sub-tabs | Key functions | Tier |
|---|---|---|---|
| **Dashboard** | — | KPIs with trend deltas: students, attendance today (%), absent list, fees collected (month) vs due, overdue, consent pending, pending approvals · charts: 30-day attendance trend, class-wise attendance heatmap, fee collection vs target, admissions funnel · **Principal Impact Card** (private) · at-risk students · today's syllabus coverage (`not_taught` visible) · recent activity | A |
| Students | All · Class/section · At-risk · Fee defaulters · Consent pending · Inactive | profile tabs: Overview, Guardians, Attendance, Fees, Exams, Documents, Communication, Consent, Activity · add, import CSV, promote, transfer, deactivate, ID card PDF | A |
| Admissions | Enquiries · Applications · Documents · Interview/Assessment · Offers · Enrolled · Waitlist/Rejected | kanban pipeline, send application link, convert → student (creates consent-pending record), source analytics | A |
| Attendance | Today · Class-wise · Student · Corrections · Staff · Analytics · Settings | unmarked-class alert, correction approval, threshold config, absence WhatsApp via send-gate | A |
| Academics | Session & terms · Classes & sections · Subjects · Teacher allocation · Syllabus progress · Homework · Timetable | conflict detection on timetable, syllabus `taught / partial / delayed / not_taught` | B |
| Exams | Exam setup · Marks entry · Verify/Approve · Grading schemes · Report cards · Analytics | workflow Draft → Submitted → Verified → Approved → Published (published is immutable, corrections are versioned); report card PDF | A |
| Fees | Dashboard · Structures & heads · Assignments · Invoices · Payments · Receipts · Dues/Defaulters · Concessions · Reminders · Reconciliation · Form 6 (IN-HR only) | record cash/UPI/cheque, Razorpay link, receipt PDF, reminder sequence via send-gate, sibling concession via `parent_student_map` only | A |
| Communication | Compose · Templates · Scheduled · Sent/Failed · Replies · Approvals · Analytics | audience by class/section/defaulters/absentees, consent check preview ("214 eligible, 12 blocked: no consent"), cost preview, approval flow | A |
| Staff | All staff · Teachers · Leave requests · Allocation · Documents | approve leave, assign classes/subjects | B |
| Calendar | School calendar · Holidays · Exams · PTM · Events | create/publish event, notify via send-gate | B |
| Reports | Student register · Attendance · Fees/collections · Dues · Exams · Communication · Consent · Audit | filter, preview, CSV/XLSX/PDF export, full data export (anti-lock-in promise) | A/B |
| Compliance | Consent dashboard · Pending · Withdrawn · Guardian verification · DSR · Retention | existing Prompt G functionality, surfaced | A |
| Settings | Profile & branding · Academic rules · Roles & permissions · Attendance · Fees · Communication (WhatsApp config panel exists) · Integrations · Audit | | A |
| Transport / Library / Inventory / Hostel / Payroll | roadmap card only | "Tell us you need this" → demand counter in P2 | C |

### 3.4 P4 — Teacher PWA (`/t`)

Bottom nav: **Today · Attendance · Homework · Marks · Me**.

| Screen | Function |
|---|---|
| Today | my periods, unmarked classes (red), pending tasks, one-tap "Mark attendance" |
| Attendance | class roster, **all-present default, tap to mark absent/late** (exception-based, fast-tap), submit, works offline (queued, syncs later, visible sync status — never a silent failure) |
| Syllabus pulse | per period: taught / partial / not_taught + one-line topic (feeds parent Daily Pulse) |
| Homework | post homework (text + photo), view submissions queue |
| Marks | enter marks for assigned exam/subject, submit for verification |
| Me | profile, leave request, language (English/Hindi), logout |

Privacy boundary (existing rule): teachers never see the Principal Impact Card or other teachers' signals.

### 3.5 P5 — Parent (structure only, Phase 2 build)

Reserve: `/p` route group, `parent` role, `/api/v1/parent/*` contracts for child summary, attendance, fees + pay link, daily pulse history, weekly brief, consent management, messages. One placeholder screen. WhatsApp remains the primary channel.

---

## 4. Competitor parity matrix (fetched 2026-09-23)

Sources: edunexttechnologies.com/school-erp.php, vidyalayaschoolsoftware.com, schoolthinker.com, eduerp.ai/school-erp-software, edumerge.com/products/school-erp. ✓ = named on their page.

| Module | Edunext | Vidyalaya | SchoolThinker | EduERP.ai | edumerge | NetCyberAI plan |
|---|---|---|---|---|---|---|
| SIS / student records | ✓ | ✓ | ✓ | — | ✓ | Tier A |
| Admissions | — | ✓ | — | ✓ | ✓ | Tier A |
| Attendance | ✓ | ✓ | ✓ | ✓ | ✓ | Tier A (built) |
| Fees + online payment | ✓ | ✓ | ✓ (UPI QR) | ✓ | ✓ | Tier A (partly built) |
| Exams / report cards | — | ✓ | ✓ (CBSE/NEP HPC) | ✓ | ✓ | Tier A |
| Timetable | — | ✓ (AI) | ✓ (AI) | ✓ | ✓ | Tier B (manual + conflict check) |
| Homework / lesson plan | ✓ | ✓ | ✓ (teacher app) | ✓ | ✓ | Tier B |
| HR / leave / payroll | ✓ | ✓ | — | ✓ | ✓ (staff info) | Leave Tier B; payroll Tier C |
| Communication (SMS/WhatsApp) | ✓ | ✓ | ✓ | ✓ | ✓ | Tier A + differentiator |
| Certificates / ID cards | — | ✓ | — | — | ✓ | Tier B |
| Events / calendar | — | ✓ | — | — | ✓ | Tier B |
| Reports / MIS | — | ✓ | ✓ | ✓ | ✓ | Tier A/B |
| UDISE+ / APAAR | — | — | ✓ | ✓ | — | Later (existing spec) |
| Transport + GPS | ✓ | ✓ | ✓ | ✓ | ✓ | Tier C, **no GPS promise** |
| Library / Inventory / Hostel | ✓ | ✓ | ✓ | ✓ | ✓ | Tier C |
| Biometric / RFID / face | ✓ | ✓ | ✓ | ✓ | — | **Rejected** |
| Parent app | ✓ | ✓ | ✓ | ✓ | (web+app) | P5 structure; WhatsApp-first |
| Teacher app | ✓ | — | ✓ | ✓ | — | P4 PWA |
| **Daily learning pulse to parents** | — | — | — | — | — | **Differentiator** |
| **Consent/DPDP ledger** | — | — | — | — | — | **Differentiator** |
| **Principal Impact Card** | — | — | — | — | — | **Differentiator** |
| **Form 6 fee advisory (HR)** | — | — | — | — | — | **Differentiator** |

"—" means the fetched page didn't name it, not that the product lacks it.

**Unverified claims in older project docs:** `NETCYBERAI_PRODUCT_FEASIBILITY_&_MARKET_GAPS.md` states "65% of schools complain…" with no traceable source. Treat it as unverified. Do not reuse it in marketing copy.

---

## 5. Design system v2 (replaces `07_DESIGN_SYSTEM.md` visuals; keeps its accessibility rules)

**Direction:** modern SaaS (think Linear/Stripe-dashboard clarity), warm enough for schools. Data-dense but calm. Not a template look.

- **Brand:** keep Sapphire `#0F4C81` as primary, Emerald for success, Amber for warning. Generate full 50–950 scales. Keep the accessible `emerald-text` / `amber-text` variants (contrast checker stays in CI).
- **Type:** Inter (Latin) + Noto Sans Devanagari (Hindi), tabular numerals for all figures.
- **Theme:** light default, dark mode supported from day one (token-based).
- **Surfaces:** off-white app background, white cards, 1px subtle borders, soft shadows, 12–16px radius.
- **App shell (P2/P3):** collapsible sidebar with icons and section groups · top bar with school switcher, global search (`⌘K`, cmdk), notifications, profile · breadcrumbs · page header (title, description, primary CTA, secondary actions).
- **Dashboard patterns:** KPI card (value, delta vs previous period, sparkline, click → filtered list) · chart card (title, range picker, empty/loading/error states) · activity feed · "needs attention" list.
- **List pattern (every list page):** search, filters (URL-synced), column toggles, saved views, bulk actions, pagination, row actions menu, CSV/XLSX export.
- **Detail pattern:** summary header + status badge + tabs + activity timeline.
- **States:** skeleton loaders (never blank white), empty states with illustration + primary action + import hint, error states with retry + reason.
- **Motion:** 150–250ms transitions, number count-up on KPIs, page/section fade-in. Respect `prefers-reduced-motion`.
- **Mobile (P4/P5 and P3 at <768px):** bottom nav, 44px tap targets, thumb-reachable primary actions, bottom-sheet dialogs (vaul).
- **Charts:** one palette across all charts. Line for trends, bar for comparisons, heatmap for class × day attendance, funnel for admissions/onboarding. Always labeled axes, tooltips, and no chart without a text takeaway.

---

## 6. Demo data specification

Generator: `scripts/seed/` (TypeScript, faker `en_IN`, **fixed random seed** so every run is identical). Target DB: **demo project only** — the script refuses to run unless `SEED_TARGET=demo` and the DB URL matches the demo project ref.

All counts and percentages below are **generator parameters for fictional data**, not real-world figures. If `check_claims.py` flags them, add an explicit exemption comment in the seed config. Don't weaken the checker.

| Entity | Volume |
|---|---|
| Schools | 3: "Green Valley Public School, Palwal" (CBSE, IN-HR, ~850 students), "Sunrise Convent, Faridabad" (CBSE, IN-HR, ~420), "Little Scholars Academy, Jaipur" (RBSE, IN-RJ, ~260) — names fictional, marked `is_test_fixture=true` |
| Academic | 1 session (2026–27), 2 terms, Nursery–XII, 2–4 sections per class, subjects per class |
| Staff | ~45 / 25 / 15 teachers, plus admin, accountant, principal per school |
| Students & guardians | realistic Indian names, siblings linked via `parent_student_map`, mixed consent states (~80% granted, ~12% pending, ~8% withdrawn) |
| Attendance | 90 school days of history, realistic patterns (Monday dips, festival absences, 5–8 chronic absentees per school) |
| Fees | quarterly structure, concessions (sibling, staff ward), payments via cash/UPI/cheque, ~15% defaulters, overdue ageing buckets |
| Exams | 1 unit test + half-yearly with marks, grade distribution, 2–3 weak subjects per school |
| Communication | sent/delivered/failed/blocked-by-consent history through the **mock** provider (real send-gate code path, not a bypass) |
| Admissions | ~60 enquiries across all pipeline stages |
| Syllabus pulse | taught / partial / not_taught entries for the last 30 days |
| P2 | 3 schools at different onboarding stages, 8 leads (incl. parent referrals), 5 tickets |

**Demo logins** (demo DB only, passwords generated at seed time, printed once to the operator, never committed): one per role — super_admin, principal, school_admin, accountant, teacher, parent. On the demo environment, separate logins are fine (unlike production, where impersonation is preferred), because a principal watching a demo expects to see the teacher's phone.

**Purge:** "delete all dummy data" = delete the demo Supabase project + demo Vercel env. Production is untouched.

---

## 7. Revised build sequence

This supersedes the order of the remaining prompts in `08_EXECUTION_BIBLE.md`. Prompt I's **spec** is unchanged. It moves after the UI foundation so it ships with real screens.

| # | Prompt | Scope | Depends on |
|---|---|---|---|
| **U0** | Design system + app shells | shadcn/ui setup, tokens v2, fonts, P2/P3 app shell (sidebar, top bar, ⌘K, school switcher), full primitive + pattern library (KPI card, chart card, data table, filters, detail tabs, states), `/dev/components` gallery page (non-prod), rewrite `07_DESIGN_SYSTEM.md` | — |
| **U1** | Demo environment + seed | 2nd Supabase project, migrations replay, `demo` branch/domain, seed generator (§6), keep-alive job, demo logins | U0 (parallel OK) |
| **U2** | P1 website rebuild | all P1 pages (§3.1) incl. parent referral form → `leads` table, demo booking, pricing calculator, animated product mock. **Reuse all existing copy, URLs, metadata and FAQ schema** (SEO equity; `seo_audit.py` must still pass). Replace only the visual layer, and turn `/demo` into a real interactive product preview built with the U0 components. Target: zero "text-only" sections on Home | U0 |
| **U3** | P3 core screens | Dashboard, Students (+detail), Attendance, Compliance, Settings — wired to real queries (respecting `is_test_fixture` in any cross-school aggregate) | U0, U1 |
| **U4** | P2 core screens | Dashboard, Leads, Schools (+detail), Onboarding board (incl. deferred `pilot_allow_outbound` wizard), Users, Audit | U0, U1 |
| **U5** | Teacher PWA | §3.4, offline queue, install manifest, Hindi toggle | U0, U1 |
| **I** | Fees (existing spec) | engine completion, Razorpay (test keys), receipts, reminders via send-gate, reconciliation, Form 6 surface **+ Fees UI** | U3 |
| **U6** | Communication center | compose, audience, consent preview, approvals, analytics | U3 |
| **U7** | Admissions | pipeline + convert-to-student | U3 |
| **U8** | Exams & report cards | workflow, marks entry (P3 + P4), report card PDF | U3, U5 |
| **U9** | Academics / timetable / homework | Tier B | U3 |
| **U10** | Staff & leave, Calendar, Certificates/ID cards, Reports export | Tier B | U3 |
| **U11** | Parent app structure | routes, role, API contracts, placeholder | U3 |
| **J–M** | Remaining Execution Bible prompts | re-sequenced after U11; each gets its UI in the same prompt | — |
| **H2** | Audit atomicity + tenant DPDP purge/export | from the founder's 8-point review | before first paid school |

**Milestone "Demo-ready"** = U0–U5 done. That is the point where the founder can walk into a school.

---

## 8. Standing rules (every prompt, every AI)

Existing rules that still apply:

1. Additive migrations only. Locked baselines (`db/schema.sql`, `db/rls_policies.sql`) stay byte-identical.
2. RLS: tenant isolation PERMISSIVE; every role overlay RESTRICTIVE. Never write `<negated role check> OR <condition>` as a permissive policy.
3. Only `db.ts` sets role/GUCs (`SET LOCAL`, never bare `SET`). Only the send-gate calls a WhatsApp provider. Only the documented module uses the service role.
4. Append-only tables (`payments`, `consent_ledger`, `audit_log`, `webhook_events` — the list enforced by `check_append_only_grants.py`) keep UPDATE/DELETE revoked from app roles. `sessions` is a separate case: RLS off, reachable only by `app_backend` (C44).
5. Mutations that expect to change a row must check the affected-row count and treat 0 as failure.
6. Every cross-school business metric excludes `is_test_fixture = true`.
7. No fabricated numbers, testimonials, logos or claims anywhere (code, copy, seed data presented as real).
8. Verify against the live system with real evidence (and negative tests) before claiming done. A figure carried forward from an earlier report is not verified until re-measured.
9. One concern per PR. Merge commits, not squash. **Only the founder merges.**
10. Never subscribe to PR activity, comment, or self-schedule without explicit same-turn permission. The platform auto-subscribes on PR creation (C61), so unsubscribe immediately.
11. Temporary diagnostic routes are stripped and confirmed 404 **before** merge (C39).
12. Close every prompt with the Transparent Output Template report and a Decision Log entry for any real bug or decision.

New rules from this plan:

13. **Visual acceptance gate.** Every PR that changes UI includes screenshots of each changed route at 360px and 1440px, light theme (dark for U0), with seed data visible. The founder approves visually before merge. If the sandbox cannot render with data, the PR says so and links the preview/demo URL for the founder to check, marked `[VISUAL REVIEW PENDING]`.
14. **No blank screens.** Every page has loading, empty and error states. A white page with text and no states fails review.
15. **Tier honesty.** Tier C modules are never presented as working.
16. **Demo ≠ production.** Heavy seed data never goes to the production DB. The seed script hard-refuses non-demo targets.
17. **Every data view respects role.** UI hiding is never the security boundary. RLS and API checks are.

---

## 9. Known gaps and risks

- `[GAP]` North Star response-rate target (Constitution Amendment 3). Needs pilot data.
- `[GAP]` DPDP erasure vs financial-retention conflict. Needs legal counsel, not code.
- `[GAP]` OTP delivery channel for guardian verification (placeholder today).
- `[GAP]` Real WhatsApp sending: blocked on Meta verification (platform WABA).
- `[GAP]` Branch protection on `main` still not applied.
- `[VERIFY]` Whether Claude Code's sandbox can reach `demo.netcyberai.com` for screenshots (it cannot reach `*.vercel.app` or `graph.facebook.com`; custom-domain egress is untested).
- **Risk:** scope. §7 is roughly 16 prompts. A solo founder + AI can easily spend months on Tier B. Hold the line: Demo-ready (U0–U5) first, then get a school, then let real demand order Tier B.
- **Risk:** Vercel Hobby commercial-use violation (D7).
- **Risk:** demo DB auto-pause (D2).

---

## 10. Prompt U0 — ready to paste into Claude Code

```
Prompt U0 — Design System v2 + App Shells

Read first: docs/00_START_HERE.md, docs/01_CONSTITUTION.md, docs/10_DECISION_LOG.md,
docs/11_MASTER_REBUILD_PLAN.md (this plan — commit it to docs/ as the first commit of
this PR, and add a Decision Log entry recording that it re-sequences the Execution Bible).

Goal: make the product look and feel premium before any more screens are built, so
nothing gets built twice.

TASK 0 — Confirm state
- Current deployed commit on netcyberai.com; PRs #10/#11 merged or not.
- Inventory every page under src/app/(admin), (school), (public): list which are real,
  which are stubs. Report it as a table.
- Test whether this sandbox can load netcyberai.com (custom domain) in headless Chromium
  (Playwright is preinstalled; use executablePath /opt/pw-browsers/chromium if needed).
  Report yes/no with evidence — this decides how the visual gate works.

TASK 1 — Foundation
- Install/initialise shadcn/ui (copy components into src/components/ui), Radix,
  lucide-react, framer-motion, sonner, cmdk, vaul, nuqs, @tanstack/react-table,
  react-hook-form, zod, recharts, date-fns. Licenses must be MIT/Apache/ISC; list them
  in docs/THIRD_PARTY_LICENSES.md.
- Tokens v2 per plan §5 (full color scales from existing brand colors, dark mode,
  radius, shadows, motion). Fonts: Inter + Noto Sans Devanagari via next/font.
- Keep check_contrast.py passing; extend it to the new tokens.

TASK 2 — App shells
- P2 (/control) and P3 (/app) layouts: collapsible sidebar with grouped nav from plan
  §3.2/§3.3 (role-filtered, feature-flag-aware), top bar (school switcher, ⌘K command
  palette, notifications placeholder, profile menu), breadcrumbs, page header component.
- Mobile: sidebar collapses to a drawer below 1024px.
- Nav items for modules not built yet go to a consistent "Coming next" page (Tier A/B)
  or "On the roadmap — tell us you need this" (Tier C). No dead links, no blank pages.

TASK 3 — Pattern library
- KPICard (value, delta, sparkline, href), ChartCard (line/bar/area/heatmap/funnel with
  loading/empty/error), DataTable (search, URL-synced filters, column toggle, bulk
  actions, pagination, row menu, CSV export), DetailHeader + Tabs, ActivityTimeline,
  EmptyState, ErrorState, Skeletons, StatusBadge, FormField set.
- A /dev/components gallery page rendering every component with sample props,
  excluded from production builds and from the sitemap.

TASK 4 — Restyle what exists
- Login page, existing attendance screens, WhatsApp config panel, /control/schools list:
  move them onto the new shell and patterns. No behaviour changes.

TASK 5 — Docs
- Rewrite docs/07_DESIGN_SYSTEM.md to match what you built (tokens, components, usage
  rules, the visual acceptance gate from plan §8 rule 13).

VERIFY (real evidence)
- Screenshots at 360px and 1440px of: login, /control shell, /app shell, /dev/components,
  attendance screen, WhatsApp config — light and dark. If the sandbox can't render with
  a session/data, say so explicitly and mark the PR [VISUAL REVIEW PENDING] with exact
  URLs for the founder.
- All existing CI guards pass; contrast checker passes on new tokens; typecheck + build
  clean; no route regressions (route-guard checker).

Standing rules: plan §8 in full. One PR for U0. Founder merges. Unsubscribe from the
auto PR subscription immediately. Close with the Transparent Output Template report.
Do not start U1 in this PR.
```

---

## 11. Change log

| Date | Change |
|---|---|
| 2026-09-23 | Created. Adds UI/UX rebuild, demo environment, teacher PWA, parent structure, competitor parity, open-source strategy, re-sequenced prompts U0–U11. |
