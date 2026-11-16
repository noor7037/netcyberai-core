# Architectural & UX Overhaul: NetCyberAI Live Visual Tutor

## STANDING RULE: the NetCyberAI Elaboration Framework (founder, 16 Nov 2026)

Whenever a student asks anything, or types just a keyword, every tutor answer follows these 5 steps, in this order, never reordered, never skipped:

1. **Definition.** What the student asked comes first, answered in one clear line.
2. **Three levels.** Basic, then Intermediate, then Advanced, so every child understands from their own level. The child's class sets which level leads and how deep the others go (LKG to Class 2 stay short and picture-led).
3. **Real life.** One real-life scene the child sees every day (the shop, the kitchen, the road, India), so the abstract becomes concrete.
4. **Try it.** A small hands-on part: a mini question the child works out, with instant feedback, to verify understanding.
5. **Future line.** Where this topic will be useful later, in science, technology or daily life.

**Every step has all three formats**, synced step by step with the board: an **image** to see (a correct, matching showcase diagram, chart, lab, model or picture; never an unrelated one; no relevant diagram means a drawn card of the term, never a wrong picture), the **text** to read, and a **voice line** to listen to. The answer is in the child's language (en, hi or hinglish), matching the question.

How it is built (do not undo): prompt v19 makes it the default for every question (`elaboration-prompt.ts`, `v19.ts`); the plan is the single block `elaboration` (`plan-shape.ts` `ctx.elaborate`, `ELABORATION_BLOCK`); the block holds the five steps in order (`src/lib/family/elaboration.ts`), the server draws the pictures and sets the lead level (`elaboration-pics.ts`), and the view is `ElaborationView.tsx` (phone: one card per step, picture on top; 1024 px and up: whiteboard beside the conversation, following the voice). Showcase diagrams are shown only past a relevance threshold and only from a chapter of the child's class and subject (`visuals/showcase.ts`). Tests: `test/family/elaboration-framework.test.ts` must keep proving a reply has all 5 steps in order, each with image, text and voice. Any new tutor feature must keep this shape.

---

Paste this whole file into Claude Code in the `noor7037/netcyberai-core` repo. Work on a **new branch** and open a **PR**. **Never push to `main`.** Noor merges.

Audited against **main** at `d54e59f9c518594c62844ce41d7d31c8778b98b7` (16 Nov 2026). An earlier Gemini review used a folder copy, so some paths, line numbers and prompt versions below were wrong. Use these corrected findings, not Gemini's.

---

## 0. What is actually live (read this before changing prompts)

Resolver prompt files on disk: **v1–v18** in `src/lib/ai/prompts/family.resolver/`.

| Layer | Version | Where |
| --- | --- | --- |
| Code fallback (`LATEST_RESOLVER_PROMPT`, `resolverPrompt(null)`) | **v10** | `src/lib/ai/prompts/family.resolver/index.ts` (export near the end; still `V10.version`) |
| Live Control override | **v15** | Supabase netcyberai-dev `unodnyyfqhxrbusbkite`, table `control.ai_profiles`, row `profile_id = 'family.resolver'`, `prompt_version = 'v15'`, `revision_id = 98`, set 13 Nov 2026, 1:52 PM IST (08:22 UTC). History: v12 → v13 → v14 → v15. |
| On disk but **not** selected in Control | **v16, v17, v18** | v16 = first `key_points` block to cut wait (C516). v17 = answer in the question's language (`readsLanguage`, `replyLang` / `motherTongue`). v18 = refusal becomes a redirect with two tappable questions (15 Nov 2026). |
| Planner prompt | **family.plan v1** | `control.ai_profiles` row `family.plan` is v1. `PLAN_BLOCKS` still cannot name `board`, `lab` or `model`. |

**Do not "upgrade the fallback to v13".** That advice is stale. v15 already includes v12 `{{name}}` and v13 labs. The next **new** prompt is **v19**. Keep v10 as the code-only fallback unless you deliberately change it and update every test that asserts `LATEST_RESOLVER_PROMPT === 'v10'`. After the PR is merged, Noor (not you) switches Control → AI → `family.resolver` to **v19**.

