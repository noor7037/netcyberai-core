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
