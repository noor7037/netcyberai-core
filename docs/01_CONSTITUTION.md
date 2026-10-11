# NetCyberAI — Product Constitution v3.0

**Governs:** every other document in `docs/`, `db/`, and the
implementation. Nothing here is silently overridden by a build prompt,
a PRD, or an AI session's own judgment — see §12.
**Governed by:** nothing. This is the root document.
**Supersedes:** Product Constitution v1.0 and v2.0, and all excerpts
pasted into prior AI sessions. Where this document conflicts with
anything you paste into a future AI tool, THIS document wins — say so
explicitly when you upload it.

**Status:** Locked source of truth. Amended three times since v2.0 (see
the index below); each amendment is recorded inline, in place, per §12
— never by silently rewriting the original text.

## Amendment index

| # | Section | What changed | Recorded |
|---|---|---|---|
| 1 | §6 (Bridge Rule) | Founder override: Phase 1 platform engineering authorized to begin without the 60–90 day pilot-data trigger. Three parameters (Pulse target, recognition thresholds, message cost model) made configurable to offset the risk this creates. | 2026-09-16 |
| 2 | §2 (Market reality) | "Palwal / NCR semi-urban" corrected from a market definition to an engineering floor (the Floor Device Standard). Addressable market is all-India, tier 1–4. | 2026-09-16 |
| 3 | §3 (North Star metric) | Two points: (1) a new AI-content re-validation rule, cross-referenced at §9; (2) the North Star metric changed from Pulse/Brief **open rate** to comprehension **response rate** — open rate is not reliably measurable (see the amendment for why) and demotes to a caveated secondary signal. Target is `[GAP]`, to be set from real data, not carried forward from the open-rate figure. | 2026-09-16 |

---

## §1. Mission

We make parents confident every day, so results go up and fees get
recovered automatically.

NetCyberAI is not a School ERP. It is a Student Learning Monitoring &
Parent Engagement Engine, delivered WhatsApp-native, with a campus
operations layer underneath it. The campus ops layer exists to support
the mission; it is not the mission.

We close three trust gaps:
1. **Parent ↔ Child** — parents don't know what was taught today, so
   they can't engage at home.
2. **Parent ↔ School** — parents feel their child is a fee number, not
   a person the school knows.
3. **Principal ↔ Teacher** — the principal has no real signal on
   teaching quality beyond exam results and hallway impression.

Every feature must serve at least one of: the School (fees + results),
the Teacher (respect + growth, never surveillance), the Parent (daily
confidence), the Student (recognition that makes them want to
improve, never a leaderboard that makes them want to hide).

## §2. Market reality (non-negotiable design constraint)

Palwal / NCR semi-urban India. No dedicated IT staff at most schools.
Uneven English literacy among staff and parents. Unreliable internet.
Low-end Android phones. WhatsApp open rate is dramatically higher than
any dedicated school app's open rate. Consequence: WhatsApp-first,
Hinglish-capable, one-tap for teachers, no forced app download for
parents, ever.

