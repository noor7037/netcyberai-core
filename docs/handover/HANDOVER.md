# NetCyberAI: complete handover, 13 November 2026

**Written by:** the supervisor session (cloud), for the Claude Code session Noor now runs in his Mac terminal.
**Delivers:** everything needed to carry on as the supervisor without the earlier conversation: who Noor is, what the
product and business are, how we work, what was decided, what is built, and the exact next step.
**How to work:** follow `CLAUDE.md` at the repository root. Where this note and `CLAUDE.md` differ, `CLAUDE.md` wins.

Read in this order: this file, then `docs/handover/2026-11-13_draw_feature_handover.md` (the unfinished join), then
`CLAUDE.md`. Read `docs/10_DECISION_LOG.md` rows C501 to C514 only if a decision below is unclear.

---

## 1. Noor, and how to talk to him

- Noor Islam is the founder. One person, non-technical, in India. He brings problems and goals, not solutions.
- He often dictates by voice. Messages arrive long, with misheard words ("Twitter" for "tutor", "Canva" for
  "canvas"). Work out what he means, say how you read it in one line, and carry on.
- He wants: plain words, what he must do first, short reports (at most 15 lines), honest status. No jargon, no
  internal ids, no praise.
- He is impatient with generic output and with being asked technical questions. Decide what the repository can
  answer; ask him only for what only he has (money, taste, real-world inputs), all questions together, with a
  recommendation.
- He merges every pull request by hand on GitHub. Never merge, never push to `main`.
- He tests on his own Android phone. A feature is not "working" until he has seen it there.
- He is paying for tokens from a small balance (about $100 of usage on the Mac). Spend carefully: section 8.

## 2. The business

- NetCyberAI is an education product for India with four surfaces:
  1. **Family app** (`/family`): a child's tutor, Study, English, Draw, Future (careers, exams, schemes), and a
     parent area. Also an Android shell (Capacitor, `android/`).
  2. **School app** (`/app`): principal, office, teacher. 35 modules, about 6 fully live.
  3. **Control** (`/control`): Noor's own console: schools, AI routes and keys, content, apps switches.
  4. **Public website**: still sells a school ERP and says "parents never need an app" in four places. Stale.
- **First customers (decided 12 Nov):** one school, Class 10 only, with the Family app handed out by the school, plus
  two or three paying parents. The school marked as paying in Control is DAV Public School, Agra.
- **Plan after that:** universal syllabus for every class and subject, sold to families directly; then a custom
  syllabus per student or school, built as a map onto a shared concept library.
- **Ownership rule proposed to Noor (not yet confirmed by him):** what a student or school uploads is theirs and
  private; lessons we write for the library are ours and reusable.
- **Budget:** ₹2,000 to 3,000 a month for AI (about $25 to 35). Paid models go only to paying customers.
- **No real users yet.** Four test family accounts. Every number on screen is demo or Noor's own testing.

## 3. Technology, in one screen

- Next.js (app router) + TypeScript + Tailwind; Postgres on Supabase with row level security; Vercel hosting.
- Supabase project the live site uses: `unodnyyfqhxrbusbkite` (called the "test" project; production cutover is
  deferred until the first real school).
- AI goes through one gateway (`src/lib/ai/platform.ts`): each feature ("profile") has a route of models chosen in
  Control; attempts are logged in `control.ai_usage_ledger`; keys are sealed in the database.
