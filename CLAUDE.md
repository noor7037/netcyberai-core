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
  `bash scripts/ci_local.sh` passes every step; tests for new logic;
  screenshots at 390 and 1440 for UI. Never merge, never push to `main`, never
  rewrite history. No secrets in code, logs, chat or PR text.
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

## Founder workload rule (C103)

- Do not give Noor dashboard, settings, password or connection-string tasks
  during the build. Do every step you can yourself. Ask Noor only for inputs
  that cannot exist without him (for example Razorpay sign-up at P3), and say
  plainly why the work cannot move without it.
- The production database cutover is **deferred to the very end**, before the
  first real school (docs/18 §0). Do not restart it or ask Noor for any of its
  steps until the supervisor schedules it.