> **Amendment 2 (2026-09-16).** The framing above is superseded. It
> conflated an engineering floor with a market definition, and it
> mischaracterised the region: Palwal has schools across the full
> infrastructure spectrum, and NCR generally is not a low-capability
> market. A prospect reading the original framing could reasonably
> conclude the product is built only for schools that can't afford
> better, which is inaccurate and commercially damaging.
>
> **Corrected framing: the Floor Device Standard.** The constraint was
> never geographic. Build so the product works on the worst device and
> connection in the addressable market, and it works everywhere above
> that automatically — a system fast on a ₹7,000 Android on 3G is
> instantly fast on a ₹70,000 iPhone on fibre; the reverse is not true.
>
> **Addressable market: all of India.** Tier 1 through tier 4, urban
> and rural, CBSE/ICSE/State/IB. No tier is excluded, no tier is the
> primary target, and no public-facing material describes the product
> as being for any particular region's limitations. The full Floor
> Device Standard table (device, viewport, network, input, ambient
> light, literacy, IT support) lives in
> [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md); the per-role device
> matrix lives in [`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md)
> §0.2. Source: `04_SYSTEM_DESIGN_PRD.md` §0.1.
>
> WhatsApp-first, Hinglish-capable, one-tap for teachers, no forced app
> download for parents remain unchanged — those follow from the floor,
> not from the market's geography.

## §3. North Star metric — AMENDED (see Amendment 3)

**Primary (the judge):** % of parents who open the Weekly Confidence
Brief + Daily Pulse, target >65% sustained over 60–90 days.

**Secondary (the sell metric, never the judge):** % of fees collected
on-time. This number sells the pilot to a principal. It must never
quietly become the metric used to decide whether the product is
working — that's a different question, and conflating them was the
single biggest ambiguity in the original brief. Every dashboard that
shows both must visually distinguish which is which.

> **Amendment 3 (2026-09-16).** Two points, recorded together because
> both were surfaced by the same review pass.
>
> **1. AI content governance (new rule, cross-referenced from §9).** No
> AI-generated factual assertion reaches a parent without deterministic
> re-validation against source data at send time. A mismatch holds the
> message for human review; it is never silently sent. A deterministic
> template satisfies this requirement by construction, which is why
> templates are the default Pulse path (§9) and LLM narrative sits
> behind a flag. This rule was already being applied in practice
> (`05_BUSINESS_LOGIC.md` §5, `04_SYSTEM_DESIGN_PRD.md` §4.1) without
> ever being stated here as a Constitution-level rule. It is one now.
>
> **2. North Star metric changed: open rate → response rate.** The
> primary metric above, Pulse/Brief **open rate**, is not reliably
> measurable. WhatsApp `read`-receipt webhooks only fire when the
> recipient has read receipts enabled — a setting users routinely
> disable — and `read` implies `delivered`, so both the numerator and
> the denominator are affected. Open rate is therefore systematically
> undercounted by an amount that varies with the user population. A
> metric that cannot be measured reliably cannot be a gate.
>
> The three-tier comprehension button tap (`05_BUSINESS_LOGIC.md` §5,
> `04_SYSTEM_DESIGN_PRD.md` §4.1) is measured by a webhook that fires
> on an explicit user action, with no privacy setting between the
> system and it. It is also the stronger signal: a tap means a parent
> engaged, not merely that a phone displayed something.
>
> **Corrected:**
>
> | Metric | Role | Why |
> |---|---|---|
> | Pulse comprehension **response rate** (button tap ÷ delivered) | `north_star` | Directly measurable; the stronger signal |
> | Pulse/Brief **open rate** (read ÷ delivered) | `secondary`, caveated as a floor, not a true rate | Retained and instrumented; never a gate |
> | Fee collection % | `sell_metric` | Unchanged |
>
> **Target is `[GAP]`.** The >65% figure above was set for open rate.
> A response-rate target cannot be derived from it — tapping is a
> higher bar than reading, so the true number will be lower. Do not
> invent one. Instrument from the first real school, observe for 30
> days, then set the target from data — this is exactly the kind of
> parameter Amendment 1's mitigation table already requires to be
> config, not a constant.
>
> This changes what the Bridge Rule (§6) was measuring, not whether it
> was met — see Amendment 1.

## §4. Architecture — DECIDED

**Database: PostgreSQL + Row-Level Security, hosted on Supabase.**

This was contested mid-build (one AI session substituted Firestore
unilaterally). Reverted, deliberately, for these reasons:
- Fees are money. ACID transactions and real joins across the fee
  ledger, consent ledger, and audit log are core to a fee-recovery and
  compliance product — a document store fights these queries.
- "Export anytime, no lock-in" is a stated trust promise (§8). A SQL
  dump is a real export. Flattening a document store into UDISE+
  CSVs is extra engineering for a worse result.
- RLS is one authorization model, enforced in the same schema your
  app already lives in. A second, separate security-rules language is
  an extra place for a tenant leak to hide.
- Supabase bundles Postgres + RLS + Auth + Storage, which is fewer
  moving parts for a solo operator than a split Firebase stack.

**Three surfaces, one identity model, staged rollout (see §6 Bridge Rule):**
1. Public Web Platform — marketing + SEO/GEO, unblocked now.
2. Control Plane (`/control`) — NetCyberAI internal, super-admin only.
3. Unified School Portal (`/app`) — one login, role decides the view.

**Messaging:** WhatsApp Cloud API primary, SMS/email fallback. See §7
for the cost-governance rules this now requires.

**Every operational table carries `school_id`. No table is exempt.**
See [`../db/schema.sql`](../db/schema.sql) /
[`../db/rls_policies.sql`](../db/rls_policies.sql) for the canonical
implementation of this rule — this Constitution defers to them for
exact structure.

## §5. Recognition Engine — CORRECTED

The original formula, `improvement_score = (new-old)/(100-old)`, is
**mathematically wrong for its stated purpose**. Proof: 85→90 scores
33.3%; 40→55 scores 25.0%. The formula rewards the student who was
already strongest, the opposite of what "Most Improved" is supposed to
protect. Do not resurrect this formula in any future prompt.

**Locked replacement, two separate mechanisms:**

1. **Personal Best (primary, non-competitive).** Any student who
   improves beyond a 5-percentage-point noise floor on any tracked
   axis (marks, attendance, homework completion), against their own
   prior-fortnight baseline, triggers a message. No ranking. Every
   qualifying parent gets one. This is the actual mechanism that
   delivers "60–70% of parents receive something positive" — a
   ranking formula can never deliver that, because ranking is
   necessarily zero-sum.
2. **Most Improved (secondary, competitive, opt-in).** Uses
   **logit-delta** — `logit(new/100) − logit(old/100)` — which is
   symmetric at both ends of the scale, unlike raw delta (biased
   toward low baselines) or the old headroom formula (biased toward
   high ones). Competitors are **banded by baseline quartile**, so a
   40%-baseline student is only ever compared to peers who also
   started near 40%. One winner per class per band.
3. **Class Shine (tertiary, opt-in, default OFF).** Top-3-per-class,
   framed as "3 students who shone this fortnight," never as
   "Rank 1/2/3." Off by default per §9's anti-shaming rule — a
   principal must actively enable it, not discover it was on.
   *(Corrected 2026-09-16: this previously cited "§15," which does not
   exist in v2.0/v3.0 — a v1.0 section reference that survived a
   rewrite. See `10_DECISION_LOG.md` C30d.)*
4. **Consistency Badge.** Quiet, portal-only, no WhatsApp blast.
5. **Sample-size guards on all competitive tiers:** minimum 2
   assessments in both windows, minimum score movement to clear
   measurement noise, and exclusion of students below 60% attendance
   in the window (their "delta" is an attendance artefact, not an
   achievement).

Implementation reference: [`../src/lib/recognition.ts`](../src/lib/recognition.ts)
— the values there (5-point floor, quartile bands) are documented
defaults, not hardcoded constants; see Amendment 1's mitigation table
and `08_EXECUTION_BIBLE.md` Prompt J.

## §6. The Bridge Rule — AMENDED (see Amendment 1). Phase 1 is authorized; read the amendment before assuming otherwise.

**Platform engineering (Control Plane + School Portal + Cloud
Functions) does not start until one of:**
- 60–90 days of real Pulse/Brief open-rate data from at least one real
  school, sustained above the §3 target, or
- 2–3 schools explicitly asking for production access, unprompted.

No real data of either kind exists anywhere in this project as of this
Constitution's writing. Building the portal now would mean betting a
solo operator's only spare capacity on an unproven thesis — this is
the exact failure mode this rule exists to prevent, and a past AI
session's own reasoning ("Noor's call to make") is not the same thing
as Noor actually making that call. This document records that the
call has been made, explicitly: **hold.**

**What IS unblocked right now, explicitly:** the Public Web Platform.
It touches no tenant data, needs no schema decision resolved, and is
the mechanism by which the 2–3-schools trigger gets pulled. Build this
first. *(Shipped as of this version — see
[`archive/netcyberai_public_site_content_plan.md`](archive/netcyberai_public_site_content_plan.md)
for the build record and [`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md)
§7.1 for the target-state site plan Phase 1 pages are added against.)*