- Tests: Vitest with PGlite (an in-process Postgres), so no database is needed to run them.
- The gate before every PR: `bash scripts/ci_local.sh --no-install` (29 steps, 10 to 15 minutes). GitHub's own
  checks do not run (the account's free minutes are used up), so a red check on a PR is expected.
- Content: published chapters are JSON under `reader/content/`; labs under `labs/`. Class 10 Science is complete;
  Class 10 Maths has 14 chapter files, most still drafts; Class 1 has three short chapters.

## 4. What the audit found (12 Nov) and what has been fixed since

| Finding | State now |
|---|---|
| Tutor refused valid questions as "not your subject" | Fixed: prompt v14 + nearest-subject rule (C503). Live |
| Control AI pickers listed about 830 model ids | Fixed: short list of working models (C502). Live |
| No paid route for paying customers, no hard spend limit | Built and live (C504), with fallback to the free route (C507) |
| Tutor never searched the published book for a typed question | Fixed (C505). Live |
| Parent area was text-only | Rebuilt as an app with four tabs (C506). Live |
| A failed question vanished; small children got text only | Kept with Try again; auto read-aloud for Classes 1 to 3; prompt v15 (C508, C509). Merged; v15 must be chosen in Control |
| Camera did not open; drawing pad too simple; call needed a Talk tap | Camera sheet, drawing studio, always-on call (C510, C511). Merged in PR #426 |
| "Too many requests" on Send to tutor | Fixed (C512). On the working branch, not merged |
| Draw tab + syllabus templates | Built in two halves, **join unfinished** (C513, C514). See section 6 |
| Tutor answer takes 6.6 to 12.9 s even on a paid model | **Not fixed.** Three AI calls in a row per answer. Next job |
| Careers, exams, schemes hubs are empty (0 rows) | Not started |
| Exam marking never measured; no red pen on the page | Not started. Needs real teacher-marked papers from the school |
| Website is stale | Not started |
| Quality checks on tutor answers are written but not connected | Not started |

## 5. Decisions that must not be re-argued

- One teacher agent in front of the child; fixed pipelines behind (marking, content, reports, watchers). No agent
  framework, no n8n, no Temporal, no separate vector database.
- Family app colours: warm paper, teal, saffron, plum; **no dark blue** (a test enforces it). The Draw feature adds
  coral, sky, mint, butter and lavender on Noor's instruction.
- The tab is called **Draw**, not "Canva" (another company's name).
- Our own drawing studio, not Excalidraw or tldraw.
- No child's drawing image is stored on our servers in this round; only a completion tick.
- No streaks, no art scoring, no ranking of children.
- Content order: Class 10 first (the pilot), then Class 9 downward. Universal content for all classes stays the goal.
- GitHub Actions stays unpaid for now; the local check suite is the gate.
- Out of scope for good: QR/NFC labels and hardware (except the Focus Lock in the Android app).

## 6. The exact point the work stopped

**Branch to work on: `claude/jolly-volta-3y6vps`.** It now holds everything: `main` + C512 + the templates + the
studio, joined by a merge. (`claude/draw-studio` is the same commit history minus this handover; ignore it.)

The join is not finished and the type check is expected to fail until these are done. Full detail is in
`docs/handover/2026-11-13_draw_feature_handover.md`:

1. `src/components/family/draw/templates/openStudio.tsx`: lazy-import `Studio` from
   `@/components/family/draw/Studio` instead of `SketchPad` from `@/components/family/tutor/SketchPad`.
2. `src/components/family/draw/DrawHome.tsx` (~line 98): `<DrawTemplatesSlot>` needs
   `{ childId, classLevel, lang, subjects, w }`. Pass them from `src/app/(family)/family/(app)/draw/page.tsx`
   and add `DRAW_TEMPLATE_KEYS` and `SKETCH_KEYS` to that page's `familyWords` list.
3. Template drawings sent to the tutor: prefix the question with `drawMarker(template.id)`
   (`src/lib/family/draw-templates.ts`), in `Studio.tsx` and through `useTemplateStudio`'s `onSend`.
4. `DRAW_MODULE` in `src/lib/family/draw-templates.ts`: `'tutor_board'` becomes `'draw'`.
5. Add row **C513** to `docs/10_DECISION_LOG.md` (reasons in section 5 above).
6. `npx tsc --noEmit -p .`, then the Draw tests, then `bash scripts/ci_local.sh --no-install` once.
7. **Before the PR (founder, 13 Nov):** the studio build stopped before its final report, so its visual spec
   (pressure brush, watercolour, radial colour wheel, rotating stickers, paper texture) is unverified. Once the join
   compiles, take phone-size (390 px) pictures of the studio, show them to Noor, and fix what is missing first.
8. Apply `supabase/migrations/20261113120000_c514_draw_completions.sql` to project `unodnyyfqhxrbusbkite` after
   the checks pass (see section 7 for how, on the Mac). Then open one PR to `main`.

Noor said on 13 Nov: skip anything that overcomplicates the code. Keep the daily drawing limit on the Draw tab only;
leave the homework link out.

## 7. What is different on the Mac

The cloud session had connectors the terminal may not have. Check before relying on any of them.

- **GitHub:** use the `gh` command line tool (`gh auth status`; if missing, ask Noor to run `brew install gh` and
  `gh auth login`). Open PRs with `gh pr create`. Never comment on, subscribe to, or schedule checks on a PR unless
  Noor asks in that message (`CLAUDE.md`, first section).
- **Supabase migrations:** the cloud session applied them through a Supabase connector. On the Mac, run `/mcp` to see
  whether one is connected. If not, do not improvise with a connection string: tell Noor a migration is waiting and
  give him the choice of (a) connecting the Supabase connector to Claude Code, or (b) pasting the migration file into
  the Supabase dashboard's SQL editor. The app's code must not be merged ahead of a migration it needs.
- **Node and Python:** CI uses Node 20 and Python 3.12. `npm ci` once, then `--no-install`.
- **Screenshots:** the Mac has no pre-installed Playwright browser; `npx playwright install chromium` may be needed
  once (ask before installing).
- **Secrets:** `.env.local` is needed only to run the signed-in app locally. Never print or commit its values.
- **Sub-agents:** the cloud session ran builds in parallel worktrees. On a small balance, work in one session,
  one slice at a time.

## 8. Spending Noor's balance carefully

- Read narrowly: `grep` first, then only the lines being changed. Never print a whole large file or log.
- One slice at a time. No parallel agents unless Noor asks.
- Run targeted tests while building; the full suite once, right before a PR.
- Suggest `/compact` when the conversation is long, and a fresh session (`/clear`) between unrelated jobs.
- Prefer the mid-tier model for ordinary slices; the strongest model only for auth, money, children's data or a
  design that spans modules.

## 9. Waiting on Noor (remind him once, briefly)

1. Review the template art: `docs/screenshots/c514-templates/all-outlines-contact-sheet.png` (the two Mughal dress
   outlines and the three folk-art frames especially).
2. The Haiku price in Control: $0.10 / $0.50 per million tokens looked about ten times too low, which would let the
   $5 limit spend about $50. He should check Anthropic's pricing page.
3. Switch "Tutor answers" to prompt v15 in Control → AI, and test PR #426 on his phone (camera sheet, drawing studio,
   call, Class 1 answers).
4. A new Android APK build, for the camera inside the app.
5. 50 to 100 real teacher-marked answer sheets from the pilot school, for the marking work.
6. Still his from before: Meta payment method (WhatsApp sends), lawyer review, Play developer account.

## 10. The queue after Draw

0. ~~Classes 9 and 10 art-integrated templates~~ built as C515 (8 templates), on branch `claude/draw-class9-10-art`.
1. **One tutor call instead of three.** Biggest remaining complaint: the wait. Start in
   `src/app/api/family/understand/route.ts` and `src/lib/family/resolver.ts` (safety check, plan call, answer).
2. **Class 10 Maths out of draft**, with images made inside the pipeline (Noor must stop hand-making images).
3. **Marking like a teacher**: read-then-mark per question, colour images, red pen on the page, measured against
   the real papers.
4. **Young-child mode** (LKG to Class 3): voice-led, tap and drag, no typing.
5. **Careers, exams and schemes** with verified entries and a nightly watcher.
6. **Control AI redesign** and the **website rewrite**.
7. **School go-live**: unused modules switched off, families set up by the school, production database.

## 11. Things the last session got wrong, so you do not repeat them

- Said "AI spend is $0" when the price table was simply empty. Say "unpriced" unless a price exists.
- Promised a Quality Lab test of a prompt version; the Lab cannot choose a prompt version.
- Approved mock-ups in dark blue that the Family colour rule forbids; had to recolour after the check failed.
- A builder overwrote a system browser file while taking screenshots. Never touch system files.
- Decision Log merges conflict on every parallel branch: keep both rows, in number order.
