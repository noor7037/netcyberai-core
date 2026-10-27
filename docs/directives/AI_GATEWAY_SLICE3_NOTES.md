> **Supervisor note (2026-10-27, HEAD 2f29e18f):** the code this file describes (gateway modules, Gemini registration, the Slice 3 migration, the new tests) was written in another workspace and never pushed. None of it is in this repository. Treat this file as a design note, not as a record of what exists. The plan that binds is `docs/37_AI_GATEWAY_AND_STUDY_PLAN.md`.

# AI Gateway — Slice 3 notes

**Date:** 2026-10-27 (Asia/Calcutta)  
**HEAD base:** `5c298ad` on `main` (uncommitted Slice 2+3 work preserved; no commit/push)  
**Briefs:** `CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`, `CLAUDE_UNIFIED_FOUNDER_EXECUTION.md`  
**Founder lock (this slice):** Provider-neutral; Gemini selectable (`gemini` / `gemini_studio` / `vertex_ai`); no auto-Primary; no fake live success; no prod migrate/deploy; testing phase — no new rate-limit/compliance hard-blocks in gateway code; secrets stay server-side.

---

## What changed

### Adapters (selectable)
- Registered in `src/lib/ai/adapters/index.ts` `REAL`: existing `gemini`, plus `gemini_studio`, `vertex_ai`.
- Files: `adapters/gemini.ts` (comment updated — no registration hold), `adapters/gemini-studio.ts`, `adapters/vertex-ai.ts`.
- `minorsEligible: false` retained as existing code metadata for child-word profiles (same as OpenAI). Control can still assign these to adult workloads; founder chooses. No new compliance gate in the gateway failover path.
- Vertex uses optional server env `AI_VERTEX_OPENAI_BASE_URL` (https + `*.googleapis.com` host only — SSRF hygiene, not a product rate limit). Missing URL → honest adapter failure, never fake success.

### Gateway routing / reliability
| Module | Role |
|--------|------|
| `src/lib/ai/gateway/routes.ts` | `WorkloadRouteConfig`, `resolveWorkloadRoute`, `routeConfigFromProfileChain` (maps `control.ai_profiles` primary + `fallback[]` → Primary/Backup1/Backup2) |
| `src/lib/ai/gateway/circuit.ts` | In-memory circuit breaker: closed / open / half-open |
| `src/lib/ai/gateway/failover.ts` | `executeWithFailover` + `isFailoverEligible` — max 3 attempts; retryable → next backup; non-retryable → stop; no fake ok |
| `src/lib/ai/gateway/registry.ts` | Declares all registered text adapters (gemini no longer “unregistered” special-case) |
| `src/lib/ai/gateway/index.ts` | Re-exports Slice 2+3 surface |

Live family traffic still uses `src/lib/ai/platform.ts`. Platform can call `resolveWorkloadRoute` + `executeWithFailover` later; this slice does not flip the switch.

### Additive SQL (not applied)
- `supabase/migrations/20261027153000_ai_gateway_slice3_providers_routes.sql`  
  - inserts `gemini_studio`, `vertex_ai` into `control.ai_providers`  
  - optional `ai_workload_routes` / `ai_route_revisions` / `ai_provider_health` for Slice 4  
  - **Do not apply to production without founder approval.**

### Tests
- Updated: `test/ai/compat-adapters.test.ts`, `test/ai/gateway-contract.test.ts`
- Added: `test/ai/gateway-failover.test.ts` (route resolution, taxonomy, circuit, failover scenarios, gemini registration)

---

## Remaining gaps (Slice 4+ Control UX)

1. Polished `/control/ai` overview: workload cards with Primary/Backup1/Backup2 selectors, promote/rollback, health badges.
2. Wire `ai_route_revisions` activation + audit; invalidate route cache.
3. Persist circuit state / fallback timeline UI (Quality Lab still later).
4. Optional: platform.ts feature-flagged call into `executeWithFailover` without breaking current chain.
5. Founder actions: enter keys in Control, choose models/slots, approve any prod migration.

---

## Verify commands (run this slice)

```bash
npm run typecheck
npx vitest run test/ai
```
