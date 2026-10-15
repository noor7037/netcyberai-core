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

### Shipped (design-system hardening — completes the Prompt C inventory)

Zero new dependencies for any of these — see each file's own comment
for why the native platform (a real `<select>`, a real `<dialog>`,
`accent-color`) or a well-specified hand-rolled pattern (WAI-ARIA Tabs,
a manual focus-trap keydown handler) was the smallest correct option,
in each case checked against the alternative rather than assumed.

| Component | File | Notes |
|---|---|---|
| `Input` | [`../src/components/ui/Input.tsx`](../src/components/ui/Input.tsx) | Full spec: `error`/`success`/`pending` states, `helperText`, `required` marking (visible asterisk + sr-only "(required)" text, `aria-required`), `aria-invalid`/`aria-describedby` wiring. Error text is `red-800` (8.31:1, AAA) — this project's own Floor Device Standard asks for AAA on critical states. |
| `Select` | [`../src/components/ui/Select.tsx`](../src/components/ui/Select.tsx) | A native `<select>` styled to the tokens, not a custom listbox — real keyboard nav (arrow keys, typeahead, Home/End) is what the browser already gets right for every platform this project targets, at zero implementation/maintenance cost. |
| `Checkbox` | [`../src/components/ui/Checkbox.tsx`](../src/components/ui/Checkbox.tsx) | v5 (C235-C): the native `<input type="checkbox">` is itself the drawn box (`appearance: none`, rounded, sapphire fill, a decorative tick over it), so semantics, keyboard and forms stay native. 44px tap target comes from the wrapping `<label>`, not from inflating the visual checkbox. Was `accent-color` before v5. |
| `Table` | [`../src/components/ui/Table.tsx`](../src/components/ui/Table.tsx) | **Mobile strategy, decided:** a card-per-row transform below `768px`, the real `<table>` at `768px` and up — see "Table's mobile strategy" below for the reasoning and the alternative this rejected. `loading`/`error`/`empty`/`ready` states via `LoadingState`/`ErrorState`/`EmptyState`. |
| `Modal` | [`../src/components/ui/Modal.tsx`](../src/components/ui/Modal.tsx) | The native `<dialog>` element (`showModal()`) for the top-layer/backdrop and Escape-to-close. **Its native Tab-cycling focus containment was tested, not assumed, and found to leak** (Chromium 141: tabbing past the last focusable element reached `document.body` for one step before self-correcting) — a manual `keydown` handler now traps Tab/Shift+Tab strictly within the dialog's own focusable elements, re-verified after the fix. |
| `Toast` | [`../src/components/ui/Toast.tsx`](../src/components/ui/Toast.tsx) | `ToastProvider` + `useToast()`. `aria-live="polite"` region; each toast auto-dismisses after 5s or on manual dismiss. `info`/`success`/`warning`/`danger` variants. |
| `Badge` | [`../src/components/ui/Badge.tsx`](../src/components/ui/Badge.tsx) | `neutral`/`success`/`warning`/`danger` variants. Variant classes are written inline in the component's own className template (not a separate lookup object) specifically so `scripts/check_contrast.py` can see and verify them — see "A checker blind spot" below. |
| `Tabs` | [`../src/components/ui/Tabs.tsx`](../src/components/ui/Tabs.tsx) | Hand-rolled per the WAI-ARIA Authoring Practices Tabs pattern: `role=tablist/tab/tabpanel`, `aria-selected`, a roving `tabindex`, Left/Right/Home/End keyboard nav with automatic activation. Verified with real keyboard events, not just code review. |
| `EmptyState`, `LoadingState`, `ErrorState` | `../src/components/ui/` | The three states Constitution §9's no-silent-failures rule requires of any async-capable view. `LoadingState` uses Tailwind's `animate-spin` (functional, not decorative). `ErrorState` is `role="alert"`, `red-800` text (AAA). |

### Design system v5 (C235-C): banners, floating labels, drawn controls, less text

