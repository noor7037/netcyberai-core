# Claude Code Execution Brief — Provider-Neutral AI Gateway, Control Panel & Premium Study/English

**Document purpose:** Detailed execution brief for Claude Code. The founder selects providers and enters credentials in NetCyberAI Control Panel. Claude Code builds the complete provider mechanism, settings UX, failover, testing, and polished product experiences — **not** the founder’s provider selection decisions.

**Project:** `noor7037/netcyberai-core`  
**Status:** Primary execution source of truth for AI provider/routing/Control AI UX and related Study/English product work.

**Supersedes (on conflict):** Provider-selection or hardwired-routing instructions in `docs/CLAUDE_FOUNDER_57_UNIFIED_EXECUTION.md`, `docs/FOUNDER_57_IMPLEMENTATION_PLAN.md`, `docs/CLAUDE_CONTENT_LAYER_DIRECTIVE.md`, `docs/CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md`, and earlier AI prompts. Those docs remain useful for curriculum/reader/hubs/content-layer detail; **this brief wins** on provider neutrality, gateway, Control `/control/ai`, failover, credentials, Quality Lab, and “no fake success”.

**Also follow:** root `CLAUDE.md` + `docs/CLAUDE_SUBAGENTS_ADDENDUM.md` (≤5–6 sub-agents, model mix, targeted reads, quality non-negotiable).

**Top-level paste companion:** [`CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`](./CLAUDE_UNIFIED_FOUNDER_EXECUTION.md) merges Founder-57 + this gateway brief for session starts.

**Hard gates:** No production migrations/deploy/paid spend without Founder sign-off. No hardcoded permanent provider winner. No fake live provider success. Preserve working code; audit first.
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

## 0. Founder intent and decision boundaries

1. The desired outcome is a highly polished, production-intent Study and English-learning experience, with configurable AI providers and operational controls.
2. Do not choose a single AI provider on the founder’s behalf. Do not hardcode a particular model as the permanent winner. Implement a common adapter architecture and let the authorized founder/admin add credentials, select models, set Primary / Backup 1 / Backup 2 per workload, run comparisons, and change routing through the Control Panel.
3. Do not assume that a consumer subscription includes API access or API credits. Reflect the actual API account state and real test results.
4. Keep provider identity, credentials, model ID, base URL where supported, endpoint/API version, parameters, modality support, and workload assignment configurable. A provider can be configured for one workload and not another.
5. Do not pretend all models support the same capabilities. Store capability declarations and test the specific model + endpoint combination.
6. The implementation must not bypass a provider’s terms, access controls, quotas, or service restrictions. Do not add arbitrary restrictions based on guessed assumptions either. Implement provider-neutral routing, explicit admin configuration and transparent operational status; the account owner is responsible for choosing services they are authorized to use. The code must not contain a hardwired provider preference disguised as an engineering rule.
7. Current stage is founder testing. Use synthetic learner personas and synthetic study material for evaluation runs. The user-facing experience must nevertheless look refined and behave like a real product, not like a throwaway demo. Never inject test fixtures or fake success states into normal user flows.
8. No production migrations, production deployment, payment-method changes, paid-plan upgrades, automatic recharge, or unapproved spending. Local/staging changes and tests are expected; require explicit approval before any production/destructive action.
9. Do not rebuild working features merely because the spec mentions them. Audit first, reuse existing service interfaces, components, schemas, RLS policies, authentication and design tokens, and then fill evidenced gaps.

---

## 1. Role and expected standard

Act as a senior full-stack engineer, AI platform architect, product designer, API reliability engineer, learning-experience designer, accessibility specialist and test lead. Make implementation decisions autonomously when they do not require founder product/business choices. If a blocker remains, implement the unblocked portion and state the precise blocker; do not ask repeated broad questions.

The quality bar is the full end-to-end experience: visually refined, responsive, fast to first useful content, accessible, personalized, coherent, resilient under provider failure, measurable, secure, and maintainable. No button may be decorative. No success banner may be fabricated. No placeholder response may be displayed as a real model answer. No TODO may be used to represent a core requested feature as complete.

---

## 2. Phase Zero — Audit the real repo before coding

At the beginning:

