# Pending before launch (14 November 2026)

**Written by:** the build lead, for Noor and the supervisor session. **Delivers:** everything still open before the
first real school, sorted by how much it blocks launch, each with its proof and a one-line fix. **How to work:** follow
`CLAUDE.md`; take P0 in order; nothing here is merged to `main` or applied to production by this run.

## P0: blocks launch

| # | What | Proof | Fix |
|---|---|---|---|
| 1 | The branch `claude/tutor-draw-content-nov14` is not pushed, reviewed or merged | `git log main..claude/tutor-draw-content-nov14` | Supervisor reviews, opens one PR per risk group (tutor and privacy; content), merges |
| 2 | Two migrations are written and tested locally but not on production | `supabase/migrations/20261114120000_c520_aadhaar_verhoeff.sql`, `20261114130000_c522_video_clicks.sql` | Apply in that order before the code that needs them is deployed (`docs/handover/HANDOVER.md` §7) |
| 3 | Tutor prompt v17 is off until chosen | `src/lib/ai/prompts/family.resolver/index.ts` (opt-in by name) | Run the Quality Lab area "tutor v16 and v17" once, then switch `family.resolver` to v17 in Control → AI |
| 4 | v17, the photo path and the per-question videos have never run against a live model, a real phone or the real YouTube key | Tests use fixtures (`test/family/c521-tutor-v17.test.ts`, `c522-answer-videos.test.ts`, `c525-photo-upload.test.ts`) | Noor tests on his phone: a book-page photo, an iPhone HEIC photo, a Hinglish and a Tamil question, a See video tap |
| 5 | Tutor answer takes 6.6 to 12.9 s | `docs/handover/HANDOVER.md` §4; three calls in `src/app/api/family/understand/route.ts` | One tutor call instead of three (queue item 1) |
| 6 | Quality checks on tutor answers are written but not connected | `docs/handover/HANDOVER.md` §4; `src/lib/ai/qc/rules.ts` | Run the rules on every answer before it is shown; log failures to Control |
| 7 | Chapter text for Classes 1 to 3 is templated and in places differs from NCERT | `docs/content/C1-3-REVIEW.md` (list at the end) | Rewrite each topic's explanation from the NCERT chapter; one reviewer per class |
| 8 | Legal review of `/privacy` and `/terms`; production database cutover | `docs/10_DECISION_LOG.md` (last lines); `CLAUDE.md` founder workload rule | Lawyer review (Noor); cutover when the supervisor schedules it |
| 9 | The local check suite is red on `main` already | `test/family/c514-draw-templates.test.ts` ("the parent sees the count…", session revoked) fails on `cf0d8325`; `/family/study/chapter/[key]` is 213 kB against a 201 kB budget on `cf0d8325` (215.2 kB on this branch; `/family/study` 201.2 kB) | Fix the test's session; trim the chapter reader's first load (lazy-load the reader's heavy parts) |

## P1: first weeks

| # | What | Proof | Fix |
|---|---|---|---|
| 1 | No real photos in Class 1 to 3 chapters | `reader/content/c0[123]/**` has no `figure` step | Add licensed low-data photos per chapter into `labs/assets` with `manifest.json` |
| 2 | No new practice labs were built; about 40 topics need one | `docs/content/C1-3-REVIEW.md` (lab list) | Build settings-only labs in `labs/defs` from existing templates first |
| 3 | About 20 chapter pictures are still weak, and Class 3 Hindi labels are below the 14 px rule in about 40 topics | `docs/content/C1-3-REVIEW.md` (last section) | Redraw those topics; re-lay out the Class 3 Hindi panels |
| 4 | Draw read-aloud speaks only English and Hindi | `src/lib/family/draw-voice.ts` (`DrawVoiceLang`) | Add languages when the app language list grows beyond en and hi |
| 5 | Read-aloud of a Tamil or Punjabi answer may use the wrong voice | `src/lib/family/voice-out.ts` (voice by app language) | Pick the voice from the answer's `replyLang` |
| 6 | Openverse photos are kept in memory only, and Openverse answered 504 during the build | `src/lib/family/visuals/` (Openverse adapter); the photo store accepts Commons only | A small migration to let the store hold Openverse; re-test when the service is up |
| 7 | The server reads full-size photos for OCR (no image library) | `src/lib/privacy/upload-check.ts` | Add an image library on the server, or keep relying on the phone shrink |
| 8 | A photo the phone cannot redraw is sent as it is, with location data | `src/lib/family/photo-shrink.ts` | Strip metadata on the server before storing |
| 9 | Careers, exams and schemes hubs are empty | `docs/handover/HANDOVER.md` §4 | Verified entries plus a nightly watcher (queue item 5) |
| 10 | Exam marking never measured against real papers | `docs/handover/HANDOVER.md` §4, §9 item 5 | 50 to 100 teacher-marked sheets from the pilot school (Noor) |
| 11 | SEO audit not run in this session | Port 3000 was held by the content preview server | Run `bash scripts/run_seo_audit.sh` with that server stopped |
| 12 | Haiku price in Control may be ten times too low | `docs/handover/HANDOVER.md` §9 item 2 | Noor checks the pricing page and corrects it |

## P2: later

| # | What | Proof | Fix |
|---|---|---|---|
| 1 | Class 4 to 12 content beyond Class 10 Maths and Science | `reader/content/books.json` | Same pipeline, Class 9 downward, then 4 to 8, 11 and 12 |
| 2 | Website is stale | `docs/handover/HANDOVER.md` §4 | Website rewrite (queue item 6) |
| 3 | No colour-swatch block for colour questions | `src/lib/family/blocks.ts` | Add a small swatch block and name it in the next prompt version |
| 4 | Young-child mode, Control AI redesign, Android APK with the camera | `docs/handover/HANDOVER.md` §9, §10 | As queued |
| 5 | Pictures in the chapters move only by a staged reveal in some subjects (Class 3 EVS) | `reader/content/c03/evs/**` | Add teaching motion where something really moves |
