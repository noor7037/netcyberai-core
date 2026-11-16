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

## Video quality, curated videos and the answer's marks (16 Nov 2026, later run)

What changed
- **Two videos per answer** (was four) on every path. Quality gate: never a declared paid placement, never one published in
  the last 30 days, never one seen fewer than `family.video_min_views` (5,000) times. Made-for-kids, no-ads channels and a
  high like share rank first.
- **Curated first.** `content.curated_topic_videos` (class, subject, topic, language) is read before any search; a match is
  shown first and exempt from the views and age gate (not from embedding, privacy, age or paid-placement checks). Two
  curated matches spend no search. `scripts/seed_curated_videos.ts` loads the 187 videos of `scripts/seed/part2_topic_map.csv`
  (`--check` reads without writing). A topic with fresh cached picks shows them until they go stale, then curated leads.
- **Free typed questions get videos.** When no catalog topic matches, up to eight of the question's own subject words name the
  topic (`free.c<class>.<words>`), only after the safety check passed it; no name, number or contact enters the key.
- **SponsorBlock.** A video that is more than 15% sponsor, self-promotion or "subscribe" is skipped; a lighter one ranks lower;
  an opening sponsor moves the start time. SponsorBlock down or slow changes nothing.
- **Gemini review (`family.video_review`).** Each kept video is watched once ever, in the background, and scored; child safety
  below 4 or accuracy below 3 hides it everywhere (`content.video_hidden`). Control can re-review a video.
- **Videos on free and paid alike.** The video route no longer checks the child's free subject. No plan filter remained
  elsewhere.
- **No "Made by AI" badge** on the tutor answer (the homework and worksheet screens keep their own notice).
- **MCQs only after step 5**, one to three by class and topic size: already true, now covered by tests
  (`elaboration-photosynthesis.test.ts`).

Verified: `tsc` clean; `test/family`, `test/ai`, `test/m2` pass (2,108 tests); production build passes. The family
First Load JS budget check reports `/study` (204 kB) and `/study/chapter/[key]` (216 kB) over 201 kB; the same pages were over
budget at the previous commit (216 / 204 / 201 kB), so this run did not cause it, and it is open.
Pictures: `docs/screenshots/tutor-overhaul/photosynthesis-{en,hi}-{top,full,end}-{390,1440}.png`. The Draw button and Ask bar float
over the lower part of the viewport while scrolling, never over a step's heading at the top, and clear everything at the page end.

To apply, in order, before enabling: migration `supabase/migrations/20261116120000_video_quality.sql` (curated table and
grants, reviews table, `content.video_hidden`, `no_ads` and `promo_share` columns, two settings, the `family.video_review`
profile). Then `DATABASE_URL=... npx tsx scripts/seed_curated_videos.ts` to load the 187 videos.
New Control settings: `family.video_min_views` (5,000), `family.video_reviews_per_day` (100); AI profile `family.video_review`
(Gemini). Env/keys: `GEMINI_API_KEY` (or the Gemini key saved in Control → AI) for the review; the YouTube key as before.
Without a Gemini key nothing is reviewed and nothing breaks.
