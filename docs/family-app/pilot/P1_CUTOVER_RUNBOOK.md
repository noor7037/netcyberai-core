# P1 production cutover runbook

**From the build lead, for Noor and the supervisor.** This runbook moves the live site to the production database
before the first pilot (50 Class 5 children, EVS; C230-S). It updates `docs/18_PRODUCTION_CUTOVER.md`, which was
written when production had 49 migrations; doc 18's dashboard steps (§2 A–E) and its Vercel split (§3 step 3) still
apply and are not repeated here. Decision Log **C302**.

**Nothing below runs until Noor approves the Supabase Pro plan** (backups and leaked-password protection, C296).
Real children's data never goes into the test database.

## 0. Noor's part, in order

1. **Approve Supabase Pro** for the organisation (chat: "Pro approved"). This is the only thing that starts this
   runbook.
2. On "ready for you" from the build lead: doc 18 §2 A–C on the **new** production project (auth URLs, SMTP, email
   templates, TOTP, leaked-password protection on, the `app_backend` password, collect the URL, keys and pooler
   string). About 30 minutes.
3. "Go", then doc 18 §3 steps 3, 4 and 6 (Vercel variables, create your user, sign in and set up your authenticator).
4. After the checks pass: Control → AI, enter the AI key **on production** and choose a provider cleared for minors.
   A key is never copied between databases.

Everything else is the build lead's.

## 1. Where things stand (checked 2026-10-22)

| | Test (`unodnyyfqhxrbusbkite`) | Production (`rkpfkqpotmpupbjfambg`) |
|---|---|---|
| Serves the live site | yes | no |
| Migration history | every repo file (155) | 146 rows; the last is `f1_trusted_devices` |
| Drift | none known | `m1_family_content_control`, `wa1_all_classes_boards`, `wa2_subjects`, `wb1_english_course`, `m2_daily_habit`, `m2_10_school_ai`, `m2_11_health_and_queues`, `p1_2_open_subjects`, `p1_3_reviewed_only` have no history row, yet `family`, `content` and `control` tables exist |
| Data | test schools, test families, the catalog, the English course | 2 leads; 0 users, 0 families, 0 syllabus versions |
| Plan | free | free |

Production's history no longer says how its schema was made, so applying "the missing ones" cannot be proven clean.

## 2. The approach: a clean replay into a new production project

- **Chosen:** create a new, empty project on the Pro plan (`netcyberai-prod`, region as test), replay **every**
  repository migration in file order, and prove the schema matches test. The old production project holds only 2
  leads (copied in step 6); it is paused after the cutover and deleted only on Noor's word.
- **Rejected:** reset the old project in place. Roles (`nca_super`, `app_backend`), storage buckets, cron jobs and Vault
  secrets live outside the schemas a reset drops, so the replay would meet leftovers and stop.
- **Rejected:** apply only the missing migrations. Two of them would fail on objects that already exist, and the result
  could not be compared with a known history.

## 3. Before "go" (build lead; the live site is untouched)

1. **Create the project** (Supabase MCP `create_project`, after `get_cost` and `confirm_cost`; the cost is stated in
   chat first). Pro plan, point-in-time recovery on.
2. **Replay:** `apply_migration` for each file in `supabase/migrations/` in name order, the file's text exactly. After
   each, `md5(statements[1])` on the new project must equal the file's md5; any mismatch or error stops the run.
   Record each version the project assigns.
3. **Schema fingerprint:** run `scripts/catalog_snapshot.sql` on test and on the new project; the two outputs must be
   identical in every category (tables, columns, constraints, indexes, policies with their expressions, functions with
   their bodies, grants, roles, extensions, cron jobs). Then `scripts/cutover/readiness.sql` on the new project: no
   data except what migrations seed.
4. **Security and backups:** the security advisor shows no finding; Database → Backups shows point-in-time recovery on
   and a first backup.
