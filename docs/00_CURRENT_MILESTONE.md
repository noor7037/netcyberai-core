# 00 — Current milestone

**Written by:** the build lead, for Noor. **Delivers:** the one file that says where NetCyberAI stands today.
**Rule:** the supervisor updates it at the end of every wave. Dates and numbers are those of `docs/10_DECISION_LOG.md`.

## Where we are (31 Oct 2026)

**Waves 6 to 11 merged:** the teaching engine, the premium Family identity, everything on by default, one-click
provisioning, the Leads screen, and the QA fixes of 30–31 Oct. Last merged: #391 (C417). Wave 12 is the docs and the
pilot scope marker (W12-D). C421 answers the Control re-test of 31 Oct: see `docs/AI_TUTOR_AGENT_PROGRESS.md` for
the item-by-item status and the three-wave plan for the Control tabs marked "Not built yet".

## What is live on www.netcyberai.com (the test database)

- **The public site** and the demo school.
- **The school platform** for principal, teachers and the office: students, attendance, fees, exams, AI marking,
  papers, WhatsApp messages, timetable.
- **The Family app** (`/family`): the Study feed with memory (C406, C413), the teaching planner and chapter retrieval
  (C407), visual answers with figure, steps, timeline, scene, chart, photo and video (C408, C414), the lesson identity
  (C412), the parent area in six sections (C400), School Link, English (the 90-day course and the live tutor),
  Future hubs, offline packs, the Learning Vault. Everything built is on by default (C398).
- **Control** (`/control`): AI gateway and dashboard, Quality Lab, Content library with coverage, Onboarding with
  one-click provisioning (C399), Leads (C403), Apps, Family, Billing, Monitoring.
- **AI testing phase:** testing mode is on (C404): no daily caps, every enabled provider read as cleared for
  children's words, the safety pre-check skipped. NVIDIA NIM is a provider. The founder switches it off in Control →
  AI before the Play Store release.

## What is next: the first real school

1. **Production cutover** to the real database, per `docs/18_PRODUCTION_CUTOVER.md` §0. The supervisor schedules it;
   nothing for you to do before then.
2. **Play Store:** the Android Family app on Google Play.
3. **Pilot scope:** choose the board, classes and subjects of the first school in Control → Content → Library
   coverage, so every unit shows Pilot or not (W12-D).

## Launch blockers (they need you or a third party)

| Blocker | Why it blocks |
|---|---|
| Lawyer review of privacy, terms, children's-data consent | Public launch (the pages say "Draft" until then) |
| NVIDIA's terms for children's words | Testing mode hides this gate; with it off, NVIDIA is refused for a child until you read and accept the terms |
| Server key rotation | The live site's key changes with the database at the cutover (docs/18) |
| Google Play developer account | The Android release |

## Your open decisions

- Which board, classes and subjects the first school uses (the pilot scope).
- Which AI provider stays Primary after the Quality Lab runs, once testing mode ends.
- The first school's name and the date of the cutover.
