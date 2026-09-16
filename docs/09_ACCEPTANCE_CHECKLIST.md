# 09 — Acceptance Checklist

**Governs:** what "done" means for any deliverable in this project.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md),
[`02_AI_BUILDER_INSTRUCTIONS.md`](02_AI_BUILDER_INSTRUCTIONS.md).

Run this before any AI session (or human) declares a deliverable done.
A claim of "passed" without a way to show the check actually ran is
not the same as passed — say what was verified and how.

---

## Phase 0 — Public Web Platform: **PASSED, 2026-09-16**

**Verification method:** [`../README.md`](../README.md)'s fabrication/
dummy-data/secrets greps plus `npm run build && npx tsc --noEmit`, run
in this consolidation session with actual output (all clean); the
schema-coverage audit now actually run by `scripts/seo_audit.py`
(`npm run audit:seo`) — 28 routes, 17 real problems found, see
`06_VISIBILITY_PROTOCOL.md` §2 for the breakdown; and
`05_BUSINESS_LOGIC.md` §9's build record for the SEO infrastructure
itself. **The Prompt 8/9 audit's original "39 problems → 0" claim
predates a script that exists in this repo and is not restated as
verified fact anywhere in this document.**

- [x] No mock/dummy/fake/sample array outside `/demo` — re-verified
      this session; the one hit found (`src/lib/recognition.ts`'s
      "sample-size" comment) is a false positive, excluded with a
      documented reason in `../.github/workflows/checks.yml`.
- [x] No secrets committed — re-verified this session, clean.
- [x] `npm run build && npx tsc --noEmit` — re-verified this session,
      clean (with `NEXT_PUBLIC_WHATSAPP_NUMBER` set; production build
      correctly *fails* without it — see the env-guard item below).
- [x] Every page has exactly one canonical and one og:image, correct
      locale/hreflang — verified by `scripts/seo_audit.py`, 28/28
      routes, 2026-09-16.
- [ ] Every page's `<title>` is ≤60 chars and meta description is
      150–160 chars. **Not passing.** `scripts/seo_audit.py` found 10
      blog titles over 60 chars (64–82 chars) and 6 meta descriptions
      short of the 150–160 window (142–149 chars). Real, unfixed —
      see `06_VISIBILITY_PROTOCOL.md` §2 for the full list.
- [x] Valid `FAQPage` JSON-LD on every page the content plan requires
      it on — `/`, `/pricing`, `/security/data-ownership`, `/demo`,
      every `/features/*`, every `/blog/*` post. Verified by
      `scripts/seo_audit.py`: JSON-LD parses, `FAQPage` type present,
      4–6 questions each, 2026-09-16 — this closes the "component
      presence confirmed, JSON-LD not yet re-audited" gap noted here
      previously.
- [ ] No numeric outcome claim anywhere without a traceable source —
      **not re-verified this session.** The existing fabrication grep
      has false-positive gaps (cited figures like "CPI + 5%" and CSS
      values like `width: '100%'` both trip it) — this is itself a
      Stage 6 finding, not a pass/fail here.
- [ ] Every WhatsApp price quoted checked against Meta's current INR
      card, with the check date shown — **not re-verified this
      session.**
- [ ] `/demo` labelled as a concept demo, cannot send real outbound —
      structurally true (Phase 0 has no messaging integration at all),
      not independently re-tested this session.
