# 07 — Design System

**Governs:** visual tokens, the Floor Device Standard, breakpoints,
the per-role device matrix, and the component inventory — for both
the shipped Phase 0 site and the Phase 1 build.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md) Amendment 2
(Floor Device Standard), [`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md)
§0.1–0.2 and §10.1–10.2 (this file consolidates those sections rather
than duplicating them as a second source of truth — treat the PRD as
authoritative if the two ever drift).

**New in this consolidation (2026-09-16).** No design-system document
existed before this one — tokens and the Floor Device Standard were
scattered across `archive/NetCyberAI_Phase0_Build_Prompts.md` Prompt 1,
`04_SYSTEM_DESIGN_PRD.md` §0.1–0.2 and §10.1–10.2, and
`08_EXECUTION_BIBLE.md` Prompt C. Consolidated here; nothing invented
— where a primitive is specified but not yet built, it's marked
`[GAP] — Phase 1` rather than described as if it exists.

---

## Tokens

Defined in [`../src/lib/design-tokens.ts`](../src/lib/design-tokens.ts)
(shipped, Phase 0) and unchanged for Phase 1 per
`08_EXECUTION_BIBLE.md` Prompt C ("Tokens — unchanged from Phase 0").

| Token | Hex | Use |
|---|---|---|
| Sapphire | `#0F4C81` | Primary, trust, headings, primary buttons |
| Emerald | `#10B981` | Growth, recognition, success states |
| Amber | `#F59E0B` | Warnings, advisory notices (Form 6 advisory surface) |
| Slate | `#1E293B` | Body text, high contrast |
| Off-white | `#F9FAFB` | Page background, outdoor legibility |

Body text minimum 16px, Slate (`#1E293B`) on Off-white (`#F9FAFB`) —
must stay legible on a cheap screen in daylight. System font stack
with a Devanagari fallback, so Hinglish examples render without a
webfont download on a slow connection.

---

## The Floor Device Standard

Corrected 2026-09-16 from "the Palwal Test" — see
`01_CONSTITUTION.md` §2 Amendment 2. Source:
`04_SYSTEM_DESIGN_PRD.md` §0.1.

The constraint is a floor, not a market definition: build so the
product works on the worst device and connection in the addressable
market (all of India, tier 1–4), and it works everywhere above that
automatically.

| Dimension | Floor | Implication |
|---|---|---|
| Device | 2GB RAM Android, 720p, budget chipset | No heavy client JS, no large bundles |
| Viewport | 360 px | Every layout works at 360 without horizontal scroll |
| Network | Intermittent 3G, packet loss | Payload budgets, offline queue, retry |
| Input | Touch, gloved or damp hands, outdoors | 44×44 px minimum targets |
| Ambient | Direct sunlight | WCAG AA minimum, AAA for critical states |
| Literacy | Mixed English / Hindi / regional | Hinglish default for parents, language toggle |
| IT support | None on site | Nothing that requires a technician to keep alive |

---

## Breakpoints and the per-role device matrix

**Breakpoint contract: `360 / 768 / 1024 / 1440`.** Every screen is
specified at 360 **and** at 1440 — a component that only works at one
end is not done. Mobile is the floor, not the ceiling: some tasks
(a 500-row import, batch report-card approval, fee reconciliation
against a bank statement) are genuinely desktop tasks, and forcing
them onto a phone makes the product worse, not more disciplined.

Source: `04_SYSTEM_DESIGN_PRD.md` §0.2.

| Role | Primary device | Secondary | Design priority |
|---|---|---|---|
| Teacher | Phone | Tablet | Phone-first, absolute. Assume no desktop access at all. |
| Principal | Phone | Desktop, tablet | Phone for decisions and approvals; desktop for analytics depth |
| School admin | Desktop | Phone | Desktop for bulk operations; phone for lookups and approvals |
| Accountant | Desktop | Phone | Desktop for reconciliation; phone for payment confirmation |
| Academic coordinator | Tablet | Desktop, phone | Tablet for timetable and allocation work |
| NetCyberAI staff (Platform 2) | Desktop | Phone | Desktop-first; phone for alerts, incidents, impersonation audit |
| Parent | WhatsApp | — | No app, no portal, no login in Phase 1 |

---

## Performance and client constraints

Source: `04_SYSTEM_DESIGN_PRD.md` §10.1–10.2.

| Metric | Target |
|---|---|
| API p95 | < 500 ms |
| API p99 | < 1,000 ms |
| First contentful paint, 3G | < 2.5 s |
| Time to interactive, floor device | < 4 s |
| JS bundle, initial route | < 200 KB gzipped |
| Attendance save round-trip | < 800 ms |
| QR scan → profile resolve | < 1 s |

360px guaranteed · zero horizontal scroll · 44×44px touch targets ·
WCAG AA minimum, AAA for critical states · zero layout shift · system
font stack with Devanagari fallback, no webfont download · offline
queue with visible pending state for teacher writes.

---

## Component inventory

### Shipped (Phase 0)

| Component | File | Notes |
|---|---|---|
| `Button` | [`../src/components/ui/Button.tsx`](../src/components/ui/Button.tsx) | `primary`/`secondary`/`outline` variants; renders as `<Link>` when `href` is set (external links get `target="_blank" rel="noopener noreferrer"`); `min-h-[44px]` — meets the tap-target floor by construction |
| `Card` | [`../src/components/ui/Card.tsx`](../src/components/ui/Card.tsx) | Rounded, bordered, white background, `p-6` |
| `Container` | [`../src/components/ui/Container.tsx`](../src/components/ui/Container.tsx) | `max-w-5xl`, responsive horizontal padding |
| `AnswerFirst`, `FaqBlock`, `StepDiagram` | `../src/components/content/` | Content primitives for the answer-first paragraph, FAQ blocks with JSON-LD, and step diagrams |

### `[GAP]` — Phase 1, specified but not built

Source: `08_EXECUTION_BIBLE.md` Prompt C.

Input · Select · Checkbox · Table (server-side pagination, sort,
filter; documented mobile strategy — cards or a horizontal-scroll
container, **never** a squeezed grid) · Modal · Toast · Badge · Tabs ·
EmptyState · LoadingState · ErrorState · form primitives with inline
validation and explicit saved state (per
`01_CONSTITUTION.md` §9's no-silent-failures rule — a teacher must
never have to guess whether attendance saved).

**Verification, once built (from Prompt C):** every primitive
rendered at 360 and 1440, screenshotted; automated contrast check on
every token pairing; automated tap-target check on every interactive
primitive.
