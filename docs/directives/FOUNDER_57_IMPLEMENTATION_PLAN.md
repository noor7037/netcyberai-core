> **Supersession (provider / gateway / Control AI):** On conflicts about provider neutrality, AI gateway, Control `/control/ai`, failover, credentials, Quality Lab, or “no fake success”, follow [`CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`](./CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md). Top-level paste target: [`CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`](./CLAUDE_UNIFIED_FOUNDER_EXECUTION.md). This plan remains useful for Founder-57 slice sequencing and curriculum detail.

# Founder-57 Implementation Plan (CTO)

**Repo:** `https://github.com/noor7037/netcyberai-core`  
**Audience:** Supervisor / Claude Code lead / sub-agents  
**Status:** Binding Founder lock (Q1–Q57). Engineering executes; does not re-litigate.  
**Companion execution prompt:** [`CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md`](./CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md)  
**Sub-agents / models:** [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) + root [`CLAUDE.md`](../CLAUDE.md)

---
**Addendum:** Family is standalone-monetizable; ERP school syllabus default vs parent photo/PDF upload for standalone; Control toggle universal vs school/parent syllabus — see `CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`.


## Cross-link & override order

| Doc | Relationship |
|---
---

## Testing phase — no premature restrictions (mandatory)

**Current stage is Founder testing.** Do **not** add unnecessary security guardrails, rate limits, compliance blocks, age/model-policy hard-blocks, or other restrictions that would prevent high-quality output or block the Founder from inserting, exchanging, and testing **any** API key from the Control Panel (`/control/ai`).

- Prioritize **high-quality product output** and **founder freedom to configure providers** over premature lock-down.
- Still: keep secrets **server-side / sealed** (never ship keys to the client, logs, or HTML) — that is basic credential hygiene, not a “block testing” guardrail.
- Still: no production migrate/deploy/paid spend without Founder sign-off.
- Still: never fake a live successful provider response.
- After testing, the Founder will instruct Claude Code **step-by-step** to set boundaries. Do not invent those boundaries now.
- Aligns with and **makes explicit** the existing no-preemptive-restriction / no hardwired provider-block rules for this testing phase.

--|----------------|
| [`CLAUDE_CONTENT_LAYER_DIRECTIVE.md`](./CLAUDE_CONTENT_LAYER_DIRECTIVE.md) | **Partially superseded.** Scaffolding-only / “NO CONTENT GENERATION” is **overridden** where Founder-57 requires complete Chapter Reader UI, Control digitizer, 3-provider router, K–12/all-boards selectors, Doubt Guru, and **seeded showcase chapters**. Still bind: no competitor scraping; no shipping secrets; preserve Study/Understand/English; reuse components; targeted reads. |
| [`CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md`](./CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md) | **Fold in, do not contradict** CTO locks that remain compatible: shared AI tutor component; Supabase `family` conversation persistence; Storage attach with size/MIME limits; existing STT/TTS paths; CSS/SVG light hubs; no ChatGPT chrome; header Notifications + Career Hub / Exam Portal / Schemes shells; ≤~200 KB family first-load discipline. |
| [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) | Unchanged — up to 5–6 sub-agents; Haiku/Sonnet/Opus mix; **no quality compromise**. |
| [`CLAUDE.md`](../CLAUDE.md) | Token discipline, parallel agents, contracts-first, no prod push/secrets — still bind. |

**Do not delete** the older directives. Note this override at the top of any PR/report that implements Founder-57.

---

## 1. Executive summary (≤10 lines)

