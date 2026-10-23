# Brief for the build lead (supervisor, 2026-10-23)

Supervisor → build lead. What the founder decided on 2026-10-23, what is now built, and what is yours next. Rules:
CLAUDE.md, including the new "Token discipline" section (C230-AC). Read this once; do not re-plan what is decided.

## What the founder decided

1. **The Family app is a product on its own (paid), and a NetCyberAI school is an optional connection.** A family whose
   school is not on NetCyberAI gets the whole learning app. A family whose school is on NetCyberAI connects it, and
   the school's part is free for them (entitlement `school_info`, src/lib/contracts/family-modules.ts). Learning is
   free for one subject per child; Family Plus (paid) unlocks the rest and the English course. The Plus checkout waits
   for the founder's Razorpay sign-up (P3); do not build a fake one.
2. **What is merged reaches the app without Control steps** (C230-Z). A built Family module with no saved switch is
   on; Control is for switching off. Safety (AI clearance for children, the safety check, parent consents) is
   separate and unchanged.

## What is built (do not rebuild)

| Piece | Where | Decision |
|---|---|---|
| School Link: the school's office makes a single-use, 7-day code for one guardian; the parent enters it in the parent area; the app reads the school **as that guardian**. Only the code's definer function makes a link; a link only ever closes (a trigger) | `src/lib/school-link/`, `withGuardianContext` in `src/lib/auth/db.ts`, `src/lib/family/school.ts`, `/api/family/school/*`, `/api/app/guardians/[parentId]/family-code`, migration `*_school_link.sql` | C230-AA |
| Linked family sees: today's attendance (home), attendance, fees and child matching (parent area), the school's own syllabus for the subject (Study) | `SchoolSection.tsx`, `SchoolSyllabus.tsx`, home and study pages | C230-AA |
| Unlink by the family or disconnect by the school ends the school's part in the same request; the family's own children and learning stay | same | C230-AA |
| A parent adds their child's syllabus from a PDF or photos of the contents pages, reviews it, then the child studies it | `src/lib/family/child-syllabus.ts`, `/api/family/syllabus/*`, `SyllabusList.tsx` | C230-AB |
| Phone fixes: room for the status and navigation bars, loading screen, read-aloud and microphone in app v2 | #283 | C230-Y |

## Yours next, in this order

1. **Android app version 2.** On the Mac: `npm ci`, `npx cap sync android`, `cd android && ./gradlew assembleDebug`, send
   `app-debug.apk` to the founder. Check on his phone: speaker reads aloud, microphone asks for permission, Gboard
   voice typing works, nothing sits under the status bar.
2. **More of the school's part for a linked family**, one module per PR, each the same way: the table's `_no_parent`
   policy widened in its own migration with `alter policy` (read only, own children, the school's consent first; see
   section 5 of `*_school_link.sql` and the C230-D parent rules; the Supabase tool hangs on `drop policy`, waiting for
   a confirmation that never comes), a reader in
   `src/lib/school-link/` that runs inside `withGuardianContext`, and a Family screen. Order: homework set by the
   teacher, notices and events, timetable, published marks and report cards. Never copy school rows into `family.*`.
3. **Link the demo pilot (C324 meets C230-AA).** The demo school (#282) has a teacher but no office, and only the
   principal or a school admin makes a connect code. Extend `demo.setup` to invite a school admin the same way as the
   teacher (a third inbox in the payload, the founder's Gmail with `+demooffice`), then: the office opens Ravi Demo on
   the guardian screen, makes the code, and the founder enters it in the demo Family account's parent area. C324's
   "no family-to-school link exists yet" is superseded by C230-AA.
4. **Workers AI instruction placement.** Answers now arrive whole (C322); #284 (C326) measures it. In the smoke test, compare the system message
   with the user message; if the system message is followed as well, move Workers AI back to it (a child's own words
   should not sit beside our safety instructions).

## Do not

- Ask the founder for anything the repository answers; ask once, together, with a recommendation.
- Hide a working feature behind a Control switch, or give a standalone family a made-up school or school records.
- Merge, push to `main`, or rewrite history.
