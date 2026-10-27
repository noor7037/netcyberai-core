# Claude Code Directive (CTO-refined) — NetCyber Family AI Tutor Window + Header/Notifications + Three Public Hubs

**Repo:** `https://github.com/noor7037/netcyberai-core`  
**Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS + Storage), Capacitor Family shell  
**Audience:** Claude Code (or AGENTS task) implementing **UI/UX scaffolding + contracts + flags + empty hub shells** — not inventing exam/scheme/career body copy  
**Companion (separate):** [`docs/CLAUDE_CONTENT_LAYER_DIRECTIVE.md`](./CLAUDE_CONTENT_LAYER_DIRECTIVE.md) — lesson/content-layer scaffolding only. **Do not duplicate** lesson schema work here. Both directives may run in parallel; wire the unified AI window to subject context from Study when both exist.  
**Do not edit** `docs/CLAUDE_CONTENT_LAYER_DIRECTIVE.md` while executing this directive.

---

---

## Testing phase — no premature restrictions (mandatory)

**Current stage is Founder testing.** Do **not** add unnecessary security guardrails, rate limits, compliance blocks, age/model-policy hard-blocks, or other restrictions that would prevent high-quality output or block the Founder from inserting, exchanging, and testing **any** API key from the Control Panel (`/control/ai`).

- Prioritize **high-quality product output** and **founder freedom to configure providers** over premature lock-down.
- Still: keep secrets **server-side / sealed** (never ship keys to the client, logs, or HTML) — that is basic credential hygiene, not a “block testing” guardrail.
- Still: no production migrate/deploy/paid spend without Founder sign-off.
- Still: never fake a live successful provider response.
- After testing, the Founder will instruct Claude Code **step-by-step** to set boundaries. Do not invent those boundaries now.
- Aligns with and **makes explicit** the existing no-preemptive-restriction / no hardwired provider-block rules for this testing phase.

## Opening constraints (read first; non-negotiable)

### CTO-locked product decisions (bake these in; do not re-litigate)

1. **Single shared AI tutor React component** reused across **all** subjects — one component tree, parameterized by subject/context. **No** per-subject forks or copy-paste UIs.
2. **Conversation state lives in Supabase `family` schema** (persisted chat history per account + child + subject context). **Not** localStorage-only / device-only history.
3. **File uploads via Supabase Storage** with **explicit size and MIME limits**. UI label is **"Attach file"** only — **never** "Photo of a question" (or any photo-specific primary label).
4. **Voice via existing STT/TTS paths and keys already in the project** (`src/lib/family/voice.ts`, `/api/family/voice`, Capacitor TTS where present). **No** new heavy speech SDKs / Whisper clients / browser ML packs.
5. **Career Hub, Exam Portal, Schemes & Scholarships** ship as **lightweight CSS/SVG shells first**; bodies are content-fed later (same spirit as the content-layer directive: schemas + empty stubs + loaders).
6. **Keep the Family app light** per `docs/family-app/09_EXPERIENCE_DESIGN.md` (≤ ~200 KB JS first load for family screens; prefer CSS/SVG; do **not** add `framer-motion`, Lottie, GSAP, recharts, d3, or other chart/animation deps unless already in `package.json` — **they are not today**).

### Hard rules

- **NO ChatGPT chrome.** No "Ask ChatGPT", no "ChatGPT can make mistakes…", no Think/waveform OpenAI-style composer. Brand as **NetCyber Family tutor**.
- **NO stacked ask form.** Replace textarea + "Speak your question" + "Explain it to me" + separate "Photo of a question" card with **ONE input rail** (text + mic + Attach + send) plus a **Conversation** tab; full conversation mode keeps mic + attach available throughout.
- **NO inventing** official exam syllabi, scholarship legalese, career advice as final copy, or competitor scrapes.
- **PRESERVE** Study / Understand / English / homework / worksheets / offline / Focus Lock / School Link. Prefer **additive** flags in `src/lib/contracts/family-modules.ts`.
- **Header:** remove parent + lock entry from top-right of child-mode header; replace with unified **Notifications** center; add three **public** hub entry points (names exact): **Career Hub**, **Exam Portal**, **Schemes & Scholarships**.
- **Parent / Family lock is not deleted** — relocate under Profile / Settings ("Parent space" / PIN). Marked **CONFIRM WITH OWNER** below; validation must still prove secure family access control.
- **Phase the work.** Do not claim "entire app redesigned" in one unbounded PR.
- **Do not commit or push** unless a human explicitly asks after review. Do not deploy production.
- **REPORT AT END** using the Report back template.

