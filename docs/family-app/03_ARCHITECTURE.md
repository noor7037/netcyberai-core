# 03 — Architecture

## 1. Shape

The family app is a **bounded module inside netcyberai-core**. It shares the deployment, the database, the design
system, the AI interface and the jobs runner, and it keeps its own code area, its own database schemas, its own
session type and its own Control section. Every boundary below exists so it can move to its own deployment and
database later without a rewrite (`04`).

```
             ┌──────────────── netcyberai-core (one Next.js app) ─────────────────┐
  family ──▶ │ /family (pages)  /api/family/** ──▶ src/lib/family/**              │
  parent     │                                      │            │                │
             │                                      ▼            ▼                │
             │                        School Link contract   AIProvider          │
             │                        (in-process today)     (no child data)     │
             │                                      │                             │
  staff  ──▶ │ /app  /control  /api/app/**          ▼                             │
             │                        parent RLS on school tables (public.*)      │
             └─────────────────────────────────────────────────────────────────────┘
   Postgres:  public.*  (school system)   family.*  (family-owned)   content.*  (catalog, no personal data)
```

## 2. Module registry

`src/lib/family/modules.ts` declares every family module (the S- and C-rows of `02`):

- `id`, `mode` (`standalone` | `connected` | `both`), `plan` (`free` | `plus`; every C-module is `free`), `flag` (a
  Control switch), `screens`, `apis`, `dataSources`.
- The family home, the menu and the APIs read the registry: a module whose flag is off, whose plan the family lacks, or
  whose mode does not match this child is neither shown nor served.
- A test fails if any `connected` module is given a paid plan (`05` rule 1).

## 3. Identity

| Decision | Reason |
|---|---|
| A **family account** is global (`family.accounts`), not a row of a school's `users`. | A standalone family belongs to no school. |
| Its session is a **separate claims type** (`role: 'family'`, `sub` = account id, no school) with its **own cookie** and its own guard. | A family session can never reach `/app`, `/control` or a staff API, and a staff session never reaches `/api/family/**` (docs/31 §3 rule 2). A route check script holds this. |
| **Sign-in:** email with a one-time code now (Resend is live); WhatsApp code to the account's number once WhatsApp is live (P4); Google sign-in later if the founder adds it. Passwords optional. | Works today without waiting on Meta or DLT SMS. |
| C230-D's founder-made parent logins become family accounts linked to their guardian record by a one-time migration. | One identity model. |
| Deleting the account erases `family.*` rows for it and ends every school link (DPDP right to erasure). | |

## 4. School Link

The only path from a family account to school data.

1. **Issue.** In the school app (Students → a guardian), the office makes a **connect code** for that guardian:
   8 characters, single use, valid 7 days, stored as a hash, audited. The school can print it, hand it over, or later
   send it by WhatsApp through the send-gate.
2. **Redeem.** In the family app, the parent enters the code. The server checks it, then records
   `family.school_links (account_id, school_id, parent_id, method, linked_at)` and one `family.child_links` row per
   child the guardian is mapped to in `parent_student_map`, matched to an existing child profile or creating one.
3. **Read.** To read school data, the server opens the existing tenant context **as that guardian** (tenant = school,
   role = parent, user = parent_id), so the parent RLS already on every school table applies (C230-D: every school table
   refuses a parent session unless a parent rule allows it, and a test fails if a new table is left open). The family code calls `SchoolLink` (`src/lib/contracts/school-link.ts`): `today(childLink)`,
   `fees(link)`, `calendar(childLink, month)`, and so on. It never runs SQL on `public.*` itself.
4. **Unlink.** By the family or the school. The link row ends, the guardian's family-app access ends in the same
   request, and nothing school-owned is kept in `family.*`. Documents the family chose to save to its vault before
   unlinking stay: they are the family's copy.
5. **Later (P4 live):** a WhatsApp code to the guardian's number on the school record as a second way to link. Same
   neutral answer for "not on record", "no consent" or "merged" (docs/31 §3 rule 4).

