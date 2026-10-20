# 09 — Experience and design standard for the family app

**Status:** decided by the supervisor (C230-K, 2026-10-20) from the founder's brief: a premium, modern, vivid app
that keeps families from the first minute. It extends the platform design system (`docs/07`, `docs/19`, v5 from
C235-C); it does not replace it.

## 1. The rule above the others: learning first, engagement as its servant

The founder asked for engagement "above all else". That is rejected as the top goal, for three reasons:
- an app optimised for time spent becomes a distraction for children;
- engagement tricks (streak pressure, endless feeds) feed the exam anxiety families already carry (`01` E4);
- for a non-school company, tracking children to maximise engagement is the "behavioural monitoring" DPDP section 9(3)
  bars (`01` E12).

**The goal instead:** every minute in the app ends with something understood, practised or decided. Delight,
colour, motion and celebration serve that: they make understanding visible and progress felt.

**Measured by:**
- topics moved to "mastered" per active child per week;
- 30-day return of families;
- the share of sessions that end with a completed check.

Never by minutes in the app.

## 2. Visual identity

- **Palette:** the v5 tokens with a family register:
  - one warm primary;
  - a vivid accent;
  - **one colour per subject**, used everywhere a subject appears (blocks, plan, practice, progress), so a child knows
    the subject before reading;
  - gradients for headers, progress and celebration only, with text always at AA contrast on them.
- **Type:** a modern sans for Latin with full Devanagari (Hindi is not an afterthought); large display numbers for
  progress and countdowns; generous line height for young readers.
- **Shape and depth:** rounded cards (16–24 px), layered soft shadows, and **2.5D depth** (layering, perspective tilt
  on focus, parallax limited to one layer) made only with transforms and opacity, so it stays smooth on budget phones.
  No grey admin tables or walls of text on family screens.
- **Class-adaptive:** classes 3–5 get larger targets, brighter accents and shorter sets; class 9+ gets a calmer,
  exam-focused register. Same tokens, different emphasis.

## 3. 3D and motion policy

| Use | Allowed | Rule |
|---|---|---|
| **True 3D** (a WebGL scene) | Only inside learning visuals where depth teaches: a simulation, a molecule, the solar system, a 3D shape, an organ model | Lazy-loaded on tap, never on page load. A 2D fallback is shown when the device is weak, data-saver is on, or reduced motion is set. One scene at a time. Paused when off screen. |
| **2.5D interface depth** | Cards, the child switcher, progress, celebrations | Transform and opacity only; 60 frames a second on a mid-range Android or simplified |
| **Motion** | State changes, a progress fill, a diagram drawing itself, a short celebration when a topic is mastered | Under 400 ms for screen entrances; no motion that delays reading; `prefers-reduced-motion` turns it into simple fades |
| **Celebration** | Real mastery (checked twice), a finished revision day, a completed English week | Never for opening the app, never a "you broke your streak" moment |
| **A mascot or character** | Not now | A brand decision for the founder; if chosen, one character with defined states (idle, thinking, correct, try again, celebrate), as character-led apps do (`§5`) |

## 4. Performance budget (a build fails if it is missed)

| Measure | Budget | How it is checked |
|---|---|---|
| Largest contentful paint (mobile, mid-range Android, 4G) | ≤ 2.5 s | Lighthouse mobile in the harness for every family screen |
| Interaction to next paint | ≤ 200 ms | The same |
| Layout shift | ≤ 0.1 | The same |
| JavaScript on first load of a family screen | ≤ 200 KB compressed; 3D libraries never in the first load | Build output per route |
| A 3D scene | Loads only on tap; ≤ 1.5 MB including models; keeps 30+ frames a second on the reference phone or falls back to 2D | Harness run on a throttled profile |
| Images | Lazy, sized, modern formats; none on first paint in data-saver mode | The harness |

Core Web Vitals thresholds from web.dev (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile on mobile).

## 5. What the leading products do well, and what we take

Sources are public pages and reviews (`01` E9, E10, E24 and below); no product's code, assets or layouts are copied,
only patterns.

| Product | Pattern worth learning | What we take | What we refuse |
|---|---|---|---|
| Duolingo | Short sessions; a character with clear states; immediate feedback; celebrations (its characters are built with Rive state machines, per [Rive](https://rive.app/use-cases/mobile-apps)) | Short sets, instant feedback, earned celebrations | Streak pressure and loss-framed reminders |
| Brilliant | Interactive first: learners manipulate the idea instead of watching ([its design roles](https://jobs.lever.co/brilliant/9f63e8ed-2f9d-4e28-8a68-6262a0f8f68d)) | Interactive blocks: graph, geometry, number line, simulation | Long courses detached from the school syllabus |
| Photomath | Scan first; animated step-by-step that shows how each step progresses ([App Store](https://apps.apple.com/ZA/app/id919087726)) | The photo input and animated worked examples | Answer-first help without a check |
| Khanmigo | Socratic guidance; no answer handed over first | Hint-first follow-ups in the resolver | US-only scope |
| Gemini Guided Learning | One response mixing text, images, video and quizzes (`01` E9) | The block-based response | Open-ended chat for children |
| ELSA Speak | Colour-coded pronunciation feedback at the sound level, with mouth-position help ([review](https://makeheadway.com/blog/elsa-speak-review/)) | Sound-level feedback in the English programme | Over-trusting speech recognition: reviewers report false "wrong" marks, so feedback says "try again", never "wrong", when unsure |
| Duolingo Max | Roleplay and video-call practice with feedback (`01` E24) | The practice partner's design, after its cost and safety gates | — |
| Quizlet | Many practice modes over one set of items | Practice modes over one topic's items (recall, match, written) | Unreviewed user-made sets |
| PhysicsWallah | Low price, exam focus, trust (`01` E10) | Price discipline, exam readiness | Video-library sprawl |
| BYJU'S | Polished animated lessons | Production quality in our own visuals | Aggressive selling and loans (`01` E8) |

## 6. Banned on family screens (a screenshot showing one fails review)

1. Raw markdown or HTML shown as text.
2. Grey admin tables or data grids for family content.
3. A wall of text without hierarchy, icons or colour.
4. Browser `alert()`, `confirm()` or unstyled system prompts.
5. Raw URLs or payment links shown as text instead of designed components.
6. Internal jargon, module ids or build labels.
7. Unhandled errors, or error text leaking to the screen.
8. Any English-only screen when Hindi is on.
9. A blank screen while loading: every async area has a skeleton.
10. Leaderboards, ranks or comparison with other children.

## 7. Design review gate for every family PR

- Pictures at 360, 390 and 1440 px, in English and Hindi, with reduced motion on and off.
- Lighthouse mobile numbers against `§4` for each changed screen.
- The banned list (`§6`) checked on every picture.
- **The question every screen must pass:** does it make the child understand, practise or decide something, and would
  a parent trust it at first sight?
