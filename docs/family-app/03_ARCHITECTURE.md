# 03 — Architecture

**Revised 2026-10-20 (C230-I):**
- the Concept Resolver pipeline (§6);
- the shared AI platform and its Control section (§7);
- the video finder (§8);
- syllabus ingestion (§9);
- opportunities and careers data (§10);
- entitlement classes in the registry (§2).

## 1. Shape

The family app is a **bounded module inside netcyberai-core**.
- **It shares:** the deployment, the database, the design system, the jobs runner and the **AI platform** (§7), which
  also serves the Teacher Copilot and Parent AI.
- **It keeps its own:** code area, database schemas, session type and Control section.

Every boundary below exists so the app can move to its own deployment and database later without a rewrite (`04`).

```
            ┌──────────────────── netcyberai-core (one Next.js app) ─────────────────────┐
 family ──▶ │ /family  /api/family/** ──▶ src/lib/family/** ──▶ SchoolLink ──▶ parent RLS │
            │                                   │                       (public.*)     │
            │                                   ▼                                       │
            │                        AI platform (src/lib/ai/**) ◀── Copilot, Parent AI │
            │                        profiles · adapters · budgets · audit              │
 staff  ──▶ │ /app  /control  ── Control → Family, Control → AI                          │
            └────────────────────────────────────────────────────────────────────────────┘
  Postgres: public.* (school)   family.* (family-owned)   content.* (catalog, reviewed items, opportunities, careers)
  Storage:  private bucket; family/<account>/… with short retention for raw uploads
```

## 2. Module registry

`src/lib/family/modules.ts` declares every family module (the rows of `02`). For each:

- `id`, `mode` (`standalone` | `connected` | `both`), `flag` (a Control switch), `screens`, `apis`,
  `dataSources`;