1. Ship a **complete interactive syllabus companion** (not book resale): Chapter Reader + Contextual Doubt Guru + Control digitizer + multi-board K–12 selectors + 3-slot AI router, seeded with **working showcase chapters** for E2E.
2. Every student sits under **parent-authenticated `/family` or school tenant**, with **three adult governance layers**: Control QA → School/Teacher → Parent (PII strip + schema + skills).
3. **Google first-class** (`gemini_studio`, `vertex_ai`, Cloud TTS/STT, Translate, YouTube Data API) as Primary when configured; OpenAI / Workers AI / Groq / Sarvam / DeepSeek / Anthropic remain in the router — **no automatic hard-block** of founder-chosen models.
4. Reuse existing Study, Understand, blocks, interactive, video-picks, modules/`subjectAccess`, boards, credentials, preprocess, resolver, FamilyHeader, voice.
5. TTS narrates **only** `tts_read_aloud:true`; skip diagrams/charts/tables/sims (`data-tts-ignore`).
6. Missing chapter → on-demand Understand resolver **and** Control digitization queue — never a dead end.
7. First subject FREE (`subjectAccess`); Family Plus unlocks rest; ERP school sync 1-to-many; content versioning keeps progress.
8. Local/test first; **prod DB migrate / deploy / paid spend = Founder sign-off only**.
9. Run via execution doc with ≤6 sub-agents; acceptance = typecheck + test + build + listed E2E behaviours.
10. Scale further board/class packs through `/control/content` **without code changes** after this release.

---

## 2. Architecture

### 2.1 Three adult governance layers

```
Layer 1 — NetCyber Control (/control/content + content.responses)
          Generate / review / cache verified chapter & topic packs.
Layer 2 — School / Teacher (/app)
          School syllabus gate; ERP class publish → schoolStudyFor.
Layer 3 — Parent (/family)
          Authenticated guardian; preprocess.ts PII strip;
          resolver.ts PublicBlock schemas; skills/guardrails; fill().
```

Minors never receive raw unguarded model output as anonymous users. Age is parent account + child class/profile — **no per-session friction popups**.

### 2.2 Interactive syllabus companion (not bookstore)

- Off-app / intake syllabus → Control digitizer → structured blocks (`narrated_text` vs `visual_figure`) → published catalog.
- Boards: CBSE, ICSE/ISC, State (28+8), NIOS, IB, IGCSE, private publishers via Control.
- School canonical syllabus (`schoolStudyFor` / `readFamilyCatalog`) + parent supplemental (`family.child_syllabi` / `readOwnSyllabus`) as **extra tab**, never overwrite.
- On-demand AI Single-Shot (`UnderstandView`) + auto-queue digitization when chapter missing.

### 2.3 AI routing & safety (every call)

| Concern | Path / rule |
|---------|-------------|
| Credentials sealed | `src/lib/ai/credentials.ts` |
| PII strip | `src/lib/ai/preprocess.ts` |
| Provider + failover | `src/lib/ai/provider.ts` + adapters; Primary→Backup1→Backup2; circuit breaker; `daily-cap.ts` |
| Gemini adapters | Split `gemini_studio` + `vertex_ai` in `/control/ai` |
| Schema | `PublicBlock` via `src/lib/family/resolver.ts` |
| Personalize | `ResolverContext.child` + `fill()` — never leak names across children |
| Cache first | `content.responses` before live LLM |
| No Rasa | resolver + provider + Postgres only |
| Slots | text/doubt, vision/OCR, TTS, STT, translation, video search |

---

## 3. Phased delivery (P0–P5)

