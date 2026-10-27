# The AI Gateway and Study programme: the plan (CTO and Chief AI Officer, 2026-10-27)

Supervisor (CTO, Chief AI Officer) → Noor and the build lead. This is the one plan for the nine founder directives now
kept in `docs/directives/`. It says what is true in the repository today, decides the points where the directives
contradict each other or the repository's rules, and orders the work into waves the build lead can start now.
Rules that bind: CLAUDE.md, the directives (the gateway brief wins on provider questions), Decision Log C230-AN.

## 1. What the directives ask, in one paragraph

A provider-neutral AI gateway: the founder adds any provider's key in Control, assigns a model to each workload as
Primary, Backup 1 and Backup 2, switches and rolls back in one click, sees honest health, and compares models on the
same synthetic cases in a Quality Lab. On top of it, a premium Study experience: a full chapter reader with narration,
a contextual doubt tutor in one shared window with conversation history and file attach, interactive visuals, chapter
tests, a Control content studio that turns a syllabus (school-published or parent-uploaded) into those chapters, and a
live spoken-English tutor. All of it polished, measured, with no fake success anywhere.

## 2. What is true in the repository today (checked at HEAD 2f29e18f)

| Area | State | Where |
|---|---|---|
| Sealed credentials per provider, Control key entry, key test | Built | `src/lib/ai/credentials.ts`, `control.ts`, `AiControls.tsx` |
| Workloads with a primary and a fallback chain | Built, unnamed | `control.ai_profiles` (`provider_id`, `model`, `fallback[]`): the data already holds three slots; the UI does not name them |
| Failover before the first streamed token, whole-answer mode | Built | `src/lib/ai/platform.ts` (`chainOf`, `streamText`) |
| Daily cap, usage metering (requests, tokens) | Built | `daily-cap.ts`, `control.ai_usage`; no cost, no ledger per attempt |
| PII strip, typed `PublicBlock` answers, `fill()` first name | Built | `preprocess.ts`, `src/lib/family/resolver.ts`, `fill.ts` |
| Adapters | anthropic, openai, workers-ai, youtube registered; **gemini written, not registered** | `src/lib/ai/adapters/` |
| Who may serve children's words | **Two gates**: a hardwired `minorsEligible` flag per adapter in code **and** a Control switch `cleared_for_minors` (terms URL, who, when) in the database | `adapters/*.ts`, `control.ts:310`, `platform.ts:231`, migration `m1_family_content_control` |
| Route revisions, rollback, circuit breaker, health history, Quality Lab, cost ledger | **Missing** | — |
| Gemini Studio / Vertex adapters, OpenAI-compatible generic adapter with SSRF guard | **Missing** | — |
| The "Slice 2+3" gateway modules the Phase 0 audit calls implemented | **Not in this repository.** They were written in another workspace and never pushed | `docs/directives/AI_GATEWAY_PHASE0_AUDIT.md` §8 |
| Study, Understand, typed blocks, interactive views, quiz, video picks, DataSaver, offline packs | Built | `src/app/(family)/family/(app)/study`, `UnderstandView`, `blocks/*` |
| Parent syllabus upload (photo, PDF), school syllabus sync, `subjectAccess` | Built | `child-syllabus.ts`, `schoolStudyFor`, `readOwnSyllabus`, `modules.ts` |
| Chapter reader with narration flags, shared tutor window with history and attach, Learning Vault | **Missing** | — |
| Control content: response queue, PDF import, video picks, English versions | Built; no digitizer preview/publish/version studio | `src/components/control/content/*` |
| English course (90 days), lessons, checks, parent report | Built | `src/lib/family/english/*`, `data/english/**` |
| Live spoken-English tutor, hubs (Career, Exams, Schemes), notifications centre | **Missing** (`careers`, `opportunities` flags exist, `built: false`) | `src/lib/contracts/family-modules.ts` |
| Heavy animation/chart libraries | None (`pdfjs-dist`, `tesseract.js` only) | `package.json` |

## 3. Decisions (C230-AN)

1. **Children's words and the provider switch.** The hardwired `minorsEligible` refusal in code goes. The one gate is
   Control's own switch: a provider serves children's words only when the founder has marked it cleared, with the
   terms URL, who and when (the database check already requires all three). Control shows, next to the switch, what the
   supervisor found in each provider's terms on 2026-10-22 (`docs/family-app/AI_PROVIDERS.md`) as advice, not as a
   block. The person who ticks the box carries the responsibility, and the audit row says who did. This satisfies the
   directive (no provider preference disguised as an engineering rule) and the repository's rule (children's data only
   where the account owner has decided it may go).
