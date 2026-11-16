# Tutor overhaul: architecture assessment (16 Nov 2026, main d54e59f9)

Built from `.claude/commands/tutor-overhaul.md`, checked against the code.

## What I found

- **Live prompt is v15 in Control; v16-v18 are on disk, unselected; the code fallback is v10.** The next prompt is v19.
  v10 stays the fallback (tests assert it). v19 is registered only; Noor switches Control after merge.
- **Showcase hole is real.** `understand/route.ts` calls `fillVisuals` with `pending.line?.key`, null for every typed
  question, so the open chapter never reaches the visual fill. The chapter files (`reader/content/**`) already hold
  authored animated SVG `diagram` steps, figures and labs. None of it reaches a question reply.
- **Labs are offered only when a window `where` exists** (`input.scope`). A free Study question gets `labs: []`.
  `PLAN_BLOCKS` cannot name `lab` or `model`.
- **Reader chapter not searched.** `bookPassages()` runs only for typed-free misses, so a question asked inside a
  chapter missing from `chapter_contents` gets a false "not from your book" line.
- **Layout:** answers are a stack of cards. The sticky composer (`bottom-[calc(var(--fam-bottom)+5.25rem)]`) has no
  matching bottom padding on the feed, so the last card sits under the composer and dock.
- **Latency:** the planner LLM finishes before the resolver starts. TTS is not on the critical path.
- **Terms pills** render `en - local` with no dedupe, giving `addition - addition`.

## Decisions

| Area | Decision |
| --- | --- |
| Showcase | New server-filled `showcase` block (never model-written): the best-matching authored animated diagram of the open chapter, chosen by word overlap with the question. Drawn as an `<img>` data URL (no script runs in an image). Chapter key now comes from `tutor.chapterKey`/`placed.chapterKey`. |
| Free licensed media | Existing Commons/Openverse fill stays. Student UI shows the picture only (credit text removed from the card); source, licence and author stay in the stored block and `content.image_picks`, never rendered. YouTube picks untouched. |
| Prompt v19 | v18 + language rule, one-board shape, labs and name on, honest grounding, conditional memory kept. Registered, not selected. |
| Terms | Dedupe in the view (one word if `en` equals `local`), and v19 asks for `local` only when it differs. |
| FigureView / Board | Restricted by the prompt: Figure only for cell/orbit/layered/circle/ring schematics; data goes to `chart`; astronomy/physics to `scene`/`model`. No parser removal (avoids breaking stored answers). |
| Layout | One stage: the feed reserves bottom space equal to the composer plus dock. |
| Latency | Start the planner and the passage search together, and skip the planner when the v19 shape is known. Guard stays on the question and every block. |
| Left alone | Control row, v10 fallback, Llama Guard, v15-v18 files, curated video system. |

## What shipped, and what did not (end of the run)

Shipped: showcase block and routing (chapter key from `where`), reader book searched inside an open chapter, no credit text on
photos, prompt v19 (registered only), one-stage plan shape, planner skipped for LKG to Class 5, showcase shown before the model
writes, labs offered to free questions, terms dedupe, "not from your book" chip hidden when the chapter's diagram is shown,
scroll margin and a shorter diagram on phones, harness screens `family-tutor-stage` and `family-tutor-stage-end`.

Not done (needs a design pass, not a patch):
- The composer is still sticky and floats over the answer while the child scrolls through it. At the end of the page nothing is
  covered (see `family-tutor-stage-end-*`). A true single-board stage that steps with the voice is a bigger rebuild of
  `UnderstandView`.
- `PLAN_BLOCKS` is unchanged: `lab` and `model` are not gated by the plan, so v19 asks for them in the resolver prompt instead.
- Lab and 3D model blocks are not auto-added from the chapter; only the diagram is. Chapter `figure` images need the
  `labs/assets` manifest and a served route.
- FigureView and BoardView code is untouched; v19 and the server drop the model's board or figure when a showcase is present.
- Planner and resolver are not run together: the planner receives the child's words, so it must follow the safety check.
- No new fetching of free licensed videos or stills beyond the existing Commons and Openverse fill.
