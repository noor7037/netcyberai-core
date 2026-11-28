# Tech & AI Lab — teaching layer, Guided Teacher Mode and parent syllabus (C557): handover

## A. Initial audit (verified in the repository, 28 Nov 2026)

- **Entry and selection.** `/family/tech` (`src/app/(family)/family/(app)/tech/page.tsx`) shows the active child's course: level from the class (`levelOfClass`), units listing that class first, the rest of the level folded. Lessons open at `/family/tech/lesson/[key]` and play See → Play → Understand → Try (`TechPlayer.tsx`).
- **Content.** 281 lesson files (`content/tech/lessons/L1–L3`), 50 units, schema `nca-techlab/1`, loaded at run time from the repository (`catalog.ts`).
- **The 277 vs 281 mismatch.** 277 was the Family App Lead's count at TL-1 (PR #461). C555 added 4 lessons (chips from sand, phone batteries, screens and touch, product design), so the true count is 281. Only a migration comment still said 277. It is corrected to call 277 history. No data depends on the count.
- **Narration.** `techlabToBlocks` → `narrationScript` → `speakLine`, one Listen button per block. The server voice speaks only text the server derives itself. A line holding the child's name is read by the phone's own voice (C555). There are no word timings.
- **Pictures.** Nearly half the See steps (473 of 975) used kinds `SeeVisual` did not draw: 334 `anim:` steps (all in Level 3, 331 different ids, no renderer anywhere), 74 `lab:`, 56 `code` and 9 `icon:`. All silently showed a generic emoji card.
- **Labs.** Lazy iframes, opened on tap. Completion comes only from the lab's own `done` message (C555).
- **Progress.** Recorded in `family.tech_lessons_done` / `labs_done` / `badges` / `days` per child (live, C555).
- **Accuracy problems in the reference chapters.**
  - Level 1 taught that the finger "also carries a tiny bit [of electricity]".
  - Level 2 said the CPU "thinks".
  - Level 3 showed four generic cards.
- **Tests at the start.** All Tech Lab tests passed.

## B. Architecture changes (one engine, all fields optional)

- **Lesson fields** (`types.ts`):
  - `hook` (a situation, with `{{name}}`, and a question);
  - `predict` (choices; never marked);
  - `teachBack` (a prompt and a checklist);
  - `see[].diagram` (parts, rows and links);
  - `see[].beats` (narration, the part to light, values shown on parts);
  - `understand[].limit` (where an analogy stops being true) and `.advanced` (a deeper note);
  - `vocab[].does` and `.where`.
  - Old lessons load unchanged.
- **Validation** (`validate.ts`):
  - `visualKind` lists every drawn kind and every honest stand-in.
  - `lessonProblems` catches unknown kinds, incomplete languages and broken diagram references. The importer and a test run it over all 281 lessons.
  - `auditLesson` grades the teaching standard.
- **Pictures** (`SeeVisual.tsx`):
  - New: a parts **diagram** that lights the part being explained and shows values, an emoji card, a lab card that opens its lab, code type for rule steps, and, for an undrawn animation, its own process (when its words give a → b → c) or its key idea and terms, labelled "picture coming soon".
  - Reduced motion: transitions are off and nothing scales.
- **Reader** (`blocks.ts`):
  - A lesson's own hook replaces the general greeting.
  - Each beat is its own block; limit and advanced notes are read too.
  - `guideTimeline()` orders opening → steps and beats → Understand cards → summary. Questions are never in it.
- **Guided Teacher Mode** (`useGuide.ts`, `read-lines.ts`):
  - One tap starts it, and audio never plays without a tap.
  - It reads one sentence at a time with captions. On each segment it moves to the step and lights the beat's part.
  - Controls: pause, resume, replay, previous, next, captions, and "read myself". "Listen to all the cards" starts at Understand.
  - A blocked-audio state waits for a tap. With no voice, each sentence stays up for a reading time.
  - It reuses `speakLine`, so the server voice's caching and allowance are unchanged.