2. **No automatic Primary.** Founder-57 Q5 ("Google as Primary when configured") is superseded by the gateway brief:
   the founder sets every slot in Control. The code never promotes a provider on its own.
3. **Workloads are profiles.** `control.ai_profiles` stays the workload table; its primary and `fallback[0..1]` are
   Primary, Backup 1 and Backup 2. Missing workloads (text_to_speech, speech_to_text, english_conversation,
   translation, video_search, visual_spec, vision_ocr) are added as rows, not as a second table. Route revisions,
   health and the ledger are new tables beside it.
4. **"Production" in the directives means the real-school database.** The live site deploys from `main` to the test
   database, as it has all along; merging stays the way the founder tests. The production cutover stays deferred
   (docs/18 §0, C103). No paid spend is switched on by code: a key the founder saves is his decision.
5. **Workflow stays the repository's.** The build lead works on branches, opens PRs and continues (CLAUDE.md "Working
   efficiently"); the directives' "no commit/push" line is read as "never to `main`, never force". PR sizes stay by
   risk: ~1,500 lines for database, auth, money or messaging; ~3,000 for UI.
6. **The daily cap stays**, as a Control setting the founder may raise (0–1000). It is a cost guard, not a block.
7. **One block schema.** The content-layer directive's separate `LessonContent` type is not built; chapters use the
   existing typed blocks (`src/lib/family/blocks.ts`) extended with `tts_read_aloud` and a stable block id. One schema,
   one renderer, one cache.
8. **The child-mode header's Parent button** (C230-Y, put there for the founder's phone) is not removed until the
   founder answers (directive assumption A1). The notifications centre and hub entries are added beside it.
9. **No scraping, no textbook prose.** Showcase chapters are NetCyber-authored; school and parent syllabi arrive through
   the content studio with a human review before publication.

## 4. The programme, in waves

Every slice: `tsc`, its tests, the checkers it touches; one `ci_local.sh` on the top of each wave; screenshots at 390
and 1440 for UI; one Opus security review per wave for the slices marked (S). Models per CLAUDE.md C230-AI.

### Wave 1: the gateway and Control (the founder can test keys and routing after this)

| # | Slice | Model | Files (primary) | Acceptance |
|---|---|---|---|---|
| G0 | The provider switch (decision 1): remove the code refusal, keep the database check, show the terms note in Control | Opus (S) | `control.ts`, `platform.ts`, `adapters/*.ts` (`minorsEligible` → `termsNote`), `AiControls.tsx`, tests | The founder clears Gemini in Control and `exams.read_pages` accepts it; an uncleared provider is still refused for a child profile; the audit row names the person |
| G1 | Adapters: register `gemini` (AI Studio) and add `vertex_ai`; one OpenAI-compatible generic adapter with an admin-set base URL, server-validated (https, no private ranges, no redirects, no metadata hosts); capability declarations per adapter (text, vision, stream, JSON, STT, TTS) | Opus (S) | `src/lib/ai/adapters/*`, `adapters/types.ts`, `control.ts` | `testConnection` for each; an unsupported capability is refused, never a no-op; no key in any response or log (test) |
| G2 | Routing reliability: `control.ai_route_revisions` (immutable snapshot per activation, rollback), `control.ai_provider_health` (probe, circuit closed/open/half-open), `control.ai_usage_ledger` (per attempt: provider, model, revision, latency, tokens, cost or `unknown`); failover taxonomy; circuit breaker in `platform.ts`; one migration | Opus (S) | `src/lib/ai/gateway/*` (new), `platform.ts`, migration | Injected Primary timeout → Backup 1 within the deadline; a refusal does not cascade; no answer from two models stitched; rollback restores the previous revision |
| G3 | `/control/ai` UX: workload cards with named Primary/Backup 1/Backup 2, promote and rollback as one transaction, provider states (Not configured, Saved, Tested, Healthy, Degraded, Circuit open, Quota, Disabled), honest empty states, the ledger and fallback timeline | Sonnet | `AiControls.tsx`, `src/app/api/control/ai/route.ts`, i18n | Screenshots en/hi 390/1440; no number on screen that was not measured |
| G4 | Quality Lab: `control.ai_eval_*` tables, ≥40 NetCyber-authored synthetic cases (maths, science, humanities, Hindi, English role-play, multi-turn, malformed JSON, timeout, quota), side-by-side runs, 1–5 rubric, export; results never enter learner history or the shared cache | Sonnet (UI), Opus (isolation) | new `src/lib/ai/lab/*`, `data/ai-lab/*`, Control screen | A run against two configured models produces a comparable table; with no key the screen says Not configured |

