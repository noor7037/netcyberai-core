> **Supervisor note (2026-10-27, HEAD 2f29e18f):** the code this file describes (gateway modules, Gemini registration, the Slice 3 migration, the new tests) was written in another workspace and never pushed. None of it is in this repository. Treat this file as a design note, not as a record of what exists. The plan that binds is `docs/37_AI_GATEWAY_AND_STUDY_PLAN.md`.

# AI Gateway — Phase Zero Audit

**Generated:** 2026-10-27 (Asia/Calcutta)  
**Briefs:** [`CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`](./CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md), [`CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`](./CLAUDE_UNIFIED_FOUNDER_EXECUTION.md)  
**Rule:** Factual only. Preserve uncommitted docs. No reset/clean/force. No commit/push.

---

## 1. Repo identity

| Field | Value |
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

---|--------|
| Path | `/workspace/netcyberai-core` |
| Branch | `main` |
| HEAD | `5c298ad192976d128b494c82c7cb772b40e12f98` (matches expected) |
| Remote | `origin` → `https://github.com/noor7037/netcyberai-core.git` |
| Package manager | **npm** (`package.json` scripts: `dev`, `build`, `start`, `typecheck`, `test`, `audit:seo`) |
| Stack | Next.js 14.2.35 / React 18.3.1 / TypeScript / Vitest / Supabase / Tailwind 3.4.4 |
| Status at audit start | Untracked founder docs only (`docs/CLAUDE_*`, `docs/FOUNDER_57_*`); working tree otherwise clean of tracked diffs |

---

## 2. Factual matrix

Legend: **W** = working (code + tests or clear runtime path) · **P** = partial · **M** = missing vs gateway brief · **U** = unable to verify in this run

### AI platform / gateway

| Area | Status | Evidence |
|------|--------|----------|
| Legacy `AIProvider` draft door | W | `src/lib/ai/provider.ts` — `DraftRequest` / `standInProvider` / `configuredProvider` (lesson/worksheet/pulse/home_help) |
| Family text adapter interface | W | `src/lib/ai/adapters/types.ts` — `TextAdapter.streamText`, vision flag, timeouts |
| Speech + moderation adapters | W | Same file + `speechAdapterFor` / `moderationAdapterFor` in `adapters/index.ts` |
| Registered text adapters | P | REAL = anthropic, openai, workers-ai. **Gemini written** (`adapters/gemini.ts`) but **not registered** (comment: terms/minors) |
| YouTube content adapter | W | `adapters/youtube.ts`; keyed via `keyedProviderFor` |
| Platform chain (primary + fallback JSON) | W | `platform.ts` `chainOf`, `prepareText`/`streamText`, failover before first streamed token; tests in `test/ai/platform.test.ts` |
| Workload enum / Primary·Backup1·Backup2 named slots | M/P | Profiles (`control.ai_profiles`) + `fallback[]` exist — **not** yet workload-catalog routes with three explicit slots per brief §4.5 |
| Normalized gateway request/response contract (§3.2) | M | No dedicated `GatewayRequest`/`GatewayResponse` types; `AiRequest`/`AiResult` are narrower |
| Full adapter methods (`validateConfig`, `testConnection`, `getCapabilities`, `synthesize`, duplex) | M/P | Connection test via Control `prepareKeyTest`; TTS mostly client/`voice.ts`; no unified capability registry object |
| Circuit breaker | M | Not found as named circuit open/half-open in `src/lib/ai` |
| Budget reservation / cost ledger | P | Daily family cap (`daily-cap.ts`, `family.ai_daily`); `control.ai_usage` metering; **no** estimated-cost / hard spend hierarchy as in §5.3 |
| Credentials sealed vault | W | `credentials.ts` + Control seal; tests `preprocess-and-seal.test.ts`, `control-routes.test.ts` |
| Preprocess PII strip | W | `preprocess.ts` + tests |
| Quality Lab UI/API | M | Smoke test `prepareSmokeTest` exists; no Model Quality Lab screen / rubric runs |
| OpenAI-compatible generic + SSRF URL guard | P | Shared `chat-completions.ts` for Workers/Gemini/OpenAI shapes; no admin-configurable arbitrary base URL with SSRF allowlist |

### Control Panel

| Area | Status | Evidence |
|------|--------|----------|
| `/control/ai` page + `AiControls` | W/P | `src/app/(admin)/control/ai/page.tsx`, `components/control/ai/AiControls.tsx`, `lib/ai/control.ts`, API `src/app/api/control/ai/route.ts` — profiles, keys, clearance, cap, undo; **not** full §4 overview/telemetry/Quality Lab |
| `/control/content` | W/P | ContentView, ResponseQueue, PdfImport, VideoPicks, EnglishVersions; digitizer/preview gaps vs §10 |
| `/control/boards` | W | `control/boards/page.tsx`, `BoardsView`, `controlBoards` |
| Workload Routing / Promote / Rollback revisions | M | Profile save + single fallback fields in UI draft; no immutable route revisions / one-click promote transaction |

### Study / Family

| Area | Status | Evidence |
|------|--------|----------|
| Study + Understand routes | W | `src/app/(family)/family/(app)/study/page.tsx`, `understand/page.tsx` |
| UnderstandView, StudyQuestion, SyllabusList, SchoolSyllabus | W | `src/components/family/*` |
| Resolver / fill / subjectAccess | W | `resolver.ts`, `fill.ts`, `modules.ts` `subjectAccess` |
| child_syllabi | W | `child-syllabus.ts` + migration `20261023074703_family_child_syllabus.sql` |
| content.responses / library | W | `lib/content/library.ts`, `response-queue.ts`, migrations under `supabase/migrations/*content*` |
| Chapter Reader (full sticky TTS / word sync) | P | Blocks via `BlockViews`; Founder-57 reader upgrades still outstanding |
| DataSaverSwitch | W | `components/family/offline/DataSaverSwitch.tsx` used on study/understand |
| VoiceInput / family voice | W | `VoiceInput.tsx`, `lib/family/voice.ts` |