5. **Content replay** (no personal data in any of it):
   - Every catalog and course file in `data/` is loaded with the same generator and the same `--ref` as on test
     (`scripts/content/catalog-sql.mjs`, the English course loader), each one run twice (the second run is skipped by
     its ref).
   - Then each version's status is set to match test (in review, released with its audience, superseded). An approval
     on test was made by a person; on production it is recorded as **carried from the test approval**, with Noor's
     production user as approver and the test approval's date in the audit row. This needs Noor's production user, so
     it runs after "go" step 4.
   - Control's settings rows that differ from the migration seeds (open subjects, checked-only subjects, video channels,
     flags) are copied as they are on test.
   - Checked explanations (`content.responses`, status `checked`) are copied with their blocks; they hold no child.
     AI-made ones are not copied; they are prepared again on production (§5).
   - Proof: an md5 per table over its content columns, ordered by key, equal on both databases.

## 4. "Go" (doc 18 §3, with these changes)

- **Step 1:** the readiness and fingerprint checks of §3 above, on the new project.
- **Step 2:** copy the 2 leads (and any applications, invitations or jobs that exist then) from **test**, where the
  live site has been writing, to the new project; counts compared.
- **Step 3 (Noor, Vercel):** as doc 18, with the new project's values:
  - `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: untick Production on the shared entry
    and add a Production-only entry.
  - `SUPABASE_SERVICE_ROLE_KEY` (Production only): edit to the new project's key.
  - `APP_SESSION_SECRET` is already Production-only (doc 18 §0): replace its value with a new one, so every old token
    is refused.
  - `AI_CREDENTIALS_KEY`, `MESSAGING_CREDENTIALS_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`,
    `ONBOARDING_NOTIFY_EMAIL`, the WhatsApp values: unchanged. The keys stored in a database are sealed per database,
    and production starts with none.
  - Redeploy.
- **Steps 4–7:** as doc 18 (Noor's user, the platform-admin row, Noor's sign-in with a new authenticator, the job
  sweeper's secrets generated in the new project's Vault).

## 5. Checks after "go" (evidence in chat)

1. `/api/health` answers ok on the new commit; the app's connections are on the new project and none on test.
2. **Sign-in smoke test:**
   - Noor signs in to Control (password, email code, authenticator).
   - A family test sign-in with a build-lead mailbox: the email code arrives and the parent area opens. This
     production family account is deleted right after, with its child.
   - A school staff sign-in for a test school is refused (test schools stay on test).
3. **The pilot screens:** Class 5 EVS is released on production. A Class 5 test child, in English and in Hindi, sees EVS
   open with 10 chapters and 67 topics named in their language, and a topic says "being checked" until its explanation
   is checked. Harness photographs at 390 and 1440. The test child is deleted afterwards.
4. Noor enters the AI key (§0 step 4). Then Control → Content → Responses → *Prepare explanations* for Class 5 EVS v2
   (154 explanations), reviewed by Noor or the supervisor's chosen reviewer. The pilot starts only when every one is
   checked.
5. **Test holds no real child:** on test, `family.accounts` lists only the build lead's test accounts, compared with the
   list taken before "go". From now on Preview and Development point at test and production at production.

## 6. Rollback (any time before the pilot's first child signs up)

- **Noor, Vercel:** as doc 18 §4: delete the Production-only entries, tick Production on the shared ones, put back the
  test service_role key, redeploy. The site is on test again within minutes; nothing on test was changed.
- **Build lead:** the job sweeper's secrets back on test; anything created on production during the window is listed
  (counts first) and copied back on Noor's "yes".
- **After a real child has signed up,** rollback means moving that family's data back to test, which the rule forbids.
  From then on a fault is fixed forward, and point-in-time recovery restores production itself.

## 7. Time

About 2 hours of the build lead's work before "go" (the replay and content load), about 30 minutes of Noor's in
dashboards, and about 10 minutes when sign-in is unavailable during "go". The public website stays up throughout.