---

---

---

## Standalone Family product & dual syllabus paths (mandatory)

The Family app is a **standalone monetizable product** for parents, not only an ERP companion.

### Two syllabus enablement paths

1. **NetCyber AI ERP school students**  
   If the child belongs to a school where NetCyber AI ERP is deployed, the **school’s uploaded/published syllabus** is enabled **by default** for all authorized students in that school/class (1-to-many via `schoolStudyFor` / school catalog sync). Do not require each parent to re-upload the same school syllabus.

2. **Standalone Family (no NetCyber ERP school)**  
   If the parent uses the Family app standalone (student not linked to a NetCyber ERP school), the **parent can upload the child’s syllabus from the parent app** — **photo capture or PDF**. NetCyber AI converts that intake into a readable, highly engaging interactive format (Control digitization / structured chapter companion) and enables it **for that parent’s child** (1-to-1 / `family.child_syllabi` / existing parent-syllabus-upload flow).

**Preserve the existing parent-syllabus-upload design** already built (or designed) by Claude Code — photo + PDF intake, status badges, Control queue. Extend and polish; do not rip out or replace with a dead-end.

### Control Panel toggle

In `/control/content` (and related admin controls), support an explicit **toggle / assignment mode** that switches per student (or school cohort) between:

- **Universal / board catalog content** (published packs available to matching board/class/medium), and  
- **School-specific syllabus** (ERP-published), and/or  
- **Parent-uploaded syllabus** (standalone intake → digitized companion)

Universal catalog and school/parent syllabi may coexist as tabs where product rules already allow supplemental subjects — never silently overwrite school canonical syllabus with parent supplemental (Founder 57). First-subject-free / Family Plus monetization (`subjectAccess`) continues to apply for standalone unlocks.

## Sub-agents, model mix, conflicts & reuse (mandatory)

