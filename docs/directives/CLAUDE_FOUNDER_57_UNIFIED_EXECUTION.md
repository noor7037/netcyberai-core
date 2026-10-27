> **Supersession (provider / gateway / Control AI):** On conflicts about provider neutrality, AI gateway, Control `/control/ai`, failover, credentials, Quality Lab, or “no fake success”, follow [`CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`](./CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md). Top-level paste target: [`CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`](./CLAUDE_UNIFIED_FOUNDER_EXECUTION.md). This file remains useful for Founder-57 curriculum/reader/hubs locks.

# Claude Code Execution Prompt — Founder-57 Unified Ship

**Who writes:** Supervisor / CTO brief for Claude Code (build lead) and up to 5–6 sub-agents.  
**For whom:** Founder Noor (decision locked); Claude Code executes without re-asking architectural questions.  
**Delivers:** Complete Family Study Chapter Reader + Contextual AI Doubt Guru + Control Digitizer + 3-provider AI router (incl. `gemini_studio` / `vertex_ai`) + K–12 & all-boards selectors + seeded showcase chapters — wired into `noor7037/netcyberai-core`, reusable for further packs via `/control/content` with **no further code changes** for content scale.  
**Does not deliver:** Production deploy, production DB migrations, paid API spend switches, competitor scrapes, textbook verbatim paste, ChatGPT chrome, Rasa server, secrets in client bundles.

---

## Binding rules (read first; non-negotiable)

1. **Founder override:** Earlier scaffolding-only / “NO CONTENT GENERATION” in [`CLAUDE_CONTENT_LAYER_DIRECTIVE.md`](./CLAUDE_CONTENT_LAYER_DIRECTIVE.md) is **SUPERSEDED** for this run where this file requires complete UI + schemas + digitizer + router + K–12/all-boards + Chapter Reader + Doubt Guru + **seeded showcase chapters**. Do **not** delete that directive; note the override in the report.
2. **Fold (do not contradict)** compatible CTO locks from [`CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md`](./CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md): shared AI tutor component; Supabase `family` conversation persistence; Storage attach with size/MIME limits (“Attach file”); existing STT/TTS (`src/lib/family/voice.ts`, `/api/family/voice`); CSS/SVG light Career Hub / Exam Portal / Schemes shells; **no ChatGPT chrome**; header Notifications + three hub entries; Parent/PIN relocated under Profile/Settings; ≤~200 KB family first-load discipline (no new framer-motion/Lottie/GSAP/recharts/d3).
3. Follow [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) + root [`CLAUDE.md`](../CLAUDE.md): targeted reads only; reuse existing components; up to **5–6** sub-agents; **Haiku / Sonnet / Opus** mix **without quality compromise**.
4. **No scraping** YoLearn, IndiaSchool.ai, or any competitor. Reference UX patterns conceptually only. Showcase content = **NetCyber-authored** educational originals (structure ready for school-provided packs later). **Never** paste copyrighted textbook prose.
5. **No shipping secrets.** Keys stay in sealed `src/lib/ai/credentials.ts` / server env. Masked in `/control/ai`.
6. **Production forbidden without Founder sign-off:** no prod DB migrations, no live deploy, no paid API spend enablement. Local/test branch only until sign-off.
7. **No commit/push** unless a human explicitly asks after review.
8. Plan companion: [`FOUNDER_57_IMPLEMENTATION_PLAN.md`](./FOUNDER_57_IMPLEMENTATION_PLAN.md). Encode **all 57** locks below — miss none.

---
---

## Testing phase — no premature restrictions (mandatory)

**Current stage is Founder testing.** Do **not** add unnecessary security guardrails, rate limits, compliance blocks, age/model-policy hard-blocks, or other restrictions that would prevent high-quality output or block the Founder from inserting, exchanging, and testing **any** API key from the Control Panel (`/control/ai`).

