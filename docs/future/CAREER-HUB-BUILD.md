# Career Hub

Who this is for: Noor. What it is: the Career Hub on the Family app Future tab, built beside the entrance-exam listings that are already there. How to use it: approve the migration, then approve careers in Control before any family sees them.

## What a family sees

The Career page still shows the entrance-exam listings (search stays on `q`). Above them is the career explorer. Career search uses `s`, so the two searches do not overwrite each other.

The explorer is state-neutral. The same approved career is offered in every state. The entrance listings keep their own class and state filters.

Nothing is visible to a family until its review state is approved and its review day is not more than 180 days past. Every seeded row starts as pending.

Each card says: General guidance, verify the official notice. Salaries are not quoted.

## What was built

- 96 careers, 14 fields, 9 cross-pathways, 3 lateral routes, plus roadmap steps and parallel actions. English and Hindi on every title, summary, step and action.
- Fields include information technology (networking, cybersecurity, web, UI/UX, software engineering, data science, AI/ML, cloud) and management (finance, accounting, operations, HR, marketing, general management). Trades and government posts are included.
- Phone: a vertical stepper. Wide screens: a horizontal map, with a dashed line when a cross-pathway exists.
- "What opens up for me now" follows the selected child's class. Science in Class 11 or 12 keeps both PCM and PCB open.
- Control → Content → Careers: filter, edit, approve, reject, and a due-for-review filter. The importer loads the seed as pending. An unchanged approved row stays approved.

## Files

New family code lives in `src/lib/family/careers/` and `src/components/family/careers/`. The review writer is `src/lib/content/career-review.ts` so it can write the audit log without sitting inside the family module.

Existing files touched, and why:

- `src/app/(family)/family/(app)/future/career/page.tsx` — mounts the explorer. The entrance listings are still rendered on that page.
- `src/lib/i18n/messages/en.ts` and `hi.ts` — one block of career words after `fam.hub.checked`.
- `src/components/app-shell/page-words.ts` — the Control careers route.
- `src/app/(admin)/control/content/page.tsx` — the Careers link.
- `scripts/check_rls_policies.py` — the seven family read policies and the seven restrictive twins.
- `scripts/check_family_boundary.py` — Control may import the career catalog, labels and importer, and the review file may import the family's hash and due-date rule.

`HubShell.tsx`, `hubs.ts`, the Exams page and the Schemes page were not edited.

## Migration the founder approves

`supabase/migrations/20261115120000_career_hub_a.sql`

Tables: `content.career_fields`, `content.careers`, `content.career_steps`, `content.career_parallel_actions`, `content.career_cross_pathways`, `content.career_lateral_routes`, `content.career_region_notes`.

Do not run this against the production database from this branch. Apply it the same way as the other migrations, when you are ready.

## How to import and approve

1. Apply the migration on the database you use for review.
2. Open Control → Content → Careers.
3. Press "Load the seed as pending". Every row is pending. Families still see nothing.
4. Read a row, edit it if the words are wrong, then Approve. Reject needs a short reason.
5. A second load does not un-approve a row whose text has not changed. Changed text returns to pending.

Counts only, no database: `npx tsx scripts/careers/import-seed.ts`

The seed file is `data/careers/career_seed.json`. Basis: `general_knowledge`.

## Known limits

- Region notes have a table and no screen. The screen is later work.
- The interest quiz, a teacher view, and a richer editor are not in this slice.
- Science does not store PCB versus PCM on the child. Both stay open for a science student in Class 11 or 12.
- Entrance steps name an exam with a soft key such as `nta.jee_main`. They do not link to a row in the entrance-exam tables.
- "Top" and "CEO" are typical stages, not a promise.
- Screenshots in `docs/screenshots/career/` are phone-width renders of the explorer words and of the roadmap component. They are not a signed-in session.
