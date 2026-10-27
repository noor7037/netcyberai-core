# Claude Code Directive — NetCyber AI Content Layer & Study Experience (scaffolding only)

**Repo:** `https://github.com/noor7037/netcyberai-core`  
**Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), Capacitor Family shell  
**Audience:** Claude Code (or AGENTS task) preparing the codebase for **incoming** lesson content  
**Content authors:** Gemini / Google Antigravity / ChatGPT (elsewhere) — **not you**

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

**NO CONTENT GENERATION.** Do **not** write lesson bodies, NCERT/CBSE textbook text, explanations, practice question stems/answers, narration scripts, mind-map node labels that teach a concept, animation storyboards with educational facts, simulation “facts”, exam tips, or bilingual lesson copy. Those arrive later as drop-in files.

**BUILD ONLY:** schemas, TypeScript types + validators, loaders/importers, empty UI shells, route stubs, API/server-action stubs, Supabase migrations (empty tables + RLS), feature flags / module registry entries, i18n **key slots** (English/Hindi placeholders that say “content pending”, never invented pedagogy), and a final inventory report.

**PRESERVE EXISTING FEATURES.** Do not rewrite Study (`/family/study`), Understand, English course (`/family/english`), homework, worksheets, videos, offline packs, Focus Lock, School Link, Pulse send path, WhatsApp gate, or Control → Content. Extend adjacent to them. Prefer additive modules and feature flags.

**LICENCE / LEGAL:** Never copy textbook prose into the repo. Catalog structure (unit/chapter/topic titles from official sources) already lives under `data/catalog/` and `content.*` — do not expand that into lesson prose. Do not scrape YoLearn, IndiaSchool.ai, or any competitor. Reference UX patterns **conceptually only**.

**REPORT AT END** using the “Report back” template. List every path created, migrations, routes, flags, and what you left untouched.

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

## Repo map (ground truth — anchor here)

### Family Study / learning UI and routes

| Area | Path |
|------|------|
| Study (class-wise subjects → chapters/topics) | `src/app/(family)/family/(app)/study/page.tsx` |
| Study homework | `src/app/(family)/family/(app)/study/homework/page.tsx` |
| Study worksheet | `src/app/(family)/family/(app)/study/worksheet/[topic]/page.tsx` |
| Understand (topic/chapter player today) | `src/app/(family)/family/(app)/understand/page.tsx` |
| Family home / tabs layout | `src/app/(family)/family/(app)/layout.tsx`, `src/components/family/FamilyTabs.tsx` |
| Subject grid / glyphs | `src/components/family/ui/SubjectGrid.tsx`, `SubjectGlyph.tsx`, `ProgressRing.tsx` |
| Syllabus list / tonight practice | `src/components/family/SyllabusList.tsx`, `TonightPractice.tsx`, `SchoolSyllabus.tsx` |
| Concept Resolver blocks (typed, not HTML) | `src/lib/family/blocks.ts`, `src/components/family/blocks/*` |
| Interactive sims (structured data only) | `src/lib/family/interactive.ts`, `InteractiveViews.tsx` |
| Catalog read (board → class → subject → chapters → topics) | `src/lib/family/catalog.ts` → `content.syllabus_versions` / `units` / `chapters` / `topics` |
| Subjects by class | `src/lib/family/subjects.ts`, `src/lib/contracts/subjects.ts` |
| Module registry + entitlements | `src/lib/contracts/family-modules.ts`, `src/lib/family/modules.ts` |
| Control flags (family app) | `src/lib/family/flags.ts` → `control.app_flags` |
| Learning progress (attempts → topic_progress) | `src/lib/family/learning.ts`, `src/lib/family/account.ts` |
| Child profile name (always use `firstName`) | `src/lib/family/children.ts`; greetings via `fam.home.hello` + `{name}` in `src/lib/i18n/messages/{en,hi}.ts` |
| Family APIs | `src/app/api/family/**` (understand, homework, worksheet, plan, english, school/pulse, …) |

**Today’s Study click path:** subject tab → catalog chapter/topic → `/family/understand?kind=…&key=…` (AI/blocks response). The new **lesson player** must sit **beside** Understand, not replace it until content exists and a flag says so.

### Spoken English

