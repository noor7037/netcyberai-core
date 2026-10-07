# 19 — Ease of Use and Colour Standard (every screen, every module)

**Status:** canonical from 2026-10-07 (Decision Log C105). Binding on every
screen in `/app`, `/control` and the Family App. It adds to the module
definition of done (`16_MASTER_ROADMAP.md` §3 rule 4) and to the app design
system (`17_MODULE_CATALOG.md` §4); where they differ, this file wins on
usability and colour, and `01_CONSTITUTION.md` still wins on everything else.

**Why it exists.** The founder's rule, from principals' feedback: the people
who use NetCyberAI are not technical. A principal, an office clerk or a
teacher must be able to learn everything in one sitting, find any function
without asking, and enjoy using it. Today the working screens are correct but
plain white; the founder wants them colourful, multicolour and easy to read
at a glance, like a modern analytics dashboard.

---

## 1. The one rule

> **A non-technical person learns the whole system in one sitting.**
> If a screen needs a training session to be understood, the screen is wrong,
> not the user.

Measured, not felt: §6.

## 2. Ten ease-of-use rules

| # | Rule | How it is built | How it is checked |
|---|---|---|---|
| 1 | **Every screen has the same layout.** Learn one screen, know all 33 modules. | `PageHeader` (title, one-line purpose, ONE primary button) → search → filter chips → list or cards → `BulkBar` when rows are selected. One shared `ModulePage` template wraps them. | A CI check fails a module page that does not render through `ModulePage` (or a documented exception). |
| 2 | **"My Day" home per role.** Today's work first, one tap each: teacher "Mark Class 5A attendance", office "12 fees due today", principal "3 things need you". | A role home built from the registry; each module contributes "today" cards through one contract (`src/lib/contracts/**`). | Screenshot per role at 390 and 1440. |
| 3 | **Plain words, Hindi and English everywhere.** No technical terms. Every button has an icon AND a word. | A language switch in the app shell; every string in the i18n files (EN + HI); a glossary of plain terms in this repo. | A string check fails a hard-coded user-facing string outside the i18n files; a word-list check flags jargon ("invalid", "entity", "null", "sync failed"). |
| 4 | **At most 3 taps to any daily task.** Big targets, phone first, readable for older eyes. | Global **"+ New"** button (Add student, Collect fee, Mark attendance, Send notice, Raise ticket); 44 px targets (48 px for the teacher app); base text 16 px; text scales to 200 % without breaking. | Task-path count recorded in each PR for the module's top 5 tasks. |
| 5 | **Smart defaults and undo.** Attendance starts "everyone present, tap the absent"; forms pre-fill; drafts autosave; undo instead of "Are you sure?" wherever the action allows. | Settings framework defaults (`17` §1a); bulk-action undo window (exists); autosave hook. | Flow tests for autosave and undo. |
| 6 | **Find anything in two seconds.** | One global search (student by name, admission no., parent phone; staff; receipts) in the shell; filter chips with plain names ("Fees due this week", "Absent 3+ days"); saved views (exist); select-many actions (exist). | Search p95 < 2 s on the demo school; chips on every list. |
| 7 | **The school chooses what it sees.** | Module on/off at onboarding and in Settings, each switch with one plain sentence on what changes; menus show only enabled modules and the person's role (`17` §5); custom fields (exist). | Entitlement tests: a disabled module disappears from nav, search, "+ New" and its API returns 403. |
| 8 | **Screens teach themselves.** | First-visit tour (max 3 steps, skippable, remembered per user); a "Show me how" link on every page to its Help Center guide (EN/HI); empty states that say what to do next with the button to do it. | Each module ships its tour, its guide and its empty states (DoD). |
| 9 | **Errors say how to fix them.** "Phone number has 9 digits; it needs 10", never "Invalid input". Nothing typed is ever lost on an error. | One error-message catalogue (EN/HI) keyed by validation rule. | Unit test per validation rule message. |
| 10 | **Fast on a budget phone and slow internet.** | Skeleton loaders, server pagination, < 200 KB JS per route, teacher actions offline-tolerant (P2). | LCP < 2.5 s on throttled 4G mid-range Android profile; interactions < 100 ms (`17` §4 budgets). |