**What a future AI session must NOT do:** infer that "the founder
wants it built" from an eager prompt and start Control Plane or Portal
code. If asked to build those surfaces, the correct response is to
point back to this section and ask whether the bridge trigger has
actually been met — not to assume it has.

> **Amendment 1 (2026-09-16). §6 is overridden by founder decision.**
> Phase 1 platform engineering (Control Plane, School Portal) is
> authorized to begin immediately, without the 60–90 day pilot-data
> trigger above having been met. A session reading only this section
> must not conclude Phase 1 is blocked — it is not.
>
> **Founder's reasoning, recorded per §12 rather than silently
> applied:** infrastructure is already provisioned (GitHub, Vercel,
> Cloudflare, n8n, WhatsApp Business API, PostgreSQL). Go-to-market
> strategy changed from *validate-then-build* to *build-then-
> demonstrate* — a complete working ecosystem shown to a principal
> converts better than a manual pilot described to one.
>
> **What the override does not change:** every other section of this
> Constitution remains in force, unamended except where Amendments 2
> and 3 say otherwise. `db/schema.sql` and `db/rls_policies.sql` remain
> the locked data layer — Postgres + RLS, not Firestore. The
> `src/lib/recognition.ts` formula remains locked; the v1.0 headroom
> formula stays banned. All permanent bans in `05_BUSINESS_LOGIC.md`
> §6 remain permanent.
>
> **The risk this override creates, and how it's mitigated.** §6's
> function was not only to conserve effort — it was to prevent locking
> parameters whose correct values can only be learned from real
> parents. Building the platform does not validate the thesis; the
> first real school putting real parents on the Pulse is still the
> moment that happens. Three parameters are made configurable, never
> hardcoded, to keep that door open while building proceeds:
>
> | Parameter | Reference | Mitigation |
> |---|---|---|
> | Pulse/response-rate target (§3) | Amendment 3 | Stored in `schools`/config, not hardcoded. Instrumented from first send. |
> | Recognition thresholds (5-point floor, band count) | §5 | Per-school config with a fairness-audit surface. See `08_EXECUTION_BIBLE.md` Prompt J. |
> | Message cost model | §7 | Rate table configurable with a verification date. The governor reads config, never a constant. |
>
> Full build sequencing under this override is
> [`08_EXECUTION_BIBLE.md`](08_EXECUTION_BIBLE.md).

