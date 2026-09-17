# 10 — Decision Log

**Governs:** nothing prescriptively — this is a record, not a spec.
**Governed by:** the resolutions below were applied to
[`01_CONSTITUTION.md`](01_CONSTITUTION.md),
[`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md),
[`05_BUSINESS_LOGIC.md`](05_BUSINESS_LOGIC.md),
[`06_VISIBILITY_PROTOCOL.md`](06_VISIBILITY_PROTOCOL.md), and
[`08_EXECUTION_BIBLE.md`](08_EXECUTION_BIBLE.md) directly; this file
is where a future session finds *why*.
**Supersedes / replaces:** the missing
`12_RECONCILED_PLATFORM_FEATURE_MAP.md`'s §0 mismatch-resolution log,
cited by `08_EXECUTION_BIBLE.md` Prompt D but never committed to this
repo. This document is its practical replacement — built from this
consolidation's own conflict resolution, with file:line references on
both sides of every conflict, rather than reconstructed from a file
that doesn't exist.

**Why this file exists:** a decision recorded once and never
re-litigated is the entire point of a locked-file discipline. Without
this record, a future AI session hits the same contradiction (Bridge
Rule status, mobile-only vs responsive, the recognition formula) and
either re-decides it from scratch or, worse, decides it differently.
Every row below has both sides' exact location and the resolution
actually applied — not just the conclusion.

---

## Part 1 — Conflicts identified before the audit

| # | Conflict | Resolution |
|---|---|---|
| C1 | Bridge Rule: `01_CONSTITUTION.md` §6 (as originally written) and 14 other files assert Phase 1 is gated; `08_EXECUTION_BIBLE.md` records a founder override. | **Override stands.** Recorded as Amendment 1, inline in `01_CONSTITUTION.md` §6. |
| C2 | `tenant_id` appears in `../db/rls_policies.sql` as the session-variable name `app.current_tenant_id`. | **Not a real conflict.** No column named `tenant_id` exists; the column is always `school_id`. Left as-is in the locked SQL; documented in `03_ARCHITECTURE_PLAIN.md`. |
| C3 | "Palwal Test" / "Palwal/NCR market constraint" (`01_CONSTITUTION.md` §2 as originally written, `02_AI_BUILDER_INSTRUCTIONS.md`, `archive/00_NetCyberAI_Revised_Understanding.md`) vs the Floor Device Standard. | **Floor Device Standard governs.** Recorded as Amendment 2. Market is all-India, tier 1–4. Two literal "Palwal" strings remain in shipped code (`src/components/content/StepDiagram.tsx:8`, `src/app/features/daily-learning-pulse-hinglish/page.tsx:53`) — reported as a Stage 6 finding, not fixed in this consolidation. |
| C4 | "Mobile-only" (`05_BUSINESS_LOGIC.md` §1 as originally titled) vs "mobile-first responsive" vs the per-role device matrix. | **Mobile is the floor, not the ceiling** (`04_SYSTEM_DESIGN_PRD.md` §0.2). §1 retitled; invariant 4 (single-column) scoped to the 360px floor only. |
| C5 | Recognition formula: `(new-old)/(100-old)` vs logit-delta with quartile banding. | **Logit-delta governs**, already the case everywhere except in banning contexts. `src/lib/recognition.ts` is authoritative; its thresholds are documented defaults, not constants (see C21). |
| C6 | `/demo` crawler policy: `05_BUSINESS_LOGIC.md` §9 (original decision) vs `06_VISIBILITY_PROTOCOL.md` §3. | **Protocol §3 governs** — already recorded inline in `05_BUSINESS_LOGIC.md` §9 as a self-correction before this consolidation began. |
| C7 | `archive/BUILD_ORDER.md` says "Phase 0 only, do not start Phase 1." | **Superseded by `08_EXECUTION_BIBLE.md`** (Amendment 1). Archived with a supersession header. |
| C8 | "Six operational workflows vs the differentiators" — no stale text found anywhere in the repo matching this description. | **Nothing to resolve.** `04_SYSTEM_DESIGN_PRD.md` §0.3 (ERP substrate elevated) is the closest existing record; the described conflict likely lived in the missing `12_RECONCILED...` file or the never-committed "CTO Recommendation" blueprint. |
| C9 | North Star metric ambiguity between "open rate" and "response rate" language across files. | Resolved as part of **Amendment 3** — see C17. |
| C10 | Two files numbered `00`; numbering jumps from `11`/`13` with no `12`. | Resolved by the Stage 3 renumbering: `docs/00_START_HERE.md` through `09_ACCEPTANCE_CHECKLIST.md`, `10_DECISION_LOG.md`. Both original `00_*` files archived. |
| C11 | `archive/00_README_UPLOAD_PACK.md` describes uploading files to an external AI tool. | **Obsolete.** Files live in this repo now. Content seeded `00_START_HERE.md`; also corrected in `01_CONSTITUTION.md` §13, which described the same workflow. |

---

## Part 2 — Errors found in the source documents themselves

These are not disagreements between two documents; they're places
where a document is wrong on its own terms.

### A1 — The schema cannot store `not_taught`

`../db/schema.sql`'s `syllabus_progress.status` check constraint only
allows `('completed','delayed','partial')`. Every other document
specifies four states — `taught / delayed / partial / not_taught` —
and the Pulse's core honesty guarantee ("a `not_taught` topic
generates no Pulse") is unbuildable without the fourth state. This is
an error in the locked schema, not documentation drift.

**Resolution:** migration added to `08_EXECUTION_BIBLE.md` Prompt A
(the constraint is dropped and re-added with the four states; existing
`'completed'` rows are updated to `'taught'`; the default becomes
`'taught'`). `../db/schema.sql` itself stays byte-unchanged — the
migration carries the fix.

### A2 — Self-contradictory consolidation brief

The instruction to "correct market framing throughout" and "carry
every other section forward unamended" cannot both hold when the
market framing lives in `01_CONSTITUTION.md` §2 itself.

**Resolution:** recorded properly as **Amendment 2**, per §12 — the
Constitution is never silently edited.

### A3 — The North Star metric may not be measurable

`01_CONSTITUTION.md` §3 (as originally written) set the North Star as
Pulse/Brief **open rate** >65%. WhatsApp `read`-receipt webhooks only
fire when the recipient has read receipts enabled (a setting users
routinely disable), and `read` implies `delivered`, so both the
numerator and denominator are affected — open rate is systematically
undercounted by an amount that varies with the user population. A
metric that can't be measured reliably can't be a gate.

The three-tier comprehension button tap is measured by a webhook that
fires on an explicit user action, with no privacy setting in the way,
and is the stronger signal — a tap means a parent engaged, not merely
that a phone displayed something.

**Resolution:** recorded as **Amendment 3**, point 2. North Star
changes from Pulse/Brief open rate to comprehension response rate
(button tap ÷ delivered). Open rate demotes to `secondary`, caveated
as a floor, never a gate. **Target is `[GAP]`** — the >65% figure was
set for open rate and cannot be carried over; instrument from the
first real school, set the target from 30 days of data.

Amendment 3 also carries a second, unrelated point recorded in the
same block because both surfaced from the same review pass: the
**AI content re-validation rule** (no AI-generated factual assertion
reaches a parent without deterministic re-validation at send time),
which was being applied in practice throughout `05_BUSINESS_LOGIC.md`
and `04_SYSTEM_DESIGN_PRD.md` without ever being stated as a
Constitution-level rule. It is one now, cross-referenced from §9.

---

## Part 3 — The eight decisions requested during Stage 2

| # | Decision | Resolution |
|---|---|---|
| **C13** | Parent login and portal: several files assumed one; `04_SYSTEM_DESIGN_PRD.md` §2.2/§1.4 says none in Phase 1. | **PRD wins — no parent login in Phase 1.** Parents are served over WhatsApp. Consequences: the "degrade to portal-only" budget fallback is redefined — Pulse queues and batches into one weekly consolidated message instead of daily; Recognition holds until budget resets and surfaces to **staff** in Platform 3 (assembly, notice board) instead of disappearing. The Consistency Badge becomes staff-visible and folds into the Weekly Confidence Brief text — no separate message, no added cost. RLS parent-scope policies stay (correct, harmless, needed for Phase 2). The shipped homepage FAQ's parent-portal promise is a Stage 6 finding, not fixed here. |
| **C19** | Are absence alerts transactional (bypass the budget cap)? | **First absence alert per student per day only.** A parent not knowing their child failed to arrive is a child-safety matter and always sends. Follow-ups and pattern alerts are non-transactional — an unbounded transactional class scaling with absence rate would be a budget hole. Final transactional class: receipt · OTP · certificate delivery · first-absence-of-day. |
| **C22** | URL scheme: `01_CONSTITUTION.md` §4 specifies `/control` and `/app`; `04_SYSTEM_DESIGN_PRD.md` §1.1's route groups `(admin)`/`(school)` add no URL segment on their own and would collide. | **Use both.** Route groups for code organisation, explicit path segments for URLs: `(admin)/control/` → `/control/...`, `(school)/app/` → `/app/...`. Applied in `04_SYSTEM_DESIGN_PRD.md` §1.1 and `08_EXECUTION_BIBLE.md` Prompts B2 and D. |
| **C23** | Exclusions: `04_SYSTEM_DESIGN_PRD.md` §1.4 put a permanent ban and a commercial deferral in one table, and contradicted itself on Library ("Permanent exclusion" that says "Defer until..."). | **Two tables.** Permanent bans (architectural/ethical, never revisited): RFID, IoT metering, blockchain credentials, facial recognition, on-premise hardware/desktop agents, autonomous tool-calling AI agents, WhatsApp Groups. Deferred (commercial, revisitable): native apps, library, hostel, payroll, inventory, transport/GPS, full LMS, parent/student portals. Un-defer condition: a paying school makes it contractual, **and** it passes the Floor Device Standard, **and** no school-maintained hardware. |
| **C26** | Does `04_SYSTEM_DESIGN_PRD.md` §7.1's 10-item nav (adding Scan & autofill, QR ID, Weekly Brief pages) now govern the shipped Phase 0 site? | **PRD §7.1 is target-state, not a Phase 0 defect.** Publishing a feature page for a feature that doesn't exist yet would itself be a fabricated claim under `01_CONSTITUTION.md` §9. Each new page ships when its feature ships. The current 6-page nav remains correct for current capability. The delta is a backlog note in `00_START_HERE.md`, not a Stage 6 defect. |
| **C29** | The consolidation brief's own contradiction (see A2). | Amendment 2, per §12. |
| **C30** | Five miscellaneous citation issues. | **(a)** "deterministic re-validation of AI content" credited to §9 without existing there → now a real rule, Amendment 3 point 1, cross-referenced at §9. **(b)** "never rely on application code alone to filter by tenant" credited to Constitution §4 → corrected to cite `02_AI_BUILDER_INSTRUCTIONS.md` rule 4 and `04_SYSTEM_DESIGN_PRD.md` §2.1 instead. **(c)** "financial records never deleted" credited to Constitution §9 → corrected to cite `04_SYSTEM_DESIGN_PRD.md` §1.5 invariant 9. **(d)** "§15's onboarding-choice principle" — no §15 exists in v2.0/v3.0, a v1.0 reference that survived a rewrite → corrected to §9 in `01_CONSTITUTION.md`. **(e)** "per your own OQ-7 default" (`archive/netcyberai_public_site_content_plan.md`) — no OQ list exists anywhere in this repo → left as `[GAP]`, the sentence rewritten to state the decision directly rather than cite a missing source. |
| **C2** | (Repeated from Part 1 for completeness — see above.) | Leave `app.current_tenant_id` unchanged; document the naming distinction. |

---

## Part 4 — Resolutions for conflicts found during the audit but not pre-listed

| # | Conflict | Resolution |
|---|---|---|
| **C12** | See A1 above. | Migration in `08_EXECUTION_BIBLE.md` Prompt A. |
| **C14** | `../db/schema.sql` has `users.school_id NOT NULL` (one school per user), no `academic_coordinator` role; `04_SYSTEM_DESIGN_PRD.md` §2.2 specifies multi-school memberships and that role; `08_EXECUTION_BIBLE.md` Prompt D already builds an Academic shell that needs it. | **PRD wins.** `memberships` table added (Prompt A migration 7); `users.school_id` becomes nullable, retained only as a home-school default; RLS session context resolves from the **active membership**, not `users.school_id` — a real auth-flow change, called out explicitly in Prompt B2. |
| **C15** | `../db/schema.sql`'s `monthly_budget_paise default 0` means every non-transactional message on a new school is blocked, silently. | **Nullable, `NULL` = not configured** (never "unlimited" — that's a real-money footgun). The onboarding wizard (Prompt E) requires a real budget before `pilot_allow_outbound` can be set true — costs nothing during pilot (outbound is already blocked) and guarantees a budget exists once it matters. |
| **C16** | Three schema pieces the spec assumes but the schema doesn't have: `budget_exceeded_transactional` isn't in the `comm_status` enum; no table carries `payload_hash` for webhook idempotency; no quiet-hours config exists despite `blocked_quiet_hours` being a specified status. | All three added in `08_EXECUTION_BIBLE.md` Prompt A: the enum value; a new `webhook_events` table (`school_id` nullable — a webhook can arrive before tenant resolution); `schools.quiet_hours_start`/`quiet_hours_end`. |
| **C17** | North Star described as "open rate" in some files, "response rate" (button-tap) in others. | Resolved by Amendment 3 (A3 above) — response rate is `north_star`; open rate is `secondary`, caveated. |
| **C18** | Form 6 filing deadline cited as a fixed fact ("due 1 February") in `06_VISIBILITY_PROTOCOL.md` §6's GEO example, while `05_BUSINESS_LOGIC.md` §3 already knew (from a 2026-09-16 correction) that Haryana has extended this deadline in different years. | **`05_BUSINESS_LOGIC.md` §3 governs.** Protocol's example corrected to cite only the stable CPI+5% cap, not the moving deadline. `compliance_config.filing_deadline`/`.filing_deadline_source` added alongside the CPI fields in `04_SYSTEM_DESIGN_PRD.md` §3.3 and `08_EXECUTION_BIBLE.md` Prompt G — same "configuration, never hardcoded" treatment as CPI. |
| **C20** | Consent purposes (`core_records, daily_pulse, recognition, weekly_brief`) cover nothing for absence alerts, fee notices, class notices, or at-risk messages — all of which other sections assume pass through the consent gate. | **Restructured**, DPDP-defensible split: `core_records` (required) · `operational_communication` (fee notices, receipts, absence alerts, certificates, school/class notices — required for service) · `daily_pulse`/`recognition`/`weekly_brief` (opt-in, off) · `at_risk` (opt-in, off, **plus** `at_risk_parent_dispatch_enabled` — both required). Applied in `04_SYSTEM_DESIGN_PRD.md` §3.5 and `08_EXECUTION_BIBLE.md` Prompt G. |
| **C21** | `src/lib/recognition.ts` has hardcoded constants (`PERSONAL_BEST_THRESHOLD = 0.05`, `MIN_ASSESSMENTS = 2`, `MIN_ATTENDANCE = 0.6`, 4 fixed bands) despite Amendment 1 requiring recognition thresholds to be per-school config; the file is described as having "tests" in `04_SYSTEM_DESIGN_PRD.md` §4.3 but has none. | File's values are **documented defaults**, wired to per-school config with these as fallback (`08_EXECUTION_BIBLE.md` Prompt J). Prompt J must write the missing tests, including the assertion that the banned headroom formula ranks 85→90 above 40→55 — that assertion, not a comment, is what actually stops the formula being reverted. |
| **C22** | (See Part 3.) | — |
| **C23** | (See Part 3.) | — |
| **C24** | `04_SYSTEM_DESIGN_PRD.md` §2.2 listed a `student` role for Phase 1 while §1.4 deferred student portals entirely — nothing for a Phase 1 student to log into. | **No student login in Phase 1.** `student` stays in the `user_role` enum for Phase 2. Corrected in `04_SYSTEM_DESIGN_PRD.md` §2.2 and `01_CONSTITUTION.md` §11. |
| **C25** | Plan tiers: `../db/schema.sql`'s comment lists `starter\|growth\|campus\|full_os`; `04_SYSTEM_DESIGN_PRD.md` §8.1 specifies Starter/Growth/Campus/**Enterprise**. | **PRD governs for Phase 1.** Not reconciled in the schema comment itself (cosmetic, non-blocking) — noted here so a future session doesn't treat it as a live conflict. |
| **C26** | (See Part 3.) | — |
| **C27** | `04_SYSTEM_DESIGN_PRD.md` §9 Stage 9 (reporting, billing, support, monitoring, DR) had no corresponding prompt in `08_EXECUTION_BIBLE.md`. | **New Prompt M added**, positioned after Prompt L, matching the PRD's own sequencing. Requires an actually-performed, timed PITR restore drill — not a described one. |
| **C28** | README says `NEXT_PUBLIC_WHATSAPP_NUMBER` is "optional — defaults"; `06_VISIBILITY_PROTOCOL.md` §8 says the production build must fail when it's unset. | **Protocol governs, and it's already implemented** — verified this session: `npm run build` throws `Error: NEXT_PUBLIC_WHATSAPP_NUMBER is required in production` when unset, succeeds when set. No code conflict; a README wording nuance only ("optional in dev," true; "optional," not quite). |
| **C29** | (See Part 3 / A2.) | — |
| **C30** | (See Part 3.) | — |
| **C31** | Demo banner wording differs slightly between `archive/netcyberai_public_site_content_plan.md` ("Concept Demo — pilot in progress") and `archive/NetCyberAI_Phase0_Build_Prompts.md` Prompt 7 ("Concept demo — sample school, not real data."). | Cosmetic. The shipped wording (Prompt 7's version) governs; both files are archived as historical records, not live specs. |
| **C32** | `llms.txt` location: Prompt 8 specified `public/llms.txt`; shipped as `src/app/llms.txt/route.ts` (a route, not a static file). | Cosmetic drift inside a now-archived prompt file. The route approach is correct (generated from the same data the pages render, per `05_BUSINESS_LOGIC.md` §9) — not a defect. |
| **C33** | `04_SYSTEM_DESIGN_PRD.md` and `08_EXECUTION_BIBLE.md` both had headers claiming to live at `docs/PHASE_1_SYSTEM_DESIGN_PRD.md` / `docs/PHASE_1_EXECUTION_BIBLE.md` while actually sitting at the repo root, and the Bible cited the PRD by that wrong path ~15 times. | Fixed by the Stage 3/4 move: both files now actually live in `docs/`, headers corrected, all internal citations updated to `04_SYSTEM_DESIGN_PRD.md` / `08_EXECUTION_BIBLE.md`. |
| **C34** | Prompt B2's own verification found that RLS's tenant policies trust `app.current_tenant_id`/`app.current_role`/`app.current_user_id` unconditionally — confirmed directly: forging the tenant GUC for a user with no real membership at that school surfaced other users' real rows there, RLS unchanged. Nothing in the database stops a second, careless call site from setting those GUCs from unverified input; only the fact that exactly one function did it correctly kept the system safe, and that was true by discipline, not by anything enforced. Same shape as the WhatsApp single-send-gate rule (`04_SYSTEM_DESIGN_PRD.md` §3.6: "One send gate for the entire system... It is the only module holding the provider token") — one function is trusted to do a dangerous thing correctly; everything else must be provably unable to do it at all. | **One tenant-context choke point, mechanically enforced, not merely documented.** `src/lib/auth/db.ts` is the only module permitted to call `set_config` for the three session GUCs, to run `SET ROLE`/`RESET ROLE`, or to define `withTenantContext`/`withSelfContext`/`withBackendConnection`. Every other file reaches Postgres session context only through those three exported functions. `scripts/check_choke_point.py` (wired into `.github/workflows/checks.yml`) fails CI if a second call site appears, or if any `src/app/api/**/route.ts` handler reads `schoolId` off its own parsed request body — `school_id` is derived server-side from a verified `memberships` row (`fetchOwnedActiveMembership`/`fetchLiveUser` in `src/lib/auth/resolve.ts`) or it does not exist for that request. The check is deliberately file-local, not a full data-flow trace, and says so in its own output — it catches a second choke point or a route that shortcuts the client's `school_id` straight through, not every conceivable indirect path. RLS itself remains unchanged and is still the backstop if this discipline is ever violated anyway; this decision is about not relying on that backstop being the *only* thing standing between a bug and a cross-tenant read. |
| **C35** | `super_admin`'s authority is `users.role` directly (PRD §2.2: platform-scoped, no membership row), and `withTenantContext` connects a `super_admin` session as `nca_super`, which bypasses RLS entirely (`bypassrls` in `db/rls_policies.sql`). Every other role's revocation-in-flight guarantee is deliberately loose -- membership `is_active` is only re-checked at refresh, an accepted worst case of up to `ACCESS_TOKEN_TTL_SECONDS` (measured in the B2 report). That same looseness applied to `super_admin` would mean a demoted or compromised platform-scoped, cross-tenant, RLS-bypassing session survives up to a full access-token lifetime. | **`super_admin` gets the same per-request "immediate" guarantee as `token_version`, not the refresh-only one.** `withTenantContext`'s live check (`src/lib/auth/db.ts`) now also confirms `users.role` is still literally `'super_admin'` whenever the claim says so, on every request, not only at refresh. Verified by flipping a seeded `super_admin`'s `users.role` mid-session and re-running the exact live-check query immediately after: the very next check returns `claim_of_super_admin_still_valid: false` -- rejection is a property of the next request, not the next refresh cycle. Every other role's 15-minute-at-refresh behavior is unchanged; this is a `super_admin`-specific tightening, not a global one. |

---

## Part 5 — Migrations location (raised as a condition on the Stage 3 approval)

**Decision:** `db/schema.sql` and `db/rls_policies.sql` are the
**locked reference baseline** — what the system looked like when this
was decided, kept byte-for-byte stable so it stays a verifiable point
of comparison. Every actual schema change from that baseline forward
is a numbered file under `supabase/migrations/` (Supabase's own
convention — what `supabase db reset` replays). Nobody edits
`db/schema.sql` directly once migrations exist; a change is a new
migration file, never a diff to the baseline.

Recorded in `03_ARCHITECTURE_PLAIN.md` and applied in
`08_EXECUTION_BIBLE.md` Prompt A, whose four new migrations (A1, C14,
C15, C16) are the first real content this split produces.

---

## Part 6 — What's still genuinely open

The consolidated, canonical list lives in
[`00_START_HERE.md`](00_START_HERE.md). Summarized here for this
document's own completeness:

- Pulse comprehension **response-rate target** (Amendment 3 changed
  the metric; no target carries over from the old open-rate figure) —
  needs 30 days of real-school data.
- `12_RECONCILED_PLATFORM_FEATURE_MAP.md` — confirmed absent, this
  document is its practical replacement.
- The "CTO Recommendation" blueprint — confirmed absent, never
  committed to this repo.
- Current-year CPI figure and official source; current Form 6 filing
  deadline and official field list.
- WhatsApp interactive button character limit and current India
  per-message billing rules — verify at build time.
- Real fee concession types from an actual school.
- DPDP legal basis for parent-facing at-risk dispatch.
- OCR provider selection.
- Final plan pricing in ₹.
- ID card print format and workflow.
- Legal review of `/privacy` and `/terms` — still blocking for launch.
