# Handover, 13 Nov 2026: where the Draw feature stands

**Written by:** the supervisor, for the next session and for Noor. **Delivers:** the exact point the work stopped at, so
it can be picked up without re-reading anything. **Rules:** `CLAUDE.md`; nothing here is merged or applied.

## State of the branches

| Branch | What it holds | State |
|---|---|---|
| `main` | Everything up to PR #426 (C507–C511) | Merged by Noor |
| `claude/jolly-volta-3y6vps` | main + C512 (unsent files cleared after an hour) + the Draw contract + the templates (C514) | Pushed. No PR open |
| `claude/draw-studio` | All of the above + the Draw tab and art-table studio (C513), joined by a merge | Pushed. **Continue here** |
| `claude/draw-templates` | The templates slice alone | Already merged into both branches above |

## Done and checked

- C512: `src/lib/family/tutor.ts` removes a stored, never-sent file after 60 minutes (`UNSENT_MINUTES`). Test in
  `test/family/tutor.test.ts`. This was the cause of "too many requests" on Send to tutor.
- C514 templates: 28 outlines in `public/draw/templates/`, registry `src/lib/family/draw-templates.ts`, route
  `/api/family/draw/done`, parent switch, progress count, tutor instruction from the registry. tsc and its tests passed
  on its own branch.
- C513 studio: `src/components/family/draw/Studio.tsx` (moved from `tutor/SketchPad.tsx`), the `/family/draw` page,
  the `draw` module, tokens coral/sky/mint/butter/lavender, brush model, radial picker, daily limit, single-flight send.
  tsc clean and 232 targeted tests passed on `claude/draw-studio` BEFORE the join.

## Not done: the join (start here)

After `git merge origin/claude/jolly-volta-3y6vps` into `claude/draw-studio` (done, conflict in `Slot.tsx` resolved by
keeping the templates' file), these are still to do. **tsc has not been run since the join and is expected to fail.**

1. `src/components/family/draw/templates/openStudio.tsx`: change the lazy import from
   `@/components/family/tutor/SketchPad` (`SketchPad`) to `@/components/family/draw/Studio` (`Studio`).
2. `src/components/family/draw/DrawHome.tsx` line ~98 renders `<DrawTemplatesSlot classLevel onOpen>`; the real slot
   takes `{ childId, classLevel, lang, subjects, w }`. Pass those from the page
   (`src/app/(family)/family/(app)/draw/page.tsx`: it has `child`, `lang`, and can read `classSubjects`), and add
   `DRAW_TEMPLATE_KEYS` (and always `SKETCH_KEYS`) to the page's `familyWords` list.
3. Send to tutor from a template: `useTemplateStudio` passes a placeholder `onSend`. Let it take an optional `onSend`
   and have `DrawHome` pass its own, with the question prefixed by `drawMarker(template.id)`
   (`src/lib/family/draw-templates.ts`). In `Studio.tsx` the same prefix when `open.template` is set.
4. `src/lib/family/draw-templates.ts`: `DRAW_MODULE = 'tutor_board'` becomes `'draw'`.
5. Add the row **C513** to `docs/10_DECISION_LOG.md` (the studio build was stopped before writing it): the tab is
   "Draw" not "Canva" (another company's name); our own studio, not Excalidraw/tldraw (licence, size, no child's
   brush); no drawing image stored on our servers in this round.
6. Run `npx tsc --noEmit -p .`, the Draw tests (`test/family/c513-draw.test.ts`, the C514 tests), then
   `bash scripts/ci_local.sh --no-install` once. Watch the 200 kB Family page budget (step 27) and the page-words test.
7. Apply the migration `supabase/migrations/20261113120000_c514_draw_completions.sql` to project
   `unodnyyfqhxrbusbkite` only after the full checks pass. Then open ONE PR from `claude/draw-studio` (or fast-forward
   `claude/jolly-volta-3y6vps` to it and open from there) and unsubscribe from PR activity on both tools.

## Simplify where it helps (founder, 13 Nov)

Noor said to skip anything that overcomplicates the code. Candidates to drop if they fight the join: the daily limit
on template drawings opened from Study (keep it on the Draw tab only), the homework context (already left out), and
download in the Android app (already hidden).

## Waiting on Noor

- Review the template art (`docs/screenshots/c514-templates/all-outlines-contact-sheet.png`), especially the two
  Mughal dress outlines and the three folk-art frames.
- The Haiku price in Control ($0.10 / $0.50 looked about ten times too low).
- Switch the tutor prompt to v15 in Control → AI and test PR #426's features on a phone.
- A new Android APK is needed for the camera inside the app.

## Next jobs after Draw

1. One tutor call instead of three (the wait is 6.6 to 12.9 s even on the paid model).
2. Class 10 Maths out of draft.
3. Marking with red pen, measured on real marked papers.