v15 already does: name token, labs list (only when a scope is passed), visual-first board for LKG–Class 2, refer-back only on the same topic (`MEMORY_RULE`), and an honest "not from your book" line when a book exists. Several bugs below still exist **on top of v15**.

---

## 1. Corrected findings (Gemini claim → verdict)

### A1. Showcase visuals stripped for typed/voice questions — **PARTLY TRUE**

- Real call: `src/app/api/family/understand/route.ts` **line 386** (not ~258). `fillVisuals(..., { chapterKey: pending.line?.key ?? null, ... })`.
- `pending.line` is a syllabus topic/chapter line (`resolver.ts` `syllabusLine`). For `kind: 'question'` it is **null**, so `fillVisuals` never receives the open reader chapter key — even when `tutor.chapterKey` or `where` / `buildScope()` already computed `placed.chapterKey` (same file ~299–320).
- **Outdated:** videos are no longer gated on `pending.line`. Line 385 always calls `videoTopicOf({ line: pending.line, passages: pending.teach?.passages ?? [], drawTemplate })` (C522). If a topic can be inferred from passages or a drawing template, videos can still be appended even when the model did not emit a `videos` block.
- Images are still generic search queries, filled by Commons then Openverse (`src/lib/family/visuals/fill.ts`), **not** from `reader/content/` or `labs/assets/`. Young children can get an auto photo (C526) the same way.

### A2. `buildScope()` discards figures / diagrams / labs assets — **TRUE** (labs list is a partial exception)

- `src/lib/family/tutor-context.ts`: `topicText()` (~142–171) keeps only terms, keypoints, explain, misconceptions. `chapterText()` (~174–180) keeps big idea, outcomes, topic titles. No figure image, diagram SVG, or asset path is passed into the prompt.
- Labs: a short `LabOffer[]` is built (`labsFor`) and, **only when the window has a `where`**, copied into the prompt as `ask.labs` (`resolver.ts` 462 and 493: `labs: input.kind === 'question' && input.scope ? input.scope.labs.map(...) : []`). A typed question from Study with no chapter/lab open gets **`labs: []`**, so v13/v15 lab rules have nothing to offer and `generate()` drops any `lab` block whose id is not in that list (resolver.ts ~641–642).
- `IMAGE_LINE` in `v8.ts` (~108, 162) is `{"type":"image","query":"..."}`. The server finds a licensed photo (Commons, then Openverse) — not "Wikimedia only", and not our own verified assets.

### A3. Fallback stuck on v10, hiding v12/v13 — **PARTLY / OUTDATED**

- Fallback is still v10: **true**.
- v12 `{{name}}` and v13 labs are **not** hidden on the live app: Control is on **v15**, which extends them.
- Gemini's copy stopped around v13. Real latest file is **v18**. Next new version is **v19**.

### A4. Strict parse + coordinates silently drop content — **PARTLY**

- `parseBlockLine()` lives in **`src/lib/family/blocks.ts`** (~1345), not in `resolver.ts`. `generate()` (~618–644) skips a line when parse returns null, or when per-block Llama Guard fails, or when a lab/model/sim does not fit.
- A double quote drops a block only when it **breaks JSON** (unescaped). A properly escaped quote is kept. v6's "no double quote in text" is a prompt rule, not a hard parser ban.
- The "label > 30 / text > 120" limits Gemini cited are **Check-my-work** diagnostics (`stepsRejectReason` in `resolver.ts` ~338–352), not a global cap. Each block type has its own limits (figure label 40, board say 240, scene label 30 / text 220, etc.). A field over its cap drops **that block**, never silently truncated.
- Board coordinates: `blocks.ts` `gridNumber` **clamps** to the 100×100 grid. The whole board is dropped only if it has no title or no step left (~690–692, 879+). Crude LLM drawings are still a real UX problem.

### A5. Wall of 6–8 cards forced by v8 / plan.ts — **PARTLY**

