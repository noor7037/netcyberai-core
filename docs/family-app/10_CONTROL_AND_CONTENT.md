# 10 — Control for every app, and one content library

**Status:** plan (C230-L, 2026-10-20). **Asked by the founder:** "From the NetCyberAI control panel we can access,
manage and monitor the parent app and the teacher app, change the APIs, and upload all syllabus, so school-linked and
individual parents use a single source."

This file settles what Control can change, how the apps are run from it, and how one central library of syllabus and
learning content serves teachers, linked families and standalone families alike. It extends `03` §7 (AI platform),
§9 (syllabus) and §12 (Control).

## 1. What Control changes, and what it never changes

| Control changes (data and settings, live within a minute) | Control never changes (code, through a PR) |
|---|---|
| Which modules are on, for whom (all, listed schools, a share of families, staff preview only) | Screens, logic, database structure, security rules |
| AI providers, models, routing, fallbacks, active prompt version, budgets, caps (`03` §7) | Prompt text itself: it is versioned in the repository; Control only picks the active version and its rollout |
| Credentials for outside services (sealed, write-only) | Any credential shown back on screen, in a log or in an export |
| Limits stored as data: free photo questions a day, vault storage, practice-partner minutes | Prices before the pilot evidence (`05` §4) |
| Content: syllabus catalog, topic packs, opportunities, career pathways, mock tests, through review and publish | Content that skipped review: nothing reaches a child as "reviewed" without a reviewer |
| A maintenance or notice banner per app, in English and Hindi | Messages to a named child or parent (the existing send-gate rules apply) |
| The oldest app version still accepted (older installs refresh at next open) | Pushing new code to phones: code ships by merge → CI → deploy, and the installed app picks it up at next open |

**Why code stays out of Control:** a panel that can change code is one stolen password away from changing it for
every child. Code goes through review, tests and the CI gate; Control changes only what is safe to change live, and
every change can be undone in one step (§7).

## 2. Control → Apps

One registry of the apps NetCyberAI runs, all from the same deployment:

| App | Where | Who |
|---|---|---|
| Teacher app | the phone shell of `/app` (docs/20) | teachers and school staff |
| School web | `/app` | principals and office staff |
| Family app | `/family` | parents and children |
| Control | `/control` | NetCyberAI staff only |

For each app, Control → Apps shows and sets:

- **Version:** the live build (commit and deploy time), the app shell version installed devices report, and how many
  active devices are on the latest (counts only).
- **Oldest accepted version:** an older shell is told to refresh before it calls any API.
- **Modules and rollout:** every module's flag with its audience (all, listed schools, a percentage of families, staff
  preview), its reason and its end date. The Teacher app's modules stay per school and per plan as today (C212);
  Control → Apps shows them together, it does not replace Control → Schools.
- **Kill switch** per module and per app, with a message shown in place of the screen.
- **Banner:** maintenance or notice text in English and Hindi, with a start and an end.
- **Health:** error rate, response time and failed requests per app and per API group over the last hour and day;
  page speed from our own first-party measure (no third-party tracker, no person in the record); the AI fallbacks
  and cap refusals; the review queues' age.
- **Usage:** active schools, teachers and families per day, as counts. Never a name, a child, an answer or a message.

## 3. Control → AI and Control → Integrations ("changing the APIs")

- **AI** (`03` §7, built in M1 thin): providers, sealed credentials, models per profile, routing and fallbacks,
  prompt-version rollout, budgets, caps, the minors check and kill switches. Switching provider or model is a Control
  change, not a code change, as long as an adapter for that provider exists. A new provider is one adapter in a PR.
- **Integrations** (extends today's `/control/integrations`): every outside service the platform calls (AI providers,
  the email sender, the video search API, WhatsApp, the payment gateway, speech services). For each: a sealed
  credential (write-only: "set on 20 Oct by Noor", never the value), a test button, health, quota used, and the date
  it should be rotated.
- **Sealing:** a credential is encrypted with a server key before it is stored and is decrypted only inside the server
  call that uses it. It never reaches the browser, a log or an export. Entering one needs the founder's authenticator
  (aal2) and writes an audit row.

## 4. Control → Content: one library for everyone

### 4.1 What the library holds

| Layer | Holds | Source |
|---|---|---|
| **Catalog** | Board → class → subject → syllabus version (academic year) → units → chapters → topics, each with a stable id, an English and a Hindi title, learning outcomes, and the official source with a "checked on" date | The board's official curriculum documents |
| **Topic packs** | Per topic: reviewed responses (per language and explanation style), practice items with misconception tags, diagrams as structured data, video picks, the English moment | Made by the Concept Resolver, then reviewed (`07` §4) |
| **Exam and future data** | Exam runways, mock tests (our own), opportunities, career pathways | Official notices, reviewed (`03` §10) |

`content.*` holds no child, family or school data. Anyone signed in may read published rows; only content roles write,
and only through Control.

### 4.2 How a syllabus gets in ("upload all syllabus")

1. A content editor uploads the board's official curriculum document (PDF), or a structured file (CSV), in
   Control → Content.