## §7. WhatsApp cost governance — NEW (was entirely absent from v1.0)

Meta's per-message billing changed 1 July 2025 (conversation-based →
per-message) and changed again with the rate cards effective 1 October
2026 (Meta's pricing page, as updated 30 September 2026). Treat every
message category as billable unless Meta's current page says otherwise;
the amounts live in `message_rate_table`, never in this document. **Any public-facing price quoted anywhere (site,
pricing page, sales material) must be re-verified against Meta's live
INR pricing card at time of publish, with the verification date shown
next to the figure.** Do not carry forward a number from an old prompt
without checking it first — it may already be stale.

Design consequences, locked:
- Every `communication_log` row records `billing_category`,
  `inside_service_window`, `billable`, `est_cost_paise`, `gst_paise` —
  cost must be observable per school, per template, per month from
  day one.
- A per-school monthly budget cap exists (`schools.monthly_budget_paise`
  in the schema). On breach: transactional messages (receipts, OTP,
  TC delivery) always send; Pulse/recognition batch or degrade to
  portal-only; principal is alerted before the cap, not after.
- WhatsApp-path flows answer in one composed message. Multi-turn
  bot interrogation is now a per-turn cost, not just a UX problem.

## §8. Data protection & DPDP — NEW (was entirely absent from v1.0)

This product's entire user base includes children's personal data.
The DPDP Rules 2025 impose verifiable-parental-consent obligations on
a timeline that was approaching at the time of the last audit — check
current status before building or publishing anything that touches
this. Locked design response regardless of exact commencement date:

- **No student record is fully active without a consent record.**
  Every student is created in `status = 'pending_consent'` (see
  schema). Bulk CSV import creates records in this quarantine state,
  never active — "onboard 500 students in 10 minutes" is a false
  promise if it means 500 unconsented child records; the honest
  version is "500 records ready for consent collection in 10 minutes."
- No outbound message and no recognition scoring touches a
  `pending_consent` student.
- Recognition, Daily Pulse, and Weekly Brief are each **separately
  consentable purposes**, independently withdrawable, defaulting to
  off until granted (`consent_ledger` table).
- `/security/data-ownership` states the residency and children's-data
  position explicitly, in plain language a skeptical principal can
  read without a lawyer.
- No third-party analytics, ad pixel, or session-replay script on any
  authenticated route, ever.

## §9. Trust rules — what we refuse to do

- **No AI-generated factual assertion reaches a parent without
  deterministic re-validation against source data at send time** —
  Amendment 3, point 1. A mismatch holds the message for human review;
  it is never silently sent.
- No public teacher leaderboard. Teacher Impact Card is principal +
  self only, enforced at the RLS layer, not just hidden in the UI.
- No parent app as the primary channel. WhatsApp is primary; a web
  portal is a companion, never a gate.
- No Top-3-only framing for student recognition as the *default* —
  Personal Best is primary; Class Shine is opt-in and secondary.
- No dummy, mock, fake, or sample data in any deliverable, ever,
  outside an explicitly-labelled `/demo` sandbox tenant that cannot
  receive real outbound messages by construction.
- No fabricated outcome statistics anywhere in public content. A
  `caseStudy` field stays `null` until a real, consented pilot exists.
  This includes percentages, ₹ figures, and "data shows" framing of
  any kind.
- No cross-school data leakage, under any role, under any query path.
- No silent failures. A blocked or failed send is logged with a
  reason (`blocked_pilot`, `blocked_consent`, `blocked_budget`, etc.),
  never dropped without a trace.

## §10. What can wait

Coaching/college tenant types (`tenant_type` enum exists, UI does
not). Native mobile apps (web + WhatsApp first; native only if
adoption data demands it). Voice Pulse, missed-call reports, homework
photo queue, AI doubt-solver — good ideas, explicitly Phase 2+, not
part of the Bridge-Rule-gated build.

## §11. Roles (summary — full matrix lives in [`../db/rls_policies.sql`](../db/rls_policies.sql))

`super_admin` (NetCyberAI team, all tenants) · `school_admin` /
`principal` (full school, approval powers) · `teacher` (own classes
only, self-view of own Impact Card) · `accountant` (fees only, no
academic edit) · `academic_coordinator` (Phase 1 addition — see
`04_SYSTEM_DESIGN_PRD.md` §2.2) · `parent` (own linked children only,
no login in Phase 1 — served over WhatsApp; see Decision Log C13) ·
`student` (own profile only, optional, Class 6+) — **stays in the role
enum for Phase 2. No student login or student-facing surface ships in
Phase 1** (Decision Log C24).

## §12. Amendment process

This document is versioned. A future AI session may propose a change
(e.g. "the North Star metric conflicts with X") but may not silently
apply it. Changes land here, as a new version, with the reasoning
recorded — the same discipline this version itself applied to v1.0's
recognition-formula bug and its missing DPDP section.

## §13. How to use this document

*(Corrected 2026-09-16 — the workflow below described uploading files
into an external AI tool. That workflow is obsolete: the files live in
this repository now. See `10_DECISION_LOG.md` C11 and
[`00_START_HERE.md`](00_START_HERE.md) for the current instruction to
give a new AI session.)*

Read this file first, before any build prompt, in any AI session
working in this repository. Pair it with
[`02_AI_BUILDER_INSTRUCTIONS.md`](02_AI_BUILDER_INSTRUCTIONS.md), which
tells the tool *how* to behave when this Constitution and a build
request conflict.