1. Print repository path, branch, HEAD commit, remotes (redact any embedded secrets), git status --short, and package manager.
2. Preserve all uncommitted work. Do not reset, clean, force checkout, overwrite unrelated changes or rewrite history.
3. Read the relevant code, tests, migrations, RLS, current docs and route conventions. Search the codebase rather than assuming filenames. Inspect at least:
   - Study routes and the Understand route/components.
   - UnderstandView, SyllabusList, SchoolSyllabus, and current reader/quiz/diagram/interactive/video components.
   - Family catalog, child syllabus, resolver, fill, modules/subject access, voice/TTS, STT, offline pack and progress logic.
   - AI provider registry/abstraction, existing adapters, prompts, preprocessors, credentials vault, daily caps, streaming, retries, caches and logging.
   - `/control/ai`, `/control/content`, `/control/boards`, admin shell/navigation and any settings forms.
   - Content library/resolver, `content.responses`, `content.syllabus_versions`, `family.child_syllabi`, progress/history schemas and their RLS/migrations.
   - Standalone `/family/english` route, its existing course structure, conversation/session state, microphone, recording, transcript, TTS and progress components.
   - DataSaverSwitch, offline/pack support, existing design tokens, icons, accessibility conventions and mobile navigation.
   - Docs under `docs/family-app/`, especially experience design, content/control, feature map and AI provider docs.
4. Run baseline typecheck, tests, lint and build using the repo’s actual scripts. Record what already fails before any edits.
5. Create a factual matrix: working and tested / partial / missing / unable to verify. Include file paths, symbols, schemas or test names.
6. Diagnose the generic/slow Llama behavior from evidence. Inspect model ID, prompt/context construction, retrieval, prompt size, max output, streaming and first-token delay, schema repair, sequential calls, retry behavior, timeout, caching, client rendering and provider errors. Do not assume changing a model alone fixes the issue.
7. Continue implementation after the audit; do not deliver audit-only output unless a genuine access blocker prevents changes.

Write the audit artifact to `docs/AI_GATEWAY_PHASE0_AUDIT.md`.

---

## 3. Required architecture: a provider-neutral AI gateway

Extend the project’s existing provider abstraction rather than creating a disconnected second system. A single server-side gateway should service every AI-related workload. Keep UI pages independent of the specific vendor.

### 3.1 Core layers

1. **User-facing feature / workflow:** Study explanation, chapter content generation, vision/OCR, voice transcription, TTS, live English conversation, translation, optional video search, diagram/interactive-spec generation.
2. **AI Gateway:** Auth/context checks, workload selection, budget reservation, input preprocessing, routing config resolution, cache lookup, provider attempts, streaming normalization, response validation, usage recording, error mapping and safe fallback.
3. **Workload Router:** Reads the active route config for the workload and environment; resolves Primary, Backup 1, Backup 2, model IDs and per-attempt settings.
4. **Provider Adapter Registry:** Vendor-specific adapters using a common typed interface. Support native protocol adapters and OpenAI-compatible APIs where appropriate. A model name and endpoint should be configurable, never hardcoded in the UI.
5. **Credentials Vault:** Encrypted/server-only credentials with rotation, status and audit history. Reuse the current credential mechanism if sound (`src/lib/ai/credentials.ts`).
6. **Reliability / Budget Layer:** Timeouts, capped retries, circuit breakers, rate limits, idempotency, quota/spend reservations, concurrency controls and telemetry.
7. **Quality Evaluation Lab:** Uses synthetic fixtures to run identical test cases across configured providers/models and compare outputs.
8. **Persistence / Audit:** Versioned route configuration, usage ledger, health history, test results and security-relevant admin audit entries.

### 3.2 Typed contract

Normalized **request** should contain: `requestId` and idempotency key; workload enum (`study_explanation`, `chapter_generation`, `vision_ocr`, `visual_spec`, `speech_to_text`, `text_to_speech`, `english_conversation`, `translation`, `video_search`, `assessment_feedback`); environment (evaluation/development/staging/production) and tenant/context IDs populated **server-side only**; authenticated actor and authorized child/profile context resolved by server code; locale/language/class/subject/chapter context; typed messages or input content; attachment descriptors; token/output/time limits; output schema/version; streaming preference and modality requirements; budget policy and cache policy resolved server-side (never trusted from client).

Normalized **response** should include: `requestId`, selected provider, selected model ID/version, route-config version, attempt count; status / stable normalized error code; streaming chunks or final typed response; input/output usage metadata (mark estimation separately from authoritative usage); latency (queue wait, cache lookup, TTFT/audio, per-attempt, total); estimated cost and data source or **unknown** when no verified price; cache hit/miss and fallback reason; schema validation outcome; safe debug metadata with **no secrets**, unnecessary PII, or full private prompts by default.