- Default **medium** plans (`src/lib/ai/teaching/plan-shape.ts` `BAND_BLOCKS`): LKG–Class 5 → `explanation + image + check`. Class 6–8 medium → explanation, steps, key_points, check, practice. Class 9+ medium → explanation, worked_example, key_points, check, practice. `english_moment` is **not** in the default. Max 9 blocks. The planner (`family.plan` v1) can add more visuals.
- Live **v15** already forces LKG–Class 2 to **board + explanation + check** only (`YOUNG_VISUAL_BLOCKS`), board first. Older classes can still get a stack of 5–7 cards, plus an optional v9 coordinate board, plus auto videos.
- UnderstandView still renders a vertical stack of cards (`DirectAnswerCard` + `AnswerBlock`s in `flex flex-col gap-3`), not one live whiteboard.

### A6. 4-step chain + TTS causes 4–10s of dead air — **PARTLY**

Sequential work **before the first visible block** in `prepareResolve` / `prepareTeach` / `generate`:

1. Prepare Llama Guard (`family.moderation`)
2. `retrievePassages()` (and `bookPassages()` only in the narrow fallback below)
3. Planner LLM (`preparePlan`, family.plan v1)
4. `prepareText` for the resolver
5. Then `generate()`: Guard on the child's question, stream the resolver, **Guard each block before it is shown**

TTS is **not** a blocking fifth step before first paint. On a voice call, a `say` event is emitted after each shown block (`understand/route.ts` ~201–203). Typed auto-read is client-side (`AnswerSpeaker`) after blocks exist.

v16 already documents that the resolver call itself is the slow part (~8.5s on the paid model) and tries a first `key_points` block so words appear sooner. **v16 is not live.** First block still waits for a complete JSON object plus Guard.

### A7. Purple bullseye / stick-figure board; richer views underused — **TRUE** in spirit

