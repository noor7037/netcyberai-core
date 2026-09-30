# Antigravity — start here

Kit for the **Experience lane** (C100, C101). Everything Antigravity needs
arrives with a normal clone of this repo, so there is nothing to copy by hand.

## 1. One-time setup (founder, ~5 minutes)

The helper folder **is** a git clone. It is never a loose folder of files, and it
is never shared with Claude Code's folder.

```bash
cd ~/Downloads                       # or wherever the helper folder should live
git clone https://github.com/noor7037/netcyberai-core.git netcyberai-ag-helper
cd netcyberai-ag-helper
git config user.name  "Antigravity (NetCyberAI)"
git config user.email "<founder-approved address>"
npm ci
```

Then open the `netcyberai-ag-helper` folder in Antigravity, pick a Claude model
for code tasks, and paste the prompt from §3.

`.env.local` is not needed for AG tasks: screens run on typed fixtures, not the
live database. Never give Antigravity production keys.

## 2. The loop, for every task

1. `git fetch origin && git checkout -b ag/<task-id>-<slug> origin/main`
2. Build only inside the task's **Allowed paths**.
3. `bash scripts/ci_local.sh` must pass every step. Add screenshots at 390 and 1440.
4. `git push -u origin ag/<task-id>-<slug>`. Then open a PR, or tell the
   founder the branch name.
5. The supervisor reviews and merges. Antigravity never merges, never pushes to
   `main`, never force-pushes, and never comments on or subscribes to PRs.
6. Next task: start again from step 1 on a fresh `origin/main`.

**If Antigravity has no GitHub access:** the founder runs step 4 from the same
folder. Do not zip the folder: a zip has no git history, so it cannot be reviewed
as a diff.

## 3. Prompt to paste into Antigravity (once per session)

```
You are the Experience-lane executor for NetCyberAI.
Read, in order: AGENTS.md, docs/antigravity/README.md, docs/16_MASTER_ROADMAP.md
§3 and §4a, docs/17_MODULE_CATALOG.md §2 and §4. Then take the first task in
docs/antigravity/tasks/ whose status is "Ready" and whose dependencies are merged.
Rules: work only on an ag/* branch from origin/main; only touch the task's
Allowed paths; never edit supabase/migrations, src/lib/auth, src/lib/jobs,
scripts/check_*, .github, env files or secrets; only colours from
src/lib/design-tokens.ts; no invented numbers or names in UI (demo data only in
src/demo-fixture/**); bash scripts/ci_local.sh must pass before you push.
Finish with the report in docs/antigravity/README.md §5. Founder actions go first.
```

## 4. Task queue

| ID | Task | Depends on | Status |
|---|---|---|---|
| [AG-1](tasks/AG-1_design_system.md) | App design system + gallery | — | Ready |
| [AG-2](tasks/AG-2_app_shell.md) | App shell: 8-group sidebar, mobile nav | Core PR-0 (`src/lib/contracts/nav.ts`) merged | Blocked |
| [AG-3](tasks/AG-3_coming_screens.md) | "Coming in P<n>" screens for every module | AG-1, AG-2 | Blocked |
| [AG-4](tasks/AG-4_help_center.md) | Help Center content (EN + HI) | AG-1 | Blocked |

The supervisor flips a task's status to Ready when its dependencies merge.

## 5. Report template (end of every task)

```
FOUNDER ACTIONS: <none | list>
Task: AG-n — branch ag/... — PR <link or "branch pushed, PR not opened">
Changed: <files, one line each>
ci_local.sh: <n/n passed>
Screenshots: <paths>
Contract requests for Core: <none | exact type change needed and why>
Decisions: <C2xx: one line each, or none>
Not done / risks: <honest list>
```