- [ ] Lighthouse mobile ≥90 performance / ≥95 accessibility on
      throttled 3G — **cannot be verified by an AI session**
      (`../README.md`'s own "Not yet done" list). Still outstanding.
- [ ] Real budget Android phone test — same, outstanding.
- [ ] Legal review of `/privacy` and `/terms` — outstanding, blocking
      for launch (both pages are marked "Draft — pending legal review"
      on the pages themselves).
- [x] Production build fails without `NEXT_PUBLIC_WHATSAPP_NUMBER` —
      re-verified this session with actual command output (the build
      throws `Error: NEXT_PUBLIC_WHATSAPP_NUMBER is required in
      production` when unset, and succeeds when set).

**Net status, corrected 2026-09-16:** most checks an AI session can run
are clean; one is not — `scripts/seo_audit.py` found 17 real,
unfixed title/description-length problems (see above). The checks that
need a human, a lawyer, or a physical device remain open and are not
claimed as passed. "Clean" is not claimed anywhere in this document
without a check behind it, including this one.

---

## Phase 1 — Platform 2 & 3: **not yet built**

Authorized under [`01_CONSTITUTION.md`](01_CONSTITUTION.md) §6
Amendment 1. Derived from
[`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md) §11's 20-item
acceptance matrix, ordered to match
[`08_EXECUTION_BIBLE.md`](08_EXECUTION_BIBLE.md)'s Prompt A–M sequence.
Every item below is unchecked because no Phase 1 code exists yet —
this section is what to run against the build once it starts, not a
claim about current state.

- [ ] **Tenant isolation** (Prompt B, the hard gate) — two-school
      suite: every cross-tenant read fails under every role; a
      deliberately buggy query missing `school_id` returns zero rows
      because RLS caught it.
- [ ] **Auth** (Prompt B2) — forged `school_id` claims defeated by
      RLS; session claims resolve from the active membership row, not
      `users.school_id`.
- [ ] **Design system** (Prompt C) — every primitive at 360px and
      1440px, screenshotted; automated contrast and tap-target checks.
- [ ] **Layouts & routing** (Prompt D) — `/control/*` and `/app/*`
      segments resolve correctly with no path collision; a teacher
      session reaching `/control/*` is rejected server-side.
- [ ] **Onboarding** (Prompt E) — school created; admin invited; 500
      students imported to `pending_consent`; `pilot_allow_outbound`
      cannot be set true without a configured budget.
- [ ] **Capture** (Prompt F) — document scanned → OCR pre-fills →
      human corrects → commits with source attached; no Aadhaar image
      stored; a cross-tenant QR scan is denied and logged.
- [ ] **Consent** (Prompt G) — `pending_consent` invisible to every
      outbound path and to recognition scoring; withdrawal is a new
      ledger row; Form 6 advisory returns `unknown` for unconfigured
      CPI or filing deadline, never a guess.
- [ ] **Attendance & send gate** (Prompt H) — every block reason
      produces a logged row; only the *first* absence alert per
      student per day is transactional; at budget cap, a receipt and
      the first absence alert still send, a daily Pulse queues into
      the weekly batch, Recognition holds and surfaces to staff.
- [ ] **Fees** (Prompt I) — partial payment status derives correctly;
      duplicate webhook does not double-credit; no code path deletes a
      payment.
- [ ] **Academics & differentiators** (Prompt J) — `not_taught`
      produces no Pulse; Personal Best reaches a broad share (fairness
      audit run); Most Improved bands correctly; the recognition
      thresholds are per-school config, not hardcoded; the banned
      headroom formula has a failing test proving it's inverted;
      Teacher Impact Card is invisible teacher-to-teacher at the
      database level; no per-parent engagement score exists anywhere.
- [ ] **n8n** (Prompt K) — nothing bypasses the send gate; an unsigned
      inbound request is rejected and logged.
- [ ] **WhatsApp** (Prompt L) — a test message reaches only the
      founder's number; delivery webhook updates the log row; a button
      tap lands in `pulse_response_log`.
- [ ] **Reporting, billing, support, hardening** (Prompt M) — a report
      export for one school contains zero rows from another; the DR
      restore drill was **actually performed and timed**, within the
      RTO < 4h target — not scheduled, not described, performed.

---

## Process

- [ ] Any deviation from [`01_CONSTITUTION.md`](01_CONSTITUTION.md)
      was flagged and confirmed, not silently applied.
- [x] The Bridge Rule (`01_CONSTITUTION.md` §6) override is recorded
      as Amendment 1, inline, per §12 — not silently applied. Verified
      this consolidation session.