| Phase | Goal | Exit |
|-------|------|------|
| **P0 Inventory** | Targeted `rg`/ls of anchors below; confirm reuse map; no full-tree dump. | Short inventory in report. |
| **P1 Schema + boards + K–12** | Nursery/LKG/UKG + 1–12; streams Science PCM/PCB, Commerce, Arts; all boards/mediums selectable via `/control/boards` + child profile UI; syllabus status badges; versioning without wiping progress. | Typecheck; boards UI selects; child form accepts full range. |
| **P2 Control AI + digitizer** | 3-provider slots + promote + telemetry badges; Gemini Studio/Vertex adapters; Digitizer studio (ingest → structure → preview → draft/reviewed/published); queue for missing chapters. | `/control/ai` promote works; content preview renders reader payload. |
| **P3 Chapter Reader + TTS** | IndiaSchool.ai-style reader: progress %, sections, diagrams, examples, sticky TTS, floating Ask a doubt, end practice; Google/Indic TTS + Web Speech fallback; auto-scroll + word/sentence highlight; **TTS skip visuals**. | Showcase chapter opens end-to-end; TTS ignores `data-tts-ignore`. |
| **P4 Doubt Guru + multimodal** | Contextual Ask inherits board/class/subject/chapter/section/highlight; Single-Shot (text+example TTS, DiagramView, InteractiveView, VideoPicks, QuizView); concept = complete-first then practice; homework stays hint-first; language switch; Learning Vault + parent clear; push-to-talk only. | Personalized answer; no ChatGPT chrome; history persists. |
| **P5 Interactive, video, monetization, harden** | SVG labs + lazy WebGL with DataSaver 2D fallback; Math/Science sliders; YouTube educational VideoPicks cache; chapter assessments; `subjectAccess` first-subject free; ERP + standalone sync; offline packs; 60fps discipline. | Acceptance checklist (Q56) green locally. |

**Ordering vs older directives:** Complete P1–P4 for Founder-57 critical path before treating content-layer “shell-only” as done. Family hubs shells (Career/Exam/Schemes + header notifications + shared tutor chrome) proceed **in parallel** where files do not collide (see execution doc workstreams).

---

## 4. Mapping to existing code (reuse first)

| Capability | Existing anchors |
|------------|------------------|
| Control AI UI | `src/app/(admin)/control/ai`, `src/components/control/ai/AiControls.tsx`, `src/lib/ai/control.ts` |
| Adapters | `src/lib/ai/adapters/{gemini,openai,anthropic,workers-ai,youtube,…}.ts` |
| Credentials / preprocess / provider / daily-cap | `src/lib/ai/{credentials,preprocess,provider,daily-cap}.ts` |
| Resolver + fill + blocks | `src/lib/family/{resolver,fill,blocks}.ts`, `src/components/family/blocks/*` |
| Study / Understand | `src/app/(family)/family/(app)/study/**`, `understand/page.tsx`, `UnderstandView.tsx`, `StudyQuestion.tsx` |
| Interactive / Quiz | `InteractiveViews.tsx`, `src/lib/family/interactive.ts`, `QuizView.tsx` |
| Video | `src/lib/content/video-picks.ts`, `VideoPicksView.tsx`, `VideoPicks.tsx`, `/api/family/videos` |
| Boards | `src/app/(admin)/control/boards`, `BoardsView.tsx`, `src/app/api/control/boards` |
| Content CMS | `/control/content`, `ContentView`, `ResponseQueueView`, `response-queue.ts`, `content.responses` |
| Catalog / syllabus | `catalog.ts`, `child-syllabus.ts`, `school.ts`, `modules.ts` (`subjectAccess`) |
| K–12 child model | `children.ts` (Nursery–12 already noted C263), `fill.ts` |
| Header / voice / offline | `FamilyHeader.tsx`, `voice.ts` + VoiceInput, `DataSaverSwitch.tsx`, `pack.ts` |
| Prompts | `src/lib/ai/prompts/family.resolver/*` |

**Gaps to close (expected create/extend):** Chapter Reader shell + TTS highlight engine; digitizer structure editor; dual Gemini adapter ids; workload slot config UX; Learning Vault persistence UI; showcase seed packs; stream selectors for 11–12; syllabus status badges in Study.

---

## 5. Workstream dependencies

```
P0 inventory
   └─► WS1 Schema/boards/K12/streams ──────────────┐
   └─► WS2 Control AI router (Gemini+slots+failover)┤ independent of WS1 UI
   └─► WS3 Digitizer + content.responses pipeline ──┤ needs WS2 for prepare/LLM
   └─► WS4 Chapter Reader + TTS rules ──────────────┤ needs WS3 payload shape
   └─► WS5 Doubt Guru + Single-Shot + Vault ────────┤ needs WS4 context + WS2
   └─► WS6 Interactive/video/assessments/monetization/DataSaver
                    (needs WS4 reader hooks; WS1 subjectAccess)
```

