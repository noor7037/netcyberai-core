# AI gateway runbook (Z1, C384)

Build lead → the founder and whoever runs Control. What to do when the AI misbehaves, using only what is built (Waves
1–3, `docs/37`). Environment variable names only; no value is ever written here.

## How it fits together

- **Workload.** Each feature names a profile (`control.ai_profiles`): for example `family.resolver`,
  `family.homework`, `family.voice_input` and `exams.read_pages`.
- **Route.** A profile's route is **Primary → Backup 1 → Backup 2** (`provider_id`/`model`, then `fallback[0..1]`).
- **Revisions.** Every save is an immutable revision (`control.ai_route_revisions`). Rollback makes a new revision
  equal to the previous one.
- **Children's words.** A provider serves a profile that carries a child's words only when it is cleared in Control,
  with a terms link, who and when (C368). Clearing is the one gate.
- **Health.**
  - Health is probed every 15 minutes (cron `ai-health-probe`, `control.ai_provider_health`).
  - The probe also refreshes each provider's model list (`control.ai_model_lists`). That list feeds the model picker
    (C379).
  - The circuit opens after 5 retryable failures in a row and stays open 60 seconds; then one half-open trial runs
    (`src/lib/ai/gateway/circuit.ts`).
- **Ledger.**
  - Every attempt is a ledger row (`control.ai_usage_ledger`): provider, model, revision, latency, tokens and outcome.
  - The cost is filled in only when Control has a price for that model (`control.ai_model_prices`); otherwise it is
    `unknown`. The ledger never holds the words.
- **Failover.**
  - Before the first streamed word, a retryable failure moves to the next slot: timeout, network, 429, quota, 404 and
    5xx.
  - A refusal, a wrong key (401/403) or a bad request does not move to the next slot.
  - Once text has been shown, nothing switches. Two models are never stitched together.
- **Caps.**
  - The family daily cap is Control's `family.ai.daily_requests` (0–1000). The count is `family.ai_daily`, one place
    per request, taken atomically. A missing or non-numeric setting lets nothing through.
  - There are per-feature caps too: photo questions a day, and voice seconds a day.
  - The server voice (read aloud) has its own allowance per family per day, in characters: Control → Family,
    `family.voice.daily_characters` (20,000 to start; 0 turns it off). It is not counted against the daily requests (C388).
- **Server secrets** (names only): `AI_CREDENTIALS_KEY` and `AI_CREDENTIALS_KEY_VERSION` seal the stored keys; `SUPABASE_SERVICE_ROLE_KEY` is used for
  storage. Provider keys are typed into Control, never into the environment.

## Control: add a key, test, route, switch, roll back

1. Control → AI → the provider's card → enter the key → **Test**.
   - The test lists the vendor's model ids, used by the picker.
   - It never shows the key back; the screen shows it masked.
2. If the provider will hear a child's words, tick **cleared for children's words**. Give the terms link. Read the
   note beside the switch first.
3. On each workload card, pick **Primary, Backup 1 and Backup 2** from the drop-down. Free typing is kept and must be
   a model id, not a display name.
4. Saving makes a revision. **Roll back** on the card restores the previous one, after a confirm. Both are audited.
5. Control → AI → **Quality Lab** runs the synthetic cases on two models side by side. Lab results never reach a
   child's history or the shared cache (`test/z1/hardening.test.ts`).
6. Enter a **price** per model if you want cost in the ledger and the Lab.

## When something goes wrong

| What you see | Likely cause | Do this |
|---|---|---|
| Key test fails with "the key was refused" | Invalid or expired key | Make a new key at the vendor, enter it, test again. The route keeps its last good revision meanwhile. |
| Answers fail, and the ledger shows `model_unavailable` (404) | The vendor renamed or retired the model | Test the key to refresh the list, pick a current id on the card, save. Backups keep answering in the meantime. |
| Ledger shows `quota_exhausted` (402) or `rate_limited` (429) | The vendor's quota is spent | Backups take over automatically. Raise the quota at the vendor, or move a cheaper model to Primary. The family sees "try again later" only when every slot fails. |
| Every slot fails, so families see "try again later" | All backups are down, or all are uncleared | Check the provider cards (Circuit open, Quota, Not configured). Put a working, cleared provider on any slot. |
| Cost looks high | High use, or an expensive model | Read the ledger's cost per model (prices must be entered). Lower the daily cap, or move a cheaper model to Primary. **No automatic spend alert exists yet.** |
| Ledger shows `invalid_request`, or answers come back in the wrong format | The model ignores the JSON shape | Run the Quality Lab ("Format not kept" column). Choose a model that keeps the format. The output check refuses a malformed answer; it is never shown. |
| Answers or speech start slowly | A slow vendor or model | The ledger has latency per attempt. A profile with its own time (for example `exams.read_pages`, 90 s) shares it across its chain, so a slow Primary leaves less time for the backups. Move a faster model up. |
| A chapter shows the wrong board, class or subject | Bad mapping in the content studio | Control → Content: retire the published version (children's progress is kept), fix a new draft, review and publish it. |
| A route was changed by mistake | Human error | **Roll back** on the card, or use **Undo** on the audit line. The live site runs on the test database; the real-school database is untouched until the cutover (docs/18 §0). |
| A provider shows **Circuit open** | 5 failures in a row | Wait 60 seconds: one trial request goes through. If it keeps opening, check the vendor's status and the key. |

## Database notes

- Gateway tables are readable only by the platform role (`nca_super`). Families and schools hold no right on them.
  Revisions and the ledger cannot be changed or removed by any session role.
- **Rolling back a migration** means writing a new migration that reverses it. History is never rewritten. Every
  migration is applied to the test database first and its md5 checked against the file (the lead's flow).
- **Family tables** are own-account only, twice. Every table keyed by a child also narrows to that child on the child's
  own phone. `test/z1/hardening.test.ts` reads this from the catalog, so a new table is held to it automatically.

## Not built yet (honest list)

- No automatic spend alert, and no retention rule for the ledger.
- No live vendor call has been measured: there are no keys on the test site yet. Every benchmark number waits for the
  founder's keys and a Quality Lab run.
