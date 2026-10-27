# Claude Code — Unified Founder Execution Brief (Top-Level Paste Target)

**Document purpose:** Single merged execution brief for Claude Code. Combines Founder-57 product locks with the provider-neutral AI Gateway / Control Panel brief. The founder selects providers and enters credentials in NetCyberAI Control Panel. Claude Code builds the complete mechanism, UX, failover, testing, and polished Study/English experiences — **not** the founder’s provider selection decisions.

**Project:** `noor7037/netcyberai-core`  
**Status:** **Top-level paste target** for Claude Code sessions. Primary orchestration doc.

**Detail companions (do not ignore):**
- Gateway / Control AI / failover / credentials / Quality Lab / “no fake success”: [`CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`](./CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md) — **wins on conflict** for those topics.
- Founder-57 Q1–Q57 locks & curriculum/reader/hubs: [`CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md`](./CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md), [`FOUNDER_57_IMPLEMENTATION_PLAN.md`](./FOUNDER_57_IMPLEMENTATION_PLAN.md).
- Content-layer schema & digitizer: [`CLAUDE_CONTENT_LAYER_DIRECTIVE.md`](./CLAUDE_CONTENT_LAYER_DIRECTIVE.md).
- Family AI hubs redesign: [`CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md`](./CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md).
- Sub-agents / model mix: [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) + root `CLAUDE.md` (≤5–6 sub-agents; Haiku / Sonnet / Opus; **no quality compromise**; targeted reads).

**Hard gates:** No production migrations / deploy / paid spend without Founder sign-off. No hardcoded permanent provider winner. No fake live provider success. Preserve working code; audit first. No commit/push unless a human explicitly asks after review. Preserve all uncommitted docs; never reset/clean/force.
---

## Testing phase — no premature restrictions (mandatory)

**Current stage is Founder testing.** Do **not** add unnecessary security guardrails, rate limits, compliance blocks, age/model-policy hard-blocks, or other restrictions that would prevent high-quality output or block the Founder from inserting, exchanging, and testing **any** API key from the Control Panel (`/control/ai`).

- Prioritize **high-quality product output** and **founder freedom to configure providers** over premature lock-down.
- Still: keep secrets **server-side / sealed** (never ship keys to the client, logs, or HTML) — that is basic credential hygiene, not a “block testing” guardrail.
- Still: no production migrate/deploy/paid spend without Founder sign-off.
- Still: never fake a live successful provider response.
- After testing, the Founder will instruct Claude Code **step-by-step** to set boundaries. Do not invent those boundaries now.
- Aligns with and **makes explicit** the existing no-preemptive-restriction / no hardwired provider-block rules for this testing phase.

---

## A. Merged founder intent (non-negotiable)

1. **Outcome:** Highly polished, production-intent Study and English-learning experience, with configurable AI providers and operational controls — an interactive **syllabus companion** (not book resale) covering Nursery–Class 12 and national/state/international boards (CBSE, ICSE, State, IB, IGCSE, NIOS, private publishers via Control digitization).
2. **Do not choose providers for the founder.** Implement a common adapter architecture. Authorized founder/admin adds credentials, selects models, sets **Primary / Backup 1 / Backup 2 per workload**, runs comparisons, and changes routing through Control Panel. No hardwired preference disguised as an engineering rule. No automatic hard-block of founder-chosen models based on guessed policy; the account owner is responsible for services they are authorized to use. Code must not bypass provider terms, quotas, or access controls, and must not invent arbitrary restrictions either.
3. **Consumer subscription ≠ API credits.** Reflect actual API account state and real test results. Never fake a live successful provider response. If a credential is missing: full UI + mocked automated tests + clear **Not configured** state.
4. **Configurable everything:** provider identity, credentials, model ID, base URL where supported, endpoint/API version, parameters, modality support, workload assignment. Capability declarations; test model+endpoint; never implement unsupported methods as successful no-ops.
5. **Three governance layers (Founder-57):**
   - **Control** content QA / digitizer / provider ops (`/control/content`, `/control/ai`, `/control/boards`).
   - **School / Teacher** (`/app`) — school-published syllabus sync to authorized matching students.
   - **Parent / Family** (`/family`) — child profiles, Study, Understand, English; `preprocess.ts` PII strip + `resolver.ts` `PublicBlock` schema validation on every child-facing AI path.
6. **Google + multi-provider:** Support Gemini (AI Studio & Vertex as separate adapters when registered), Cloud TTS/STT, Translate, YouTube Data API **when the founder configures them**, alongside OpenAI, Cloudflare Workers AI, Groq, Sarvam, DeepSeek, Anthropic, and OpenAI-compatible endpoints — all via Control, never hardcoded winners.
7. **Family AI unified window:** Shared tutor surface with mic + **Attach file** (size/MIME limits) + conversation tab; header Notifications + Career Hub / Exam Portal / Schemes shells (CSS/SVG light); no ChatGPT chrome; Parent/PIN under Profile/Settings; ≤~200 KB family first-load discipline (no new heavy animation/chart libs).
8. **Study interactive lessons + Spoken English live tutor:** Chapter Reader + Contextual Doubt Guru + English multi-turn voice/text with honest capability fallbacks.
9. **Founder testing stage:** Synthetic learner personas and synthetic study material for evaluation. User-facing UX must look refined. Never inject fixtures or fake success into normal user flows.
10. **No prod migrate/deploy/payment/recharge** without explicit Founder approval. Local/staging OK. Audit first; reuse; fill evidenced gaps only.