| Area | Path |
|------|------|
| English tab | `src/app/(family)/family/(app)/english/page.tsx` |
| Lesson / assessment routes | `…/english/lesson/[key]/page.tsx`, `…/english/check/[kind]/page.tsx` |
| Parent English report | `…/parent/english/[childId]/page.tsx` |
| Course schema + checker | `src/lib/family/english/course.ts` |
| Progress / store | `src/lib/family/english/progress.ts`, `store.ts`, `report.ts` |
| UI players | `src/components/family/english/{EnglishCourse,LessonPlayer,AssessmentPlayer,EnglishReport}.tsx` |
| Lesson JSON on disk | `data/english/{a,b,c,d}/unit-NN.json` (+ assessments) |
| Content DB | `content.english_*` (migration `supabase/migrations/20261021232416_wb1_english_course.sql`) |
| Family progress DB | `family.english_*` (same migration) |
| APIs | `src/app/api/family/english/**` |
| Spec | `docs/family-app/12_ENGLISH_COURSE.md` |
| Module flag | `english_programme` in `FAMILY_MODULES` |

### Content / CMS patterns

| Area | Path |
|------|------|
| Control → Content | `src/app/(admin)/control/content/**`, APIs under `src/app/api/control/content/**` |
| Content plan | `docs/family-app/10_CONTROL_AND_CONTENT.md` |
| Syllabus CSV sources | `data/catalog/*.csv` |
| Catalog proof sheets | `docs/family-app/catalog-proof/` |
| Cached topic responses | `content.responses` (blocks jsonb; statuses `ai_made` \| `checked` \| `withdrawn`) |
| Module status (marketing honesty) | `src/content/module-status.ts` — **do not invent “live” claims**; leave status updates to humans |
| Prepare / pack | `src/lib/family/prepare.ts`, migration `…_w2_1_content_prepare.sql` |

### Progress / analytics

| Area | Path |
|------|------|
| `family.attempts`, `family.topic_progress` | migration `…_m1_family_content_control.sql` |
| English lesson done / reviews | `family.english_lessons_done`, `family.english_reviews`, … |
| Family results / school progress | `src/app/(family)/family/(app)/results/**`, `SchoolProgress.tsx`, `src/lib/contracts/progress-report.ts` |
| Parent progress | `…/parent/progress/[childId]/page.tsx` |
| Habit / plan completion | `src/lib/family/habit.ts`, `plan.ts` |

### Pulse / Recognition / Teacher Impact / WhatsApp

| Area | Path |
|------|------|
| School Daily Pulse UI | `src/app/(school)/app/pulse/page.tsx` |
| Pulse libs | `src/lib/pulse/{drafts,send,replies,followups,text}.ts` |
| Family school pulse API | `src/app/api/family/school/pulse/route.ts` |
| Recognition (deterministic) | `src/lib/recognition.ts`, UI `src/app/(school)/app/recognition/page.tsx` |
| Teacher Impact | `src/app/(school)/app/teacher-impact/page.tsx`, `my-impact/page.tsx` |
| WhatsApp send-gate | `src/lib/whatsapp/gate.ts` |
| Plans | `docs/25_P4_WHATSAPP_PLAN.md`, `docs/14_BACKEND_BUILD_PLAN.md` (Daily Learning Pulse / Weekly Confidence Brief mentions), `docs/26_P5_PRINCIPAL_CONTROL_PLAN.md` |
| Nav ids | `src/lib/nav/nav-items.ts` (`pulse-engagement`, `recognition`, `teacher-impact`) |

### Docs / Capacitor Family

| Area | Path |
|------|------|
| Family app index | `docs/family-app/00_INDEX.md` |
| Product / architecture / feature map | `02_PRODUCT.md`, `03_ARCHITECTURE.md`, `11_FEATURE_MAP.md` |
| Experience design | `09_EXPERIENCE_DESIGN.md` |
| Capacitor config | `capacitor.config.json`, `android/`, `android-shell/` |
| Build prompts (style reference only) | `docs/family-app/prompts/*` |

### Multi-tenant RLS patterns

- **School tables:** `school_id` + `using (school_id = current_setting('app.current_tenant_id', true)::uuid)` (see `supabase/migrations/20260917073745_baseline_rls.sql`, pulse followups).
- **Family tables:** composite `(account_id, child_id)` + `family.current_account()`; **permissive + restrictive** pair (see English / M1 family migrations). Never put child PII in `content.*`.
- **Content library:** no `school_id`; published + audience gates for `family_app` role.

