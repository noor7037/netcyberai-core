# AI gateway and Study programme: evidence report (Z1, C384)

Build lead → the supervisor and Noor. This is the end-of-programme report in the format of the gateway brief's §19
(`docs/directives/CLAUDE_AI_GATEWAY_EXECUTION_BRIEF.md`). Only measured numbers appear; anything not run says so.

## 1. What was inspected

- **Repository** `noor7037/netcyberai-core`. Main is at `870368a8` (Waves 1 and 2 merged, plus G6). The Wave 3 stack is
  #358 → #359 → #360 → #361 → this PR, each with base main.
- **Routes:**
  - `/control/ai` and `/control/ai/lab`;
  - `/control/boards`;
  - `/family/study/chapter/[key]`;
  - `/family/english/live`, `/family/notifications`, `/family/profile` and `/family/future/*`;
  - the matching `/api/control/**` and `/api/family/**`.

## 2. What already existed and was reused

- The profile platform (`src/lib/ai/platform.ts`): sealed keys, the PII pre-processor, the daily cap, failover before
  the first streamed word, and typed `PublicBlock` answers.
- The family consent ledger.
- The voice path (speech to text).
- The English course.
- Typed blocks and the Study screens.
- `docs/37` §2 lists each, with where it lives.

## 3. What changed (by wave, with Decision Log rows)

| Wave | Slices | PRs | Decision Log |
|---|---|---|---|
| 1, the gateway | G0 provider switch, G1 adapters, G2 routing reliability, G3 the Control screen, G4 Quality Lab; G5 prices and probe; G6 model picker | #343–#348, #356 | C368–C373, C379 |
| 2, Study | S1 chapter reader, S2 tutor window and Learning Vault, S3 content studio, S4 curriculum selectors, S5 interactives and chapter tests | #349–#354 (merged as #357) | C374–C378 |
| Follow-ups (C230-AP) | photo notice v3; Control → Boards for the family boards | #358, #359 | C380, C381 |
| 3 | E1 live English tutor, H1 hubs and notifications, Z1 hardening | #361, #360, this PR | C382, C383, C384 |

## 4. The provider mechanism

Nothing is chosen for the founder.

- **Adapters:** anthropic, openai, gemini (AI Studio), vertex_ai, workers-ai, one OpenAI-compatible adapter with an
  admin-set https base URL (no private ranges, redirects or metadata hosts), and youtube. Each declares its
  capabilities: text, vision, stream, JSON, STT and TTS. An unsupported capability is refused.
- **Workloads:** 13 profiles. Each has Primary, Backup 1 and Backup 2. Every save is a revision, and rollback is one
  action.
- **Children's words:** one gate, the founder's clearance in Control, with a terms link, who and when (C368).
- **Health:** a probe every 15 minutes. The circuit opens after 5 failures and closes after a 60-second cool-down.
- **Ledger:** one row per attempt (cost only where a price is entered).
- **Failover:** by taxonomy, before the first word only.
- **Daily cap:** from Control; family voice seconds and photos per day as well.

## 5. Control guide

`AI_GATEWAY_RUNBOOK.md` covers the whole guide: add a key → test (it lists the vendor's model ids) → clear for
children's words → pick Primary and Backups from the picker → save (a revision) → roll back. It also covers the Quality
Lab and prices.

## 6. Study and English outcomes, and their capability fallbacks

| Flow | Without a provider | Narration and speech |
|---|---|---|
| Chapter reader (S1) | Reads fully. Narration uses the phone's own voice. | No server TTS: no adapter declares it. Diagrams, tables and interactives are never read aloud (tested). |
| Tutor window (S2) | Says not set up. History, attach and Vault work. | — |
| Chapter tests (S5) | Multiple choice works. Written answers need a provider. | — |
| Live English (E1) | Says "needs a speech service" (the acceptance test). | Turn-based only: no adapter declares duplex. The phone's voice reads the replies. |
| Hubs (H1) | Shells with national and state sections. No entries invented. | — |

## 7. Test evidence

All runs are local. GitHub CI runs `ci_local.sh` again on each PR.

| Command | Where | Result |
|---|---|---|
| `bash scripts/ci_local.sh --no-install` | the top of the Wave 3 stack | _filled after the run_ |
| `npx vitest run test/z1` | Z1 | 9/9. Without the Z1 migration, 2 fail: the catalog check and the sibling check. |
| per-slice targeted runs | each PR body | listed in each PR |

Baseline: main passed `ci_local` 26/26 on the Wave 2 top (the supervisor's run, C230-AP).

## 8. Measured benchmark

**None run.** The test site has no provider key yet, so no vendor call has been made and no latency, quality or cost
number exists. The Quality Lab is ready: 40+ synthetic cases in `data/ai-lab/`, a 1–5 rubric and export. It runs as
soon as two keys are saved.

## 9. Founder actions (real blockers only)

1. Save the keys you want to try in Control → AI, and test each.
2. Clear the ones whose terms you accept for children's words. Read the note beside the switch first.
3. Pick Primary, Backup 1 and Backup 2 per workload, and run the Quality Lab on two models.
4. A speech provider (for example Workers AI Whisper) is needed for voice input and Live English.

## 10. Known limitations

- No server TTS, no duplex and no streaming in Live English.
- No automatic spend alert, and no retention rule for the ledger.
- The tutor does not read attached files. There is no AI digitizer in the studio (staff digitize by hand).
- No hub content exists yet.
- The bell's dot ignores chapter-request changes.
- `/family/parent` loads 490 kB of first-load JavaScript, over the 200 kB family budget. This predates Wave 3.
- 3D (WebGL) has not been checked in a real browser on a phone.
- Second-reviewer publishing is not held yet. It is required before the first real school (C230-AP).