---

## B. Execution order (bind both briefs)

Follow gateway brief §17 slices; Founder-57 product work rides inside the relevant slices:

| Slice | Focus |
|------|--------|
| 1 | Phase Zero audit & baseline (matrix, Llama/generic-slow diagnosis, tests) |
| 2 | Provider-neutral gateway types + extend existing `src/lib/ai/*` adapters (additive) |
| 3 | Routing reliability: Primary/Backup1/Backup2, retries, circuits, budgets, ledger, rollback |
| 4 | Control Panel UX: overview, registry, credentials, workload router, health, Quality Lab |
| 5 | Quality/latency fixes vs founder-configured candidates (measured, not claimed) |
| 6 | Study reader vertical: chapter blocks, TTS flags, doubt drawer, visuals, progress, Content Studio |
| 7 | English conversation vertical: multi-turn, STT→LLM→TTS, personalization, fallbacks |
| 8 | Hardening: security/RLS/spend tests, a11y, docs, evidence report |

**Role standard:** Senior full-stack + AI platform + product design + reliability + learning UX + a11y + test lead. Autonomous on engineering; state precise blockers only. Quality bar = end-to-end refined product. No decorative buttons, no fabricated banners, no TODO-as-done for core features.

---

## C. Architecture pointers (see gateway brief for full text)

- **Single server-side AI Gateway** for every AI workload; UI never picks vendors.
- Layers: feature → Gateway → Workload Router → Adapter Registry → Credentials Vault → Reliability/Budget → Quality Lab → Persistence/Audit.
- Typed normalized request/response; adapter interface with `validateConfig`, `testConnection`, `getCapabilities`, `generate`/`stream`, `transcribe`, `synthesize`, `analyzeImage`, `estimateUsage`, `normalizeError`, `healthCheck` — unsupported methods must not no-op success.
- Workloads (seed): `study_explanation`, `chapter_generation`, `vision_ocr`, `visual_spec`, `speech_to_text`, `text_to_speech`, `english_conversation`, `translation`, `video_search`, `assessment_feedback`.
- Failover taxonomy + request algorithm + budgets + one-click promote/rollback: gateway brief §5.
- Data model: reuse `control.ai_*` / credentials; additive migrations only; RLS; founder approval for prod: gateway brief §6.
- Extend `/control/ai` (not a second console): overview, registry, credentials, routing, health, Quality Lab, audit: gateway brief §4.

---

## D. Product surfaces (carry forward)

### Study (`/family/.../study`, Understand)
- Curriculum selector Nursery–12; boards via `/control/boards`; Published / In progress / Queued / Supplemental / Unavailable — no dead ends.
- Full Chapter Reader: ordered blocks, sticky audio controls, auto-scroll, highlight only when timing exists, TTS only `tts_read_aloud` / narratable blocks.
- Contextual Ask-a-Doubt: server-resolved child context; text / push-to-talk / attach; locale EN/HI/Hinglish/regional; typed `PublicBlock`s — no arbitrary HTML/JS.
- Visuals: model returns typed specs; app owns SVG/Canvas/WebGL; lazy-load; DataSaver / no-WebGL 2D fallback.
- Progress & chapter tests: real attempts only; version-aware.
- Optional video: user-triggered; curated picks; missing key ≠ broken Study.

### English (`/family/.../english`)
- Upgrade existing course; multi-turn coherent session; push-to-talk; transcript correctable; TTS play/replay/speed; duplex only if configured adapter supports it; never claim pronunciation scoring from text-only STT; no background mic.

### Content Studio (`/control/content`)
- Intake → provenance → extract → ordered blocks → family-identical preview → validation → human review → publish/map → version history → honest parent-visible status. AI-assisted extraction + human QA; batch queues.

### Design / latency / cache / security
- Reuse Tailwind/tokens/shells; premium educational tone; mobile-first; a11y; no fabricated metrics.
- Measure TTFT, cache, attempts; stream when safe; cancel with AbortSignal.
- Cache scopes: shared reviewed content (no child names), per-profile history, TTS public assets, short-lived route cache, isolated evaluation cache.
- Secrets server-only; platform-admin for provider/route/budget/lab; tenant + child isolation; SSRF guards on custom base URLs.

---

## E. Tests, docs, DoD, final report

- Unit + integration + E2E with **mocked** providers for CI; separate founder-triggered live smoke with cost warning: gateway brief §15.
- ≥40 synthetic golden cases for Quality Lab when built.
- Mandatory: report baseline vs final for `typecheck` / `test` / lint / build; never claim unrun tests passed.
- Docs/runbook updates: gateway brief §16.
- Definition of done: gateway brief §18.
- Final response format (10 sections): gateway brief §19.

---

## F. Phase Zero start command

Begin with Phase Zero against the actual checkout (`docs/AI_GATEWAY_PHASE0_AUDIT.md`), then proceed through implementation slices. Do **not** reply with another plan only. Do **not** decide which AI provider the founder must use; implement the provider-neutral mechanism so the founder can decide and configure it in Control Panel.

**Now begin with Phase Zero**, then Slice 2 (gateway types + additive adapter/registry extensions) when the audit artifact is solid. Preserve uncommitted work. No commit/push unless authorized.


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