### 3.3 Adapter interface

Common interface for model capabilities, for example:

- `validateConfig(config)`
- `testConnection(config)`
- `getCapabilities(config)`
- `generate(request, config, signal)`
- `stream(request, config, signal)` when supported
- `transcribe(audio, config, signal)` when supported
- `synthesize(text, voiceConfig, config, signal)` when supported
- `analyzeImage(input, config, signal)` when supported
- `estimateUsage(request, config)` as a clearly labeled estimate only
- `normalizeError(error)`
- `healthCheck(config)` where safe and supported

**Do not implement unsupported methods as successful no-ops.** The capability registry must tell the router whether a configured model supports text, structured output, vision, streaming, embeddings, transcription, synthesis, real-time duplex audio, tool calls and other needed features. A workload may be assigned only to adapters that pass capability checks.

For real-time voice APIs, use a dedicated streaming/duplex contract rather than forcing them through a plain text-completion interface. Keep a fallback turn-based speech pipeline possible when a provider lacks real-time audio.

### 3.4 Adapter and provider configuration

Support:

- Provider display name and stable internal ID.
- API protocol/type, adapter name, model identifier, endpoint/base URL only where supported, API version and optional deployment/region.
- Credential reference (never raw key in route config).
- Model/workload capabilities, context/output limits where known, supported languages/modalities where verified.
- Timeout defaults and concurrency limits, overridable per workload within safe system maximums.
- Model parameters supported by that API (temperature, max output, top-p, reasoning effort, voice ID, language, etc.). Only expose applicable fields; don’t send unsupported knobs.
- Secret test status, connectivity test time, last test outcome, model availability timestamp, administrator status and notes.
- Cost settings/quotas only if entered or verified. Unknown cost must display **Not configured**, not falsely Free.

Provide a generic OpenAI-compatible adapter only if it can be safely constrained and tested. Custom base URL must be server-validated, restricted against SSRF/private-network targets, redirects and cloud metadata endpoints. Provider setup is **admin-only**. Do not allow untrusted users to choose arbitrary upstream URLs.

---

## 4. Control Panel — complete UX specification

Extend the existing `/control/ai` page and admin navigation using its current design system. Mature operations console density; never sacrifice clarity.

### 4.1 AI Control Center overview

Display: active routing environment and route-config version; workload summary with Primary / Backup 1 / Backup 2, route status, configured/healthy; provider connectivity states (**Not configured**, **Configured**, **Connection tested**, **Healthy**, **Degraded**, **Circuit open**, **Quota reached**, **Disabled**, **Last test failed**); recent requests, fallback events, latency percentiles, TTFT, error rate, cache hit rate, budget usage; usage/spend by school/tenant, workload, provider/model, day with uncertainty when estimated; explicit distinction between API configured, connection successful, model output quality evaluated, and operationally enabled; honest empty states — **no fake charts or made-up traffic**.

### 4.2 Provider Registry screen

Add/edit/disable provider adapters and model deployments: adapter selection from implemented registry; label, provider ID, protocol, model/deployment ID, region/endpoint options; credential selection/creation; capabilities with provenance (never fabricate); model parameters with validated bounds and reset-to-default; actions: Save, Test connection, Test sample output, Run benchmark, Disable, View history. Disabled adapters with historical usage are not deleted. Registry must **not** be artificially limited to three providers; three **routing slots** per workload are mandatory where three compatible configurations exist.

### 4.3 Credentials screen / add or rotate API key

Flow: choose provider and environment → enter API key/secret or cloud workload identity → validate format without logging → store server-side via sealed/encrypted store → immediately mask; never return original secret → optional Test connection (bounded, low-cost; warn quota may be consumed; not on every page render) → states: Missing, Saved—not tested, Test succeeded, Test failed, Rotation recommended, Disabled → rotate atomically with audit (no secret in audit) → delete/disable only after showing dependent workloads; block accidental deletion of last valid credential from active route without explicit confirm → optional test mode with synthetic input only.

Secrets must never appear in HTML, client bundles, React props, browser storage, URLs, exception text, console logs, analytics, error reporting, database plaintext or exported reports. Test redaction paths.

### 4.4 Workload Routing screen