**Zod note:** this repo does **not** currently depend on `zod`. Prefer the existing style: TypeScript types + hand-rolled checkers (mirror `src/lib/family/english/course.ts` and `src/lib/family/blocks.ts`). If you add Zod, add it as a dependency and justify in the report; otherwise use a `LessonContent` type + `checkLessonContent(raw): LessonProblem[]` gate.

---

## What to build (scaffolding only)

### 1) Separate content layer — strict `LessonContent` schema

Universal K-12 lesson slot. School syllabus maps onto the **same** schema later via `topic_key` / catalog ids (`content.topics.topic_key`).

**Create types + checker:**

- `src/lib/content/lesson-schema.ts` — types + `checkLessonContent`
- Optional re-export from `src/lib/contracts/` if Control needs the same shape (`src/lib/contracts/lesson-content.ts`)

**Schema sketch (TypeScript — implement this; do not fill example pedagogy):**

```ts
/** Stable ids: lowercase snake / dotted keys, matching content.topics.topic_key style */
export type LocaleCode = 'en' | 'hi' | string; // start with en|hi; more locales = key slots only

export type AssetSlot =
  | { kind: 'graphic'; id: string; altKey: string; href?: string | null; status: 'empty' | 'ready' }
  | { kind: 'mind_map'; id: string; dataRef?: string | null; status: 'empty' | 'ready' }
  | { kind: 'animation'; id: string; dataRef?: string | null; status: 'empty' | 'ready' }
  | { kind: 'simulation'; id: string; /* prefer Interactive from blocks.ts or sim kind */ dataRef?: string | null; status: 'empty' | 'ready' };

export type LocalizedString = Partial<Record<LocaleCode, string>> & { en?: string; hi?: string };

export type LessonContent = {
  schemaVersion: 1;
  /** Taxonomy */
  subject: string;       // must be a Subject id from SUBJECT_IDS when known
  classLevel: number;    // 1–12 (0/-1/-2 reserved; pre-primary later)
  board?: string;        // CBSE | CISCE | … optional for universal pack
  chapter: { key: string; title: LocalizedString };
  topic: { key: string; title: LocalizedString };
  subtopic?: { key: string; title: LocalizedString };
  /** Catalog bridge — when mapped to content.topics */
  catalogTopicKey?: string | null;
  academicYear?: string; // e.g. 2026-27 via academicYearOf()

  /** Body — SLOT ONLY. Empty until drop-in. Never generate. */
  body: {
    status: 'empty' | 'draft' | 'reviewed' | 'published';
    /** Opaque payload from external authors; validate shape, do not invent text */
    blocks?: unknown[] | null; // later: align with Block[] from blocks.ts OR dedicated lesson blocks
    markdownRef?: string | null; // path or storage key; file may be missing
  };

  assets: AssetSlot[];
  localizationKeys: string[]; // e.g. lesson.<id>.title — keys registered in i18n messages as pending stubs
  learningObjectives: { key: string; text: LocalizedString; status: 'empty' | 'ready' }[];
  practiceQuestions: { key: string; status: 'empty' | 'ready'; payload?: unknown | null }[];
  summary: { status: 'empty' | 'ready'; text: LocalizedString };

  meta: {
    lessonId: string; // stable: `${subject}.c${class}.ch.${chapter}.t.${topic}` style
    minutes?: number | null;
    updatedAt?: string | null;
    source: 'drop_in' | 'control' | 'repository';
  };
};
```

**Checker rules:** reject unknown top-level keys optionally; require `schemaVersion === 1`, non-empty `lessonId` / taxonomy keys; allow **all** body/objectives/practice/summary/assets to be `empty`; refuse files that contain fields named like `generatedBy` pointing at Claude with filled pedagogy (soft warn). Mirror English course: tests under `test/content/` that load fixtures of **empty** and **minimal shell** lessons only.

### 2) Folder layout for content drop-in

**Preferred (repo JSON, same spirit as English):**