- Prioritize **high-quality product output** and **founder freedom to configure providers** over premature lock-down.
- Still: keep secrets **server-side / sealed** (never ship keys to the client, logs, or HTML) — that is basic credential hygiene, not a “block testing” guardrail.
- Still: no production migrate/deploy/paid spend without Founder sign-off.
- Still: never fake a live successful provider response.
- After testing, the Founder will instruct Claude Code **step-by-step** to set boundaries. Do not invent those boundaries now.
- Aligns with and **makes explicit** the existing no-preemptive-restriction / no hardwired provider-block rules for this testing phase.

## Locked Founder decisions (Q1–Q57) — implement exactly

### A. Age & AI providers (1–7)

1. Full **Nursery–Class 12** under parent-authenticated `/family` or school tenant + 3-layer adult governance.
2. Include **Google Gemini** (AI Studio & Vertex) as first-class providers.
3. Separate adapters: `gemini_studio` and `vertex_ai` in `/control/ai`.
4. **No automatic hard-block** of founder-chosen models; Control assigns Primary/Backup1/Backup2.
5. **Prioritize Google** (Gemini, Cloud TTS/STT, Translate, YouTube Data API) as Primary when configured; keep OpenAI, Cloudflare Workers AI, Groq, Sarvam, DeepSeek, Anthropic in router.
6. Age via parent account + child class/profile — **no per-session friction popups**.
7. Every AI call: mandatory system instructions, age/class tone, `preprocess.ts` PII strip, `PublicBlock` schema validation in `resolver.ts`.

### B. Books / copyright framing (8–14)

8. Interactive **syllabus companion**, not book reselling — complete readable chapter aligned to student’s syllabus.
9. Support CBSE, ICSE, State, IB, IGCSE, NIOS, private publishers via Control digitization.
10. Syllabus collected off-app/intake → Control → structured blocks; publish school 1-to-many or standalone 1-to-1.
11. Diagrams/charts: faithful structured visuals (`DiagramView` / SVG / structured blocks).
12. TOC/snapshot expansion into full chapter lessons via AI + Control pipeline.
13. Metadata draft → reviewed → published in `/control/content` without bureaucratic blocks.
14. Missing chapter: on-demand Understand resolver **AND** queue digitization — never dead-end.

### C. Classes / boards (15–20)

15. Nursery/LKG/UKG + Classes 1–12 in schema **and** UI now.
16. All 28 states + 8 UTs + state boards + CBSE/ICSE/ISC/NIOS selectable via `/control/boards`.
17. IB + IGCSE in board registry from day one.
18. Regional mediums (English, Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Punjabi, …) in Reader + Doubt Guru.
19. Class 11–12 streams: Science PCM/PCB, Commerce, Arts (+ interdisciplinary) in profile + Study.
20. School syllabus via `schoolStudyFor`; parent supplemental in `family.child_syllabi` as **extra tab** without overwrite.

### D. Chapter reader + AI tutor (21–30)

21. Personalize from `ResolverContext.child` (firstName, class, board, stream, subject, chapter, progress, language).
22. Warm first-name address; `fill()` templates; **never leak names across children**.
23. IndiaSchool.ai-style Interactive Chapter Reader: progress %, structured text, diagrams, examples, sticky TTS, floating ✨ Ask a doubt, end practice.
24. Natural TTS: Google Cloud TTS / Indic / provider + Web Speech fallback.
25. Auto-scroll + word highlight with sentence/paragraph fallback; play/pause/seek/speed/resume.
26. **CRITICAL:** TTS only narrates `tts_read_aloud: true`; skip charts/mindmaps/diagrams/tables/sims (`data-tts-ignore`).
27. Ask a doubt inherits board/class/subject/chapter/section/highlight.
28. Single-Shot Understanding: text+example (TTS), DiagramView (no TTS), InteractiveView (no TTS), vetted video (no TTS), QuizView.
29. Concept/doubt = complete single-shot first then practice; Homework stays hint-first.
30. Instant language switch: English / Hindi / Hinglish / regional.

### E. Interactive + video (31–35)

