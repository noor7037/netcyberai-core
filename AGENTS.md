# AGENTS.md — rules for every AI coding agent on this repo

Read by Claude Code (with `CLAUDE.md`), Google Antigravity and any other agent.
If this file and a task prompt disagree, say so in one line and follow the
safer rule.

## Read first, in this order
1. `docs/16_MASTER_ROADMAP.md` — operating model, standing rules (§3), phases,
   your lane (§4a).
2. `docs/17_MODULE_CATALOG.md` — every module, configuration and filters
   frameworks (§1a), the founder's E2E decisions (§3a), design system (§4),
   roles (§5).
3. `docs/10_DECISION_LOG.md` — before treating anything as a contradiction.
4. Antigravity only: `docs/antigravity/README.md` (setup, loop, task queue in
   `docs/antigravity/tasks/`, report template).
5. `CLAUDE.md` — PR-activity rule (applies to every agent: never subscribe to
   PR activity, comment on PRs or schedule check-ins without the founder's
   explicit yes).

## Lanes (never work outside yours)
- **Core lane — Claude Code, branches `claude/*`:** database, migrations, RLS,
  auth, jobs pipeline, integrations, API routes, settings / filters /
  custom-fields engines, security, `src/lib/contracts/**` (the typed contracts
  the Experience lane consumes).
- **Experience lane — Antigravity, branches `ag/*`:** app design system
  components, charts, motion, app shell visuals, module screens built against
  `src/lib/contracts/**` (typed fixtures until the API exists), Help Center
  content, EN/HI copy, visual checks.
  **Never edit:** `supabase/migrations/**`, `src/lib/auth/**`,
  `src/lib/jobs/**`, `src/lib/auth/db.ts`, `scripts/check_*`, `.github/**`,
  env files, secrets. Need a contract change? Stop and write the request in
  your PR description.
- Work in your own clone of the repo. Never share a working folder with
  another agent.

## Every change
- One PR per coherent slice (split above ~1,500 lines). Never merge; the
  supervisor merges. Never push to `main`. Never rewrite history.
- Git identity: `Claude <noreply@anthropic.com>` for Claude Code; Antigravity
  uses the founder-approved identity set in its clone.
- Before opening a PR: `bash scripts/ci_local.sh` passes all 20 steps; tests
  for new logic; screenshots at 390 and 1440 for UI; phones are
  responsive-native at 360/390/768/1024/1440 (`17` §4).
- Only logo tokens from `src/lib/design-tokens.ts`; AA contrast
  (`scripts/check_contrast.py`); motion off under `prefers-reduced-motion`.
- No fabricated numbers, names or claims in product UI (`scripts/check_claims.py`).
  Demo data lives only in `src/demo-fixture/**`.
- No secrets in code, logs, chat or PR text.
- Decision Log numbers: Claude Code from C110, Antigravity from C200.
- Report in the Transparent Output Template, with anything the founder must do
  listed first.