```text
content/lessons/
  README.md                 # how authors drop files; NO sample NCERT text
  _schema/lesson.schema.json  # optional JSON Schema generated from types
  {board|universal}/
    class-{n}/
      {subject}/
        {chapterKey}/
          {topicKey}/
            lesson.json     # LessonContent; body.status = empty until authors fill
            assets/         # optional empty dirs: graphics/ mindmaps/ animations/ sims/
```

Also accept **Supabase Storage + JSON** later: stub `content.lesson_versions` (parallel to `content.english_versions`) with `body jsonb`, review/publish/audience columns — **do not seed educational body**.

Loader: `src/lib/content/lesson-loader.ts` — read from disk in dev; refuse invalid files; never invent missing body.

Importer stub (Control-ready): `src/lib/content/lesson-import.ts` + optional API `src/app/api/control/content/lessons/route.ts` that lists/imports shells only.

Document in `content/lessons/README.md`: authors paste reviewed JSON; Claude Code / CI only validates schema.

### 3) Family Study — full interactive lesson experience (shell)

**Keep** class-wise subjects on `/family/study` (`classSubjects`, `subjectAccess`, free-subject rules).

**Add** (behind new module flag, suggested id `lesson_player`):

| Piece | Create at |
|-------|-----------|
| Route map | `/family/study/lesson/[lessonId]` → `src/app/(family)/family/(app)/study/lesson/[lessonId]/page.tsx` |
| Optional chapter hub | `/family/study/subject/[subject]/page.tsx` **or** deepen existing Study page with links — prefer **links from Study** to lesson route when `body.status !== 'empty'`; otherwise keep Understand link |
| Shell components | `src/components/family/lesson/{LessonPlayerShell,LessonNav,AssetSlots,NarrationSlot,MindMapSlot,SimulationSlot,FactsSlot,ExamTipsSlot,DoubtAssistSlot,LessonProgressHeader}.tsx` |
| Words | keys under `fam.lesson.*` in `src/lib/i18n/messages/en.ts` + `hi.ts` — placeholders only (`"{name}, this lesson is being prepared"` using `fill` + `child.firstName`) |
| API | `GET /api/family/lessons/[lessonId]` → `src/app/api/family/lessons/[lessonId]/route.ts` — returns schema + empty slots; 404 if missing |
| Progress write | `POST /api/family/lessons/[lessonId]/progress` stub |

**UX requirements for shells (no fake content):**

- Address student by **`child.firstName`** (never “Student”, “Dear learner”, “Champ”). Reuse `fill(w['fam.home.hello'], { name })` pattern / new `fam.lesson.hello`.
- Sections as empty cards with labels: Chapters · Narration · Mind map · Graphics · Animations · Simulations · Facts · Exam tips · Doubt help · Progress.
- Multi-language doubt assist: **hook only** — call existing `/api/family/voice` or understand resolver **later**; shell shows “available when content + consent ready”.
- Do **not** remove Understand, StudyQuestion, SyllabusList, TonightPractice, PackButton, DataSaverSwitch.

Wire Study page: for each catalog topic, if a lesson shell exists for that `catalogTopicKey`, show “Open lesson” → lesson player; else keep current Understand href.

### 4) Spoken English — live interactive voice-tutor **add-on** (not a rewrite)

Keep `english_programme` and all of `data/english/**` + `LessonPlayer` as-is.

**Add** adjacent module (suggested flag `english_live_tutor`, `built: true` once shell lands, `addOn: true` or own card on English tab):

| Piece | Create at |
|-------|-----------|
| Feature flag | entry in `FAMILY_MODULES` + Control-readable flag `english_live_tutor` |
| Route | `/family/english/live` → `src/app/(family)/family/(app)/english/live/page.tsx` |
| Components | `src/components/family/english/live/{LiveTutorShell,VocabDrillSlot,StorySlot,LiveProgress}.tsx` |
| Lib stubs | `src/lib/family/english/live/{session.ts,types.ts}` — session state machine empty; consent purpose reuse `voice_practice` patterns from docs/12 |
| API | `src/app/api/family/english/live/route.ts` — returns `{ enabled, consentRequired, slots: [] }` |

**Conceptual UX (YoLearn Live Class — do not scrape):** live speak-to-AI turn taking, vocab practice, storytelling, progress %, multi-language UI chrome. Implement **empty states + consent gates + daily cap hooks** only. No TTS/STT provider wiring beyond stubs that respect existing AI platform / minors rules (`docs/family-app/AI_PROVIDERS.md`, `10_CONTROL_AND_CONTENT.md`).