- **Prediction privacy.** The phone copy drops the prediction's answer. `POST /api/family/tech/lessons/[key] {action:'predict', choice}` reveals it only after the child has chosen.
- **Parent syllabus** (the English course's per-child pattern):
  - Table `family.tech_settings` (migration `20261128085638_c557_tech_settings.sql`, applied live). Row level security is enabled and forced, and access is the own account twice plus one child only on a child's phone.
  - `POST /api/family/tech/settings` works in parent mode only.
  - Page `/family/parent/tech/[childId]` sets the class the course is shown for and the topic areas that are on. A Parent Area row links to it.
  - The child's course and lessons hide switched-off areas (`visibleCatalog`). Nothing is deleted, and progress is kept.

## C. The three reference lessons

- **L1 Tap, click and drag.**
  - Opening: "Hey {name}! You watch videos and play games on a phone, right? When you touch the screen, how does the phone know exactly where your finger touched?"
  - Prediction: camera / the finger changes the screen's tiny electric field / guess.
  - New diagram step: finger → see-through grid → touch chip → app, with 4 beats.
  - Understand: corrected touch card (the field changes; "no electricity flows out of your finger"), with an analogy limit and a projected-capacitive deeper note for older classes; mouse vs tap; drag, double-tap and long press ("each app decides").
  - New question: the woollen glove. Teach-back: three points.
- **L2 Motherboard and parts.**
  - Opening: the selfie. Prediction: where the photo is kept after power-off (storage).
  - Diagram 1: the selfie's journey (camera → CPU → RAM → storage → GPU → screen), 6 beats.
  - Diagram 2: a desktop motherboard (board, CPU, RAM, SSD, GPU, PSU), with buses and power links, 6 beats.
  - Then the boot flow, and a desktop vs phone system-on-chip comparison.
  - Understand: "CPU executes instructions", with a kitchen analogy and its limit (a cook decides; a CPU does not); a phones vs desktops card.
  - New question: RAM, not storage, when apps freeze. The 3D builder lab comes after the parts are explained.
- **L3 The von Neumann machine.**
  - Opening: 23 + 19 in a calculator. Prediction: instructions are numbers in memory (stored program).
  - Diagram 1: input / CPU / output / memory with the bus, 4 beats.
  - Diagram 2: **ADD R1, [100]** traced with values:
    - PC 200 → IR → decode;
    - memory [100] = 7;
    - ALU 5 + 7;
    - write-back R1 = 12;
    - PC 201, with the caveat "when each instruction takes one memory cell".
  - Then the fetch–decode–execute–write-back cycle, and the bottleneck stated as a bandwidth and delay limit.
  - Understand: "Why R1 becomes 12", the conductor analogy and its limit, and a deeper note on split L1 caches (a modified Harvard design).
  - New question: ADD R2, [50] gives 13. Teach-back: the four steps.

## D. Curriculum coverage (`COVERAGE.md`, regenerated by `npx tsx scripts/tech_coverage.ts`)

- **Lessons:** 281 in 50 units.
- **Grades:** 127 meet the standard, 154 need minor work, 0 need restructuring (before: 3 / 111 / 167).
- **Openings, predictions and teach-backs:** all 281 lessons now have their own, in English, Hindi and Hinglish, with no duplicates (checked). The name token appears once per language.
- **Pictures drawn:** 688 of 975 See steps (before: 516). 177 more steps became real flows, cycles, comparisons or layers. The rest keep an honest, labelled stand-in.
- **Narration tied to a diagram part:** the 3 reference lessons only.
- The grade reads what a file contains. It does not prove accuracy. See H.

## E. Changed files (main)

- **New:**
  - `src/lib/family/tech/validate.ts`, `settings.ts`
  - `src/components/family/tech/useGuide.ts`, `read-lines.ts`, `TechParentSettings.tsx`
  - `src/app/api/family/tech/settings/route.ts`
  - `src/app/(family)/family/(app)/parent/tech/[childId]/page.tsx`
  - `supabase/migrations/20261128085638_c557_tech_settings.sql`
  - `scripts/tech_coverage.ts`, `scripts/tech_check_units.ts`
  - `test/family/tech-teaching.test.ts`, `tech-settings.test.ts`
  - `docs/family-app/tech-lab/COVERAGE.md`, this file
- **Changed:**
  - `types.ts`, `blocks.ts`, `personal.ts`, `score.ts` (`forChild`), `words.ts`
  - `SeeVisual.tsx`, `TechPlayer.tsx`, `TechRead.tsx`, `TechCourse.tsx`, `tech-lab.css`
  - the lesson route (predict), both tech pages, `ParentArea.tsx`, the parent page
  - en/hi messages, `scripts/check_rls_policies.py`, `scripts/import_tech_course.ts`
  - harness screens, Decision Log C557
  - all 281 lesson files (additive: hook, predict, teach-back, picture kinds)

## F. Test evidence (commands run in this session; nothing reported that was not run)

- `bash scripts/ci_local.sh`: **all 30 steps passed**, including 6,410 unit tests, typecheck, build, harness isolation, First Load JS budgets and SEO.
  - Earlier runs on this work failed twice, and both were fixed:
    - a hard-coded "CC" label;
    - the prediction's answer reaching the phone. Grok's answer-hiding test caught it, and the answer now comes from the server.
- `npx vitest run` on `test/family/tech*.test.ts`: 34 passed.
- `npx tsx scripts/import_tech_course.ts`: 281 lessons, 0 problems.
- `npx tsx scripts/tech_coverage.ts --check`: the report is current.
- `node scripts/harness/run.mjs --family --only family-tech` at 360, 390 and 1440 px: passed, with axe clean, no target under 44 px and nothing scrolling sideways. Earlier runs found and fixed:
  - an empty iframe title;
  - dimmed diagram labels at 4.27:1 (now dimmed by colour);
  - Sources taps under 44 px.
- **Not run:** a real Android device, server-voice audio (no key in the harness), and Hindi native review.

## G. Performance and accessibility

- **Light by default.** Labs and Level 1 scenes are lazy iframes. Diagrams are plain HTML with no library and no 3D. Guided mode adds one small hook. The First Load JS budget passes.
- **Without audio or on slow networks.** With no voice, captions advance at reading pace. Blocked audio waits for a tap. Every Listen button and card reads without audio.
- **Reduced motion.** Transitions are off and the lit part does not scale.
- **Screen readers.** The lit part is announced through its note. Diagrams carry text labels.
- **Touch targets.** 44 px throughout.

## H. Remaining gaps

- **[GAP: realistic 3D hardware]**
  - There is a pipeline for free-licence 3D models (`src/lib/family/visuals/models3d.ts`, Sketchfab with `SKETCHFAB_TOKEN`, and `Model3dPic` in Study).
  - Nothing renders a checked keyboard or motherboard model yet. Each model needs a person to confirm it is accurate (layout, proportions, parts).
  - The files run up to 15 MB, so they need a still picture first and a tap to load the 3D on budget phones.
  - Not built: unchecked models would break the "real-world accuracy" rule.
- **Pictures still to draw:** 287 See steps. These are Level 3 timelines, scatter plots, histograms, the PID response and similar, which no template draws honestly. They need new templates such as a timeline or a chart.
- **Narration tied to diagram parts:** only the reference lessons have it. The other 278 lessons need diagrams and beats authored.
- **Not yet stored:** per-child learning measures (delayed recall, misconceptions, teach-back quality). Teach-back is a self-check and nothing is stored. Spaced revision uses only the "revise low-scored lessons" path (C555).
- **Needs a person to review:**
  - **Hindi.** A subject and Hindi review is needed for content written by the six content writers, especially newly coined Hindi terms (for example सीमा-मान, पार्श्व पठन).
  - **Facts.** A few existing claims have no source, for example "Scratch is made at MIT".
- **Missing controls:** there are no volume or mute controls. Pause covers it, and the phone's own volume applies.
- **Not committed:** none of this work is committed, as the brief asked. PR #463 (separate sign-ins) is separate and open.

## I. Next priorities, in order

1. Authorise the commit. This work then goes on its own branch and PR, separate from #463. Before the first real school, a Hindi and subject review of the six writers' content.
2. Add timeline and chart picture templates, then convert the Level 3 stand-ins that fit them.
3. Add diagrams and beats to the most-taken lessons per class (networking packet journey, circuits, sensors → controller → actuator).
4. Curate 3D models for 10 physical objects (keyboard, laptop, motherboard, CPU, RAM, router, ports). A person checks each, then a tap-to-load `model:` picture kind reuses `Model3dPic`.
5. Store a small per-child misconception and recall signal (the prediction choice and the teach-back self-check), under the existing consent rules, for spaced revision.