Lead owns migrations, Decision Log, and merge order. Parallelize only non-colliding files (see execution doc).

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| TTS word-highlight fragile across devices | Word-level when boundaries exist; **sentence/paragraph fallback**; unit tests on `tts_read_aloud` filter. |
| Storage RLS / attach limits (hubs fold-in) | Reuse Family hubs Storage rules; size/MIME caps; Opus for RLS review. |
| Gemini Studio vs Vertex confusion | Separate adapter ids `gemini_studio` / `vertex_ai`; sealed credentials; no client keys. |
| Scope vs Family ≤~200 KB | No new chart/animation deps; lazy WebGL/video; CSS/SVG hubs; DataSaver 2D fallback. |
| Copyright / competitor scrape pressure | Showcase = **NetCyber-authored** educational originals; school packs via Control; **never** paste textbooks or scrape YoLearn/IndiaSchool.ai. |
| Earlier “scaffolding only” conflict | This plan + execution doc **override** for complete ship; document in report. |
| Prod accidents | Local/test only; Founder sign-off gate for migrate/deploy/paid APIs. |

---

## 7. How Claude Code should run

1. Open [`CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md`](./CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md) as the **paste-ready brief**.
2. Obey [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) + [`CLAUDE.md`](../CLAUDE.md) token/parallel rules.
3. Fold compatible Family AI hubs CTO locks; supersede content-layer scaffolding-only where noted.
4. **No commit/push/deploy** unless Founder explicitly asks after review.
5. End with the Report-back template in the execution doc.

---

## 8. Founder-57 crisp lock map (miss none)

**A Age & providers (1–7):** Full Nursery–12 under parent/school; Gemini Studio + Vertex first-class; no hard-block; Google Primary when configured; multi-provider kept; age via parent+profile; mandatory system/tone/PII/schema every call.

**B Books (8–14):** Companion not resale; complete readable chapter; all boards/publishers via Control; off-app intake → structured blocks; faithful diagrams; TOC/snapshot → full lessons; draft→reviewed→published without bureaucracy; missing → Understand + digitization queue.

**C Classes/boards (15–20):** Nursery/LKG/UKG + 1–12 in schema+UI; 28 states + 8 UTs + national + IB/IGCSE; regional mediums; 11–12 streams; school vs supplemental tabs.

**D Reader + tutor (21–30):** Personalize from `ResolverContext.child` + `fill()`; IndiaSchool-style reader; natural TTS; auto-scroll/highlight/controls; TTS only `tts_read_aloud:true`; contextual Ask; Single-Shot multimodal; concept complete-first / homework hint-first; instant language switch.

**E Interactive + video (31–35):** Smart 2D SVG + lazy WebGL + DataSaver; Math/Science sliders; VideoPicks + YouTube edu filters cached; chapter assessments (MCQ, board-pattern, photo, writing checklists).

**F APIs/Control (36–44):** Primary+2 backups; failover/breaker/daily-cap; one-click promote; purpose slots; sealed keys; cache responses first; telemetry badges; no Rasa; Translate API + LLM multilingual selectable.

**G Publish/sync/money (45–50):** Syllabus status badges; Digitizer studio; ERP 1-to-many; standalone catalog+own; first subject FREE then Family Plus; versioning keeps progress.

**H Privacy/launch/quality (51–57):** Learning Vault + parent clear; push-to-talk only; PII strip; **complete ship this release + showcase seeds**; 60fps/DataSaver/offline; acceptance via typecheck/test/build E2E; prod needs Founder sign-off.

---

*End of CTO plan. Execute via `CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md`.*