**Full rules:** [`docs/CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md) — **in addition to** root [`CLAUDE.md`](../CLAUDE.md) Working efficiently / Token discipline / Parallel agents (keep those; do not discard).

- Launch **up to 5–6** sub-agents when complexity warrants; brief tightly; parallel only non-colliding slices.
- Mix **Haiku / Sonnet / Opus** by task to save tokens and time.
- **No compromise on output or work quality** — if a cheaper model would degrade the sub-task, use the stronger model.
- On conflicts (directives vs each other vs codebase): Claude Code has full end-to-end repo access; **resolve with the best approach you deem fit**, preferring additive changes and **reuse of existing components** from their current locations.
- Report sub-agent count, model mix, conflict resolutions, and reused paths in the Report back template.
- **Targeted reads only** (main + sub-agents): no full-codebase scans or redundant re-reads — see [`CLAUDE_SUBAGENTS_ADDENDUM.md`](./CLAUDE_SUBAGENTS_ADDENDUM.md). Rely on existing platform knowledge; open only paths needed for the current slice.

## Ordering vs content-layer directive

| Track | May parallel? | Coupling |
|-------|---------------|----------|
| Content-layer lesson schema / loaders / empty lesson shells | Yes | Independent |
| This directive: unified AI window + header + hubs | Yes for schemas/shells | **Unified AI window must accept Study subject context** (`subject`, child `firstName`, class/board) when wiring into Study |
| Filling hub/exam/scheme **bodies** | No (later content drop-in) | Same empty-status pattern as lessons |

When both land: Study subject page mounts the **shared** tutor component with `subject` from the active Study tab; Conversation rows key on `(account_id, child_id, subject)` (plus optional topic key later).

---

## Repo anchors (ground truth — verify in Phase 0)

### Current AI / ask / understand (REPLACE stacked UX)

| Area | Path |
|------|------|
| Study subject page (hosts ask + homework photo link) | `src/app/(family)/family/(app)/study/page.tsx` |
| Stacked ask form (textarea + speak + Explain) | `src/components/family/StudyQuestion.tsx` |
| Voice mic pill (reuse logic, restyle into rail) | `src/components/family/VoiceInput.tsx`, `src/lib/family/voice.ts`, `src/app/api/family/voice/route.ts` |
| Separate homework photo card labels | i18n `fam.homework.studyLink` / `fam.homework.studyLead`; link on Study page → `/family/study/homework` |
| Homework photo flow (keep as capability under Attach; retarget labels) | `src/components/family/HomeworkHelper.tsx`, `src/app/api/family/homework/**` |
| Understand block player (not open chat today) | `src/components/family/UnderstandView.tsx`, `/family/understand`, `/api/family/understand` |
| Home ask teaser card (entry to Study — keep, do not ChatGPT-ify) | `src/components/family/ui/HomeAsk.tsx` |
| Ask copy (replace / retarget) | `fam.study.ask`, `fam.study.askHelp` ("It is not saved."), `fam.study.askButton` in `src/lib/i18n/messages/{en,hi}.ts` |

**Snap A (replace this):** stacked white cards — textarea "Ask about anything in this subject" with default resize handle; helper "It is not saved"; pill "Speak your question"; button "Explain it to me"; separate card "Photo of a question".

**Snap B (replace this):** generic ChatGPT composer — "Ask ChatGPT", Think, mic, blue waveform; "ChatGPT can make mistakes…" disclaimer. Never ship this chrome in Family.

### Header / tabs / parent / lock / notifications

| Area | Path |
|------|------|
| Child-mode header (parent pill + lock SVG top-right — **remove from here**) | `src/components/family/FamilyHeader.tsx` |
| Bottom tabs (Home / Study / English / Future / Family→parent) | `src/components/family/FamilyTabs.tsx` |
| App layout (tabs, flags, session) | `src/app/(family)/family/(app)/layout.tsx` |
| Home page | `src/app/(family)/family/(app)/page.tsx` |
| Parent PIN gate | `src/components/family/PinGate.tsx`, `src/app/api/family/pin/**` |
| Parent area | `src/components/family/ParentArea.tsx`, `/family/parent` |
| Focus Lock (parent-space feature; not a child header icon) | `src/components/family/FocusSection.tsx`, `focus_lock` module |
| Push / notify prefs (parent-oriented today) | `src/components/family/NotifySection.tsx`, `src/lib/family/push.ts`, `/api/family/push`, `/api/family/notify`, migration `…_m3_8b_web_push.sql` |
| Icon set (includes `lock`) | `src/components/family/FamIcon.tsx` |
| Sub-page header | `src/components/family/SubPageHeader.tsx` |

### Modules / profile state / storage / design

| Area | Path |
|------|------|
| Module registry (prefer additive flags) | `src/lib/contracts/family-modules.ts` — existing stubs: `careers`, `opportunities` on tab `future` (`built: false`) |
| Module helpers | `src/lib/family/modules.ts`, `src/lib/family/flags.ts` |
| Child profile incl. `firstName`, `stateCode` | `src/lib/family/children.ts` |
| Indian states list | `src/lib/family/states.ts` → `src/lib/contracts/indian-states.ts` |
| Existing Storage pattern (school docs bucket — **do not reuse for Family child uploads**; mirror pattern) | `supabase/migrations/20260921133000_documents_storage_bucket.sql`, `src/lib/capture/storage.ts` |
| Experience / perf / motion policy | `docs/family-app/09_EXPERIENCE_DESIGN.md` |
| Product / feature map (M4 careers / scholarships mentions) | `docs/family-app/02_PRODUCT.md`, `11_FEATURE_MAP.md` |
| Family CSS tokens / motion | `src/app/(family)/family/family.css` |
| `package.json` animation/chart deps | **None** of framer-motion / lottie / gsap / recharts / d3 today — keep it that way for Phase 1–2 shells |

---

## Replace current AI UX — before → after

### Before (encode as broken; must disappear from Study subject ask surface)

| Element | Problem |
|---------|---------|
| Stacked white cards | Fragmented, unbranded |
| Default HTML textarea resize handle | Browser chrome, not a tutor surface |
| Separate "Speak your question" pill | Split input modes |
| Separate "Photo of a question" card | Photo-labeled primary CTA; inconsistent with Attach |
| Helper "It is not saved" | Contradicts persisted Conversation requirement |
| "Ask ChatGPT" / Think / waveform / OpenAI disclaimer | Generic competitor chrome; wrong brand |

### After (must ship)

```
┌─────────────────────────────────────────────────────────────┐
│  NetCyber Family tutor · {Subject} · Hi, {firstName}        │  ← never "Hi there"; never "Ask ChatGPT"
├──────────────┬──────────────────────────────────────────────┤
│ Conversation │  (persisted threads / turns for this child+  │
│   (tab)      │   subject; load from family.* tables)        │
├──────────────┴──────────────────────────────────────────────┤
│  [message stream / Understand blocks / tutor turns]         │
│                                                             │
│  ┌─ ONE input rail ───────────────────────────────────────┐ │
│  │  [Attach file]  [text field…]  [mic]  [Send]           │ │
│  └────────────────────────────────────────────────────────┘ │
│  Mic + Attach remain available in full conversation mode    │
└─────────────────────────────────────────────────────────────┘
```

**UX rules for the shared component**

- One React component, e.g. `src/components/family/tutor/FamilyTutorWindow.tsx` (name flexible; **one** export reused).
- Props include at least: `subject`, `childFirstName`, `classLevel`, optional `topicKey` / initial seed from Study/Understand.
- **Attach file** opens a file picker: images (jpeg/png/webp), PDF, common documents; optional study-material mime list documented in schema. No primary label "Photo…".
- Mic uses existing voice pipeline; transcript lands in the rail for edit-before-send (preserve consent + daily caps).
- Conversation tab lists persisted threads; selecting one restores turns. New ask creates/continues a thread in Supabase.
- Branding strings: NetCyber Family / tutor voice; AiNotice pattern may continue for AI-made vs checked content — never ChatGPT attribution.
- Subject colour from `subjectTheme` where helpful; still one component.

**Homework photo capability:** keep the **hint-not-answer** homework helper behind Attach (or a secondary action inside Attach sheet), but **retire** the Study-page standalone "Photo of a question" card as the primary entry. Retarget i18n keys; do not break `/family/study/homework` route.

---

## A. Unified AI Explanation window

### Implementation sketch (concrete files — adjust only if inventory finds better homes)

| Deliverable | Suggested path |
|-------------|----------------|
| Shared tutor shell | `src/components/family/tutor/FamilyTutorWindow.tsx` |
| Input rail (text + mic + attach + send) | `src/components/family/tutor/TutorInputRail.tsx` |
| Conversation tab UI | `src/components/family/tutor/TutorConversationTab.tsx` |
| Types + checkers (no Zod unless justified) | `src/lib/family/tutor/conversation.ts` |
| Server helpers | `src/lib/family/tutor/store.ts` |
| APIs | `src/app/api/family/tutor/conversations/route.ts`, `…/[id]/route.ts`, `…/messages/route.ts`, `…/attachments/route.ts` |
| Study mount | Replace stacked UI in `StudyQuestion.tsx` **or** thin wrapper that only mounts `FamilyTutorWindow` |
| Module flag | Additive: e.g. `{ id: 'family_tutor', tab: 'study', flag: 'family_tutor', entitlement: 'learning', built: true, milestone: 'CTO-AI' }` (exact id flexible; register once) |
| i18n | New `fam.tutor.*` keys; deprecate/redirect old ask helpers that say history is not saved |

### Supabase conversation persistence (`family` schema)

Suggested tables (names flexible; RLS must match existing family pattern: `(account_id, child_id)` + `family.current_account()` permissive+restrictive pair):

```sql
-- Sketch only — implement in a new migration under supabase/migrations/
-- family.tutor_conversations
--   conversation_id uuid pk
--   account_id uuid not null
--   child_id uuid not null
--   subject text not null
--   title text null
--   created_at / updated_at timestamptz
-- family.tutor_messages
--   message_id uuid pk
--   conversation_id uuid fk
--   role text check in ('user','tutor','system')
--   body_text text
--   blocks jsonb null          -- optional: reuse PublicBlock[] when answering via Understand
--   attachment_ids uuid[] null
--   created_at timestamptz
-- family.tutor_attachments meta (or store path on message)
--   attachment_id uuid pk
--   account_id, child_id
--   storage_path text
--   mime text
--   byte_size int
--   created_at
```

**Do not** claim Understand becomes free-form ChatGPT. Prefer: user turns persist; tutor replies may still go through existing Understand/resolver or a stub that returns empty/safe shells until product wires full multi-turn. Document the chosen bridge in the report. Conversation **history UI** must exist even if early replies are single-shot Understand responses.

### Storage uploads

- New **private** Family bucket (suggested id: `family-tutor`), **not** the school `documents` bucket.
- Enforce in **server** code (mirror `src/lib/capture/storage.ts` discipline): path prefixed with server-derived `account_id` / `child_id`; service-role only; signed URLs time-limited.
- **Limits (document in code + directive acceptance):** e.g. max **8 MiB** per file; MIME allowlist `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, plus `text/plain` / `application/vnd.openxmlformats-officedocument.*` only if you add and test them — prefer starting with images+PDF like the existing documents bucket.
- Daily/abuse caps: reuse or mirror homework photo / voice day caps patterns where sensible; require parent photo/voice consents already in ParentArea.

### Voice

- Reuse `VoiceInput` / `/api/family/voice` / `family.voice_input` profile.
- No new speech dependencies in `package.json`.
- Mic control lives **inside** the input rail, not a separate card.

---

## B. Header & access

### Child header changes (`FamilyHeader.tsx`)

1. **Remove** the top-right Link to `/family/parent` with lock SVG (`fam.home.parent`).
2. **Add** Notifications center control (bell or branded icon) opening a panel/sheet/route listing:
   - school alerts (existing school/pulse/notify kinds where available),
   - automation / career-guidance pushes (stub kinds OK),
   - academic updates (progress, homework notices — wire to existing notify kinds where possible).
3. **Add** three public entry points — homepage top-right **or** a clearly specified header/nav cluster (document exact placement in UI notes). Official names **exact**:
   1. **Career Hub**
   2. **Exam Portal**
   3. **Schemes & Scholarships**

Suggested routes (public to signed-in Family users; entitlement `public`):

| Feature | Route | Module flag (additive) |
|---------|-------|------------------------|
| Career Hub | `/family/career` or `/family/future/career` | extend `careers` **or** add `career_hub` |
| Exam Portal | `/family/exams` | add `exam_portal` |
| Schemes & Scholarships | `/family/schemes` | extend `opportunities` **or** add `schemes_scholarships` |

Prefer aligning with existing `future` tab modules (`careers`, `opportunities`) when possible; if homepage header entries are required in addition to Future tab, keep both behind the same flags. **National content visible to all**; state-specific schemes **only** when `child.stateCode` (or account profile state) is set — filter in loader.

### Parent / lock relocation — OWNER ASSUMPTION (CONFIRM WITH OWNER)

- Parent mode / Family PIN / Focus Lock are **not deleted**.
- Entry moves under Profile / Settings / Family tab ("Parent space"), still gated by `PinGate`.
- Bottom tab `family` → `/family/parent` may remain as the Profile/Parent space entry **or** be renamed in i18n to "Parent space" — choose one and document; do not leave orphaned PIN flows.
- **Validation checklist must still verify** PIN gate, lock/unlock (`/api/family/pin/lock`), Focus Lock parent section, and consent screens.

---

## C. UI/UX overhaul (phased)

Respect `docs/family-app/09_EXPERIENCE_DESIGN.md`: learning first; CSS/SVG/transform motion; `prefers-reduced-motion`; ≤ 200 KB JS first load; no new chart libraries for hub shells — use CSS/SVG diagrams and placeholder chart frames.

### Phase 1 — AI window + header/notifications + three hub shells (this PR scope)

1. Shared `FamilyTutorWindow` + input rail + Conversation tab + Supabase persistence + Storage attach.
2. Header: remove parent/lock icons; Notifications center shell; three hub entries.
3. Three hub **route shells** + schemas + empty JSON stubs + loaders + flags.
4. Docs updates under `docs/family-app/` (features / architecture / design notes).
5. i18n keys EN+HI placeholders.

### Phase 2 — Design tokens + motion across Family tabs

1. Token pass in `family.css` / shared primitives for cards, docks, tutor rail, hub shells.
2. Cohesive motion (CSS only) on Home / Study / English / Future / Family — no unbounded rewrite of English lesson player internals.
3. Polish Notifications + hub empty states.

### Phase 3 — Polish pass

1. Accessibility, reduced-motion, bilingual screenshots, Lighthouse budgets.
2. Content drop-in dry-run for one empty career pathway / exam listing / scheme listing.
3. Do **not** advertise "entire app redesigned" until Phase 3 acceptance is green.

---

## D. Documentation requirements

Update (or add short companion pages linked from) `docs/family-app/`:

- `00_INDEX.md` — link this work and the new routes.
- `03_ARCHITECTURE.md` — tutor conversations, storage bucket, notification center.
- `09_EXPERIENCE_DESIGN.md` — note tutor rail + hub shell visual rules (or add `13_AI_TUTOR_AND_HUBS.md` and index it).
- `11_FEATURE_MAP.md` — map Career Hub / Exam Portal / Schemes & Scholarships; mark scaffold vs content-fed.

Keep honesty: shells ≠ live curated national databases.

---

## E. Content policy (hubs / exams / schemes)

- Scaffold **TypeScript types + checkers + loaders + empty UI**.
- Stub lists may be **empty arrays**, or use **well-known public exam/scheme names as IDs/titles only** with `body.status: 'empty'` for detail — prefer empty over inaccurate claims. Mark stub files clearly (`status: 'empty'`, README: "content pending").
- **No** scraping competitors. **No** final scholarship legalese or career counseling paragraphs.
- State filter: `SchemeListing.scope === 'national'` → all users; `scope === 'state'` → show only if `stateCode` matches profile.

---

## TypeScript schema sketches (hand-rolled checkers; mirror english/course style)

```ts
// src/lib/family/hubs/types.ts  (sketch)

export type NotificationKind =
  | 'school_alert'
  | 'career_guidance'
  | 'academic_update'
  | 'system';

export type FamilyNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string; // ISO
  read: boolean;
  href?: string;
};

export type CareerPathway = {
  id: string;
  title: string;
  audience: 'all' | 'class_band';
  classMin?: number;
  classMax?: number;
  // viz: CSS/SVG shell ids only — no invented advice paragraphs
  flowSteps: { id: string; label: string }[]; // labels may be empty stubs
  chartSlots: { id: string; kind: 'bars' | 'flow' | 'cycle'; status: 'empty' | 'ready' }[];
  body: { status: 'empty' | 'ready'; summary?: string };
};

export type ExamListing = {
  id: string;
  title: string; // well-known public name OR empty stub
  tier: 'national' | 'institutional' | 'academic';
  classLevels: number[]; // empty => unspecified
  body: { status: 'empty' | 'ready'; overview?: string };
};

export type SchemeListing = {
  id: string;
  title: string;
  scope: 'national' | 'state';
  stateCode?: string; // required when scope === 'state'
  deadlines: { label: string; at: string }[]; // prefer [] until verified
  body: { status: 'empty' | 'ready'; overview?: string };
};

export type TutorConversation = {
  conversationId: string;
  childId: string;
  subject: string;
  title: string | null;
  updatedAt: string;
};

export type TutorMessage = {
  messageId: string;
  conversationId: string;
  role: 'user' | 'tutor' | 'system';
  bodyText: string;
  attachmentIds: string[];
  createdAt: string;
};
```

Drop-in folders (suggested):

```
content/hubs/careers/*.json      # status empty
content/hubs/exams/*.json
content/hubs/schemes/*.json
content/hubs/README.md
```

---

## Concrete file checklist by phase

### Phase 1

- [ ] `FamilyTutorWindow` + rail + conversation tab components
- [ ] Replace `StudyQuestion` stacked form with shared tutor mount
- [ ] Migration: `family.tutor_*` + RLS; Storage bucket `family-tutor`
- [ ] APIs for conversations / messages / attachments
- [ ] Flag `family_tutor` (or equivalent) in `FAMILY_MODULES`
- [ ] `FamilyHeader`: remove parent/lock control; add Notifications + hub entries
- [ ] Notifications center UI shell (read API stub OK if push kinds not all ready)
- [ ] Routes + shells: Career Hub, Exam Portal, Schemes & Scholarships
- [ ] Hub schemas + empty stubs + loaders + state filter for schemes
- [ ] i18n `fam.tutor.*`, `fam.notify.center.*`, `fam.hub.*` (en + hi)
- [ ] docs/family-app updates
- [ ] Retarget/remove Study "Photo of a question" primary card; Attach-only label

### Phase 2

- [ ] Visual system polish tokens + CSS motion across Family tabs
- [ ] Tutor + hub visual cohesion pass

### Phase 3

- [ ] Polish + validation screenshots + perf budgets
- [ ] Content drop-in dry run (empty → ready fixture without inventing legal copy)

---

## Acceptance checklist (before deploy)

### AI tutor

- [ ] One shared component used for every subject (no per-subject UI forks)
- [ ] Input rail includes mic + **Attach file** + send; no "Photo of a question" primary label
- [ ] Conversation tab shows history loaded from Supabase `family` tables
- [ ] Full conversation mode retains mic + attach
- [ ] Header/context shows **subject name + student `firstName`** — never "Hi there", never "Ask ChatGPT"
- [ ] No ChatGPT disclaimer / Think / waveform chrome
- [ ] Uploads hit Supabase Storage with enforced size/MIME; paths not client-trusted for tenancy
- [ ] Voice uses existing STT path; no new heavy speech deps
- [ ] Study / Understand / English / homework routes still function

### Header / hubs / access

- [ ] Parent + lock icons gone from child header top-right
- [ ] Notifications center reachable; lists school / career-guidance / academic kinds (stubs OK)
- [ ] Career Hub, Exam Portal, Schemes & Scholarships publicly reachable to signed-in Family users
- [ ] National schemes/exams visible without state; state schemes filtered by `stateCode`
- [ ] Parent space / PIN / Focus Lock still reachable and secure (relocated, not deleted)
- [ ] Hub bodies empty/placeholder — no invented official syllabi or scholarship legalese

### Engineering

- [ ] Additive flags in `family-modules.ts`; Control switches respected
- [ ] `npm run typecheck` passes; targeted tests for schema checkers + state filter
- [ ] Family first-load JS budget not blown by new chart/animation libraries
- [ ] docs/family-app updated
- [ ] Report back template completed

---

## Out of scope

- Implementing full multi-turn LLM product policy beyond scaffolding + Understand bridge
- Authoring real career advice, exam prep courses, or scholarship legal text
- Scraping or cloning competitor career/exam/scholarship UIs
- Rewriting English 90-day course JSON or Understand resolver core
- Adding framer-motion / Lottie / GSAP / recharts / d3
- Declaring modules "live" in `src/content/module-status.ts` with new marketing claims
- Production deploy, Vercel promotion, or git push without human ask
- Changing pricing / Family Plus entitlements math
- Duplicating or editing `docs/CLAUDE_CONTENT_LAYER_DIRECTIVE.md`

---

## Open questions / owner assumptions (encoded)

| # | Assumption | Status |
|---|------------|--------|
| A1 | Parent mode / Family lock / PIN move under Profile or Settings ("Parent space"); header icons only removed — **not** deleted | **CONFIRM WITH OWNER** |
| A2 | Three hubs are available to all signed-in Family users (`entitlement: 'public'`), including unlinked-to-school accounts | Encoded as requirement |
| A3 | State-specific schemes use child `stateCode` from `family.children` (already on profile) | Encoded; confirm if account-level state should override |
| A4 | Early tutor replies may bridge to existing Understand/resolver while Conversation persistence is real | Encoded; confirm if open multi-turn is mandatory in Phase 1 |
| A5 | Homework photo helper remains as capability under Attach / existing route; Study primary photo card removed | Encoded |
| A6 | Existing `careers` / `opportunities` module ids may be reused or aliased for Career Hub / Schemes | Prefer reuse; confirm naming with owner if product names must match flags 1:1 |
| A7 | Notifications center aggregates existing push/notify kinds plus stub career-guidance kind | Encoded |

If owner answers differ, update this doc's assumptions table before changing PIN/parent information architecture.

---

## Report back (Claude Code must fill)

```md
## Family AI + hubs redesign — report

**Date (Asia/Calcutta):** …
**Branch / commit:** …

### Paths created
- …

### Migrations / Storage
- …

### Routes / APIs
- …

### Module flags
- …

### i18n keys added
- …

### Tests
- …

### Header / parent-entry change
- Removed from: …
- Parent space now entered via: …

### Left untouched (explicit)
- English `data/english/**`
- Content-layer lesson work (companion directive)
- …

### Sub-agents / models / reuse
- Sub-agents used (≤6) and model each: …
- Conflicts resolved (if any) and approach: …
- Existing components reused (paths): …

### Gaps / risks noticed
- …

### Owner confirmations still needed
- …
```

---

## Quick start for Claude Code

```bash
# From repo root — inventory first
rg -n "StudyQuestion|FamilyHeader|FAMILY_MODULES|VoiceInput|fam.homework.studyLink" src/
rg -n "framer-motion|recharts|lottie|gsap" package.json   # expect none
# Implement Phase 1 only unless asked; no lesson-body or hub-body authorship
npm run typecheck
```

When unsure: **empty shell + checker + flag + TODO pointing at an existing path** beats inventing product copy or ChatGPT chrome.