Provider routing **per workload**, not one global Primary for all features. Each workload card: workload ID and purpose; capability requirements; Primary / Backup 1 / Backup 2 selectors; model/deployment ID and provider label; eligibility; health/latency/quota; timeout, max attempts, retryable errors, streaming/cache mode, output schema; Promote to Primary, Move up/down, Test route, Save draft, Activate, Rollback.

One-click promotion is a **transaction**: validate config + capabilities → reorder → validate budget → new route version → audit → atomic activate → invalidate route cache → confirm only after server success. On validation failure preserve old route. Support revisions and instant rollback; draft vs active distinct; live environments use existing admin permission model — changing routing does **not** imply deployment.

### 4.5 Workload catalog

Seed (reuse existing names where present):

1. `study_explanation` — contextual Doubt Guru.
2. `chapter_generation` — structured chapter/lesson content.
3. `vision_ocr` — image/textbook page understanding.
4. `visual_spec` — typed schema for diagrams/mind maps/interactive specs (not executable code).
5. `speech_to_text` — push-to-talk transcription.
6. `text_to_speech` — chapter and answer narration.
7. `english_conversation` — multi-turn speaking/listening; optional real-time duplex if adapter supports it.
8. `translation` — optional dedicated translation.
9. `video_search` — optional user-triggered curated retrieval (not generative fake search).
10. `assessment_feedback` — validated feedback/marking if separate routing helps.

Empty slots show **Not configured** with CTA. Missing optional routes degrade gracefully.

### 4.6 Health and telemetry screen

Per-provider/model health, last test/live request, success/error rates, p50/p95, TTFT, timeouts; fallback timeline; circuit state (closed/open/half-open) with permissioned override; quota status (Unknown if unqueryable); budgets and concurrency; filters; sanitized export (no secrets or raw child conversations).

### 4.7 Model Quality Lab screen

Founder/admin-only (server-authorized). Same synthetic fixtures across models; side-by-side outputs; optional blinding; TTFT/latency/usage/cost/errors; human 1–5 rubric dimensions (correctness, adherence, pedagogical completeness, naturalness, personalization, schema validity, visuals/practice usefulness, latency, reliability); cases for math, science, humanities, languages, English role-play, multi-turn, malformed JSON, timeout, quota, failover; versioned datasets; judge-model may triage but not sole acceptance; export JSON/CSV/Markdown; evaluation responses never leak into learner history / shared cache / published content unless deliberately published.

### 4.8 Audit and change history

Audit provider config, credential lifecycle (never values), route activation/rollback, budgets, tests, enable/disable, environment changes. Actor, timestamp, correlation ID, safe diffs, outcome. Avoid full prompts/private content by default.

---

## 5. Automatic routing and failover — explicit behavior

Failover is central in the AI Gateway. Front end never chooses backups and cannot override routing.

### 5.1 Error taxonomy