### 5) Subject-wise and topic-wise progress (Learn-screen style)

**Extend, don’t replace** `family.topic_progress`.

**Migration** `supabase/migrations/<timestamp>_lesson_progress.sql`:

```text
family.lesson_progress (
  account_id, child_id, lesson_id, subject, topic_key,
  status text check in ('not_started','in_progress','completed'),
  percent smallint check between 0 and 100,
  completed_at timestamptz,
  updated_at timestamptz,
  PK (child_id, lesson_id),
  FK (account_id, child_id) → family.children ON DELETE CASCADE
)
-- RLS: same own-account permissive + restrictive pair as family.topic_progress

family.subject_progress_rollups (optional materialized view or table)
  account_id, child_id, subject, completed_topics, total_topics, percent, updated_at
```

**UI:**

- `src/components/family/lesson/SubjectProgressList.tsx` — list subjects with `ProgressRing` %, completed topics count (0/0 until content).
- Surface on Study and/or Home via existing progress modules; parent view stub under `/family/parent/progress/...` optional link.
- Pure functions in `src/lib/family/lesson-progress.ts` (mirror `english/progress.ts` style).

Conceptual parity with “YoLearn Learn screen”: % + completed topics — **no competitor assets or copy**.

### 6) Support surfaces / hooks

Scaffold **data contracts + empty UI or WhatsApp template hooks** — **no fake marketing copy**, no invented pulse bodies.

| Surface | Scaffold |
|---------|----------|
| Daily Learning Pulse | Extend contracts in `src/lib/contracts/` e.g. `learning-pulse.ts`: `{ schoolId, date, subjectId, lessonIds[], status }`. Hook comment pointing at `src/lib/pulse/drafts.ts` / `send.ts` and WhatsApp gate. Empty card on school pulse page **or** family school pulse read — label “Learning Pulse hook — awaiting content”. |
| Weekly Confidence Brief | `src/lib/contracts/confidence-brief.ts` + empty component stub under school or family parent area; batch job stub file `src/lib/jobs/confidence-brief.ts` that returns empty payload. |
| Recognition | Do not change formula in `src/lib/recognition.ts`. Add optional event kind stub / TODO linking lesson completion → recognition **inputs only** when product asks; empty UI note on recognition page if needed. |
| Teacher Impact Card | Contract stub `src/lib/contracts/teacher-impact-lesson.ts` documenting fields that **may** later feed `teacher-impact` (counts of lessons completed by class — ids only). No numbers invented on screen. |

All WhatsApp sends must continue through `src/lib/whatsapp/gate.ts`. **Do not send messages** in this scaffolding task.

### 7) Do not break existing features

- Run `npm run typecheck` and relevant vitest slices if present (`test/` for family/english/content).
- Leave Capacitor / Android shell untouched unless a deep link is required (prefer web routes only).
- Do not mark modules “live” in `src/content/module-status.ts` with new claims.
- Do not deploy to production; do not push unless the human asks.
- Do not commit large binary assets.

### 8) Report what was built and where

Fill the Report back template at the end of your work.

---

## Ordered implementation phases

### Phase 0 — Inventory (read-only, ≤ 30 min)

Confirm paths above still exist. Note any drift in a short `## Inventory notes` section of your report. Do not change app source yet.

### Phase 1 — Schema + drop-in layout

1. Add `src/lib/content/lesson-schema.ts` (+ tests with empty fixtures).
2. Create `content/lessons/README.md` + directory tree with **zero** pedagogical JSON bodies (at most one `lesson.json` with all `status: 'empty'` for a catalog topic that already exists — titles may copy **existing catalog title keys only**, not new textbook prose).
3. Add `src/lib/content/lesson-loader.ts`.

### Phase 2 — DB migrations + RLS

1. `content.lesson_versions` / `content.lessons` (optional if disk-first; prefer disk + thin DB mirror for publish workflow).
2. `family.lesson_progress` (+ rollups if needed).
3. RLS: content readable when published/everyone; family rows own-account only.
4. Grant to `family_app` mirroring English migrations.

### Phase 3 — API / server stubs