2. Extraction proposes units, chapters and topics with a confidence per line; unclear lines are marked, never guessed.
3. The editor corrects the draft; a reviewer who is not the editor approves it.
4. **Publish** makes it a numbered version. A new academic year is a new version, shown as a diff against the last.
5. Published versions go first to **staff preview**, then to everyone (§7).

**Licence rule:** we store the structure (titles of units, chapters and topics) and our own content. We never copy
textbook text: NCERT books are CC BY-NC-ND (`01`), and NetCyberAI is commercial. Uploading whole textbooks is refused.

### 4.3 Who reads it: one source, three doors

```
                Control → Content (catalog + topic packs, reviewed, versioned)
                 │                         │                          │
   school adopts a version         linked family reads         standalone family reads
   into its syllabus map           the school's map            the catalog version for
   (Setup → Syllabus)              through School Link         its board, class and year
                 │                         │                          │
   Teacher app: taught today,      same topic ids  ───────────►  same topic packs,
   logbook, Copilot drafts         → same topic packs            same cached responses
```

- **Schools adopt, they do not retype.** In Setup, the office picks "CBSE 2026-27, class 8, Mathematics". The
  structure is copied into the school's own syllabus map (`syllabus_units`), each row carrying its catalog topic id
  (a plain id, no foreign key across schemas, `03` §14). The school may reorder, remove, or add its own topics; an
  added topic has no catalog id and works from its title.
- **New versions never change a school silently.** The school sees "an update is available" with the diff, and
  applies it or not.
- **Linked families** read their school's map through School Link, so a child follows the school's order, and every
  topic with a catalog id reaches the same reviewed topic pack.
- **Standalone families** read the catalog directly. A family's own upload (`03` §9) is only for a book the catalog
  does not have; a structure confirmed by several families becomes a catalog candidate after review.
- **One reviewed answer serves everyone.** Responses are cached by topic, class, language, style and prompt version.
  Once a reviewer approves one, every family asking about that topic gets it, so quality rises and AI cost falls as
  coverage grows.
- **A correction reaches everyone.** A reported mistake withdraws the response at once (`07` §6); the fix is published
  as a new version, and offline packs refresh it when they next connect.

## 5. Roles

| Role | Can |
|---|---|
| `super_admin` (the founder) | Everything in Control; credentials and AI routing need the authenticator |
| `content_editor` | Draft and edit catalog lines and topic packs |
| `content_reviewer` (per subject or stream) | Approve or reject drafts in their subject; cannot approve their own edit |
| `ops_viewer` | Read Control → Apps health and usage; change nothing |

These are platform roles, never school roles: no school user can publish to the library.

## 6. Monitoring and alerts

| Signal | Alert to | First action |
|---|---|---|
| An app's error rate above its threshold for 10 minutes | The founder by email (WhatsApp after P4) | Switch the module off (§2), then fix in a PR |
| AI fallbacks or failures above threshold; a budget at 80% | The founder | Check usage by profile before raising a cap |
| A credential's test fails or nears its rotation date | The founder | Replace it in Control → Integrations |
| A review queue older than its target (`07` §4) | The reviewers | Clear the queue; coverage waits |
| An opportunity source unchanged past its check date | The opportunities reviewer | The item hides itself until rechecked |

Alerts carry counts and ids, never a child's data.

## 7. Every change is audited and reversible

- Every Control change writes an audit row: who, what, when, the reason, and the before and after for settings (ids
  only for content).
- Flags, AI routing, prompt-version rollout and content versions keep their history; "roll back" restores the
  previous one in one step.
- Content and AI changes roll out in stages: staff preview → a share of families → everyone.

## 8. Silent failures this design guards against

| Failure | Guard |
|---|---|
| A wrong catalog version reaches every child at once | Two-person publish; staff preview first; diff against the last version; one-step rollback |
| A school's map drifts from the catalog without anyone knowing | Catalog ids on every adopted row; "update available" with the diff |
| A credential leaks through the panel | Write-only fields; never logged; aal2 to set; audit row |
| An AI switch moves children's words to a provider not cleared for minors | The minors check refuses it (`03` §7) |
| A Control setting breaks an app | Kill switch, banner and one-step rollback; the setting's history shows who changed it |
| Two sources of truth for the same syllabus | The school map points at catalog ids; the family app never keeps a private copy of a catalog syllabus |

## 9. Where it is built (`07`)

| Piece | Milestone |
|---|---|
| Content schema, catalog import (CSV), review and publish, staff preview; Control → AI thin; Control → Apps v1 (versions, flags with audience, kill switch, banner); Control → Family counts | M1 |
| Catalog import from PDF with extraction; topic-pack review queues; Control → Apps health and usage; alerts; Copilot and Parent AI on the AI platform | M2 |
| School adoption of catalog versions in Setup and the Teacher app's syllabus map; "update available" | M3 |
| Exam runways, mock tests, opportunities and pathways in the library | M4 |
| Control → Integrations for every remaining service; credential rotation reminders | By M7 |