### Wave 2: Study (chapter reader, tutor window, content studio, standalone path)

| # | Slice | Model | Acceptance |
|---|---|---|---|
| S1 | Blocks gain `tts_read_aloud` and stable ids; the chapter reader route `/family/study/chapter/[key]`: ordered blocks, progress, sticky narration controls, auto-scroll, sentence highlight (word only when timing exists), seek, speed, resume; narration through the existing voice path, with a `text_to_speech` workload when configured | Opus (TTS correctness), Sonnet (UI) | Two showcase chapters play end to end; diagrams, tables and sims are never read aloud (test) |
| S2 | One shared tutor window: input rail (text, mic, Attach file, send), Conversation tab, `family.tutor_conversations/messages/attachments` with RLS, private Storage bucket with size and MIME limits, the Learning Vault with parent clear; replaces the stacked Study ask form; the doubt drawer in the reader inherits board, class, subject, chapter, section | Opus (S) | History persists per child and subject; a sibling never sees it; no "ChatGPT" anywhere; homework stays hint-first |
| S3 | Content studio: digitizer preview identical to the family reader, draft → reviewed → published, version history without wiping progress, the missing-chapter queue, the per-student assignment mode (catalog, school, parent-uploaded) | Sonnet | Publish a chapter from a parent's PDF upload and open it on the child's Study |
| S4 | Curriculum selectors: Nursery–12, streams for 11–12, boards and mediums from `/control/boards`; status badges (Received, Digitizing, Published) on Study; `subjectAccess` first subject free kept | Sonnet; Haiku for i18n | Boards and streams selectable; badges match the queue |
| S5 | Interactive sliders, lazy WebGL with DataSaver 2D fallback, chapter tests (MCQ, written with rubric, photo), curated video picks | Sonnet | DataSaver forces 2D; a test records real attempts only |

### Wave 3: English live, hubs, hardening

| # | Slice | Model | Acceptance |
|---|---|---|---|
| E1 | Live spoken-English tutor beside the course: turn-based STT → LLM → TTS through the workloads, bounded context with summaries, push-to-talk only, correctable transcript, session summary; duplex only if a configured adapter declares it; never a pronunciation score from text alone | Opus (S) | A ten-turn session stays coherent; with no STT key the screen says so |
| H1 | Notifications centre and the three hub shells (Career Hub, Exam Portal, Schemes & Scholarships) as CSS/SVG, national visible to all, state schemes by `stateCode`; empty bodies, no invented copy | Sonnet; Haiku for stubs | First-load JS stays under the family budget |
| Z1 | Hardening: RLS and isolation tests (tenant, sibling, evaluation cache), spend tests, a11y pass, runbook (`docs/family-app/AI_PROVIDERS.md` and a new `AI_GATEWAY_RUNBOOK.md`), the evidence report in the gateway brief's §19 format | Opus (review) | `ci_local.sh` green; the report lists measured numbers only |

## 5. What the founder does

1. Answer the three questions in the supervisor's report (the Parent button; the stranded workspace; which providers to
   try first).
2. Save the keys he wants to test in Control → AI (he can do it now for Anthropic, OpenAI and Workers AI; Gemini after
   G1). Keys are his spend; Control never switches a paid key on by itself.
3. After G0: tick "cleared for children's words" for each provider he accepts the terms of. Read the note first.
4. After Wave 1: pick Primary, Backup 1, Backup 2 per workload; run the Quality Lab on the same cases; decide.

## 6. Risks the plan carries

- **Terms.** Google's and OpenAI's API terms were read as not meant for minors' words (2026-10-22). The switch now puts
  that decision with the founder. It is a legal decision, not a technical one.
- **Content supply.** A chapter reader without chapters is a demo. Scale needs the studio plus human review; that is
  people time the plan does not remove.
- **Cost.** No per-child cost is known until the ledger (G2) and the Lab (G4) measure it. Nothing is promised before.
- **Weight.** The reader, narration and visuals must stay under the family app's first-load budget; everything heavy is
  lazy-loaded or it does not ship.
- **Lost work.** Whatever was built in the other workspace is rebuilt here unless that workspace pushes a branch first.