31. Smart 2D SVG labs + lazy WebGL 3D with DataSaver 2D fallback.
32. Math/Science sliders (Play-series pattern).
33. Inline Watch Concept Video via VideoPicksView + YouTube Data API educational filters, cached.
34. Filter by board/class/chapter + trusted channels (`src/lib/content/video-picks.ts`); cache in `content.*`.
35. Chapter assessments: MCQ, board-pattern written, photo upload, writing-format checklists.

### F. APIs / Control AI (36–44)

36. Every workload: Primary + Backup1 + Backup2.
37. Auto failover + circuit breaker + daily-cap (`src/lib/ai/daily-cap.ts`).
38. One-click promote in `/control/ai`; health/latency/last-error; instant rollback.
39. Slots: text/doubt, vision/OCR, TTS, STT, translation, video search.
40. Credentials sealed server-side (`src/lib/ai/credentials.ts`).
41. Cache `content.responses` first; respect free-tier/daily caps.
42. Telemetry badges: Configured / Tested / Healthy / Degraded / Quota Reached.
43. **NO Rasa** — resolver + provider + Postgres.
44. Translate API and LLM multilingual selectable in `/control/ai`.

### G. Publishing / sync / monetization (45–50)

45. Syllabus status badges in `/family/study` (Received → Digitizing → Published & Live).
46. Control Digitizer studio: ingest, structure narrated vs visual, preview reader, publish + version history.
47. ERP 1-to-many school sync via `schoolStudyFor` / `readFamilyCatalog`.
48. Standalone: published catalog + `readOwnSyllabus`.
49. First subject FREE (`subjectAccess` in `src/lib/family/modules.ts`) then Family Plus; ERP per school plan.
50. Content versioning increments without wiping progress/test history.

### H. Privacy / launch / quality (51–57)

51. Save doubt history Learning Vault + parent clear.
52. Push-to-talk / tap-to-record only; no background recording.
53. PII strip; firstName via server `fill()`; zero external training on student data.
54. **THIS RELEASE:** complete UI + schema + digitizer + 3-provider router + K–12/all-boards + Chapter Reader + Doubt Guru + **showcase chapters**; then scale packs via Control without code changes.
55. 60fps, DataSaver, lazy 3D/video, offline packs (`PackButton` / `pack.ts`).
56. Acceptance: `npm run typecheck`, `npm test`, `npm run build` + E2E behaviours listed below.
57. Local/test first — prod DB/deploy/paid spend need **Founder sign-off**.

---

## Phase 0 — Inventory (targeted only; NO full-tree dump)

Run light `rg`/`ls` to **verify** these anchors exist; open only what a slice needs. Do not re-clone.

### Known map (verify lightly)

| Area | Paths |
|------|-------|
| Control AI | `src/app/(admin)/control/ai`, `src/components/control/ai/AiControls.tsx`, `src/lib/ai/control.ts` |
| Credentials / preprocess / provider / daily-cap / platform | `src/lib/ai/credentials.ts`, `preprocess.ts`, `provider.ts`, `daily-cap.ts`, `platform.ts`, `control-guard.ts` |
| Adapters | `src/lib/ai/adapters/{index,gemini,openai,anthropic,workers-ai,youtube,types}.ts` |
| Prompts | `src/lib/ai/prompts/family.resolver/*` |
| Resolver / fill / blocks | `src/lib/family/resolver.ts`, `fill.ts`, `blocks.ts` |
| StudyQuestion / Understand / Study | `src/components/family/StudyQuestion.tsx`, `UnderstandView.tsx`, `src/app/(family)/family/(app)/study/**`, `understand/page.tsx`, `/api/family/understand` |
| Interactive / Quiz | `src/components/family/blocks/InteractiveViews.tsx`, `QuizView.tsx`, `BlockViews.tsx`, `src/lib/family/interactive.ts` |
| Video picks | `src/lib/content/video-picks.ts`, `src/components/control/content/VideoPicksView.tsx`, `src/components/family/VideoPicks.tsx`, `/api/family/videos` |
| Modules / subjectAccess | `src/lib/family/modules.ts`, `src/lib/contracts/family-modules.ts` |
| Boards | `src/app/(admin)/control/boards`, `src/components/control/BoardsView.tsx`, `src/app/api/control/boards` |
| Content / responses | `src/app/(admin)/control/content/**`, `ContentView.tsx`, `ResponseQueueView.tsx`, `src/lib/content/response-queue.ts` |
| Catalog / syllabus / school | `src/lib/family/catalog.ts`, `child-syllabus.ts`, `school.ts`, `prepare.ts` |
| Children / K–12 | `src/lib/family/children.ts` (Nursery–12), `subjects.ts` |
| Header / voice / offline | `FamilyHeader.tsx`, `VoiceInput.tsx`, `src/lib/family/voice.ts`, `DataSaverSwitch.tsx`, `pack.ts`, `/api/family/pack` |
| Family hubs fold-in | Follow Family AI hubs directive paths for notifications + Career/Exam/Schemes shells + shared tutor rail |

