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
- **Every PR:** one coherent slice (split above ~1,500 lines);
  `bash scripts/ci_local.sh` passes every step; tests for new logic;
  screenshots at 390 and 1440 for UI. Never merge, never push to `main`, never
  rewrite history. No secrets in code, logs, chat or PR text.
- **Decision Log numbers:** Claude Code from C110.
- **Report** in the Transparent Output Template, founder actions first.