Normalize to: `AUTH_FAILED`, `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `CAPABILITY_MISMATCH`, `INVALID_REQUEST`, `CONTENT_REJECTED`, `OUTPUT_SCHEMA_INVALID`, `BUDGET_EXHAUSTED`, `CANCELLED_BY_USER`, `UNKNOWN_PROVIDER_ERROR`.

Do **not** fail over blindly. Network/timeout/5xx, 429 after bounded wait, exhausted quota, model-unavailable may trigger next provider if policy allows. Invalid input, user cancel, NetCyberAI auth failure, provider refusal, or app budget exhaustion must **not** cascade across all vendors by default. Credential errors mark deployment degraded and alert admin; cross-provider attempt is configurable policy with strict attempt/spend cap.

### 5.2 Request algorithm

1. Authenticate/authorize; resolve trusted profile/tenant server-side.
2. Validate size, MIME, context bounds, output schema.
3. Resolve workload route + active version; confirm modality/features.
4. Rate-limit; reserve estimated budget atomically.
5. Preprocess; never trust client for identity, secrets, tenant authority, or budget exceptions.
6. Cache lookup with versioned key (task, curriculum/content version, locale, model/prompt/schema version); avoid child names in shared keys/values.
7. Attempt Primary; record safe metadata.
8. If streaming: emit normalized events; on mid-stream failure do not invisibly concatenate another model’s answer — emit stable restart/fallback event.
9. On retryable error before useful output: cancel upstream, refund unused reservation, Retry-After/backoff, respect deadline, try Backup 1 then Backup 2 if allowed.
10. Max total attempts default ≤3 provider attempts (one per priority); same-provider retries separately bounded inside total.
11. Circuit breaker after consecutive failures/error rate; half-open probes after cooldown; no health request on every user request.
12. Validate output schema; at most tightly bounded repair (billable); further fallback only if no partial shown and policy allows.
13. Track actual usage; reconcile reservation; mark estimates explicitly.
14. Record success/error, latencies, cache, attempts, usage, route version — no secrets/full sensitive context.
15. Return stable normalized result including fallback flag; friendly message if all failed; **no fake answer**.

### 5.3 Timeouts, backoff and budgets

Per-workload request deadline and per-attempt timeout; bounded exponential backoff with jitter; honor Retry-After without sleeping past deadline; concurrency ceilings; idempotency keys; budget hierarchy system → environment → workload → school/tenant → user/profile (map if existing differs without weakening); soft thresholds (illustrative 70/85/100% — configurable, not universal facts); unknown pricing → show usage metadata, mark cost unavailable; failover never bypasses NetCyberAI spend cap; unknown-cost backup may be disallowed until admin sets allowance; degrade options: cache, cheaper configured model, graceful limit message, disable non-essential — never silently send to unapproved provider.

### 5.4 Manual switch and rollback

Validate credentials/capability/model/params/optional test; warn on degraded/unknown quota/unconfigured cost/untested; require confirm for known risks; immutable revision + audit + atomic activate + cache invalidate; show new order only after success; immediate Rollback; environment selection explicit (local/staging ≠ production).

### 5.5 Health checks

Distinguish low-cost probes from generative sample tests. Prefer provider health endpoints; else admin-scheduled bounded synthetic probe. Record method/time; 2xx ≠ quality proof. Health is workload/model-specific where possible.

---

## 6. Data model and migration guidance

Audit current tables first; reuse; no duplicate provider tables. Additive migrations with RLS, indexes, rollback notes, tests. Logical entities (map to project naming):

1. `ai_provider_configs` — no raw keys.
2. `ai_credentials` or existing sealed store — encrypted/vault ref, fingerprint, status.
3. `ai_model_configs` — capabilities, params, limits, state.
4. `ai_workload_routes` — Primary/Backup1/Backup2, timeouts, policies, schema/budget refs.
5. `ai_route_revisions` — immutable snapshots; never credentials.
6. `ai_provider_health` — probe, circuit state.
7. `ai_usage_ledger` — attempts, usage authoritative vs estimated, cost, route version.
8. `ai_budget_policies` — caps and degradation paths.
9. `ai_evaluation_runs` / `_cases` / `_results`.
10. `ai_audit_events`.
11. Optional key-validation history (no secrets/raw user data).

Requirements: correct FKs/enums/indexes; tenant isolation on usage; platform-only config for authorized platform admins; no weakened RLS; no service-role from client; optimistic version checks for concurrent admin edits; preserve student progress/content history; production execution requires founder approval.

---

## 7. Server endpoints / Server Actions

Follow existing Next.js conventions. Logical contracts — reuse equivalents if present. Every mutation: authenticated, role-checked, schema-validated, CSRF/origin protected as appropriate, rate-limited, audited.

**Admin:** list/create/update/disable providers; save/rotate/delete credentials (never read secret back); test connection/sample; capability metadata; list routes/revisions; save draft / validate / activate / promote / rollback; health/fallback/budget aggregates; circuit admin; evaluation run/score/export; budget policy update.

**Runtime:** submit study/conversation via gateway (client may **not** supply provider ID, API key, route, tenant authority, budget override, or system prompt); stream normalized events with cancel/abort + budget reconcile; validated attachments; voice STT/TTS; optional video search only on deliberate user action.

Stable non-sensitive error codes; no raw upstream stacks to ordinary clients.

---

## 8. Premium Study experience

Use IndiaSchool.ai and YoLearn.ai as **public interaction-pattern references only** — not code, content, branding, or architecture. Reproduce useful patterns in NetCyberAI’s design language.

### 8.1 Curriculum selector

Nursery, LKG, UKG, Classes 1–12; national/state/international boards; medium/regional language; class 11–12 streams. Reuse `/control/boards` and catalog. Distinguish Published & Ready / In progress / Queued / Supplemental / Unavailable. No dead ends: missing pack → contextual doubt + Control content request. Never pretend ad-hoc generation is the exact official textbook. Separate school canonical syllabus from parent-supplemental.

### 8.2 Chapter reader

First-class full-reader: breadcrumb, title, read time, progress; ordered blocks (narrative, worked example, key point, formula, chart/table/diagram, mind map, interactive, practice, optional video); sticky audio controls; auto-scroll; word highlight only when timing exists else sentence/paragraph — never fake word sync; seek on tap; TTS **only** narratable blocks; progress by stable chapter/version/block IDs; voice availability only after real support check; offline/DataSaver respect pack architecture.

### 8.3 Contextual Ask-a-Doubt tutor

Floating action → drawer/panel; inherit server-validated curriculum context; text / push-to-talk / attach; resolve learner from authenticated server context; personalize with first name naturally (inject at composition; shared cache free of identity); locales EN/HI/Hinglish/regional; coherent understanding response with typed PublicBlocks; stream/lazy optional parts; homework-help integrity rules; per-profile history; concise copy without repetitive boilerplate.

### 8.4 Visuals and interactive 2D/3D

Typed specs → app renderer; lazy-load; 2D/static fallback under DataSaver/no-WebGL/low power; never execute generated code; keyboard + reduced-motion; don’t force 3D when 2D is clearer.

### 8.5 Chapter tests and progress

MCQ/written, worked solutions, structured rubric feedback, photo when supported; deterministic arithmetic when possible; real progress only; version-aware history.

### 8.6 Optional video

User-triggered only; curated/reviewed picks; cache + quota; calm unavailable state if key/quota missing — must not break chapter/tutor.

---

## 9. Natural voice and English live conversation

Upgrade existing `/family/english` without replacing working curriculum modules.

### 9.1 Interaction

Personal greeting; conversation by level/goal/topic/situation; multi-turn memory; tap-to-talk with correctable transcript; natural TTS with real available voices; optional duplex only if configured; grammar/vocab feedback; distinguish acoustic pronunciation analysis from text-only — never claim pronunciation scoring from transcript alone; Try saying…; session summary; language/level adjust without wiping progress.

### 9.2 State and turn pipeline

Server-authorized session IDs; bounded context + summarize older turns; cancellation/barge-in; push-to-talk only; retention/consent; never label browser voices as premium/HD.

### 9.3 Cost and latency

Stream text when supported; TTS on sentence boundaries only if safe; cache reusable chapter narration; per-minute/session/daily limits with text fallback.

---

## 10. Content Studio and syllabus pipeline

Extend `/control/content`. Workflow: intake → provenance/rights → import/extract → ordered blocks → family-identical preview (incl. voice-exclusion) → automated validation → human review/publish/schedule/archive → map school vs standalone → version history → honest parent-visible status → missing chapter = contextual resolve + queue, never unreviewed model text as verified textbook. Batch queues + throughput metrics. Human QA with AI-assisted extraction.

---

## 11. User-facing design system and interaction standard

Reuse existing Tailwind/tokens/Radix-shadcn if present/lucide/shells. Premium, warm, educational, modern. Clear typography/spacing; refined empty/loading/error/success; responsive small Android → large displays; a11y (keyboard, SR, focus, touch, reduced motion, contrast); audio has text fallback; no repetitive AI disclaimers in every answer; purposeful personalization; **no fabricated** review counts, audio-ready badges, benchmarks, health, progress, or model output.

---

## 12. Latency and quality engineering

Measure: route resolution, cache, TTFT/first audio, total gen/render, attempts/fallback overhead, schema repair, content query, voice latency, UI long tasks. Optimize: versioned public cache; text first then lazy visuals; parallel safe calls; stream validated fields; bound output size; modular calls; AbortSignal; avoid polling/rerender storms; DataSaver / 2D fallback.

---

## 13. Caching and personalization correctness

Scopes: shared reviewed content (no child names); per-profile conversation; TTS public assets; short-lived provider/route cache (invalidate on activate); isolated evaluation cache. Inject greeting after shared retrieval. Test sibling/tenant isolation.

---

## 14. Security and authorization

Provider calls/credentials server-side only — never `NEXT_PUBLIC_*` / browser storage. Platform-admin for registry/credentials/routes/budgets/lab. Tenant + child isolation via server choke point + RLS. Sanitize attachments; never execute uploaded/generated code. Redact secrets/PII/prompts from logs. Rate limits; SSRF prevention for custom URLs. Do not claim all selectable providers are “approved/safe”; record config and observed test status accurately.

---

## 15. Testing strategy — required before calling work complete

### 15.1 Unit tests

Cover: secret encrypt/mask/no-leak; config validation; adapter normalize/error map; routing/failover matrix (primary success, timeout→backup, 429/quota, all fail, non-retryable, no stream concat, deadline, circuit, atomic route change, budget races); cache/data isolation; Study/TTS/tutor/video; English mic/states; Content Control intake→publish.

### 15.2 Integration / E2E

Mocked providers for CI. Separate founder-triggered live smoke with quota/cost warning. Verify: key save → test → route → promote → simulated failure → failover → rollback; Study E2E; English E2E; responsive breakpoints.

### 15.3 Quality evaluation

≥40 synthetic golden cases; deterministic math checks; founder scoring for pedagogy; report only measured results.

### 15.4 Mandatory checks

`typecheck`, lint, unit, integration, E2E, production build as project scripts allow. Report baseline vs final; separate pre-existing failures. Never claim unrun tests passed.

---

## 16. Documentation and operational runbook

Update established doc locations: provider/credential handling; workload routing + adapter contract; failover taxonomy/circuit/budget; Control Panel guide (add key → test → route → switch → rollback → investigate); Quality Lab rubric; Study chapter-block schema + narration flags + publish workflow; English architecture; env var **names only**; RLS/migration rollback notes.

Runbook cases: invalid/expired key; model renamed/unavailable; quota exhausted; all backups failed; high spend; schema-invalid output; slow TTFT/speech; bad chapter/curriculum mapping; route switched in wrong environment.

---

## 17. Implementation sequence

Work in vertical slices. Do not commit/push unless authorized.

- **Slice 1 — Audit & baseline:** matrix, Llama diagnosis, test baseline, plan.
- **Slice 2 — Gateway and provider config:** typed adapter registry, secret storage integration, provider/model registry, workload routes and validation. Keep existing adapters working while migrating (**additive**).
- **Slice 3 — Routing reliability:** Primary/Backup1/Backup2, retries, deadlines, circuit, budgets, ledger, telemetry, activate/rollback.
- **Slice 4 — Control Panel:** polished overview, registry, credential wizard, router, health, Quality Lab — functional only.
- **Slice 5 — Quality/latency fixes:** measured comparisons; improve prompts/context/streaming/caching/schema.
- **Slice 6 — Study reader vertical.**
- **Slice 7 — English conversation vertical.**
- **Slice 8 — Hardening:** security/RLS/spend/a11y/docs/build/evidence.

Do not create throwaway UI. Design route types and UI contracts before wiring; each slice is a working vertical increment.

---

## 18. Definition of done

Declare completion only when evidenced:

- Control forms save/retrieve non-secret config; keys masked and server-only.
- Founder configures compatible model per workload and Primary/Backup1/Backup2 without code edits.
- One-click promote/rollback audited and safe.
- Injected Primary failure → bounded observable failover; budgets enforced.
- No fake health/metrics/success banners in live UI.
- Quality Lab compares configured APIs on same synthetics; no invented prices/credits.
- Study reader/narration/doubt/visuals/practice and English work E2E through configured adapters with honest fallbacks.
- Names/histories server-resolved and isolated; shared cache never leaks identity.
- UI polished, responsive, accessible, real states.
- typecheck/tests/lint/build reported accurately.
- Docs/runbooks updated; migrations/RLS tested; no unapproved production deploy.

---

## 19. Final response format from Claude Code

At completion, provide:

1. What was inspected: branch/commit and relevant routes/files.
2. What already existed: verified reused features.
3. What changed: implementation areas and key files.
4. Provider mechanism: adapters, workloads, Primary/Backup, limits, health, rollback — without choosing a provider for the founder.
5. Control Panel guide: add key, test, select model IDs, routing, switching.
6. Study and English outcomes: flows exercised and capability fallbacks.
7. Test evidence: exact commands and pass/fail; baseline vs introduced.
8. Measured benchmark: only if run; model IDs, timestamp, rubric, latency, usage; state if no credentials.
9. Required founder actions: actual blockers only (API key, model choice, prod approval).
10. Known limitations: concise and factual. Do not label complete if only UI/schema exists.

---

**Now begin with Phase Zero against the actual checkout, then proceed through implementation slices. Do not reply with another plan only. Do not decide which AI provider the founder must use; implement the provider-neutral mechanism so the founder can decide and configure it.**
