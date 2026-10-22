CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, for Noor, a non-technical founder. This is the 2026-10-22 audit's handover: what the supervisor fixed, what is yours, and how the two lines of work stay apart. Work by CLAUDE.md; challenge anything wrong with evidence; report in plain words, founder actions first.

WHO OWNS WHAT (no overlap)
- **Supervisor:** D1, the Family app's visual layer (C230-Q). It covers:
  - `src/app/(family)/family/family.css`;
  - `src/lib/family/subject-theme.ts`;
  - `src/components/family/ui/*`;
  - `FamilyHeader`, `FamilyTabs`, `ChildSwitcher`, `SubPageHeader`;
  - the explanation card frame in `blocks/BlockViews.tsx`;
  - the look of the home and Study pages.
  Merged to main before your M2 stack.
- **Build lead:** M2's functions and everything listed under YOURS below.
- **Do not restyle what D1 owns.** Use its classes and components instead of writing new card styles.

YOURS, IN THIS ORDER
1. **M2 CI is red. Fix it first.**
   - `check` "no mock/dummy/fake/sample reference" fails on:
     - `samplePoints` in `src/lib/family/interactive.ts` and `src/components/family/blocks/InteractiveViews.tsx`;
     - the comment in `src/lib/ai/prompts/family.resolver/v4.ts` ("sample responses").
   - Rename the function to `plotPoints` and the comment to "before-and-after responses". Then run the check locally before pushing.
2. **Merge main into your M2 stack** (it now holds D1). Resolve the two conflicts by keeping both sides:
   - **Home page:** keep D1's `HomeAsk` first, then your `PlanCard` and `HabitCard`, then D1's `SubjectGrid` and the progress card.
   - **Study page:** keep D1's subject chips and chapter cards, and add your homework link and worksheet actions inside them.
3. **Put every M2 screen on D1's layer:**
   - cards: `fam-card` (not `rounded-3xl bg-white shadow-sm ring-1 ring-slate/10`);
   - tappable cards and buttons: `fam-press`;
   - entrances: `fam-rise` with a `--d` delay;
   - subject colour: `subjectTheme(subject)`, with `bg-royal-deep ${theme.tile}` under white text;
   - progress: `ProgressRing`;
   - no device emoji as icons: use an inline SVG, or `SubjectGlyph`.
   - This covers `PlanCard`, `HabitCard`, `HomeworkHelper`, `WorksheetScreen`, `VideoPicks`, `ParentArea` and `InteractiveViews`.
4. **Hindi chapter names for classes 9–12** (CBSE Mathematics, Science, Physics, Chemistry, Biology; CISCE):
   - `title_hi` is empty on 1,517 lines.
   - CBSE publishes no Hindi curriculum for these, but **NCERT's Hindi editions of the same books** (for example गणित, विज्ञान) print the chapter names. Take them from their contents pages, as C262 did for classes 6–8, in a new version of each file.
   - Never translate a title yourself.
5. **The English course's pictures** are device emoji, which look different on Samsung, Xiaomi and older Android.
   - Bundle one open-licence emoji set as SVG files under `public/` (for example Noto Emoji, Apache 2.0), only the characters the course uses.
   - Draw `Pictures.tsx` and `Visuals.tsx` from it.
   - Record the licence in `docs/`.
6. **Leaked-password protection** is off in Supabase Auth (advisor WARN). Turn it on if the plan allows it, or record why not.

PROCESS RULES FROM THIS AUDIT
- **Report from a query, not from memory.** The #213–#237 report said production had none of the four migrations; production had `f1_trusted_devices`, under another version number.
- **Never start a founder-directed wave without a Decision Log row first.** Waves A and B did this right (C263, C274); keep it so.
- **A stack is merged at its top.** The supervisor now merges a reviewed stack by its top PR, so Vercel builds once, not once per PR. Preview builds are off, and production skips docs-only commits.
- **Every family PR shows its screens beside the mockup** (`docs/family-app/mockups/`) at 390 and 1440, in English and Hindi. A screen that looks like a plain list of white boxes is not done.

HOW TO AVOID WHAT THIS AUDIT FOUND
1. **A banned word in CI** (`samplePoints`):
   - Before the push, run `grep -rn 'mock\|dummy\|fake\|sample' src/ --include='*.ts' --include='*.tsx'`.
   - Name things for what they do (`plotPoints`), not for where the data came from.
2. **A page wider than the phone:**
   - A scrolling row (`overflow-x-auto`) clips only children it positions.
   - An `sr-only` label or another absolute child inside it escapes and widens the page.
   - Give every scrolling row `relative`. Then check `document.documentElement.scrollWidth` at 360 in the harness ("sideways scroll").
3. **Content hidden under a header band:**
   - The band is positioned (`fam-band`), so it paints over the content pulled up under it with `-mt-8`.
   - Give that `main` the class `relative`.
4. **A button that looks pressable while disabled:**
   - The shared `Button` has no disabled style.
   - Add `disabled:opacity-60 disabled:cursor-not-allowed`.
5. **Colours the checker cannot see:**
   - `check_contrast.py` reads literal classes only.
   - A colour chosen at run time keeps a literal solid background under its text (`bg-royal-deep`).
   - Add a test that computes its contrast, as `test/family/d1-theme.test.ts` does.

GATES: 07 §3, as before. No Co-Authored-By line and no model name anywhere.