The founder asked for a premium, Apple-like, education-appropriate look with
at least 30% less text on screen and no fact lost. What changed:

| Piece | File | Notes |
|---|---|---|
| Page banner | [`PageHeader.tsx`](../src/components/app-ui/PageHeader.tsx) (`PageBanner`), [`BannerTitle.tsx`](../src/components/app-ui/BannerTitle.tsx) | Every `ModulePage` (and `PageHeader`) opens with a gradient in the module group's tone (`HERO_TONES` in `tones.ts`): the module icon in a frosted tile, the group, the title, ONE short line, and an ⓘ "About this page" (`about` prop) for the longer explanation. Actions sit on a white tray so buttons keep their own colours. Bright hues use their deep variants: every stop takes white text at 4.5:1 or more (computed in `test/app-ui/tones.test.ts`); `bg-grape` under the gradient is the worst stop, which is what `check_contrast.py` reads. Decorative circles only darken. |
| `InfoTip` | [`InfoTip.tsx`](../src/components/app-ui/InfoTip.tsx) | The ⓘ beside a heading, row or field: a 44px button (`aria-expanded`, words for screen readers and as its tooltip) and the panel it opens under the row (`basis-full` in a `flex flex-wrap` row). Secondary explanation lives here instead of on the screen for every visit. |
| `KpiTile` v4, dashboard `FactTile` | [`KpiTile.tsx`](../src/components/app-ui/KpiTile.tsx), [`dashboard-parts.tsx`](../src/components/dashboards/dashboard-parts.tsx) | Icon chip in the tone above the number, the number large, the label under it; the v3 top bar is gone. A tile no longer repeats the period the range switch already shows. |
| `HeroBand` | [`HeroBand.tsx`](../src/components/app-ui/HeroBand.tsx) | `brand` is the royal-to-violet gradient; `needs` lets a dashboard say the count without repeating the attention list as chips. |
| Floating labels | [`field.tsx`](../src/components/ui/field.tsx), `Input`, `Select`, [`Textarea`](../src/components/ui/Textarea.tsx) | The label is a real `<label for>` drawn inside the field and raised onto the top border on focus or value (pure CSS: the field is the label's `peer`, `:placeholder-shown` means empty). A caller's placeholder shows only under the raised label, never as the label (WCAG 1.3.1/3.3.2). Helper text and errors sit under the field in small text. A label over 34 characters would not fit a phone-width field, so it sits above instead: nothing is cut short. Field border slate/50 (3.1:1, WCAG 1.4.11). No API break; `floating={false}` asks for the label above. |
| `Radio`, `RadioGroup` | [`Radio.tsx`](../src/components/ui/Radio.tsx) | Drawn over the native radio (`appearance: none`), a fieldset with its legend, controlled or not. |
| `SegmentedControl` | [`SegmentedControl.tsx`](../src/components/ui/SegmentedControl.tsx) | For 2 to 4 short options: native radios (one tab stop, arrow keys), a quiet track with the chosen segment raised; full width on a phone, words wrap rather than scroll. |
| `Switch` | [`Switch.tsx`](../src/components/ui/Switch.tsx) | A `role="switch"` checkbox drawn as a track and knob; the state is also said in words. Settings' on/off fields use it. |

All motion added here (label rise, knob slide, tick) is off under
`prefers-reduced-motion` (`motion-reduce:transition-none`). Every target is
44px or more.

**Less text, every fact kept.** `scripts/harness/visible-words.mjs` counts the
words a reader can see in `<main>` (not the shell, screen-reader text or a
closed disclosure); the harness records it per screen and
`node scripts/harness/word-count.mjs <before> <after>` compares two runs. On
the 11 screens of the C235-C set the count fell from 7,490 to about 3,000
words at 1440 px (the PR has the per-screen table). The means: one short
banner line plus ⓘ "About this page"; section explanations behind an ⓘ;
Settings fields show their control and a "Default" mark, with the sentence
and default behind the field's ⓘ, and each module's "When off" sentence behind
its row's ⓘ; repeated lines dropped (hero chips that repeated the attention
list, "Today" on every tile under a "Today" heading, "Change to" on every
attendance button, kept for screen readers).

