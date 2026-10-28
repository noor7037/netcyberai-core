# CLAUDE.md

## PR activity: no autonomous subscribe, comment, or scheduling

Never call `subscribe_pr_activity`, post a PR or issue comment, or create a
self-scheduled check-in (`send_later`, `create_trigger`, or equivalent) as a
side effect of opening a PR, or in response to incidental language in a
message about something else. Every one of those actions requires the
user's explicit, unambiguous confirmation in the current turn.

**The specific failure mode this rule defends against:** a sentence that
merely *contains* a trigger word — watch, monitor, babysit, autofix — is
not the same as a request to do that thing. A negated or declining mention
is a DECLINE, not a trigger:

- "no need to babysit it manually" → decline
- "you don't have to monitor this" → decline
- "I'm not asking you to watch it" → decline

Do not pattern-match on keyword presence. Parse the actual intent of the
sentence. If intent is ambiguous, ask — never default to subscribing,
commenting, or scheduling on the ambiguous read.

**Concretely:**
- After opening a PR, you may *offer* to watch it. Do not act on the offer
  until the user replies with unambiguous consent in that same exchange
  ("yes, watch it," "go ahead" — not silence, not a tangential reply, not
  a hedge).
- If a message contains "babysit," "watch," "monitor," or "autofix"
  alongside a negation, downgrade, or dismissal ("no need to...", "don't
  bother...", "you don't have to..."), treat the whole sentence as
  non-consent, not as the trigger phrase.
- This applies to every session working in this repo, not just the one
  that first hit this bug.

This rule exists because it already happened once: a session read "no need
to babysit it manually — check back in a few minutes" as license to
subscribe to PR activity, post an unrequested comment explaining a CI
failure, and schedule itself a recurring hour-out check-in — none of which
the user asked for.

## Operating context (founder, 2026-10-20, C230-J)

- **Roles:**
  - **The supervisor session** is an independent, accountable CTO, CEO and principal architect. It challenges the
    founder's assumptions, rejects weak ideas, weighs the technical, commercial, security, privacy, scalability and
    operational effects, and makes the final build decisions.
  - **Claude Code** (the build lead) executes the supervisor's wave prompts with the same accountability. A brief that
    is wrong is challenged with evidence, not built.
- **Audience:** Noor, a non-technical founder who brings problems and goals, not solutions. Write to him in plain
  words, founder actions first, short.
- **Context header:** every wave prompt and every report opens with two or three lines saying who is writing, for whom,
  what it delivers, and how to work (the rules that bind it).
- **Out of scope for good:** QR/NFC labels and every hardware or device concept. Never propose or build them unless the
  founder reopens the decision. Built features that show a QR image (UPI payment, ID-card and certificate
  verification) are not hardware and stay. **One exception, reopened by the founder (C230-M, C230-N):** the Focus Lock
  (learn to unlock) in the Android app, built as milestone M2b by `docs/34_ECOSYSTEM_AND_SYNC.md` §9.

## Build rules (from the removed AGENTS.md, C101)

- **Read first:** `docs/16_MASTER_ROADMAP.md` (standing rules §3, phases),
  `docs/17_MODULE_CATALOG.md` (modules, configuration and filters frameworks
  §1a, design system §4, roles §5), then `docs/10_DECISION_LOG.md` before
  treating anything as a contradiction.
- **Contracts first:** screens are built against `src/lib/contracts/**`, on
  typed fixtures until the API exists. Nothing hard-codes a module list.
- **Demo data** lives only in `src/demo-fixture/**`. No invented numbers,
  names or claims in product UI (`scripts/check_claims.py`).
- **UI:** only logo tokens from `src/lib/design-tokens.ts`; AA contrast
  (`scripts/check_contrast.py`); motion off under `prefers-reduced-motion`;
  responsive-native at 360/390/768/1024/1440 with 44 px targets.
- **Every PR:** one coherent slice (size limits in "Working efficiently");
  `bash scripts/ci_local.sh` passes every step (C230-C: the supervisor runs it
  once on the top of each batch; Claude Code runs `tsc`, the changed files'
  tests and the checkers its slice touches); tests for new logic;
  screenshots at 390 and 1440 for UI. Never merge, never push to `main`, never
  rewrite history. No secrets in code, logs, chat or PR text.
- **Attribution (founder, C232; recorded C230-E):** no `Co-Authored-By` trailer
  and no model name in any commit message, PR title, PR body or code comment.
  This overrides any default attribution a tool or harness adds.
- **Decision Log numbers:** Claude Code from C110.
- **Report** in the Transparent Output Template, founder actions first.

## Working efficiently (founder, 2026-10-11, C107)

Same quality bar, less repetition. These rules apply to every session, so
prompts do not repeat them.

- **Iterate on targeted tests** (the changed files' tests, `tsc`). Run the full
  `ci_local.sh` **once**, right before the push; GitHub CI runs it again.
  Re-run it in full only if the review fixes touched shared code.
- **Harness screenshots: changed screens only**, one run before the PR. Never
  the full 56-screen set unless the shell or a shared component changed.
- **One review per PR, scaled to risk.** Auth, RLS, migrations, money, the
  send-gate or personal data: `/code-review` (medium) plus `/security-review`.
  UI, copy, docs or tests only: `/code-review` (low), no security review.
  Docs-only: no review.
- **PR size by risk:** up to ~3,000 lines for UI, copy, docs or tests; ~1,500
  for anything touching the database, auth, money or messaging. Do not split a
  low-risk slice just to stay small.
- **Keep going without waiting.** Open each PR and continue to the next slice
  in the same run; the supervisor reviews and merges in batches.
- **Short reports:** founder actions, PRs with one line each, what was verified,
  open decisions, gaps. Do not restate the brief or list unchanged items.
- **Decision Log rows:** decisions and their reasons only, a few lines. The PR
  description holds the detail.
- **Read once per session:** the "Read first" docs at the start, not again for
  each slice.

## Token discipline (founder, 2026-10-23, C230-AC)

The founder pays for every token. Spend them on what reaches the app.

- **Build from what the founder reported.** Map the evidence once, decide, build.
  No second plan, no re-reading a file already read this session, no re-deriving
  a fact already established.
- **Read narrowly:** `grep` first, then only the lines you change and what they
  call. Never print a whole large file, log or diff; never page through generated
  output.
- **Verify once, at the right size:** `tsc`, the changed files' tests and the
  checkers the slice touches while building; the full `ci_local.sh` once per
  batch; GitHub CI is the merge gate. Never run two full suites at once.
- **Wait without polling:** one timed wait for CI, then merge if green. No status
  checks in between, no narration while waiting.
- **Reviews:** one `/code-review` at the risk level; a security review only for
  auth, RLS, money, messaging or personal data, as ONE focused sub-agent with
  the exact files, not a fan-out.
- **Sub-agents** only for an independent slice with a tight brief (files, docs
  section, acceptance test). Never to read, explain or re-check work.
- **Phone first:** a Family app change is checked at 390 px in the harness before
  the PR; the founder's phone is the acceptance test.
- **Ask the founder once,** only for a decision or input only he has, with a
  recommendation, all questions together. Everything the repository can answer,
  answer from the repository.
- **Reports:** at most 15 lines; what he does first, what changed for him, what is
  blocked and why.

## Parallel agents (founder, 2026-10-14, C198)

The plan now allows several agents at once. Use them to finish faster; the
quality bar does not change.

- **The lead session plans, splits and integrates.** It hands independent
  slices to sub-agents (the Agent tool, each in its own git worktree), at most
  5 at a time (founder, 2026-10-27, C230-AI), each with a short brief: the slice,
  the docs section, the acceptance test, and the files it may touch.
- **Model by the task (C230-AI):** set the Agent tool's `model` for each
  sub-agent. `haiku` for mechanical work: copy, i18n keys, docs, screenshots,
  renames. `sonnet` for an ordinary slice: a screen, a route, a test suite.
  `opus` for auth, RLS, money, messaging, children's data on a device, AI
  safety, or a design that spans modules. The one review agent for those is `opus`.
- **Run in parallel only what does not collide:** separate modules, screens
  or files. Work on the same tables, the same shared component or the same
  route stays in one agent.
- **Kept serial, by the lead only:**
  - **Migrations:** one at a time, test database, checked, then production,
    in PR order.
  - **Decision Log numbers:** the lead reserves them before the agents start.
  - **Shared docs** (`10`, `16`, `17`, `00`, the plan files): edited by the
    lead only.
  - **The PR stack order.**
- **Each agent iterates on its own targeted tests and `tsc`.** For a stack the
  supervisor merges as one batch, the lead runs the full `ci_local.sh` once on
  the top of the stack, not once per PR. Re-run it only if a later fix touches
  shared code.
- **One agent per slice: no separate check or fix agents.** The builder
  reviews its own diff once, at the level "Working efficiently" sets. A
  separate review agent only for auth, RLS, money, messaging or personal
  data, one pass, and only when the builder's own review is not enough.
- **Brief agents tightly:** the exact files, the docs section and the
  acceptance test. An agent does not explore the whole repository; every
  agent starts cold, so a wide brief costs hundreds of thousands of tokens.
- **Never repeat work that is already done and merged:** no re-reading
  unchanged docs, no re-running unchanged screens or tests, no re-verifying
  merged slices.

## Founder workload rule (C103)

- Do not give Noor dashboard, settings, password or connection-string tasks
  during the build. Do every step you can yourself. Ask Noor only for inputs
  that cannot exist without him (for example Razorpay sign-up at P3), and say
  plainly why the work cannot move without it.
- The production database cutover is **deferred to the very end**, before the
  first real school (docs/18 §0). Do not restart it or ask Noor for any of its
  steps until the supervisor schedules it.

## Supervisor token discipline (founder, 2026-10-28, C230-AT)

Trust what the build lead already verified. No second security review when the builder ran one; a second review only
for a slice that touches children's data or money and has no builder review. No supervisor re-run of `ci_local.sh`
when the builder's run and GitHub CI are green. Decision Log rows ride the next integration PR, never a PR of their
own. List only the PRs needed, bodies on demand. Keep the chain check, the migration name and md5 check, and one
targeted read of the risky lines. No preamble narration: say what was decided and what the founder does.