- `entitlement`, one of:
  - `school_info`: always free to a linked family (C1, C3–C10);
  - `learning`: per child per subject; free for one subject, Plus or school-sponsored for the rest (the resolver,
    practice, mastery, Tonight's practice, revision, past papers);
  - `public`: free (opportunities, career exploration, the weekly summary, English moments, the vault);
  - `plus`: Plus only (the 90-day English programme, custom syllabus set-up beyond the free subject, saved career
    plans, vault export).

**Grants (C230-L):** a child's access to a `learning` or `plus` module comes from one of: the free subject, Family
Plus, a school's sponsorship, or a time-boxed pack (an exam runway, a Board 30-day plan for one subject) with its end
date. Limits such as free photo questions a day are data set in Control (`10` §1), never constants in code.

The home, the menu and every API read the registry. A test fails if a `school_info` module is given any paid
entitlement (`05` rule 1).

## 3. Identity

| Decision | Reason |
|---|---|
| A **family account** is global (`family.accounts`), not a row of a school's `users`. | A standalone family belongs to no school. |
| Its session is a **separate claims type** (`role: 'family'`, the account id, no school) with its **own cookie** and guard. | A family session can never reach `/app`, `/control` or a staff API, and the reverse (docs/31 §3 rule 2). A route check holds it. |
| **Sign-in:** a one-time email code now (Resend is live); a WhatsApp code once WhatsApp is live (P4); passwords optional. | Works today. |
| C230-D's founder-made parent logins become family accounts linked to their guardian. | One identity model. |
| Deleting the account erases its `family.*` rows and storage objects and ends every school link. | DPDP right to erasure. |

## 4. School Link

The only path from a family account to school data.

1. **Issue:** the school office makes a single-use, hashed, 7-day connect code for a guardian (Students → guardian).
   Audited.
2. **Redeem:** the parent enters it. The server records `family.school_links` and one `family.child_links` row per
   mapped child.
3. **Read:** the server opens the existing tenant context **as that guardian** (role parent), so the parent RLS on
   every school table applies. Family code calls `SchoolLink` (`src/lib/contracts/school-link.ts`) and never runs
   SQL on `public.*` itself.
   - Methods include `today`, `fees`, `calendar`, `reports`, `notices`, `pulse`, `pulseReply`, `homework`,
     `material`, and `syllabus` (the school's `syllabus_units` for the child's class and subjects, read-only).
4. **Unlink:** by either side. Access ends in the same request. Nothing school-owned stays in `family.*` except
   documents the family saved to its vault (its copy) and the child's own progress records, which point to school
   topic ids and become inert.
5. **Later:** a WhatsApp code to the guardian's number on record, with the same neutral answers.

The school's consent ledger still decides what a linked child's school data shows.

## 5. Data

| Schema | Holds | Rules |
|---|---|---|
| `family` | accounts, consents, children, school and child links, entitlements, private syllabi (with versions), topic progress, check and practice answers, misconceptions met, saved responses, vault items, readiness checklists, saved career plans, English programme progress and assessments, reminders, notification preferences, AI usage, subscriptions | Forced RLS keyed to `app.current_account_id`. **No foreign key into `public.*`**: school, guardian, student and topic ids are plain uuids checked at link time. |
| `content` | the board catalog (board, class, subject, year, version → units → chapters → topics), reviewed resolver responses, misconception tags, video picks per topic, opportunities and their sources, the career pathway graph, English programme items and assessments, product prompt versions in use | No personal data. Published rows readable by family sessions; written only by Control roles and the jobs that create drafts. |
| `public` | the school system, unchanged | Read through School Link only. |

**Storage:**
- the private bucket under `family/<account_id>/inputs/` (photos sent to the resolver: deleted after 24 hours unless
  the family saves the response);
- `…/syllabus-uploads/` (deleted when the syllabus is confirmed, at most 7 days);
- `…/vault/` (kept until the family deletes).

Raw uploads never go into the database and never by WhatsApp.

**Minimisation:**
- A child is a first name, class, board, medium and state.
- Category, income band and gender are asked only for opportunity matching, with that purpose recorded.
- No Aadhaar, phone or photo of a child, ever; the 12-digit rule applies to every typed field and to text read from
  images.

## 6. The Concept Resolver pipeline

```
input (topic | search | question | photo)
  → 1 ingest      text normalised; photo → private storage → vision read (OCR fallback) → PII and Aadhaar screen
  → 2 context     match to a syllabus topic (school / catalog / private); class, board, language, past mistakes
  → 3 cache       reviewed response for this topic, class, board, language and schema version? serve it
  → 4 plan        choose blocks for this subject and question type (schema-constrained)
  → 5 generate    fill each block as JSON against its schema
  → 6 verify      schema check; numeric steps recomputed (math library); answer keys re-solved independently,
                  mismatches dropped; links only from allowlisted domains; reading level for the class
  → 7 render      our components only: markdown subset, KaTeX, Mermaid (strict mode), a function plotter,
                  geometry (a constrained construction vocabulary), timelines, outline maps, vetted simulation embeds
  → 8 learn       checks and practice update topic progress and misconceptions; revisits scheduled
```

- **Blocks are data, never code.** Each block type has a JSON schema and one component. Unknown types and unsafe
  fields are dropped. A test feeds script into every field.
- **Interactive components** are ours or from libraries whose licences allow commercial use (for example MIT-licensed
  plotting and geometry libraries).
  - Third-party simulations are embedded only from an allowlist with attribution, after their licence for our use is
    confirmed (gate L7).
  - GeoGebra and Desmos need commercial licences, so they are not used without one.
- **Images:** photos are read by the vision model through the AI platform; the existing OCR (English only) is the
  fallback. A photo with an Aadhaar number or card is refused (the existing upload rule). Faces are not stored or
  analysed.
- **Copyright:**
  - A photographed page is processed for the child's own question and deleted.
  - The cache stores our response keyed by topic, never the page.
  - Catalog content is titles and structure only.
- **Cost:**
  - Reviewed responses are served from the cache.
  - Generation is metered per account, with daily limits by entitlement.
  - Photos count more than text.
- **Promotion:** usage and reports rank unreviewed responses in Control's queue; a reviewer edits and approves; the
  approved version is cached and marked.

## 7. The AI platform (shared, owned by the platform lead)

One router for every AI feature in NetCyberAI. It is the "AI router" the automation plan names, not a second one. The
Teacher Copilot and Parent AI move onto it.

| Part | What it is |
|---|---|
| **Adapters, by capability** | `text`, `vision`, `speech_to_text`, `text_to_speech`, `realtime_voice`, `embeddings`; and non-AI content adapters such as `video_search`. One interface per capability; a vendor is an adapter, never a call inside a feature. |
| **Profiles, by feature** | For example `copilot.lesson_plan`, `parent_ai.home_help`, `family.resolve.plan`, `family.resolve.generate`, `family.resolve.verify`, `family.syllabus_extract`, `family.video_rank`, `family.career_explain`, `family.opportunity_extract`, `english.feedback`, `english.partner`. Each pins the provider and model with a fallback chain, the prompt version, token limits, the pre-processor policy, whether children's data may pass, and whether zero data retention is required. |
| **Credentials** | Entered in Control, sealed with a server key (the pattern used for WhatsApp and payment credentials), write-only, never sent to a browser. Realtime voice uses short-lived server-issued tokens. |
| **Budgets and quotas** | A platform monthly cap, per-school monthly limits (today's `monthly_tokens` plan limits), per-account daily limits by entitlement; at a limit, a clear message, never a silent failure. |
| **Health and fallbacks** | Latency and error rates per provider and profile; automatic fallback down the chain; a kill switch per profile. |
| **Rollout** | A percentage per profile version, by account bucket, audited, with a reason. |
| **Prompts** | Prompt text lives in the repository (a PR with before-and-after samples, `08` §7). Control chooses the active version and its rollout, and never edits prompt text live. |
| **Audit and usage** | `ai_usage` extended with the profile, provider and model; counts and tokens only, never prompt or answer text. |
| **Minors** | A profile that may carry a child's words is refused at start-up unless its provider is marked as permitted for minors (with zero retention where the provider requires it). |

## 8. The video finder

1. **Per topic and language, not per query.**
   - Search official and reviewer-approved channels first (by channel id), then the wider catalogue.
   - Fetch details for the candidates in one batch (duration, embeddable, made for kids, captions present, language).
   - Parse chapter timestamps from the description.
   - Rank with the `family.video_rank` profile on metadata only.
2. **Store** the top few in `content.video_picks` with the provider's data refreshed or dropped within its storage
   rules. Reviewers can pin, reject or add picks.
3. **Serve:** the resolver maps a query to its topic and shows that topic's pick, starting at the matching chapter when
   one exists.
4. **Quota:** about 100 searches a day by default. Warm the catalog gradually by topic, reuse results, and apply for a
   quota extension (a compliance review) before scale.
5. **Player:** the privacy-enhanced embed, related videos limited to the same channel, no autoplay, tap to load, and
   the note that YouTube may show ads and suggestions (`02` §5).

## 9. Syllabus ingestion

- **Catalog:** the central library in Control → Content (`10` §4): an editor imports a board's official curriculum
  document into `content` (units, chapters, topics), a second person approves, and it is published as a version per
  academic year. Schools adopt it, linked families read it through their school, standalone families read it
  directly: one source for all three.
- **Family upload:**
  1. Up to 5 images or a 10-page PDF of the contents or syllabus pages, into storage.
  2. `family.syllabus_extract` returns units, chapters and topics with a confidence per line.
  3. If 90% or more of the chapter titles match a catalog syllabus, the child is linked to the catalog version and no
     private copy is kept.
  4. Otherwise a draft private syllabus: low-confidence lines are shown as questions, never guessed. The parent edits
     and confirms, and each confirmation is a new version.
  5. The upload is deleted after confirmation, or after 7 days at most.
  6. The same structure confirmed by several families becomes a candidate for the catalog, after review.
- **School syllabus:** read through School Link. A school-side import from index pages is an ERP Setup slice that
  reuses this extraction.

## 10. Opportunities and careers data

- **Opportunities:** `content.opportunity_sources` and `content.opportunities`.
  - **Sources:** official URL, kind, cadence, last fetched, last changed.
  - **Opportunities:**
    - type and issuer;
    - eligibility rules (class, age, state, category, income, marks, gender, stream) plus the conditions in the
      notice's words;
    - dates, fees, canonical document types and steps;
    - official notification and application links;
    - status (candidate, verified, published, closed, archived), verified by and on, and a change hash.
  - **The flow:**
    - a weekly job fetches each source and detects changes;
    - `family.opportunity_extract` drafts fields, each citing its source text;
    - a person verifies and publishes in Control;
    - a nightly job closes and archives;
    - an item past its check interval is hidden.
  - **Not covered:** myScheme has no public API we found; scheme pages are linked to, never scraped.
- **Careers:** `content.career_nodes` (stage, qualification, exam, course, occupation by NCO-2015 code, skill) and
  `content.career_edges` (prerequisites, restrictions, typical duration, source URL, checked on, reviewer).
  - O*NET's skill taxonomy may be adapted under its CC BY 4.0 licence with attribution.
  - Labour data (PLFS, NCS) is stored as dated figures with their source.
  - `family.career_explain` may only describe routes the graph contains.

## 11. Consent (DPDP)

- **Purposes,** each granted by the parent before use:
  - `study_core`;
  - `school_link`;
  - `opportunity_matching` (category, income band, gender);
  - `photo_input`;
  - `english_programme`;
  - `voice_practice` (when piloted).
- The method is the one the lawyer approves under Rule 10 (gate L1). The ledger is `family.consents`.
- Withdrawing a purpose stops it at once.
- **No trackers:** no analytics or third-party trackers on family screens. Product metrics are server-side counts by
  module and day.

## 12. Control

**Control → Family:**
- an overview (counts only);
- modules and entitlements (flags with reasons);
- content review (resolver responses, misconception tags, catalog imports, video picks);
- opportunities review and source health;
- career pathways review;
- reported mistakes;
- school links (counts);
- subscriptions.

**Control → Apps, Integrations and Content** (platform-wide, C230-L): versions, flags with audiences, kill switches,
banners, health and usage for the Teacher app, school web and Family app; sealed credentials for every outside
service; the central content library with review and publish. Detail in `10`.

**Control → AI** (platform-wide):
- providers and sealed credentials;
- profiles with routing and fallbacks;
- prompt versions and rollout;
- budgets and quotas;
- health;
- usage by profile, school and day;
- kill switches.

Both sections are audited, and neither shows a child's data.

## 13. App shell

- A PWA under `/family`, with its own manifest and a service worker that never stores `/api`; sign-out clears it.
- A **data-saver mode:** text first, images on tap, video only on tap, offline download of today's practice set.
- The v5 design system with a family register; English and Hindi through `fam.` message keys.

## 14. Boundaries enforced by CI (`scripts/check_family_boundary.py`)

- Family code imports only:
  - its own area;
  - `src/lib/contracts/**`, `src/components/ui/**` and `src/components/app-ui/**`;
  - `src/lib/i18n/**` and the design tokens;
  - the AI platform's public interface;
  - the storage interface and the family database helper.
- School code never imports family code.
- Family SQL touches only `family.*` and `content.*`; school data comes only through `SchoolLink`.
- No feature calls a vendor SDK directly: AI and video calls go through the AI platform's adapters.
- Every `family.*` and `content.*` table has RLS enabled and forced.