Record any missing pieces in the report; create them in the workstreams below rather than inventing parallel stacks.

---

## Workstreams (≤6 sub-agents; model mix)

Launch in parallel only when file sets do not collide. Lead owns migrations + Decision Log + merge order.

| ID | Slice | Model | May touch (primary) | Must not |
|----|-------|-------|---------------------|----------|
| **WS1** | K–12 + boards + streams + syllabus badges + subjectAccess wiring | Sonnet (Opus if RLS) | `children.ts`, boards UI/API, child form, Study syllabus badges, `modules.ts` / contracts flags, stream fields | Chapter Reader TTS internals; `/control/ai` adapters |
| **WS2** | 3-provider router + Gemini Studio/Vertex + slots + failover + badges + translation select | Opus for adapter/security; Sonnet for UI | `src/lib/ai/adapters/*`, `provider.ts`, `credentials.ts`, `daily-cap.ts`, `control.ts`, `AiControls.tsx`, `/control/ai` | Family Study UI chrome; digitizer copy |
| **WS3** | Control Digitizer studio + response queue + draft→reviewed→published + missing-chapter queue | Sonnet | `/control/content/**`, content components, `response-queue.ts`, syllabus_versions metadata, preview payload shape | Client TTS engine; router credential store |
| **WS4** | Chapter Reader + TTS highlight/skip + sticky controls + language switch shell | Opus for TTS correctness; Sonnet for UI | New reader components under `src/components/family/**`, Study route wiring, block render with `tts_read_aloud` / `data-tts-ignore`, voice integration | Homework hint policy rewrite; Control AI keys |
| **WS5** | Contextual Doubt Guru + Single-Shot compose + Learning Vault + shared tutor rail (hubs fold-in) | Opus (children’s data / persistence) | `UnderstandView` / StudyQuestion / resolver path, conversation persistence in `family.*`, Ask panel context inherit, i18n keys | Invent exam/scheme body copy; scrape |
| **WS6** | Interactive sliders + VideoPicks inline + assessments + DataSaver/offline + showcase seed | Sonnet; Haiku for seed JSON/i18n slots | `InteractiveViews`, video-picks, assessment blocks, `DataSaverSwitch`, `pack.ts`, **showcase seed files** | Prod migrate; paid API flips |

**Haiku** OK for: i18n key slots, showcase JSON stubs, inventory lines, boilerplate mirrors.  
**Escalate to stronger model** whenever quality would drop.

---

## Concrete create / change list

### Extend (prefer)