### English

| Area | Status | Evidence |
|------|--------|----------|
| `/family/english` course | W | pages under `english/`, `EnglishCourse.tsx`, APIs `api/family/english/*`, tests `test/english/*` |
| Live multi-turn duplex tutor | P/M | Course + speech helpers; gateway brief duplex + coherent live tutor still gap |
| Pronunciation-from-audio scoring | M/U | Must not claim if only STT — not verified as a false claim in this run |

### Data model (AI)

| Entity | Status | Evidence |
|--------|--------|----------|
| `control.ai_providers` / `ai_credentials` / `ai_profiles` / `ai_usage` | W | Created `20261021094627_m1_family_content_control.sql` + RLS; workers/gemini inserts later |
| `ai_workload_routes` / `ai_route_revisions` / `ai_provider_health` / evaluation tables | M | Not present under those names |
| `family.ai_daily` | W | Daily cap |

---

## 3. Llama / generic-slow diagnosis (facts only)

Evidence from code comments and prompts (not a live latency measurement this run):

1. **Serving path:** Cloudflare Workers AI is the registered children’s path (`adapters/index.ts`: “serves every profile for now”). Model IDs are Control-configured `@cf/...` / `@hf/...` (`workersModelLooksRight`).
2. **Streaming disabled for Workers text:** `workers-ai.ts` forces `stream: false` because live probe (C321/C322) found **Llama 4 Scout streamed JSON losing inner quotation marks**; whole-answer mode keeps JSON but means the child waits for the full response (comment: “a few seconds after asking”).
3. **Timeouts:** `CALL_TIMEOUT_MS = 60_000`; `WHOLE_ANSWER_TIMEOUT_MS = 120_000` for non-streamed whole answers — long waits possible before failover.
4. **Prompt shape:** `prompts/family.resolver/v5.ts` documents measured failure mode on Llama 4 Scout (2026-10-22 Class 6 Science demo): model stopped early (`finish: stop`) before required check/practice blocks under older order → v5 puts **required blocks first**. Large JSON-lines instructions increase prompt size.
5. **Temperature:** Workers set to `0.3` for structured adherence.
6. **No usage from provider:** Workers path `includeUsage: false` — token accounting may be estimated/word-counted in places.
7. **Sequential chain:** Platform tries providers in order; after first streamed token, no failover (`platform.test.ts` “no fallback once text has been shown”). With whole-answer Workers, failover only if call fails entirely.
8. **Gemini parked:** Adapter exists, `minorsEligible: false`, not in REAL registry — not a live alternative until founder configures + registers under Control policy.
9. **Not assumed:** Changing model alone fixes slowness; streaming/schema/prompt size/timeouts/cache are implicated by code evidence above. **No live TTFT numbers collected this audit** (no founder API keys exercised).

---

## 4. Recommended next slice order (brief §17)

1. **Slice 2 (next):** Additive typed gateway contract + registry hooks extending `adapters/types.ts` / `index.ts` / thin `gateway` module — **do not remove** existing adapters or `platform.ts` behavior.
2. Slice 3: Named Primary/Backup1/Backup2 workload routes, circuit, budget reservation, route revisions.
3. Slice 4: Control UX polish on `/control/ai` (overview, routing, health, Quality Lab).
4. Slice 5: Measured latency/quality vs founder-configured models.
5. Slices 6–7: Study reader + English verticals.
6. Slice 8: Hardening.

---

## 5. Baseline command results

| Command | Result | Notes |
|---------|--------|-------|
| `npm install` | OK | 326 packages; install-scripts warnings for esbuild/tesseract (informational) |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit 0) | ~38s after install |
| `npx vitest run test/ai` | **PASS** | 5 files, **61 tests**, ~6.2s |
| Full `npm test` | **Not run** this session (long suite; deferred) | Includes second vitest for `global-search.test.ts` |
| `npm run build` / lint | **Not run** | No dedicated lint script in `package.json` |

Pre-existing AI suite is green; no regressions introduced by documentation-only Phase Zero work.

---

## 6. Docs written / patched this Phase Zero

- `/workspace/netcyberai-core/docs/CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md` (new)
- `/workspace/netcyberai-core/docs/CLAUDE_UNIFIED_FOUNDER_EXECUTION.md` (new)
- `/workspace/netcyberai-core/docs/AI_GATEWAY_PHASE0_AUDIT.md` (this file)
- Supersession callouts prepended to `CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md` and `FOUNDER_57_IMPLEMENTATION_PLAN.md`

---

## 7. Blockers / non-blockers

- **Non-blocker for Slice 2:** Types/registry can proceed without API keys.
- **Founder later:** Enter credentials, choose models, Primary/Backup per workload; approve any production migrate/deploy/spend.
- **Do not:** Invent API keys, hardcode a permanent provider winner, fake live success, commit/push without ask.


---

## 8. Slice 3 follow-up (2026-10-27)

Implemented (uncommitted): Gemini family registered and selectable; `resolveWorkloadRoute` + `executeWithFailover` + circuit breaker; additive migration written but **not** applied. Details: [`AI_GATEWAY_SLICE3_NOTES.md`](./AI_GATEWAY_SLICE3_NOTES.md). Live traffic still `platform.ts`.
