# Premium UX and everything on: the founder's verdict (supervisor, 2026-10-28)

Supervisor → build lead. The founder reviewed the live screens (Control → AI, the Quality Lab, Study, Boards, the
parent area) and gave a verdict: they read as generic, long and plain, not as an enterprise product. He is right, and
the supervisor let them through. This file is the binding fix. Rules: CLAUDE.md; this file wins over earlier UI copy
in `docs/37` where they differ. Decision Log C230-AU.

## 1. Everything on, everywhere (product default)

- Every built Family module ships `built: true` and its Control flag **defaults on** for every family; every teacher
  feature is on in the teacher app; every school feature is on for the demo school and the demo principal. Nobody
  turns anything on. The founder turns things **off** later, by hand, when he decides.
- What stays as a gate, because it is law or money, not product: a parent's consents; the per-provider "cleared for
  children's words" switch; the daily caps and the spend alert. Nothing else asks a question before it works.
- Control → Apps keeps its switches for turning off, not for turning on.

## 2. One composer, like the products people already know

The Study ask surface becomes **one composer**: a single rounded field with, inside it, the attach (paper-clip) icon on
the left, the mic icon and the send arrow on the right; "Conversation" is an icon beside it, not a tab bar above it.
No helper paragraphs ("Your voice is turned into words…", "A photo or PDF, up to 10 MB…"): the limits appear only
when a limit is hit. The composer is pinned above the bottom dock on the phone. The chapter reader's doubt drawer
uses the same composer. Reference pattern: the ChatGPT, Claude and Gemini apps; the brand is NetCyberAI Family.

## 3. Chapters as an accordion

Study shows the subject's chapters collapsed, one row each, status badge on the right. Tap a chapter: its topics
open under it, with a chevron, nothing else expands. Everything below the composer that today is a stacked card
("Photo of a question", "Chapters you asked for", offline packs) moves into the chapter rows or into the parent area.
The subject strip, the composer, then the chapters: three things on the screen.

## 4. Control → AI as a dashboard, not a scroll

- A top row of four stat tiles (requests today, failures, cost known today, cost unknown), then the workload cards in a
  two-column grid on a laptop, one column on a phone. Each card: the workload name, three slot rows **Primary /
  Backup 1 / Backup 2**, each row **one drop-down** of "provider · model" from the fetched lists (free typing only
  through an "other…" item), state pill, Make Primary, Rollback. No duplicate rows, no separate provider and model
  selectors.
- The "Use" list (fifteen paragraphs of zeros) becomes one compact table: workload, today, this month, cost. Zero rows
  collapse to one line: "No use today".
- Prices, the daily limit, the spend alert and recent changes sit in a right-hand column on a laptop, in collapsible
  sections on a phone.
- Quality Lab: the model picker is one row per model, each a single drop-down; at most four; the results table fills
  the width with sortable columns; the page never exceeds a laptop screen without scrolling inside the table.

## 5. The visual system

Use the existing tokens (`src/lib/design-tokens.ts`) and the D1 family theme: one gradient header per screen,
elevation on cards, 12–16 px radii, subject colours on the subject tiles only, numbers in a tabular figure face,
CSS-only motion (hover lift, pressed scale, 150–200 ms), honoured under `prefers-reduced-motion`. Empty states carry
one sentence and one action, never a paragraph. No "AI may make mistakes" boilerplate anywhere; the AI-made marker
stays as a small pill where the product rules require it. Family pages stay under 200 kB; Control pages under 250 kB.

## 6. Order and acceptance

Wave 6, one PR each, in this order: (1) everything on; (2) the composer and accordion; (3) Control → AI dashboard and
the Lab picker; (4) the parent area and Boards pages on the same system. Acceptance is the founder's own screenshots at
390 and 1440: a screen passes when it fits what this file says and he says it looks like a product. The build lead
attaches a 390 and a 1440 picture of every changed screen in the PR, and names the reference pattern it follows.