- `src/lib/ai/adapters/gemini.ts` → split/support `gemini_studio` + `vertex_ai`
- `src/lib/ai/adapters/index.ts`, `provider.ts`, `credentials.ts`, `daily-cap.ts`, `control.ts`
- `src/components/control/ai/AiControls.tsx` — 3-slot workloads, promote, badges
- `src/lib/family/resolver.ts`, `fill.ts`, `blocks.ts`, `modules.ts`, `catalog.ts`, `child-syllabus.ts`, `children.ts`
- `src/components/family/{UnderstandView,StudyQuestion,FamilyHeader,VoiceInput,VideoPicks}.tsx`
- `src/components/family/blocks/{BlockViews,InteractiveViews,QuizView}.tsx`
- `src/components/control/content/*` + `/control/content` digitizer UX
- `src/components/control/BoardsView.tsx` + boards API
- `src/lib/content/video-picks.ts`, `response-queue.ts`
- `src/lib/family/{voice,pack,interactive}.ts`
- `src/lib/i18n/messages/{en,hi}.ts` (+ regional keys as needed)
- Feature flags in `src/lib/contracts/family-modules.ts` / `flags.ts`

### Create (additive; names may adjust if better reuse found — report them)

- Chapter Reader component(s), e.g. `src/components/family/ChapterReader.tsx` (+ TTS controller util under `src/lib/family/` or `src/components/family/`)
- Digitizer structure editor / preview pane under `src/components/control/content/`
- Learning Vault UI + API hooks under family study/parent
- Stream selector UI for Class 11–12 on child profile / Study
- Syllabus status badge component on Study
- Showcase seed pack directory (see below)
- Tests covering TTS skip filter, failover order, reader progress, subjectAccess

### Preserve

Study/Understand/English/homework/worksheets/offline/Focus Lock/School Link/WhatsApp gate behaviour unless this brief explicitly extends them. Prefer flags + adjacent routes.

---

## Showcase chapter seeds

**Location (preferred):** `data/showcase/` (or `content` seed SQL under `supabase/seed/` if that matches existing content loaders — pick the path that plugs into `readFamilyCatalog` / `content.responses` with least friction; document choice).

**Minimum:** one **Science** + one **Maths** chapter, enough to prove E2E Reader + TTS skip + Ask doubt + Quiz + one interactive slider + one video pick stub.

**Rules:** NetCyber-authored educational explanations OK; **do not** paste copyrighted textbooks; structure must accept later school-provided packs unchanged.

### Minimal complete example structure (illustrative)

```json
{
  "board": "CBSE",
  "classLevel": 8,
  "medium": "en",
  "subject": "Science",
  "chapterKey": "showcase.science.force-pressure",
  "title": "Force and Pressure (Showcase)",
  "version": 1,
  "status": "published",
  "sections": [
    {
      "id": "s1",
      "heading": "What is force?",
      "blocks": [
        {
          "type": "narrated_text",
          "tts_read_aloud": true,
          "text": "A force is a push or a pull. In this showcase lesson we explore how forces change motion."
        },
        {
          "type": "worked_example",
          "tts_read_aloud": true,
          "text": "Example: Pushing a school bag across a floor requires a force that overcomes friction."
        },
        {
          "type": "visual_figure",
          "tts_read_aloud": false,
          "data_tts_ignore": true,
          "diagram": { "kind": "force_arrows", "caption": "Push vs pull" }
        },
        {
          "type": "interactive",
          "tts_read_aloud": false,
          "data_tts_ignore": true,
          "lab": { "kind": "slider", "params": ["forceN", "massKg"] }
        },
        {
          "type": "video_pick",
          "tts_read_aloud": false,
          "query": "class 8 force and pressure educational"
        },
        {
          "type": "quiz",
          "tts_read_aloud": false,
          "items": [{ "stem": "Force is measured in?", "choices": ["Newton", "Joule"], "answer": 0 }]
        }
      ]
    }
  ]
}
```

Mirror a Maths chapter (e.g. linear equations / angles lab) with the same block contract. Wire seeds so Study opens the Chapter Reader without dead ends.

---

## Acceptance checklist (mirrors Q56)

