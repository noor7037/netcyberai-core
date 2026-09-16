# 00 — Start Here

**Governs:** nothing normatively — this is the index. Read it first,
then follow the order below.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md).

---

## What NetCyberAI is

NetCyberAI is a WhatsApp-native Student Learning Monitoring & Parent
Engagement Engine for Indian schools, not a school ERP — it makes
parents confident every day, so results go up and fees get recovered
automatically. It closes three trust gaps (parent↔child, parent↔
school, principal↔teacher) through a small set of differentiators —
the Daily Learning Pulse, Weekly Confidence Brief, non-competitive
student Recognition, and the Teacher Impact Card — built on top of a
conventional school-operations layer (students, attendance, fees,
exams) that exists to give those differentiators real data to work
with, not as an end in itself.

## Current status

**Phase 0 (public web platform) — shipped, PASSED.** See
[`09_ACCEPTANCE_CHECKLIST.md`](09_ACCEPTANCE_CHECKLIST.md) for what
was actually verified and how.

**Phase 1 (Control Plane + School Workspace) — authorized, not yet
built.** [`01_CONSTITUTION.md`](01_CONSTITUTION.md) §6 originally
gated this behind a 60–90-day pilot-data trigger that was never met.
**Amendment 1 overrides that gate** — the founder decided to build the
platform first and demonstrate it, rather than wait for proof. Three
parameters this created risk around (the Pulse response-rate target,
recognition thresholds, message cost model) are built as configuration
from day one specifically so that risk stays bounded. Build sequence:
[`08_EXECUTION_BIBLE.md`](08_EXECUTION_BIBLE.md), Prompts A through M.

## Read order for a new session

1. [`01_CONSTITUTION.md`](01_CONSTITUTION.md) — source of truth. Read
   the amendment index at the top first; it tells you what's changed
   since v2.0 without reading the whole document.
2. [`02_AI_BUILDER_INSTRUCTIONS.md`](02_AI_BUILDER_INSTRUCTIONS.md) —
   how to behave: the Transparent Output Template, the anti-
   fabrication rules, what to do when you disagree with a past
   decision.
3. [`03_ARCHITECTURE_PLAIN.md`](03_ARCHITECTURE_PLAIN.md) — why
   Postgres+RLS, why WhatsApp-first, in plain language.
4. [`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md) — the Phase 1
   specification. Long; read the section the prompt you're running
   cites, not the whole thing cold.
5. [`05_BUSINESS_LOGIC.md`](05_BUSINESS_LOGIC.md) — fee engine, Form 6
   advisory, at-risk detection, the WhatsApp Accountability Loop.
6. [`06_VISIBILITY_PROTOCOL.md`](06_VISIBILITY_PROTOCOL.md) — SEO/AEO/
   GEO/AIO, Platform 1 only.
7. [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) — tokens, the Floor
   Device Standard, breakpoints, component inventory.
8. [`08_EXECUTION_BIBLE.md`](08_EXECUTION_BIBLE.md) — the actual build
   prompts, A through M, in order. **Do not batch prompts.**
9. [`09_ACCEPTANCE_CHECKLIST.md`](09_ACCEPTANCE_CHECKLIST.md) — what
   "done" means, checked against real output.
10. [`10_DECISION_LOG.md`](10_DECISION_LOG.md) — read when something
    in the above seems to contradict something else. It almost
    certainly doesn't — check here before re-deciding it.

`db/schema.sql`, `db/rls_policies.sql`, and `src/lib/recognition.ts`
are locked reference implementations, cited throughout — read them
when a prompt tells you to, not before.

## The one instruction to give any new AI session

> Read `docs/00_START_HERE.md`, then `docs/01_CONSTITUTION.md` and
> `docs/02_AI_BUILDER_INSTRUCTIONS.md`, fully, before responding.
> Treat the Constitution as locked; if my request conflicts with it,
> tell me directly instead of silently following my request. Use the
> Transparent Output Template on every response. Check
> `docs/10_DECISION_LOG.md` before treating anything as a
> contradiction — it may already be resolved there.

## Consolidated `[GAP]` list

Nothing below is invented or assumed. Each needs a human answer, a
lawyer, a real school, or real data.

- **Pulse comprehension response-rate target** — Amendment 3 changed
  the North Star metric from open rate to response rate; no target
  carries over from the old >65% figure. Instrument from the first
  real school, set the target from 30 days of data.
- `12_RECONCILED_PLATFORM_FEATURE_MAP.md` — confirmed absent from this
  repo. `10_DECISION_LOG.md` is its practical replacement.
- The standalone "CTO Recommendation" blueprint — confirmed absent,
  never committed to this repo.
- `scratchpad/seo_audit.py` — referenced repeatedly in
  `06_VISIBILITY_PROTOCOL.md` as the tool that verified 28 pages and
  caught 39 problems, and as something to "keep in CI." Confirmed
  absent from this repo (2026-09-16); no such check runs in
  `.github/workflows/checks.yml`. The 39→0 result is a historical
  claim with no way to re-run it. Needs writing, or the Protocol's
  references to it need to stop implying it still exists.
- Current-year CPI figure and its official source (Form 6 advisory,
  blocks `08_EXECUTION_BIBLE.md` Prompt G).
- Current-year Form 6 filing deadline and the official field list
  (same prompt) — not a fixed date; Haryana has extended it in past
  years.
- WhatsApp interactive button character limit and current India
  per-message billing rules — verify against Meta's live reference at
  build time (Prompt L).
- Real fee concession types actually used by target schools, from a
  real school, not assumed (Prompt I).
- DPDP legal basis for parent-facing at-risk dispatch (Prompt J) —
  needs legal review.
- OCR provider selection, against the criteria in
  `04_SYSTEM_DESIGN_PRD.md` §6.1 (Prompt F).
- Final plan pricing in ₹ — tiers are structured in
  `04_SYSTEM_DESIGN_PRD.md` §8.1; the numbers are the founder's to set.
- ID card physical print format and workflow — in-house or vendor.
- Legal review sign-off on `/privacy` and `/terms` — still blocking
  for launch; both pages are marked "Draft — pending legal review."
- The public-site nav/feature-page delta between the shipped 6-page
  site and `04_SYSTEM_DESIGN_PRD.md` §7.1's target state (Scan &
  autofill, QR student ID, a dedicated Weekly Brief page) — not a
  defect (Decision Log C26); each ships when its feature ships. Listed
  here as a backlog item, not a gap requiring an answer.

## Change log

**2026-09-16 — Documentation consolidation.** Eleven root-level `.md`
files plus two SQL files and one `.ts` file, previously scattered at
the repo root with inconsistent numbering and a `12` gap, reorganized
into `docs/` (numbered `00`–`10`, superseded/historical files under
`docs/archive/`), `db/` (the two locked SQL baselines), and
`src/lib/recognition.ts`. Three Constitution amendments recorded
inline (Bridge Rule override; market scope; AI content governance +
North Star metric change). Full conflict inventory and resolutions in
`10_DECISION_LOG.md`. Git version control initialized for the first
time as part of this consolidation (previously untracked).
