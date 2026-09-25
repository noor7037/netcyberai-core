# 12 — NetCyberAI E2E Reconstruction & Engineering Plan (Investigation)

**Status:** Investigation deliverable. No production code changed to produce
this document — repo/DB read-only inspection plus external research only.
**Date:** 2026-09-23.
**Governs:** nothing by itself. It reconciles
[`11_MASTER_REBUILD_PLAN.md`](11_MASTER_REBUILD_PLAN.md) against
same-day live evidence and answers the specific questions
`11_MASTER_REBUILD_PLAN.md` did not cover (ProjectWorlds purchase
decision, AI-governance spec, Gap/Contradiction/Build registers, journey
maps). Where this document finds `11_MASTER_REBUILD_PLAN.md` stale or
wrong, it says so explicitly under §1 — it does not silently correct it.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md) (locked, unchanged),
[`11_MASTER_REBUILD_PLAN.md`](11_MASTER_REBUILD_PLAN.md) (authoritative
over PRD §7 / Execution Bible ordering, per its own header, per the
founder's instruction this session).

**No implementation code was written to produce this document.** Two docs
files are added/verified in this same PR (this file, and
`11_MASTER_REBUILD_PLAN.md` itself — see §0). Everything else is a
proposal for the founder to approve, per the founder's own stated
principle: *"no existing decision is permanently sacred, but no change
happens silently — WHAT EXISTS / WHAT THE NEW EVIDENCE SAYS / WHAT IS
PROPOSED / WHY / WHAT THE TRADE-OFF IS, and the founder decides."* This
document uses that exact format everywhere it proposes a change.

---

## 0. What this PR actually does

`11_MASTER_REBUILD_PLAN.md` was supplied by the founder this session as
an already-written, evidence-heavy rebuild plan, explicitly designated
authoritative over PRD §7 and the Execution Bible's prompt order where
they conflict. It was **not yet in this repository** — confirmed by
`ls docs/` before this PR (only `00`–`10` existed). Its own §10 "Prompt
U0" text says: *"commit it to docs/ as the first commit of this PR."*
This PR does exactly that: commits `11_MASTER_REBUILD_PLAN.md` verbatim
as supplied, and adds this document alongside it. Nothing in either file
authorizes writing product code yet — both are explicitly investigation/
planning artifacts, and the founder's own governing instruction for this
turn was "do not begin implementation until this investigation is
complete."

---

## 1. Evidence classification legend

Every claim below carries one of these tags. A claim with no tag is a
mistake — flag it back.

| Tag | Meaning |
|---|---|
| **VERIFIED-CODE** | Read directly from a file in this repo, this session. |
| **VERIFIED-DB** | Queried directly against the live `netcyberai-dev` Supabase project (`unodnyyfqhxrbusbkite`), this session. |
| **VERIFIED-DEPLOYED** | Confirmed against a real GitHub/Vercel API response, this session. |
| **DOCUMENTED, NOT RE-VERIFIED** | Stated in a prior Decision Log entry or `11_MASTER_REBUILD_PLAN.md`, not independently re-checked this session (cited with its source). |
| **COMPETITOR MARKETING CLAIM** | What a competitor's own site says. Not verified, never to be repeated as fact about them or copied into our own marketing. |
| **PROPOSED** | Not built. A recommendation in this document or in `11_MASTER_REBUILD_PLAN.md`. |
| **[GAP]** | No evidence found either way; needs a human answer or a future build. |
| **CONTRADICTORY** | Two sources in this project disagree; flagged, not silently resolved. |

---

## 2. Corrected current-state audit (2026-09-23, same-day re-check)

`11_MASTER_REBUILD_PLAN.md` §1 is a strong, largely accurate audit
written earlier the same day. Re-running it a few hours later, on the
current branch state (`main` at `d44fea7`, PRs #10/#11/#12 all merged),
surfaces four corrections and one new finding it didn't have yet.

### 2.1 The stub surface is larger than §1.2 states — CONTRADICTORY, corrected

`11_MASTER_REBUILD_PLAN.md` §1.2 point 2 says: *"recognition, analytics
and dashboard pages have zero real queries today."* True, but incomplete.
**VERIFIED-CODE**, grepped every `page.tsx` under `src/app/(school)/app/*`
and `src/app/(admin)/control/*` for the `StubPage` component this
session:

| Surface | Stub pages (of total) | Real pages |
|---|---|---|
| `/app/*` (P3, 21 routes) | **14 stub**: dashboard, recognition, pulse, fees, marks, exams, syllabus, staff, reports, my-day, my-impact, teacher-impact, class-notices, communication, documents-id-cards, academics (16 actually — see note) | 7 real-with-data: attendance, students, admissions (partial, honest — see its own source comment), compliance, settings, `/app` root (redirect only) |
| `/control/*` (P2, 12 routes) | **9 stub**: analytics, audit-logs, billing-plans, compliance, integrations, messaging-cost, monitoring, support, system-settings, users | 3 real-with-data: onboarding, schools, schools/[schoolId] (1 of 21 sub-tabs real, 20 `EmptyState`) |

*(Correction to my own count while writing this: the P3 stub list above
has 16 named entries against a stated "14" — dashboard, recognition,
pulse, fees, marks, exams, syllabus, staff, reports, my-day, my-impact,
teacher-impact, class-notices, communication, documents-id-cards,
academics is 16 items. Re-counted directly from the grep output: 14
files matched `StubPage`, meaning two of those sixteen names are stub by
a different mechanism, not the `StubPage` component — worth a human note
rather than silently rounding. Re-checking the raw grep: `academics`,
`class-notices`, `communication`, `dashboard`, `documents-id-cards`,
`exams`, `fees`, `marks`, `my-day`, `my-impact`, `pulse`, `recognition`,
`reports`, `staff`, `syllabus`, `teacher-impact` — that actually is 16
matches, not 14. The "14" in the raw shell count above was this session's
own transcription slip while summarizing its own tool output — flagging
it here rather than quietly fixing it, per this document's own
anti-fabrication rule. **Correct figure: 16 of 21 P3 routes are stubs,
5 are real** (attendance, students, admissions-partial, compliance,
settings; `/app` root is a redirect, not a screen).)*

**Why this matters:** the founder's complaint ("only text, tabs not
placed well") is not a styling problem layered on a mostly-working
product — fewer than a quarter of the school-workspace screens have any
real query behind them at all. `11_MASTER_REBUILD_PLAN.md`'s U3/U4/U6–U10
sequence already plans to build real screens for all of these; this
correction doesn't change the plan, it sharpens how big U3–U10 actually
are. Treat "16 of 21 P3 screens, 9 of 12 P2 screens are unbuilt" as the
real starting line, not "just three dashboards."

### 2.2 `leads` table does not exist — [GAP], not previously flagged

`11_MASTER_REBUILD_PLAN.md` §3.2 (P2 "Leads" module) and §3.1 ("For
Parents" referral form → "becomes a lead in P2") both assume a `leads`
table. **VERIFIED-DB**: the live schema has 44 tables (`mcp__Supabase__
list_tables`, `netcyberai-dev`, `public` schema) and none of them is
`leads`, nor does any migration file create one (`grep -rl "leads"
supabase/migrations/*.sql db/schema.sql` — zero hits). This is not a bug
in the plan — the plan never claimed the table existed — but it is a
concrete, scoped `[GAP]` that U2/U4 must include a migration for, and it
wasn't itemized as its own line item before. Adding it here so it isn't
rediscovered mid-build.

### 2.3 Zero automated test framework exists — [GAP], not previously stated this plainly

**VERIFIED-CODE**: `package.json` has no `test` script, no `jest`,
`vitest`, or `@playwright/test` dependency; no `*.spec.ts`/`*.test.ts`
files exist anywhere in the repo outside `node_modules`. Every "VERIFY"
section in this project's history (Decision Log C40–C65) was proven with
a hand-written, one-off diagnostic route or SQL script, run once, then
deleted. That discipline is real evidence, but it is not regression
protection — nothing stops a future prompt from silently re-breaking
`recompute_fee_status()` the same way Pre-F's currency migration did.
`11_MASTER_REBUILD_PLAN.md` doesn't raise this as a risk. It should be
one: as screen count goes from 5 real to ~40 real across U0–U11, one-off
diagnostic routes per prompt stop scaling. **Proposed** (not started):
introduce Playwright (already pre-installed in this environment per the
system environment notes) as a real, kept, `npm test`-able E2E suite
starting at U0, covering the golden paths each new screen ships —
founder decision needed on whether to fold this into U0's scope or treat
it as its own prompt; not decided here.

### 2.4 Only one Supabase project exists — confirms `11_MASTER_REBUILD_PLAN.md` D2 is not yet built

**VERIFIED-DB** (`mcp__Supabase__list_projects`): exactly one project,
`netcyberai-dev` (`unodnyyfqhxrbusbkite`, `ap-south-1`, Postgres 17.6).
No `netcyberai-demo` project exists. This matches `11_MASTER_REBUILD_PLAN.md`
D2/§7 (U1) treating it as not-yet-built work, not a contradiction —
listed here only so "confirm state" (the founder's own recurring
instruction this session) is on record with a real query, not an
assumption carried from the plan's text.

### 2.5 `main` branch protection: confirmed still absent

**VERIFIED-DEPLOYED** (`mcp__github__list_branches`): `main` shows
`"protected": false`. Matches `11_MASTER_REBUILD_PLAN.md` §9's `[GAP]`
line exactly — re-verified, not stale.

### 2.6 Vercel plan tier (Hobby vs. Pro): could not be verified this session — [GAP], flagged rather than guessed

`11_MASTER_REBUILD_PLAN.md` D7 flags Vercel Hobby's non-commercial-use
restriction as a real risk since `netcyberai.com` already advertises a
paid product. This session's available Vercel MCP scope
(`list_teams`/`get_team`) does not surface plan/billing tier — the API
response has no plan field at this permission level. **Not re-verified,
not assumed true or false.** This is a five-minute check only the
founder can do (Vercel dashboard → Settings → Billing) and it blocks
nothing else in this document, but per D7 it should happen before any
paid pilot, not after.

### 2.7 The one real ML/AI-adjacent feature in the codebase today

**VERIFIED-CODE**: `package.json` has no LLM SDK of any kind (no
`openai`, `anthropic`, `@ai-sdk/*`, `langchain`). Constitution §3
Amendment 3 already documents that an "LLM narrative path" for the Daily
Pulse is designed but "sits behind a flag" — **VERIFIED-CODE**: no such
flag or code path exists yet; it is `DOCUMENTED, NOT RE-VERIFIED` as
built because it was never built, only specified. The one real
ML-touching code in the repo is `tesseract.js` OCR
(`src/lib/capture/ocr.ts`, `src/components/students/DocumentCapture.tsx`)
for document capture (Prompt F) — a client-side, non-generative OCR
library, not a call to any external AI provider. §11 below gives this
the governance treatment the founder's prompt asked for, and is explicit
that every other "AI" reference in this codebase (recognition scoring,
at-risk flags) is deterministic arithmetic (`src/lib/recognition.ts`,
locked formulas per Constitution §5), not AI, and should not be marketed
as AI.

---

## 3. RLS / tenancy verification status (re-confirmed, not re-run)

The two-school tenant-isolation suite (43 checks, Decision Log C1–C53
history) and the fee-engine hardening negative tests (Decision Log C62)
are **DOCUMENTED, NOT RE-VERIFIED this session** — re-running the full
suite was out of scope for a read-only investigation pass and would have
meant writing/deleting test rows against the live dev database outside
any of the founder's four explicit sub-tasks for this turn. `rls_enabled:
true` on 43 of 44 public tables was independently **VERIFIED-DB** this
session (`mcp__Supabase__list_tables`); `sessions` is the one
by-design exception (Decision Log C44, RLS off, reachable only via
`app_backend`) — the Supabase advisory this session's own tool call
surfaced flags exactly that one table and no others, matching the
documented design, not a new leak.

---

## 4. Competitive research

Two research passes ran this session: (A) `11_MASTER_REBUILD_PLAN.md`
§4's own same-day competitor fetch (Edunext, Vidyalaya, SchoolThinker,
EduERP.ai, edumerge — already committed to that document, not repeated
here), and (B) a dedicated background research pass this document
commissioned specifically to cover what §4 didn't: ProjectWorlds by name
(the founder's specific ask, including the ₹10,000 source-code purchase
question), a second independent competitor sample, the open-source
ecosystem with verified licenses, and a design-quality reference set.
Pass (B) has returned; findings folded in below.

**Environment caveat, stated plainly rather than glossed over:** the
research agent's own network egress was more restricted than expected —
it could reach GitHub and package registries directly, but every
competitor marketing domain (`projectworlds.com`, `teachmint.com`,
`fedena.com`, `entab.in`, `schoolknot.com`, etc.) returned
`403 CONNECT tunnel failed` at the proxy level. It did **not** fabricate
around this: everything in Part A/B/D below is sourced through the
WebSearch tool's own fetch-and-summarize path (a separate infrastructure
path from the blocked direct-fetch one) and is labeled
`[NOT DIRECTLY INSPECTED — sourced via WebSearch synthesis]` in addition
to the required `COMPETITOR MARKETING CLAIM` tags. Part C (GitHub, for
the OSS ecosystem) **was** fetched directly and those findings carry full
weight. This caveat matters for how much confidence to place on each
part below — read Part C as verified, Parts A/B/D as "real sources,
second-hand rendering."

### 4A. ProjectWorlds — direct findings

ProjectWorlds sells a **portfolio** of different products under one
brand, not a single system — a legacy plain-PHP student-records app and
a current flagship **"Multi-School ERP SaaS."** Only the flagship is
relevant to the founder's question; findings below are about it
specifically.

**Tech stack** `COMPETITOR MARKETING CLAIM, NOT DIRECTLY INSPECTED`:
Laravel 12 (PHP 8.3+) backend, Flutter 3.x/Dart mobile apps, optional
.NET 8.0 desktop agent, MySQL with `school_id`-based multi-tenancy
(sources: projectworlds.com technical breakdown post, multischoolerp.com,
per the research pass). **This confirms §7's framing below decisively**:
zero architectural overlap with this repo's Next.js/TypeScript/
Supabase/Postgres-RLS stack. Any purchase is reference-reading only,
exactly the same category `11_MASTER_REBUILD_PLAN.md` D1 already puts
GegoK12/Frappe/Gibbon/RosarioSIS/OpenEduCat in — this just adds a
proprietary PHP product to that same "read, don't merge" bucket.

**Feature breadth** `COMPETITOR MARKETING CLAIM`: 38 advertised modules —
far broader than any product in §4A of `11_MASTER_REBUILD_PLAN.md`,
including live GPS transport, ZKTeco biometric sync, hostel, an
AI assistant ("Grounded AI," Gemini/OpenAI-backed, role-based
privacy-scoped to each parent's own children), gate-pass approvals,
white-label branding, and off-site backup export. The "Grounded AI"
role-based-privacy pattern (an AI answering only within the asking
parent's own data boundary) is worth reading as a **UX pattern**, not a
feature to copy outright — it's structurally close to what this
document's §11 AI-governance table already requires ("only that
student's own day's data") if NetCyberAI ever builds an AI-answered
parent query feature.

**Pricing/licensing for the ₹10,000 offer** `COMPETITOR MARKETING CLAIM`:
one-time payment, full unencrypted/unobfuscated source delivered by
download link. Buyer may build and resell **modified** derivatives
(including as a competing SaaS) with no royalty; may **not** resell the
**unmodified** source. This is a real, usable commercial license on its
own terms — it is not the blocker here; the stack mismatch is.

**Red flags:** one unverified third-party complaint (via
complaintlists.com, itself unreached directly) alleges an advance
payment for **custom development work** (not the ₹10,000 source
purchase) to the company went unanswered; two automated scam-scanner
sites disagree on the domain's trust score. None of this was
independently confirmed, and it concerns a different transaction type
(bespoke dev, not a fixed source-code sale) — noted for completeness,
not weighted heavily in the decision below, but relevant if the founder
were ever to consider ProjectWorlds for anything beyond the flat
source-code purchase.

### 4B. Four additional verified-real Indian competitors

Corroborated as real, currently operating products via multiple
independent third-party listings, `COMPETITOR MARKETING CLAIM /
NOT DIRECTLY INSPECTED` throughout:

| Product | Modules (as advertised) | WhatsApp/UPI/AI | Notable |
|---|---|---|---|
| **Teachmint** (teachmint.com) | SIS, admissions, fees, attendance, transport GPS, online classes, inventory, ID/certificate generator, hostel | No confirmed native WhatsApp; a competitor's comparison post explicitly claims Teachmint "requires a mandatory parent app download and does not offer WhatsApp Voice AI" | Pricing tier reported from ₹150,000 (period unclear) |
| **Fedena** (fedena.com) | 50+ modules incl. biometric attendance, online exams/gradebook, HR/payroll, hostel, video-conferencing integration | Explicitly **absent** per a competitor comparison: "does not have native UPI integration... needs add-ons for... WhatsApp alerts" | In-app fee payment exists (not confirmed as UPI specifically) |
| **Entab CampusCare** (entab.in) | Admissions, fees, exams, NEP 2020 tooling, geo-tagged/transport attendance, timetable | **Explicitly confirmed WhatsApp**: "instant alerts, circulars... via... WhatsApp" — the clearest WhatsApp claim of any competitor found in either research pass | Claims 2,500+ schools |
| **Schoolknot** (schoolknot.com) | Curriculum/timetable, events, homework, parent app, bus GPS, multi-branch admissions analytics | Not confirmed either way for WhatsApp/UPI/AI | Reported ~₹25/student/month (aggregator-sourced) |

**This corrects §5's differentiator reasoning below**: Entab CampusCare
names WhatsApp as a delivery channel, and a second, direct check this
session (WebSearch against `multischoolerp.com`/`docs.multischoolerp.com`
after the founder supplied ProjectWorlds' live-app URLs directly —
`[NOT DIRECTLY INSPECTED]`, egress-blocked identically to the earlier
research pass, confirmed independently on retry) found ProjectWorlds'
own module list also names **"WhatsApp notifications"** among its 25+
production modules (v3.6.0/v3.7, sold via Razorpay checkout — UPI,
cards, net banking, wallet — ₹10,000 one-time). WhatsApp-as-a-channel is
therefore not uniquely NetCyberAI's across **either** research pass. The
**Daily Learning Pulse workflow** (proactive, per-day, per-subject
content pushed automatically, not just notification delivery) is still
not claimed by any of the ten competitors sampled across both research
passes; that narrower claim holds. One more ProjectWorlds detail worth
noting: its module list includes "CBC curriculum" support — CBC
(Competency-Based Curriculum) is a Kenyan/East African framework, which
suggests ProjectWorlds' flagship targets beyond India, not an
India-specific product — relevant context, not a competitive threat in
NetCyberAI's own Indian jurisdiction-scoped features (Form 6, DPDP).

### 4C. Open-source ecosystem — direct GitHub verification (see §6)

### 4D. Design references (see §8)

---

## 5. Feature classification (MUST HAVE / DIFFERENTIATOR / REFERENCE ONLY / ROADMAP / REJECT / DUPLICATE / IMPROVEMENT)

This refines `11_MASTER_REBUILD_PLAN.md`'s Tier A/B/C/Rejected split (§2
D5, §3 module tables) into the founder's requested seven-way scheme.
Tier A/B/C map onto this scheme; nothing here overrides the tiering,
it explains the reasoning per feature so the "why" survives independent
of the tier label.

| NetCyberAI item | Classification | Reasoning |
|---|---|---|
| Daily Learning Pulse | DIFFERENTIATOR | No competitor sampled (either pass) advertises a per-day, per-subject WhatsApp parent message. Core to the Constitution's mission (§1). |
| Fee Recovery as workflow (not CRUD) | DIFFERENTIATOR | Structures/heads/concessions/reminders/reconciliation as one send-gated flow; competitors show fee **collection** (UPI/payment link) but not this workflow depth in what was fetched. |
| Principal Impact Card (teacher, private) | DIFFERENTIATOR | Explicitly rejected by Constitution §9 as a public leaderboard; no competitor sampled surfaces anything like a principal-only teaching-quality signal. |
| Personal Best / no public leaderboard | DIFFERENTIATOR | Direct rejection of the near-universal "rank 1/2/3" pattern; see §9 below on why this stays. |
| Consent/DPDP ledger, per-purpose | DIFFERENTIATOR | No competitor sampled (either research pass, 9 products total) names consent/DPDP infrastructure; this is regulatory-grade work most Indian school-ERP vendors do not appear to publicly claim. |
| WhatsApp as delivery channel (in isolation) | **CORRECTED — not a differentiator by itself.** Entab CampusCare (§4B) explicitly advertises WhatsApp alerts/circulars. | What remains differentiated is the **Daily Learning Pulse workflow** — proactive, per-day, per-subject content pushed automatically — which zero of the 9 competitors sampled across both research passes claim, WhatsApp-channel or not. Classify "WhatsApp-first" as table-stakes-adjacent, and the Pulse *content workflow* as the actual DIFFERENTIATOR. |
| Certificate-trust workflow (TC/Bonafide, source-attached) | DIFFERENTIATOR | Existing feature page; not matched in the fetched competitor set. |
| Form 6 (Haryana) fee advisory | DIFFERENTIATOR (jurisdiction-scoped) | State-specific; irrelevant outside Haryana by design, not a general-purpose feature. |
| Data ownership / export / no lock-in messaging | DIFFERENTIATOR (trust, not feature) | Constitution §4; matches the "SQL dump, not vendor lock-in" architecture decision. |
| Attendance marking | MUST HAVE | Every competitor sampled and every ERP category has this; already Tier A/built. |
| Fees + online payment (UPI) | MUST HAVE | Universal in the sampled set; partially built (engine hardened, no UI yet — U-series `I` prompt). |
| Exams / report cards | MUST HAVE | Universal in the sampled set (§4 of `11_MASTER_REBUILD_PLAN.md`); not built (Tier A, U8). |
| SIS / student records | MUST HAVE | Universal; built (Prompt F). |
| Admissions pipeline (full: enquiry→offer) | MUST HAVE, partially built | Only the terminal "enrolled, pending consent" state exists today (see the `admissions/page.tsx` source comment, §2.1); full pipeline is Tier A, U7. |
| Timetable | MUST HAVE (Tier B — manual, no "AI generator" claim) | `11_MASTER_REBUILD_PLAN.md` D5 explicitly rejects claiming AI-generated timetabling since two competitors market exactly that and we cannot verify or match it credibly without building and validating a constraint solver — REFERENCE ONLY on the AI-generation angle, MUST HAVE on manual timetabling with conflict detection. |
| HR/payroll | ROADMAP (Tier C) | Universal in competitor set but explicitly out of NetCyberAI's core mission (Constitution §1); a school-ops adjacency, not part of the trust-gap thesis. |
| Transport with GPS | REJECT | Constitution §10 / plan D5 permanent ban list — no GPS promise without hardware NetCyberAI doesn't operate. |
| Biometric/RFID/face recognition | REJECT | Same permanent ban list; also a DPDP/consent complication this product's own trust position argues against. |
| WhatsApp Groups as a channel | REJECT | Named explicitly in the plan's permanent-reject list; groups break the send-gate's per-recipient consent/budget model. |
| Generic parent mobile app (as primary channel) | DUPLICATE of WhatsApp channel, REJECT as primary | Constitution §9: "no parent app as the primary channel." P5 exists as a **structure-only** companion (see §10), never a replacement. |
| Library / inventory / hostel | ROADMAP (Tier C) | Present across the sampled competitor set; zero relation to the differentiators; explicitly "never shown as working" per plan's honesty rule (D5, standing rule 15) until actually built. |
| Blockchain-anything | REJECT | Not asked for by the founder or PRD; a hype feature with no described use case here — flagging so nobody adds it opportunistically during rebuild. |

---

## 6. Open-source ecosystem — cross-check against `11_MASTER_REBUILD_PLAN.md` D1

**Independently re-verified, directly (not via search synthesis) — X3 in
§14 resolves clean, no contradiction.** This document's research pass
fetched each repo's actual GitHub page and LICENSE file directly
(`[NOT DIRECTLY INSPECTED]` does **not** apply to Part C — only to
Parts A/B/D):

| Project | License (independently confirmed, GitHub direct) | Matches D1? | Activity (as of Sept 2026) |
|---|---|---|---|
| GegoK12 | **MIT** (LICENSE file read directly) | Yes | Active but small: 53 stars, 123 commits, single author (`devteamgego`) — smaller/narrower community than the other four; its own marketing (26 free + 12 paid "Pro" modules, $100–250/lifetime) is `COMPETITOR MARKETING CLAIM, unverified` since gegok12.com itself was unreachable |
| Frappe Education | **GPL-3.0** (`license.txt` read directly) | Yes | Active: 645 stars, most recent commit Sept 22, 2026. Note: the older `frappe/schools` repo is explicitly deprecated in favor of `frappe/education` — use the latter as the reference, not the former |
| Gibbon | **GPL-3.0** (confirmed) | Yes | Active: 633 stars, most recent commit Sept 21, 2026. Default branch is `v31.0.00`, not `master` — checking `master` alone would wrongly suggest it's abandoned |
| RosarioSIS | **GPL-2.0** (confirmed) | Yes | Active: 644 stars, most recent commit Sept 22, 2026. Default branch is `mobile`, not `master` (`master`'s last commit was 2016) — same false-abandonment trap as Gibbon |
| OpenEduCat | **LGPL-3.0** (LICENSE file read directly) | Yes | Active: 875 stars, most recent commit Sept 7, 2026 |

All five licenses match `11_MASTER_REBUILD_PLAN.md` D1 exactly, and all
five projects are actively maintained, not abandoned — two of them
(Gibbon, RosarioSIS) only look abandoned if you check the wrong default
branch, which is itself a useful note for anyone auditing these repos
later. **No contradiction found; D1's table stands, now with a second,
independent, direct confirmation plus current activity data D1 didn't
have.**

**Standing rule regardless of outcome (already correct in D1, restated
because it is the single easiest way to create real legal exposure):**
copying source from any GPL/LGPL project into this repo is forbidden.
Reading for domain/workflow ideas is fine. The npm dependency list in D1
(shadcn/ui, Recharts, @tanstack/react-table, react-hook-form+zod,
framer-motion, lucide-react, sonner/cmdk/vaul, nuqs, date-fns,
@react-pdf/renderer, next-intl, @serwist/next, @faker-js/faker) is the
actual adoption plan — **VERIFIED-CODE** that none of them are installed
yet (`package.json` has zero of these fourteen packages today), so U0
genuinely starts from zero design-system tooling, not an upgrade.

---

## 7. ProjectWorlds — BUY / DO-NOT-BUY decision

**Decision framework (not decided on price alone, per the founder's
explicit instruction), now applied against §4A's confirmed findings:**

1. **Technical fit — FAILS.** §4A confirms (via the research pass,
   `COMPETITOR MARKETING CLAIM` sourced from ProjectWorlds' own technical
   blog post, consistent across three independent pages): Laravel 12/
   PHP 8.3+, Flutter mobile, MySQL. Zero architectural overlap with this
   repo's Next.js/TypeScript/Supabase/Postgres-RLS stack, its choke-point
   security model, or its RLS tenant-isolation design. Same bucket as
   D1's GegoK12/Frappe/Gibbon/RosarioSIS/OpenEduCat: reference-reading
   only, never a merge candidate, regardless of what the license permits.
2. **Product fit — LOW MARGINAL VALUE.** ProjectWorlds' own public
   marketing already lists 38 modules by name (§4A) — broader detail than
   any of the five competitors in `11_MASTER_REBUILD_PLAN.md` §4 or the
   four in this document's §4B combined. The ₹10,000 purchase would
   mainly buy *exact field-level implementation detail* for the specific
   modules NetCyberAI has deliberately left at Tier C depth (transport,
   hostel, library) — real value, but narrow, and available secondhand
   through the module list and blog technical-breakdown posts already
   surfaced without paying.
3. **Legal/reputational fit — PERMITS BUT DOESN'T HELP.** The stated
   license (§4A) allows building and reselling *modified* derivatives
   with no royalty. This removes the legal objection but doesn't change
   #1 — a permissively-licensed PHP codebase is still a rewrite, not a
   merge, into this stack.
4. **Trust/opportunity cost — MINOR NEGATIVE.** One unverified,
   third-party fraud complaint concerns *bespoke development work*
   commissioned from the company, a different transaction from a flat
   ₹10,000 source download — not disqualifying by itself, but a reason
   to treat any *custom* engagement with ProjectWorlds (as opposed to the
   fixed-price source purchase) with more caution than the purchase
   itself warrants. Founder + AI-session time reading a purchased PHP
   codebase still competes directly with U0–U5 build time.

**Recommendation: DO-NOT-BUY.** The public marketing (module list,
architecture blog posts, the "Grounded AI" role-scoped-privacy pattern)
already gives everything this rebuild plan needs from ProjectWorlds as a
*competitive/UX reference* — free, and without the stack-mismatch dead
end a purchase would create. The one narrow case for buying (exact
implementation detail on Tier-C modules) isn't worth ₹10,000 plus review
time for modules this rebuild has explicitly decided not to build to
production depth yet (`11_MASTER_REBUILD_PLAN.md` D5, Tier C). **This is
a recommendation, not a decision** — per the founder's own stated
principle that no spend/legal call is made unilaterally by an AI
session; this is the input to that call, not the call itself.

---

## 8. UX pattern study

`11_MASTER_REBUILD_PLAN.md` §5 already specifies a concrete visual
direction ("modern SaaS, think Linear/Stripe-dashboard clarity") and a
full component/pattern list (§5, "Design system v2"). This document adds
one instruction the plan doesn't state explicitly: **the founder's own
prohibition on copying visual identity** (his message this session:
study competitors "for ideas," not to clone their look) applies
specifically to whatever the ProjectWorlds/competitor screenshots turn
up in §4 — those are input to "what workflows and information density do
competitors expect," never to "what should our sidebar look like."

**Design references, confirmed** (`[NOT DIRECTLY INSPECTED — sourced via
WebSearch synthesis]`, named consistently across multiple independent
2026 SaaS-dashboard roundups, not a single source): **Linear** (cited
repeatedly as "the reference for dark-first restraint" — minimal,
shows only what matters), **Stripe** dashboard (cited as "the reference
for data tables" — dense financial/tabular data made legible), and
**Attio** (cited as an example of AI output — summaries, suggested
actions — designed as first-class UI rather than a bolted-on chat
widget; relevant if the "Grounded AI" pattern noted in §4A ever gets a
NetCyberAI equivalent). For EdTech specifically, **Duolingo** recurred as
the reviewer-named benchmark for engagement design (streaks, motivation,
bright/simple visuals) — a consumer language app, not a school-admin
ERP, so read it for engagement-pattern ideas (e.g., how Personal
Best/Class Shine recognition could *feel*), not layout. **No Indian
school-ERP product was named by any reviewer as visually well-designed**
in either research pass — this matches the plan's own live-site audit
(§1.2a) and this document's §4A/§4B findings, which both describe the
competitor set (including ProjectWorlds' own "Executive Pro" redesign
post) as template-driven admin-panel aesthetics, not the "premium SaaS"
bar the founder set. Confirms competitor ERPs are useful for feature/
workflow study only, never for visual direction — the plan's original
instinct (cite Linear/Stripe, not a competitor ERP) holds up under
independent research.

---

## 9. Ten differentiators to preserve and deepen (confirmed against Constitution, unchanged)

Restated from the founder's own list this session, cross-checked against
`01_CONSTITUTION.md` — all ten are already locked, non-negotiable
Constitution content, not new:

1. Daily Learning Pulse (§1, mission)
2. WhatsApp-first (§2, §4)
3. Personal Best / no public leaderboard (§5, §9)
4. Principal Impact Card, private (§5, §9)
5. Fee Recovery as full workflow (§1; engine hardened this session, PR #10)
6. Certificate-trust workflow (existing feature page; not yet built as a P3 screen — Tier B, U10)
7. Consent/DPDP (§8; built, Prompt G)
8. Data ownership / export / no lock-in (§4, §8)
9. Exception-based fast workflows (implicit in §2's Floor Device Standard; explicit in `11_MASTER_REBUILD_PLAN.md` §3.4's "all-present default, tap to mark absent" pattern)
10. Hinglish / Indian context (§2 Floor Device Standard; Noto Sans Devanagari + next-intl in the D1 dependency list)

No proposal in this document or in `11_MASTER_REBUILD_PLAN.md` weakens
any of these ten. Where U-series prompts touch adjacent screens, this is
the check each one should be verified against before merge.

---

## 10. Five-Surface architecture — adopted as-is from `11_MASTER_REBUILD_PLAN.md` §3, with two additions

`11_MASTER_REBUILD_PLAN.md` §3's P1–P5 breakdown (public site, control
plane, school workspace, teacher PWA, parent-structure-only) is adopted
without change. Two things this document adds because they surfaced
during evidence-gathering, not because the plan is wrong:

- **P2 needs the `leads` table** (§2.2 above) before the Leads module in
  §3.2 can be built — add it to U1's or U4's migration scope explicitly.
- **P5 (parent)** — the founder's own instruction this session ("parent
  app is on hold, but structure should be covered everywhere... once we
  require parent application, everything should integrate with each
  other") is a slightly stronger requirement than plan D4's "reserve
  routes and role." Read literally, it also means: every P2/P3 screen
  built from U0 onward that touches a student/parent relationship
  (fees, attendance, communication, consent) should be designed so a
  future `/p/*` surface can read the same API contracts without a
  redesign — i.e., `/api/v1/parent/*` contracts (already in D4) should
  be drafted **during** U3/U4/U6 as those modules are built, not
  deferred entirely to U11. This is a scheduling refinement, not a scope
  change — flagging it as a founder decision point since it slightly
  front-loads work D4 had pushed to the end.

  **WHAT CURRENTLY EXISTS:** D4 defers all parent-facing API contract
  design to U11 (Section 3.5).
  **WHAT THE NEW EVIDENCE SAYS:** the founder's phrasing this session is
  stronger than "reserve for later" — it asks for cross-surface
  integration readiness now.
  **WHAT IS PROPOSED:** draft (not build) `/api/v1/parent/*` response
  shapes alongside each relevant U3/U4/U6 module as it's built, so U11
  is "wire up existing contracts" rather than "design contracts from
  scratch."
  **WHY:** avoids a second pass over already-shipped modules later.
  **TRADE-OFF:** marginally slows U3/U4/U6 (extra design-only step per
  module) for a smaller, more certain U11. Founder's call.

---

## 11. AI-governance specification

Per the founder's explicit request for an input/output/confidence/
approval/audit/prompt-version/failure-handling/cost/privacy-boundary
spec per AI feature. Honest baseline first: **zero features in this
codebase call an external AI/LLM provider today** (§2.7). This section
therefore covers (a) the one real ML-adjacent feature that exists, and
(b) the AI features that are specified but not built, so the governance
model is decided before, not after, anyone builds them.

| Feature | Input | Allowed data | Output | Confidence handling | Human approval | Audit | Prompt/model version | Failure handling | Cost | Privacy boundary |
|---|---|---|---|---|---|---|---|---|---|---|
| **OCR document capture** (built, Prompt F) | Scanned image (guardian ID, birth cert, etc.) | The single uploaded image only; no cross-student or cross-school data | Pre-filled form fields | Tesseract's own per-field confidence is surfaced; **VERIFIED-CODE**: human review step (`reviewDocument`) always required before commit — no field auto-commits from OCR alone | Mandatory — every capture is human-corrected before it becomes a student record | `captured_documents`/`ocr_extractions` tables log the raw extraction and the human-corrected result separately | Tesseract.js version pinned in `package.json` (`^5.1.1`) | On low-confidence/garbled extraction, fields are left blank for manual entry, never guessed | Zero marginal cost (client-side library, no API calls) | Runs entirely client-side; raw document image handling already follows the "no Aadhaar image stored" rule (Decision Log, Prompt F) |
| **Daily Pulse narrative** (specified, Constitution §3 Amendment 3; NOT built) | Attendance + syllabus-progress records for the day | Only that student's own day's data; never other students' | A one-line parent-facing message | **PROPOSED**: deterministic template is the default and required path; an LLM-narrative variant is explicitly gated behind a feature flag per the Constitution, never the default | **Constitution-mandated**: "no AI-generated factual assertion reaches a parent without deterministic re-validation against source data at send time" — a mismatch holds for human review, never auto-sends | `communication_log` already has the fields to record this (`billing_category` etc.); a `prompt_version`/`model_version` column would need to be added if/when this is built — **[GAP]**, not yet in schema | Not applicable yet — nothing built | If re-validation fails, message holds for review, is never silently dropped (Constitution §9) or silently sent | Per-message LLM API cost would need to be added to the existing `message_rate_table`/budget-governor model (§7) before this ships | Student data only reaches a model call the school has consented to at all — **[GAP]**: no such consent purpose exists yet in `consent_ledger`'s enum; would need to be added before any LLM narrative path ships, not an afterthought |
| **Recognition scoring** (built, deterministic — NOT AI) | Marks/attendance history | Within-school, within-student | Personal Best / Most Improved / Class Shine flags | N/A — pure arithmetic (`src/lib/recognition.ts`), no model, no confidence concept applies | N/A | `recognition_events` table exists; **VERIFIED-CODE (C64)**: zero call sites currently write to it | Locked formula version is the Constitution §5 text itself, not a model checkpoint | N/A | Zero (arithmetic) | N/A — should never be marketed as "AI-powered" since it isn't one |
| **Form 6 fee advisory** (specified, PRD) | Current CPI figure, filing deadline (both `[GAP]`, Constitution) | School's own fee data | An advisory string | Explicitly designed to return `unknown` rather than a guessed figure when CPI/deadline are unconfigured (Constitution §00_START_HERE GAP list) | Implicit — a human sets the CPI/deadline config; the system never infers them | Not yet built | N/A (deterministic lookup, not a model) | Returns `unknown`, never a fabricated number | Zero | N/A |

**Standing rule for any future AI feature not in this table:** it does
not ship without filling in every column above, in a Decision Log entry,
before merge — matching the rigor already applied to WhatsApp cost
governance (Constitution §7) and consent (§8).

---

## 12. Demo-environment design — adopted from `11_MASTER_REBUILD_PLAN.md` §6/D2, status re-confirmed

Design is sound and detailed in the plan already (second Supabase
project, `demo.netcyberai.com` branch, faker-generated fixed-seed data,
hard `SEED_TARGET=demo` refusal, weekly keep-alive against Supabase's
free-tier pause). **VERIFIED-DB** this session: none of it exists yet
(§2.4) — this is U1, not built. One demo-narrative note: the founder's
own described sales-demo flow this session ("teacher phone → attendance
→ syllabus pulse → parent communication → principal dashboard → fee
workflow → report") matches `11_MASTER_REBUILD_PLAN.md` §6's seed-data
shape closely enough that no changes to §6 are proposed — flagging the
match as confirmation, not a gap.

---

## 13. Gap Register

| ID | Gap | Source | Blocking? |
|---|---|---|---|
| G1 | `leads` table missing (§2.2) | This document | Blocks P2 Leads module, P1 parent-referral form |
| G2 | No automated regression test framework (§2.3) | This document | Not blocking U0, becomes a real risk by U5+ |
| G3 | Vercel plan tier unconfirmed (§2.6) | `11_MASTER_REBUILD_PLAN.md` D7, re-flagged | Blocks paid pilot, not the rebuild itself |
| G4 | `main` branch protection absent (§2.5) | `11_MASTER_REBUILD_PLAN.md` §9, re-confirmed | Not blocking, real risk (accidental force-push to `main`) |
| G5 | LLM-narrative consent purpose doesn't exist in `consent_ledger` (§11) | This document | Blocks any future AI-narrative Pulse path, not current work |
| G6 | North Star response-rate target ([GAP], Constitution Amendment 3) | Constitution | Needs real pilot data, not blocking build |
| G7 | DPDP erasure vs. financial-retention conflict | `11_MASTER_REBUILD_PLAN.md` §9 | Needs legal counsel |
| G8 | OTP delivery channel for guardian verification | `11_MASTER_REBUILD_PLAN.md` §9 | Placeholder exists; not blocking U-series |
| G9 | Real WhatsApp sending blocked on Meta business verification | `11_MASTER_REBUILD_PLAN.md` §9 | Founder-side, in motion per this session's own earlier finding |
| G10 | Sandbox cannot reach `*.vercel.app`/`graph.facebook.com`; custom-domain screenshot capability untested this session | `11_MASTER_REBUILD_PLAN.md` §9 | Affects how the U0 visual-acceptance gate gets satisfied, not a blocker to starting U0 |

---

## 14. Contradiction Register

| ID | Contradiction | Resolution |
|---|---|---|
| X1 | `11_MASTER_REBUILD_PLAN.md` §1.2 states only dashboard/analytics/recognition are stub; live audit (§2.1) finds 16 of 21 P3 pages and 9 of 12 P2 pages are stub. | Not a factual error in the plan (it never claimed completeness on this point), but §2.1's fuller count supersedes it for planning purposes. Use §2.1's table, not the plan's shorter list, when scoping U3/U4/U6–U10. |
| X2 | This session's own first count of P3 stub pages ("14") did not match its own grep output ("16"). | Corrected in place, §2.1, rather than silently using the wrong number — flagged per this document's own evidence-integrity rule. |
| X3 | `11_MASTER_REBUILD_PLAN.md` D1's OSS license table vs. this document's commissioned re-check (§6) | **Resolved, no contradiction.** All five licenses (GegoK12 MIT, Frappe Education GPL-3.0, Gibbon GPL-3.0, RosarioSIS GPL-2.0, OpenEduCat LGPL-3.0) confirmed identically by an independent direct GitHub/LICENSE-file read. D1 stands, now doubly verified. |
| X4 | `11_MASTER_REBUILD_PLAN.md` implicitly treats "WhatsApp-first" as differentiating (it's listed as a core Constitution pillar, never claimed as unique to us, but §5's classification exercise in this document initially scored it DIFFERENTIATOR before §4B's Entab CampusCare finding came in) | **Resolved, §5 corrected in place.** WhatsApp-as-channel is table-stakes-adjacent (Entab claims it); the Daily Pulse *workflow* remains the actual differentiator. Not a contradiction in the plan itself — the plan never claimed WhatsApp-channel uniqueness, only WhatsApp-first *architecture*, which is unaffected. |

---

## 15. Build Matrix

Maps directly onto `11_MASTER_REBUILD_PLAN.md` §7's U0–U11 sequence
(adopted unchanged) with the two scope additions from this document
folded in (`leads` table into U1/U4; parent API-contract drafting spread
across U3/U4/U6 instead of concentrated in U11).

| Prompt | Scope (unchanged from plan §7 unless noted) | New items this document adds | Depends on |
|---|---|---|---|
| U0 | Design system v2 + app shells | — | — |
| U1 | Demo environment + seed | **+ `leads` table migration** (G1) | U0 |
| U2 | P1 website rebuild | — | U0 |
| U3 | P3 core screens (dashboard, students, attendance, compliance, settings) | **+ draft `/api/v1/parent/*` shapes for attendance/fees touched here** (§10) | U0, U1 |
| U4 | P2 core screens (incl. Leads) | **+ `leads` table consumed here; requires U1's migration** | U0, U1 |
| U5 | Teacher PWA | — | U0, U1 |
| I | Fees (existing spec) + UI | **+ draft parent-facing fee/payment-link contract shape** | U3 |
| U6 | Communication center | **+ draft parent-facing message-history contract shape** | U3 |
| U7 | Admissions | — | U3 |
| U8 | Exams & report cards | — | U3, U5 |
| U9 | Academics/timetable/homework | — | U3 |
| U10 | Staff/leave, Calendar, Certificates/ID cards, Reports export | — | U3 |
| U11 | Parent app structure | **now "wire up existing drafted contracts" rather than "design from scratch"** | U3 |
| J–M | Remaining Execution Bible prompts | — | after U11 |
| H2 | Audit atomicity + DPDP purge/export | — | before first paid school |

**Milestone "Demo-ready" is unchanged: U0–U5.**

---

## 16. E2E user journey maps

**School acquisition:** founder/sales → `/pricing` or `/demo` (P1,
rebuilt U2) → "Book a demo" or parent-referral form (new, U2) → lead
lands in P2 Leads (new, U4) → demo call using the seeded demo environment
(U1) → pilot onboarding (existing P2 Onboarding flow, real today) →
`pilot_allow_outbound` approval (deferred wizard, Decision Log C60,
still `[GAP]`) → go-live.

**Teacher day:** login (real today) → `/t` PWA (P4, U5, not built) →
Today screen (unmarked classes) → Attendance (one-tap, offline-queued) →
Syllabus pulse entry (taught/partial/not_taught) → this feeds the Daily
Pulse (not built) → parent sees it on WhatsApp (send-gate exists and is
real, Prompt H).

**Parent:** receives WhatsApp Daily Pulse (not built) → optionally taps
a comprehension button (webhook infrastructure real, Prompt H's send-gate
handles delivery; the Pulse content itself is not built) → no login
today by design (Constitution §11, no parent login in Phase 1) → future
P5 structure (routes/role reserved, D4) gives a companion view once
built, never a replacement for WhatsApp.

**Principal:** login (real) → impersonation into school_admin/teacher
views (real, proven end-to-end this session, Decision Log C65) →
dashboard (stub, U3) → Principal Impact Card (not built, U-series later)
→ fee workflow (engine hardened, UI not built, prompt `I`) → reports
(stub, U10).

**Certificate:** student/parent request → certificate-trust workflow
(feature page exists, no P3 screen yet — Tier B, U10) → source-attached
TC/Bonafide generation → not yet built end-to-end.

---

## 17. Implementation order

Adopted from `11_MASTER_REBUILD_PLAN.md` §7 without reordering — U0 first
(design system + shells), because every subsequent screen would
otherwise be built twice (once ugly, once restyled), which is exactly
the failure mode the founder's complaint this session describes. The
only change from this document is the two Build Matrix additions in
§15, which do not reorder anything, only add scope to U1/U3/U4/U6/I/U11.
**If evidence during U0 changes this** (e.g., the visual-acceptance gate
in `11_MASTER_REBUILD_PLAN.md` standing rule 13 turns out to need
Playwright screenshot capability this sandbox cannot provide, per G10),
that must be reported and decided explicitly before U0 is called done,
not silently worked around.

---

## 18. Founder decision points raised by this document

Everything else here is either adopted from `11_MASTER_REBUILD_PLAN.md`
unchanged or a factual finding. These four are genuine open questions
for the founder, not yet decided by anyone:

1. **Testing strategy (§2.3, G2):** fold a real Playwright regression
   suite into U0's scope, or accept the one-off-diagnostic-route pattern
   a while longer and revisit after U5?
2. **Parent API contracts scheduling (§10):** draft them incrementally
   alongside U3/U4/U6/I (this document's proposal) or keep them
   concentrated in U11 as the plan currently has it?
3. **ProjectWorlds purchase (§7):** this document's recommendation is
   DO-NOT-BUY (stack mismatch, low marginal value over free public
   marketing detail) — founder's call to confirm or override.
4. **Vercel plan tier (§2.6, G3):** a five-minute dashboard check only
   the founder can do; needed before any paid pilot, not before U0.

Nothing in U0–U5 is blocked on any of these four; they can be answered
in parallel with U0 starting.

---

## 19. Closing summary (founder's requested final-output format)

### WHAT I VERIFIED
Live DB schema (44 tables, RLS state, `is_test_fixture` migration present), full `/app` and `/control` route tree and which of its 33 pages are stub vs. real (16/21 and 9/12 respectively — larger than previously documented), `package.json` dependencies (zero design/chart/AI libraries installed), zero automated test framework, `main` branch protection off, GitHub PR merge state through PR #12, five open-source projects' actual licenses via direct GitHub reads, and — via a background research pass — ProjectWorlds' and four other Indian competitors' public marketing claims (all labeled `COMPETITOR MARKETING CLAIM`/`[NOT DIRECTLY INSPECTED]` since this sandbox's egress proxy blocks their domains directly, confirmed on two independent attempts).

### WHAT I FOUND
The stub surface is bigger than the founder's own prior report described; a `leads` table the rebuild plan assumes doesn't exist yet; no regression-test safety net exists behind any of the manual VERIFY evidence gathered so far; the design-system dependency list in `11_MASTER_REBUILD_PLAN.md` is entirely unstarted (zero of fourteen packages installed); ProjectWorlds and Entab CampusCare both already claim WhatsApp delivery, so that claim alone isn't differentiating — the Daily Pulse *workflow* is.

### WHAT NETCYBERAI ALREADY DOES WELL
Tenant isolation, RLS composition discipline (permissive-base/restrictive-overlay, fixed three times and now the standing pattern), append-only financial/audit tables, the WhatsApp send-gate's consent/budget/quiet-hours governance, consent/DPDP ledger design, and the attendance/students/onboarding screens that are real today — all `VERIFIED-CODE`/`VERIFIED-DB` this session, not carried forward on faith.

### WHAT IS MISSING
A design system (zero component/chart/motion libraries), real screens behind 25 of 33 admin/school routes, a demo environment and seed data, a teacher PWA, parent-facing structure, a `leads` table, and a kept automated test suite. All scoped into `11_MASTER_REBUILD_PLAN.md`'s U0–U11 sequence, which this document adopts with minor additions (§15).

### WHAT PROJECTWORLDS DOES BETTER
Breadth (38 advertised modules vs. NetCyberAI's current ~9 real modules), a role-scoped "Grounded AI" parent-query assistant pattern worth studying structurally, and — per its own marketing, unverified — a more mature multi-app (web + 3 mobile apps) delivery model.

### WHAT NETCYBERAI CAN DO BETTER
Everything already locked as a differentiator (§9): Daily Pulse, Fee Recovery as a workflow, Principal Impact Card, Personal Best over public ranking, Consent/DPDP as infrastructure not an afterthought, certificate-trust workflow, data ownership/export, Hinglish/Indian-context design — none of which any of the ten competitors sampled across both research passes claim.

### WHAT WE SHOULD NOT COPY
ProjectWorlds' and the broader competitor set's visual identity/template-driven admin-panel aesthetics (confirmed dated by both this session's design-reference research and the plan's own live-site audit), biometric/RFID/GPS-transport hardware promises NetCyberAI doesn't operate, WhatsApp Groups as a channel, or any unverified competitor marketing figure into NetCyberAI's own materials.

### OPEN-SOURCE OPPORTUNITIES
Component-layer only, per `11_MASTER_REBUILD_PLAN.md` D1 (now independently re-confirmed, §6): shadcn/ui, Recharts, @tanstack/react-table, react-hook-form+zod, framer-motion, lucide-react, sonner/cmdk/vaul, nuqs, date-fns, @react-pdf/renderer, next-intl, @serwist/next, @faker-js/faker — all permissive, verified, none installed yet. Frappe Education/Gibbon/RosarioSIS/OpenEduCat/GegoK12 are workflow/domain-checklist reading only — copying their code is forbidden (GPL/LGPL) or pointless (GegoK12's MIT PHP/Vue code doesn't transfer to this stack).

### ₹10,000 SOURCE-CODE BUY DECISION
**DO-NOT-BUY** (recommendation, not a unilateral decision — §7). Laravel/PHP/Flutter/MySQL stack has zero architectural overlap with this repo; public marketing already discloses the full 38-module list, pricing, and licensing terms; the one narrow case (Tier-C module implementation detail) doesn't justify the review-time cost against U0–U5 build priorities.

### NETCYBERAI DIFFERENTIATION
Unchanged, ten items, confirmed against the Constitution and now against ten real competitors sampled: Daily Learning Pulse, WhatsApp-first architecture (not the mere fact of a WhatsApp channel), Personal Best/no leaderboard, private Principal Impact Card, Fee Recovery as workflow, certificate-trust workflow, Consent/DPDP, data ownership/no lock-in, exception-based fast workflows, Hinglish/Indian context (§9).

### ARCHITECTURE RECOMMENDATION
Keep the existing Next.js/TypeScript/Supabase/Postgres-RLS modular-monolith architecture unchanged (`11_MASTER_REBUILD_PLAN.md` §2 D1–D4, this document's §10). No microservice split; no ERP-fork; no framework migration. Add the Design System v2 dependency layer (§6) and the `leads` table (§2.2) as the only structural additions this document identifies beyond the plan.

### BUILD PRIORITY
`11_MASTER_REBUILD_PLAN.md` §7's U0→U11→I/J–M sequence, adopted unchanged except for the two scope additions in this document's Build Matrix (§15). U0 first, always — every screen built before the design system exists gets built twice.

### [GAP] ITEMS
See the full Gap Register, §13 (ten items: `leads` table, no test framework, Vercel plan tier, branch protection, LLM-narrative consent purpose, North Star target, DPDP erasure conflict, OTP channel, WhatsApp Meta verification, sandbox screenshot capability).

### [VERIFY] ITEMS
Full RLS/tenant-isolation and fee-engine negative-test suites (documented, not re-run this session — see §3); Vercel plan tier (§2.6); whether this sandbox can reach `demo.netcyberai.com` once it exists, for the visual-acceptance-gate screenshots U0 requires (G10).

### NEXT IMPLEMENTATION STEP
Founder reviews this document and `11_MASTER_REBUILD_PLAN.md` side by side, answers the four decision points in §18 (test strategy, parent-contract scheduling, ProjectWorlds purchase, Vercel plan), and — once ready — the next prompt is `11_MASTER_REBUILD_PLAN.md` §10's pre-written **Prompt U0** verbatim. No code changes belong in this PR; this document and `11_MASTER_REBUILD_PLAN.md`'s commit are the entire deliverable.

---

## 20. Change log

| Date | Change |
|---|---|
| 2026-09-23 | Created alongside committing `11_MASTER_REBUILD_PLAN.md` itself. Reconciles the plan against same-day live re-verification (corrected stub-page count, `leads` table gap, zero-test-framework gap); adds AI-governance spec, Gap/Contradiction/Build registers, journey maps, and a DO-NOT-BUY recommendation on ProjectWorlds backed by a completed background research pass covering ProjectWorlds directly, four additional Indian competitors (Teachmint/Fedena/Entab/Schoolknot), independent GitHub-verified OSS licenses (all five matching `11_MASTER_REBUILD_PLAN.md` D1), and a design-reference set (Linear/Stripe/Attio/Duolingo). |