### Table's mobile strategy

The `[GAP]` note this replaces allowed either "cards or a
horizontal-scroll container, never a squeezed grid." Cards, below
`768px`, is now the actual, applied answer — chosen over horizontal
scroll for a stated reason, not arbitrarily:

The per-role device matrix (above) makes every role Table actually
serves — school admin, office, accountant — primary-desktop for the
bulk/reconciliation work Table exists for; phone is explicitly their
secondary "lookups and approvals" use, not deep reconciliation. A card
reads cleanly for a quick lookup on a touch screen with no sideways
gesture required; a wide table's columns scrolled off to the right are
exactly the kind of thing easy to miss with gloved or damp hands
outdoors, per the Floor Device Standard's own input/ambient rows.
Horizontal scroll (with a visible affordance) remains legitimate for a
genuinely dense, equally-weighted-columns view — an audit log, say —
but that would be a deliberate, separate decision made for that
specific future screen, not a second default `Table` itself also
offers: `Table` implements exactly one strategy, applied consistently,
per this prompt's own instruction not to let each future screen invent
its own answer.

Verified for real (Playwright, Chromium 141, the allowlisted
`demoStudents` fixture): at `360px` the card view is visible and the
`<table>` element is not; at `1440px` the reverse. Both markups render
from the same `rows`/`columns` props; a CSS breakpoint (`md:hidden` /
`hidden md:block`) decides which shows, not a client-side viewport
read, so there's no layout-shift risk from a JS breakpoint check
running after first paint.

### The contrast checker

`scripts/check_contrast.py` (wired into `.github/workflows/checks.yml`)
computes real WCAG contrast ratios for every `text-*` utility class
used across `src/`, against an approximation of its actual background
(same-element first, then the nearest enclosing JSX ancestor's
background via a tag-nesting stack, then this codebase's off-white
page background as the fallback). Fails below 4.5:1 for normal text or
3:1 for large text; warns (does not fail) below 7:1 on a
`role="alert"`/`red-*` critical-state pairing.

**Why this exists:** the login page's own `text-slate/60` bug (4.04:1,
found by hand, once) is exactly the failure mode this project's
"measure, don't assume" pattern says to close by making the check
automatic. Running it against the whole codebase for the first time
found and fixed a real instance already shipped (`Input`'s placeholder
text, `slate/40`, 2.36:1) and surfaced that the raw `emerald`
(`#10B981`, 2.54:1) and `amber` (`#F59E0B`, 2.15:1) brand tokens both
fail as text color on white — `accessibleTextColors` in
`../src/lib/design-tokens.ts` (`emerald-text` `#047857` 5.48:1,
`amber-text` `#92400E` 7.09:1) are the darkened, accessible variants
for any success/warning TEXT or border; the two brand tokens
themselves stay locked, unchanged, for icon/background use where text
contrast doesn't apply.

**A checker blind spot, found and worked around, not hidden:** a
component that builds its className from a separate JS object (like
`Button`'s `variantClasses` map) is invisible to this script — it reads
literal className text, not evaluated JavaScript. `Button`'s three
variants were checked by hand instead (`off-white` on `sapphire` 8.86:1,
`slate` on `emerald` 5.77:1, `sapphire` on `off-white` 8.86:1 — all
pass). Every new primitive in this pass writes its variant logic as an
inline ternary directly inside the `className` template instead of a
separate object, specifically so the checker can see it — `Badge` and
`Toast` are both structured this way for exactly this reason.

**Verification, from the original Prompt C note, now actually done:**
every primitive rendered at 360 and 1440 (real Playwright screenshots
and measured dimensions, not descriptions); the automated contrast
check, run against the whole codebase; an automated tap-target
measurement on every interactive primitive (all ≥44px — the native
checkbox itself measures 20×20px, with its wrapping `<label>`
measuring 328×44px as the actual tap target).