## 3. Colour and visual standard

### 3.1 The founder's reference board (2026-10-07)

The founder shared a board of dashboard references (stock icon sets and
analytics dashboards). **They are licensed stock images: use them only as a
style reference; never copy, trace or ship them.** Every icon and illustration
in NetCyberAI is drawn in-house in `src/components/visual/Icons.tsx` style.

What the board shows, and what we take from it:

| Seen on the board | What we build |
|---|---|
| Icon sets where each icon sits in its own coloured rounded tile (blue, orange, teal, purple, pink) | **Module icon tiles**: every module has one distinct icon in a rounded tile in its group colour (§3.2), in the sidebar, the "+ New" menu, search results, Help Center and empty states |
| KPI cards with coloured bands, a big number, a mini chart | **KPI tile v2** (§3.3): tinted card in its tone, coloured icon chip, big number, trend pill in words, sparkline |
| Ring and donut progress (percent done), concentric rings | **Ring progress** for every "how much is done" number: attendance marked today, fees collected, syllabus covered, consent collected |
| Gradient area charts (blue → violet), smooth lines | **Trend charts**: area with a soft gradient fill of the series colour |
| Rounded multicolour bar charts | **Comparison charts**: rounded-end bars in the validated order (§3.5) |
| Semicircle gauges | **Score gauge** for School Health Auditor and similar 0–100 scores, with the bands labelled in words |
| Dark navy dashboards with glowing accents | **Cinematic mode** for the principal's and the founder's overview hero bands (midnight surface, `nca-mesh-dark`, `nca-glass`); working lists stay light for reading |
| Calendar heat grids | **Attendance calendar** (one hue, light → dark) per student and per class |
| 3D / isometric dashboard illustrations | **Illustrated empty states and welcome screens**, built from our own icons in their tiles (flat with soft shadow; no stock 3D) |

### 3.2 Module identity colours and icon tiles

Each navigation group keeps its tone from `17` §4; each module gets its own
icon and its group's tile. Group → tile: School & People = sapphire/royal ·
Teaching & Learning = royal/azure · Parent Engagement = cyan/turquoise ·
Finance = tangerine/amber · Records & Compliance = emerald · AI Intelligence =
grape/violet · Help = gold. Tile = `TOKEN_TONES[tone].soft` background with
the icon in the tone's text-safe colour; active/selected = `solid`.

The icon set today has 40 icons and several modules share one; this standard
requires **one distinct icon per module (33) plus per KPI type**, drawn in the
existing style (stroke, rounded joins, 24 px grid).

### 3.3 Dashboard anatomy (every role dashboard and module overview)

1. **Hero band**: greeting, date, school name, and "N things need you today"
   as tappable chips. Brand gradient (`nca-spectrum-bar` accent) or
   cinematic midnight for the principal and Control.
2. **KPI row**: 2–6 KPI tiles v2 (tinted tone surface, icon chip top-left,
   value in slate, trend pill with arrow AND words, sparkline in the tone,
   whole tile drills down). Value text is never coloured by its series.
3. **Attention list**: the exceptions, most urgent first, each with its
   one-tap action and a "Why this?" link (evidence, rule, history; C104).
4. **Chart cards**: one message per chart, title says the takeaway
   ("Fees collected: 72 % of this month's dues"), legend + direct labels,
   hover/tap tooltip, table view toggle (exists in `ChartCard`).
5. **Quick actions**: the module's "+ New" items as large coloured tiles.

On phones the same blocks stack in the same order and colours (`17` §4).

### 3.4 Which chart for which job

| Job | Form |
|---|---|
| How much is done (one number out of a whole) | Ring progress + the number in words |
| One headline number | KPI tile, not a chart |
| Change over time | Line or gradient area; one axis only |
| Compare classes / sections / months | Rounded bars, sorted, direct labels |
| Parts of a whole (≤ 5 parts) | Donut with labels; 6+ parts → bars |
| Daily pattern over a month | Calendar heat grid, one hue |
| 0–100 score with bands | Gauge with band words (Good / Watch / Act) |
| Student progress | Personal Best only: the child against their own earlier result. **Never** a chart that ranks named children (`01_CONSTITUTION.md` §5, §9) |

### 3.5 Palette (computed, not eyeballed)