- `FigureView.tsx` + `blocks.ts` `FIGURE_SHAPES`: only `circle | ring | cell | layered | orbit`. Any other shape is dropped. The prompt forces the model to pick one of the five, so unrelated ideas get the same schematic.
- `BoardView.tsx` + `v9.ts` `BOARD_COMMANDS` (and v15's young-board lines, which still use `BOARD_LINE`) ask the LLM for raw `[x,y]` commands on a 100×100 grid.
- `ChartView`, `ModelBlockView` (Three.js), `SimView`, and `labs/` exist, but `PLAN_BLOCKS` does **not** include `lab` or `model`, so the planner cannot request them. Labs also need a non-empty `p.labs` list (see A2).

### A8. Hindi UI / English tutor, and `addition — addition` pills — **PARTLY** (still real on v15)

- v8–v15 start with `Explain in ${STYLE[child.style]}` (`v8.ts` ~57–61, 241): the child's **style** setting (en / hi / hinglish), not the app locale and not the language of the question.
- **v17** already has `languageRule()` for question language (hi / en / hinglish) and sets the persona to `language: 'both'`. It is **not** selected in Control.
- Terms pills: `BlockViews.tsx` `ExplanationView` ~108–116 always renders `{t.en} — {t.local}` with no dedupe. The prompt asks for `local` in the explanation language, so an English answer becomes `addition — addition`.

### A9. Forced "Earlier we saw…" and false "not from your chapter" — **PARTLY / OUTDATED** on live v15

- `REFER_BACK_LINE` still sits in `v8.ts` (~203) and applies to v8–v14.
- **v15 replaces it** with `MEMORY_RULE` (refer back only when the question continues the same topic; never on a new topic or a different subject). Live Control is v15, so the forced "Earlier we saw…" leak should already be fixed for the live prompt. Keep the rule in v19; do not reintroduce the v8 line.
- `retrievePassages()` (`src/lib/ai/teaching/retrieve.ts` ~42–60) still uses `websearch_to_tsquery` over **`content.chapter_contents` only**.
- `bookPassages()` (reader/published book) runs only when the library returns **nothing** and the question is `typedFree`: no `chapterKey` and no `scope` (`resolver.ts` 535–542). A question asked **from** a reader/showcase chapter that is missing from `chapter_contents` will **not** fall back to the book, and can still get a general / "not from your book" disclaimer. Citation chip: `CitationChip.tsx` / `citation.ts`.

### A10. Wall of cards and overlapping composer — **PARTLY**, and the path was wrong

- Real path: **`src/components/family/tutor/TutorWindow.tsx`** (not `src/components/family/TutorWindow.tsx`). Composer: `src/components/family/tutor/Composer.tsx`. UnderstandView: `src/components/family/UnderstandView.tsx`.
- Answers are still a vertical stack of lesson cards (UnderstandView ~339–442; `KeptAnswer` in TutorWindow ~522–531).
- Composer is sticky: `Composer.tsx` ~158, `sticky z-20 ... bottom-[calc(var(--fam-bottom,0px)+5.25rem)]` when `pinned === 'dock'`. Study passes `pageScroll`, so the feed is **not** a `max-h-[70vh]` box, and the feed itself has no padding equal to composer + tab-dock height. Overlap of the last cards with the Draw/Ask composer and the bottom dock is a real risk at 390px and 1440px. Verify with screenshots; do not assume Gemini's screenshots still match.

---

## 2. Extra observations Gemini missed (fix these too)

1. **Showcase routing is the real hole, even when a chapter is open.** `tutor.chapterKey` and `buildScope()` already know the chapter, but `fillVisuals` is passed `pending.line?.key` (always null for questions) and `buildScope` throws away figure/diagram/lab assets. Wire the open chapter's own images, animated SVGs, labs, and curated videos into `kind: 'question'` replies without asking the LLM for coordinates or a generic photo query.
2. **Labs and 3D models are gated twice.** Offered labs are empty unless `input.scope` is set; `PLAN_BLOCKS` cannot name `lab` or `model`. The planner can never choose them. Fix both the offer list (including free Study questions in that subject/class) and the plan vocabulary.
3. **Perceived latency is the planner + first full JSON block, not TTS.** family.plan v1 must finish before the resolver starts. Stream (and show) the first safe block as soon as it parses. Consider merging or overlapping planner and resolver, or skipping the planner when v19 already knows the single-board shape. v16's "key_points first" idea is useful; fold a better version into v19 rather than shipping v16 as-is.

Also: image blocks today store `credit` / `licence` / `source` from Commons (`fill.ts` `photoBlock`). See the asset rule in §4.

---

## 3. Your mandate

Give an architectural assessment first (what to add, what to retire or tightly restrict, what to leave). Then implement in small verified slices.

Goal: a **colourful, animated, interactive, showcase-grounded** tutor that can stand next to a voice-first whiteboard: one clear stage, synced with speech, using our own chapter and lab assets first.

Decide and implement:

1. **Showcase-first visual routing** for `kind: 'question'`. How should `buildScope()`, `retrievePassages()` / `bookPassages()`, and `fillVisuals()` inject original `reader/content/` images, animated SVGs, interactive `labs/defs/` (and `labs/assets/`), Three.js `model` blocks, and curated videos — **without** the LLM inventing raw SVG coordinates? Pass the real chapter key (from `tutor.chapterKey` / `placed.chapterKey` / passages), not `pending.line?.key`. Prefer a semantic layout (title, ~3 bullets, 1 e.g., 1 visual, 1 check) that *references* an asset id, not a 100×100 sketch.
2. **Retire or tightly limit crude primitives.** Restrict `FigureView` to genuine schematic cases (cell, orbit, and similar). Route percentages/data to `ChartView`, astronomy/physics/anatomy to `SimView` / `ModelBlockView`, early-grade stories and counting to illustrated/animated showcase assets or a simple semantic board — not "everything is a purple cell" and not LLM stick figures. Keep BoardView only where a short, structured drawing still helps, ideally from templates or semantic commands, not free-form coordinates.
3. **Whiteboard-first layout, no overlap, voice-synced.** Restructure `TutorWindow.tsx` / `UnderstandView.tsx` / `Composer.tsx` so 390px and 1440px show a clean Live Whiteboard stage (bullets + e.g. + warning + equation + rich visual + one check), stepped with voice. The Draw/Ask composer and the tab dock must never cover the answer. Add the reserved bottom inset the sticky composer needs.
4. **Prompt v19** (next after the real latest, v18), chosen later in Control → AI. Include, as the default behaviour of v19:
   - language matching: answer in the language of the question (hi / en / hinglish), consistent with the UI locale when the question does not make a language clear; fold in v17's `languageRule` rather than leaving it on a dead version;
   - no duplicate terms pills (if `en` and `local` are the same, show one word; if they differ, show `en — local` once);
   - keep v15's conditional refer-back (`MEMORY_RULE`); do not bring back forced "Earlier we saw…";
   - `{{name}}` and labs remain on by default in v19;
   - honest grounding: use reader/book/library passages correctly; do not say "not from your chapter/book" when the topic is in the open chapter or the child's book; if you search `chapter_contents`, also search reader books when the chapter is open, not only for `typedFree` misses;
   - one-shot whiteboard shape for the default plan (not a textbook dump of 6–8 cards). Younger classes stay short and visual-first; older classes can have a worked example when the question needs it, but still one stage, not a wall.
5. **Latency.** Overlap or merge planner and resolver where it is safe; stream and display the first checked block immediately; run per-block moderation without blocking the next token more than you must. Do not weaken safety. Keep Llama Guard on the question and on blocks.

---

## 4. Assets beyond our own library (required)

When the tutor needs an image or video that we do not already have in `reader/content/`, `labs/assets/`, or our curated catalog, you may fetch it from **freely licensed public resources** (public-domain and openly licensed image and video libraries, government and educational archives). Prefer **public domain or CC0**.

**Student UI rule (non-negotiable):** only the image or video itself is shown. No source name, no attribution line, no credit, no watermark text, and no source link is visible to the student.

**Internal rule (also non-negotiable):** keep the source URL and licence for every such asset in an internal metadata field or file that is **not rendered** in the student UI, so we stay legally safe. Do not strip licence records from the database or cache.

Curated YouTube answer-picks (`content.video_picks` / `VideoPicks`) are a separate system: do not invent a new "hide YouTube" behaviour that would break that provider's rules. This section applies to stills and clips we pull from freely licensed public collections to illustrate a concept.

---

## 5. Work in slices (verify each one)

Assess first, then ship in this order (you may tighten the plan after the assessment, but do not skip verification):

1. Showcase-first routing: chapter key into `fillVisuals`; inject own figures / diagrams / labs / videos / models into question replies; extend retrieval so an open reader chapter is actually searched.
2. Prompt **v19** + plan-shape: single-board default, language, terms dedupe, conditional memory, labs+name on, honest book/chapter line, planner may name lab/model where appropriate. Register v19; do not silently rewrite v15.
3. Restrict FigureView / BoardView; route to ChartView / SimView / ModelBlockView / labs / showcase assets.
4. Whiteboard layout + composer/dock overlap fix; voice step sync.
5. Latency: first block sooner; planner/resolver overlap or skip when the v19 shape is already known.

Each slice: `tsc` (or the repo's typecheck script), relevant unit/integration tests, and a production build. For UI slices, screenshots at **390px** and **1440px** (answer + composer + dock, mobile and desktop). Put screenshots in the PR.

---

## 6. Git and Control

- New branch off current `main`. Open a PR. **Never push to `main`.** Noor merges.
- Do not switch the live Control prompt yourself. In the PR description, tell Noor: after merge and deploy, set Control → AI → `family.resolver` to **v19** (it is on v15 today).
- No secrets in the PR or in chat.
- Keep changes scoped to this tutor overhaul. Do not drive-by refactors.

---

## 7. What "done" looks like

A typed or spoken question about a chapter we already have should show **our** figure, lab, model or video when one exists; otherwise a freely licensed image/video with **no credit on screen**. The answer should land as one clear board (title, about 3 bullets, one example, one visual, one check), in the student's language, using their name naturally, referring back only when the topic continues, without false "not from your chapter" lines, without `addition — addition` pills, without the composer covering the answer at 390px or 1440px, and with the first visual or words appearing sooner than today's wait-for-the-whole-stack behaviour.