Run locally (not production):

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Full showcase chapter loads in Study → Chapter Reader (progress %, sections, examples)
- [ ] TTS narrates only `tts_read_aloud:true`; diagrams/charts/tables/sims have `data-tts-ignore` and are skipped
- [ ] Auto-scroll + word **or** sentence/paragraph highlight; play/pause/seek/speed/resume
- [ ] ✨ Ask a doubt inherits context; answer personalized with `firstName` via `fill()`; no cross-child leak
- [ ] Single-Shot shows text+example, diagram, interactive, video, quiz; concept complete-first; homework hint-first preserved
- [ ] Interactive Maths/Science slider works; DataSaver forces 2D fallback path
- [ ] `/control/ai`: 3 providers per slot; failover; one-click promote; Gemini Studio + Vertex selectable; badges visible
- [ ] `/control/boards` + child profile: Nursery–12, streams 11–12, IB/IGCSE + Indian boards selectable
- [ ] Digitizer can preview + publish draft→reviewed→published; missing chapter queues + Understand still resolves
- [ ] School vs standalone syllabus paths; supplemental tab does not overwrite school
- [ ] `subjectAccess` first-subject free still enforced
- [ ] Learning Vault saves doubts; parent can clear; push-to-talk only
- [ ] No ChatGPT chrome; no secrets in client; no competitor scrape content
- [ ] Offline pack / DataSaver paths still compile; no new heavy animation deps

---

## Report-back template (mandatory)

```markdown
# Founder-57 report

## Context header
- Who / for whom / what delivered / binding rules followed

## Override note
- Content-layer scaffolding-only: superseded for [list]
- Family hubs CTO locks folded: [list]
- Conflicts resolved: [decision + why]

## Phase 0 inventory
- Verified paths: …
- Missing → created: …

## Sub-agents
- Count: N (≤6)
- Model mix: Haiku … / Sonnet … / Opus …
- Parallel slices: …

## Files created
- …

## Files changed
- …

## Showcase seeds
- Paths + chapter keys
- How loaded into catalog/responses

## Acceptance
- typecheck / test / build: pass|fail
- E2E behaviours checklist: …

## Reused components
- …

## Explicitly NOT done (needs Founder sign-off)
- Production DB migrations
- Live deploy
- Paid API spend switches
- [anything else deferred]

## Risks / follow-ups
- …
```

---

## Production gate (repeat)

**Build and test on local/test only.** Production database migrations, live deployment, and paid API spend require **explicit Founder sign-off**. Do not treat this prompt as that sign-off.

---

*Paste this entire file as the Claude Code run brief. Plan detail: `docs/FOUNDER_57_IMPLEMENTATION_PLAN.md`.*


---

## Standalone Family product & dual syllabus paths (mandatory)

The Family app is a **standalone monetizable product** for parents, not only an ERP companion.

### Two syllabus enablement paths

1. **NetCyber AI ERP school students**  
   If the child belongs to a school where NetCyber AI ERP is deployed, the **school’s uploaded/published syllabus** is enabled **by default** for all authorized students in that school/class (1-to-many via `schoolStudyFor` / school catalog sync). Do not require each parent to re-upload the same school syllabus.

2. **Standalone Family (no NetCyber ERP school)**  
   If the parent uses the Family app standalone (student not linked to a NetCyber ERP school), the **parent can upload the child’s syllabus from the parent app** — **photo capture or PDF**. NetCyber AI converts that intake into a readable, highly engaging interactive format (Control digitization / structured chapter companion) and enables it **for that parent’s child** (1-to-1 / `family.child_syllabi` / existing parent-syllabus-upload flow).

**Preserve the existing parent-syllabus-upload design** already built (or designed) by Claude Code — photo + PDF intake, status badges, Control queue. Extend and polish; do not rip out or replace with a dead-end.

### Control Panel toggle

In `/control/content` (and related admin controls), support an explicit **toggle / assignment mode** that switches per student (or school cohort) between:

- **Universal / board catalog content** (published packs available to matching board/class/medium), and  
- **School-specific syllabus** (ERP-published), and/or  
- **Parent-uploaded syllabus** (standalone intake → digitized companion)

Universal catalog and school/parent syllabi may coexist as tabs where product rules already allow supplemental subjects — never silently overwrite school canonical syllabus with parent supplemental (Founder 57). First-subject-free / Family Plus monetization (`subjectAccess`) continues to apply for standalone unlocks.

