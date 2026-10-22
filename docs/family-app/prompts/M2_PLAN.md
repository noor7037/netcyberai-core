CONTEXT: From the Claude Code build lead to the supervisor and the founder (Noor). This is how M2, "the daily habit" (07 §1), is built: twelve slices as a stack of PRs on base main, after the English stack (#213–#237). Built by CLAUDE.md; Decision Log rows C275–C289 are reserved for M2.

# M2 build plan

## Decisions (C275)

- **Photos are never stored.** The homework helper reads a photo inside the request and drops it, so `03` §5's
  24-hour bucket is not built. What the server keeps between steps (the question it read, the hints, the worked
  steps) travels in a sealed token like a check item's (M1-5), never in a table. Stricter than the spec, and no
  deletion job to fail silently.
- **Revisits:** a wrong answer schedules the topic again after 3 and 10 days (Control settings). A return is done by
  a checked answer on the topic on or after its day. A wrong answer then schedules again; a pending return is never
  pushed later.
- **The day's plan** is built once per child per India day and kept for the day: due returns (oldest first), then
  weak topics, then the next topic of the syllabus, until the minutes Control sets (20 by default). It is done when
  every item has a checked answer that day. Missed days never pile up: tomorrow is built fresh, and a return that does
  not fit waits without a count of what was missed. M2b's Focus Lock reads "done" from here.
- **The weekly goal** counts days with the plan done, out of the parent's goal (5 of 7 by default). Never a streak,
  never "you broke it". **Badges** are for mastered topics only. **The reward jar** fills with plan days; the parent
  writes the reward and gives it; NetCyberAI holds no money.
- **Videos:** YouTube's key is entered in Control → AI like an AI key. Picks are ranked on metadata in code (no AI
  call), cached per topic and language for 30 days, and pinned or rejected by a reviewer. The search sends a topic's
  title, never a child's words.
- **Worksheets** print through the browser's print to PDF with a print stylesheet; the answer key is on its own last
  page, for the parent. No PDF library.
- **Shared content is written only by the server:** families write video picks and the search count through two
  definer functions the server calls with what the provider returned.

## Slices

| # | Slice | Owner | Needs | Done when |
|---|---|---|---|---|
| M2-1 | Schema: revisits, plan days, reward jars, day counts, weekly goal; video picks, channels and search count; settings; the YouTube provider; the homework and voice profiles | Lead | — | RLS with two accounts; staff reach nothing; the functions keep pinned and rejected picks and skip blocked channels; the minors check guards the new profiles |
| M2-2 | Revisits and the day's plan; the home opens on today's plan (the learning-first routine, R6 step 1) | Lead | M2-1 | A wrong answer brings a targeted explanation and a revisit; the plan is due returns, weak topics, then the next topic, within the minutes; done only from checked answers |
| M2-3 | Weekly goal, mastered-topic badges, the reward jar, the parent's weekly summary (three lines) and tonight's talk question | Agent | M2-2 | No streak, no leaderboard; the jar fills from plan days; the summary and question come only from checked answers |
| M2-4 | Worksheets: a practice set on screen and a printable one with the answer key last | Agent | M2-1 | Answers are checked on the server; the printout fits A4 at 360 px source; no PDF library |
| M2-5 | The video finder and the honest player; Control → Content → Videos (pin, reject, channels) | Agent | M2-1 | A video shows only when suitable, tap to load, privacy-enhanced embed, the note about ads and suggestions; no key, no video, no error |
| M2-6 | Photo and screenshot input, and the Socratic homework helper (L1 photo, L3); the vision capability on the AI platform | Lead | M2-1 | A photo returns hints or a clear refusal; never the answer first; the 12-digit and face screen; the photo is never stored; 3 a day by default |
| M2-7 | Voice input with `voice_practice` consent; the speech-to-text capability | Agent | M2-6 (platform) | No consent, no microphone; the audio is never stored; seconds a day capped |
| M2-8 | Interactive diagrams (graph, number line, fraction model, geometry) and in-house simulations with checked physics (L2) | Agent | M2-1 | The model fills fields only; our code computes every value; reduced motion respected |
| M2-9 | Offline chapter packs and the data-saver (L9) | Agent | M2-2 | A pack shows its size; answers made offline sync once; live AI, voice and video say "needs internet"; data-saver loads text only |
| M2-10 | Copilot and Parent AI moved onto the AI platform | Lead | — | Copilot works as before (its tests), now metered and capped by the platform |
| M2-11 | Control → Apps health, usage and alerts | Agent | M2-10 | Error rates and usage per app and AI profile; an alert when a profile fails or a cap is near |
| M2-12 | Catalog import from PDF with extraction; topic-pack review queues | Agent | M2-6 (platform) | A PDF becomes a draft catalog version for review, never published by the importer; reviewed responses are queued by how often they are asked |

Gates (07 §3): `/code-review` medium plus `/security-review` for M2-1, M2-6, M2-7 and M2-10; `/code-review` low for the
UI slices. Harness pictures of the changed family screens at 390 and 1440 px. The full `ci_local.sh` once on the top.

## Founder inputs M2 needs

- The AI key and a provider cleared for minors (already on the list): the homework helper and voice input use the same
  Control → AI screen as Understand.
- A YouTube Data API key, entered in Control → AI as the provider "youtube". Without it, responses simply show no video.