Consent stays the school's: a connected child's school data shows only when the school's consent for that child is on
its ledger (the family home's rule today).

## 5. Data

| Schema | Holds | Rules |
|---|---|---|
| `family` | accounts, children, consents, school links, child links, plans and practice history, doubts saved by the family, vault items, notification preferences, subscriptions | Forced RLS: every row carries `account_id`; restrictive policy `account_id = app.current_account_id`. **No foreign key into `public.*`**: school, guardian and student ids are plain uuids checked at link time, so the schema can move to another database. |
| `content` | board/class/subject/chapter/topic catalog, explainers, question banks, paper patterns, scholarships and exams, each with `status` (`draft`, `reviewed`, `published`, `retired`), reviewer, reviewed day and source URL | No personal data. Readable by family sessions only when `published`; written only by Control roles. |
| `public` | the school system, unchanged | Read by the family app only through School Link. |

Data minimisation:
- A standalone child is a first name, class, board, medium and state, plus category and income band only if the
  parent asks for scholarship matching, with that purpose recorded.
- No Aadhaar, phone or photo of a child, ever. The 12-digit rule (`public.no_aadhaar_number`) applies to every typed
  field.

## 6. AI

- **One door:** the existing `AIProvider` interface (C154) gains family kinds: `topic_explainer`, `question_bank`,
  `doubt_hint`, `weekly_summary`.
- **Library generation** (explainers, question banks) carries only board, class, subject, chapter, topic and
  language. Drafts land in Control's review queue; nothing reaches a family before a reviewer publishes it. One
  reviewed item serves every family: cost is per topic, not per child.
- **Doubts** carry the child's text, so a pre-processor removes names, phone numbers, emails, 12-digit numbers and
  addresses before the provider call. A CI test proves it, as the Copilot test does.
  - The reply is hint-first and marked as AI.
  - The doubt is kept only if the family saves it.
  - Usage is metered per account (`family.ai_usage`, counts and tokens only), with daily caps by plan and a monthly
    platform cap set in Control.
- **Stand-in provider** until the founder chooses a real one (gate L3): the whole flow is built and tested without a
  key.

## 7. Consent (DPDP)

- Before any child profile exists, the account holder confirms being the child's parent or lawful guardian and
  consents, per purpose: `study_core`, `scholarship_matching`, `ai_doubt_help`, `school_link`.
- The consent method is the one the lawyer approves under Rule 10 (gate L1). The ledger is `family.consents` (purpose,
  version, granted, withdrawn, method).
- Withdrawing a purpose stops it at once; withdrawing `study_core` offers account deletion.
- No analytics or third-party trackers on any family screen. Product metrics are server-side counts by module and day,
  with no person in them.

## 8. Control: the one place the family app is run

A new Control section, `/control/family`, for the founder and NetCyberAI staff roles:

| Screen | What it shows or does |
|---|---|
| Overview | Accounts, children, weekly active accounts, links per school: **counts only**, never a child |
| Modules and plans | The registry's flags per module and plan, with a reason on each change (audited) |
| AI | Spend by kind and day, caps per plan, the platform monthly cap, the provider in use |
| Content review | Explainers, question banks and paper patterns: draft → reviewed → published, with source and reviewer |
| Opportunities review | Scholarship and exam candidates from the weekly job, approved or rejected with the official link |
| Reported mistakes | Families' "Report a mistake" items, linked to the content row |
| School links | Codes issued and redeemed per school, failures by reason (counts) |
| Subscriptions | Plans, renewals and failures (Phase 6) |

Support needs no access to child data: a family's ticket carries what the family chooses to attach.

## 9. App shell

- PWA under `/family` with its own manifest and service worker (scope `/family`). It keeps static files and the last
  pages loaded, never anything under `/api`, and sign-out clears what it kept (docs/31 §3 rule 7).
- Design: the v5 system (C235-C) with a family register: warmer, more visual, larger type for younger classes. Same
  tokens; AA contrast; reduced motion honoured.
- Languages: English and Hindi at launch, through the message files (`fam.` keys).

## 10. Boundaries enforced by CI (`scripts/check_family_boundary.py`)

- Code in `src/lib/family/**`, `src/app/(family)/**`, `src/app/api/family/**` and `src/components/family/**` may
  import only:
  - its own area;
  - `src/lib/contracts/**`, `src/components/ui/**` and `src/components/app-ui/**`;
  - `src/lib/i18n/**`, `src/lib/design-tokens.ts`;
  - `src/lib/ai/provider.ts`, `src/lib/storage/file-storage.ts`;
  - the family database helper.
- School code may not import family code.
- Family SQL touches only `family.*` and `content.*`; school data is read through `SchoolLink` only.
- Every `family.*` and `content.*` table has RLS enabled and forced (the existing RLS check extended to both schemas).