1. `GET /api/family/lessons/[lessonId]`
2. `POST /api/family/lessons/[lessonId]/progress` (auth via existing `requireFamilyPage` / family session helpers in `src/lib/family/server.ts`, `request.ts`)
3. Control list stub under `src/app/api/control/content/lessons/` (staff only — follow existing control auth)

### Phase 4 — Study lesson player shells + Study links

1. Module flag `lesson_player` in `FAMILY_MODULES`.
2. Routes + shell components + i18n keys.
3. Study page: conditional lesson link; Understand remains default.

### Phase 5 — English live tutor add-on

1. Flag `english_live_tutor`.
2. `/family/english/live` shells + API stub.
3. Entry point from English course home (`EnglishCourse.tsx`) as secondary card — do not alter lesson JSON checker or unit files.

### Phase 6 — Progress UI

1. Subject/topic progress components wired to new tables (empty → 0%).
2. Ensure progress updates only on explicit stub completion action (button “Mark shell complete” for QA) — or leave write path tested with unit tests only.

### Phase 7 — Pulse / Brief / Recognition / Impact hooks

1. Contracts + empty UI / comments only.
2. No WhatsApp sends; no fake template bodies (template **names**/ids as constants OK if already used elsewhere).

### Phase 8 — Acceptance + Report

1. Checklist below.
2. Fill Report back template.
3. Open PR only if the human asked; otherwise leave changes local and summarize.

---

## Acceptance criteria checklist

- [ ] No NCERT/CBSE/CISCE lesson prose, practice stems, or narration scripts were authored by this task.
- [ ] `LessonContent` schema + checker exist; empty lesson fixtures pass; invalid shapes fail.
- [ ] Drop-in folder `content/lessons/` documented; loader returns empty body safely.
- [ ] Family Study still lists class subjects; Understand still works; lesson player is additive and flagged.
- [ ] Lesson UI addresses child by `firstName` only (no generic greetings).
- [ ] English course units/lessons/assessments unchanged; live tutor is add-on + flag.
- [ ] `family.lesson_progress` (or equivalent) has RLS consistent with existing family tables.
- [ ] Subject/topic progress UI renders 0% / 0 completed without crashing when no content.
- [ ] Pulse / Confidence Brief / Recognition / Teacher Impact: contracts or empty hooks only — no fake copy, no sends.
- [ ] `npm run typecheck` passes; targeted tests added/green.
- [ ] Report back template completed with paths and untouched list.

---

## Out of scope

- Generating or translating lesson body, objectives text, practice Q&A, summaries, exam tips, mind-map educational labels, or simulation “science facts”.
- Scraping or cloning YoLearn, IndiaSchool.ai, BYJU’S, or any third-party lesson site.
- Copying textbook PDFs or long excerpts into the repo (structure titles already handled by catalog pipeline).
- Rewriting Understand / Concept Resolver / English 90-day course.
- Production deploys, Vercel promotions, WhatsApp template submission, or real Pulse sends.
- Changing pricing, entitlements math, or declaring Family Plus live.
- Updating `module-status.ts` marketing claims without human review.
- Adding animation libraries that break the Family 200 KB guidance (`docs/family-app/09`, `12`) — CSS/SVG stubs only.
- True 3D / WebGL (explicitly later per feature map L2).

---

## Report back (Claude Code must fill)

```md
## Content layer scaffolding — report

**Date (Asia/Calcutta):** …
**Branch / commit:** …

### Paths created
- …

### Migrations
- …

### Routes / APIs
- …

### Module flags
- …

### i18n keys added
- …

### Tests
- …

### Left untouched (explicit)
- Study Understand flow
- English `data/english/**` and course checker
- WhatsApp gate / pulse send
- …

### Sub-agents / models / reuse
- Sub-agents used (≤6) and model each: …
- Conflicts resolved (if any) and approach: …
- Existing components reused (paths): …

### Gaps / risks noticed
- …

### Content drop-in instructions for authors
- Put reviewed `lesson.json` at: …
- Validate with: …
```

---

## Quick start for Claude Code

```bash
# From repo root
rg -n "FAMILY_MODULES|readFamilyCatalog|LessonContent" src/lib src/app
# Implement phases 1→8; do not fill lesson bodies
npm run typecheck
```

When unsure, prefer **empty shell + TODO pointing at an existing path** over inventing product behaviour. Content generation happens **outside** this repository task.