Validated with the dataviz validator (`validate_palette.js`, light surface
`#FFFFFF`), 2026-10-07:

- **Categorical order (fixed, never cycled):** royal `#1D4ED8` → tangerine
  `#FF7A1A` → turquoise `#14B8A6` → grape `#8B3DFF` → azure `#016898` →
  violet `#4400F0`. Lightness, chroma, colour-blind separation (worst ΔE 15.4)
  and normal-vision floor all PASS. Tangerine and turquoise sit under 3:1 on
  white, so every chart using them shows value labels and a table view.
  A 7th series folds into "Other" or small multiples; gold and leaf FAIL as
  series (too light; leaf collides with coral for red-green colour blindness).
- **Sequential (magnitude):** one hue, light → dark (royal tints); validate
  with `--ordinal`.
- **Diverging (better/worse than target):** two poles with a neutral grey
  middle; never a hue at the midpoint.
- **Status is reserved:** good / warning / alert / recognition always with an
  icon and a word (`STATUS_TONES`); where a chart also shows status, its
  series must not reuse that status hue.
- **Dark (cinematic) surfaces need their own validated steps:** the light
  order FAILS the dark lightness band on midnight. Charts on dark surfaces
  wait until a dark set is validated and added to `design-tokens.ts`.
- `chartSeries` in `src/lib/design-tokens.ts` is extended to this six-slot
  order by the P1-c PR; the validator run is pasted into that PR.

### 3.6 Non-negotiables (from the dataviz method)

One axis per chart · colour follows the entity, never its rank · a legend for
2+ series and direct labels for up to 4 · thin marks, 4 px rounded bar ends,
2 px gaps · text in text colours, never in series colours · a table view for
every chart · AA contrast (`check_contrast.py`) · motion 150–300 ms, count-up
numbers, all off under `prefers-reduced-motion`.

## 4. Foundation pieces (built once in P1-c, then every module uses them)

| Piece | Exists today | P1-c builds |
|---|---|---|
| Page header, filter bar, saved views, bulk bar with undo, list, states, status pill, KPI tile, chart card with table view | Yes (`src/components/app-ui/**`) | Restyle to §3 (tinted KPI v2, coloured icon chips) |
| `ModulePage` template (rule 1) | No | Yes, plus the CI check |
| Role "My Day" home (rule 2) | No | Yes, with the "today cards" contract |
| Hindi/English switch in the app (rule 3) | Help Center only | Yes, shell-wide, plus the string check |
| Global search (rule 6) | Students search API only | Yes, in the shell |
| "+ New" quick-add (rule 4) | No | Yes, registry-driven |
| First-visit tours, "Show me how" links (rule 8) | Help guides exist | Yes |
| Plain-language error catalogue (rule 9) | No | Yes |
| Module icon tiles, 33 distinct icons (§3.2) | 40 shared icons | Yes |
| Ring, gauge, gradient area, heat grid, donut (§3.4) | Bars/lines in `ChartCard` | Yes |
| Hero band and cinematic mode (§3.3) | Website classes exist | Yes, app components |

## 5. Definition of done additions (every module, from P1-c on)

A module is not done until it: renders through `ModulePage`; contributes its
"today" cards and "+ New" actions; is fully in EN + HI; has its tour, its
"Show me how" guide and helpful empty states; uses its icon tile and group
colour; uses §3.4 forms and the §3.5 palette with a table view per chart;
and passes the §6 test for its top 5 tasks.

## 6. How "learn in one sitting" is proven

- **Task test per module:** the module's 5 most common tasks, written in the
  PR. A first-time, non-technical tester finishes them without help.
  Target: 9 of 10 tasks done unaided, each within 3 taps of the home screen.
  Before real users exist, the executor runs the script with Playwright and
  records taps and time; the founder may show the same script to the
  principals and teachers he already meets (optional, never a blocker).
- **Screenshots at 390 and 1440** in every PR, as today.
- **Visual check:** the PR shows the screen next to the §3 anatomy.

## 7. Change log

- **2026-10-07** — Created (C105): founder rule "learn everything in one
  sitting" and the colourful dashboard direction from the founder's reference
  board; palette order validated; foundation pieces assigned to P1-c.
