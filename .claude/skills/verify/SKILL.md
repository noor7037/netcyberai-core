---
name: verify
description: Verify a change in this repo the way CI does. Runs scripts/ci_local.sh (the exact mirror of .github/workflows/checks.yml), starts the dev server, and smoke-tests the running app with Playwright; for database work, applies migrations without drift and proves dev and prod still match. Use before every commit and PR, and whenever asked to verify, run CI or check that something works.
---

# Verify

Do these in order; stop and fix at the first failure. Report what ran and
its real output, never a paraphrase of what should have happened.

## 1. CI, locally

```bash
bash scripts/ci_local.sh
```

- Same steps, order and commands as `.github/workflows/checks.yml`;
  `scripts/check_ci_mirror.py` (a step in both) fails if the two drift. To
  change a check, edit `checks.yml` and copy the change into `ci_local.sh`.
- `--no-install` skips `npm ci` when `node_modules` is current (the
  SessionStart hook in `.claude/settings.json` keeps it current).
  `--list` prints the 20 steps.
- Stop any dev server first: the SEO audit step starts `npm start` on :3000
  and refuses to run when that port is taken.
- CI runs Node 20 and Python 3.12; the script prints a note when the local
  versions differ. A step that passes locally on another version still has
  to pass in CI.

## 2. Dev server

- Claude desktop app: `preview_start` with name `netcyberai-dev`
  (`.claude/launch.json`, `npm run dev` on :3000).
- Terminal: `npm run dev`. Production build: `npm run build && npm start`.
- Public pages need no environment. Sign-in, `/app`, `/control` and any API
  route that reaches the database need `.env.local` with the names listed in
  `.env.example` (`DATABASE_URL`, `APP_SESSION_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`). Never print or commit their values.

## 3. Smoke test (read-only)

```bash
bash .claude/skills/verify/smoke.sh                  # http://localhost:3000
bash .claude/skills/verify/smoke.sh https://<preview-url>
```

Checks public pages answer 200, `/app` and `/control` redirect to `/login`
without a session, and renders `/` and `/login` in headless Chromium through
Playwright 1.59.1 (fetched by `npx`, not a project dependency), saving
screenshots. In the desktop app the browser pane (`read_page`, screenshot)
covers the same ground for UI changes. The public website is frozen
(Version 1): a smoke failure on a public page is a regression to fix, never a
reason to change the page.

## 4. Database changes

- Every schema change is a file in `supabase/migrations/`, applied with the
  Supabase `apply_migration` tool under the file's own name (the part after
  the version). Never run DDL through `execute_sql`; that is how the drift
  Phase 0 fixed was created.
- `apply_migration` records the apply time as the version. After applying to
  dev, rename the file to the version `list_migrations` shows, so file and
  history match.
- Apply to dev (`unodnyyfqhxrbusbkite`) and prod (`rkpfkqpotmpupbjfambg`,
  `netcyberai-prod`), then run `scripts/catalog_snapshot.sql` on both: every
  category's count and hash must be equal. A difference becomes a new
  reconciling migration, never a hand-edit of either database.
- Run `get_advisors` (security) on both and compare with before.
- A migration that creates a SECURITY DEFINER function revokes EXECUTE from
  `public, anon, authenticated, service_role` explicitly: Supabase's default
  privileges grant it to the last three by name, so `revoke ... from public`
  alone leaves the function on the REST API (Decision Log C94).
- Behaviour proofs run as `app_user` inside a DO block that ends in
  `raise exception` so everything, including the harness's transaction-local
  `grant app_user to postgres with set true`, rolls back.

## 5. Before a PR

`security-review` on the diff, then `code-review` (medium); fix or justify
each finding; `bash scripts/ci_local.sh` green. Opening or merging a PR needs
the founder's explicit words; never subscribe to PR activity (CLAUDE.md).
