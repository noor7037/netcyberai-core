# 18 — Production cutover runbook (P1-a)

**Governs:** moving the live site from `netcyberai-dev` (`unodnyyfqhxrbusbkite`)
to `netcyberai-prod` (`rkpfkqpotmpupbjfambg`), and what happens to the old
database afterwards. Decision Log C111.
**Status:** prepared, **not executed**. Nothing in Vercel changes until Noor
writes "go" in chat.
**Secrets:** every value below is typed by Noor into the Supabase or Vercel
dashboard or his own terminal, and kept in his password manager. None is
pasted into chat, a file in the repo, or a PR. Claude never sees one.

---

## 1. What moves and what stays (inventory 2026-09-30, counts only)

| On the live database today | Where it goes | Why |
|---|---|---|
| 2 leads (public forms) | **Copied to prod** by Claude at "go" (re-counted then) | Real enquiries |
| School applications, staff invitations, jobs (0 each today) | **Copied to prod** if any exist at "go" | Real onboarding |
| The founder's platform-admin account | **Re-created on prod** by Noor (§3 step 4); his authenticator is set up again | Password hashes and authenticator secrets are never copied between databases |
| 2 test schools (`is_test_fixture`), their 160 students, the other test accounts | **Stay** on the old database | Test data; the old database becomes the **test database** |
| 6 Vault secrets: the job runner's 2 and 4 WhatsApp tokens of deleted test configs (0 WhatsApp configs exist) | Runner secrets: new ones generated **in** prod; the rest stay | A secret is generated where it is used, never copied |
| Storage objects (0), audit rows (11, test activity) | Stay | Nothing real |

Prod today: all 49 repo migrations applied (49 history rows, one per file;
dev's history has 52 rows, 3 of them Phase 0 probes kept as a record only; the
last two are P1-b, C112), catalog identical to dev in all
18 categories, the same roles, extensions and cron jobs, no data, no Vault
secrets. Re-checked at "go" with `scripts/cutover/readiness.sql`.

## 2. Before "go" — Noor, in dashboards (about 30 minutes)

Do these any time; none of them changes the live site.

**A. Supabase, prod project (`netcyberai-prod`) → Authentication:**
1. URL Configuration: Site URL `https://www.netcyberai.com`; redirect URL
   `https://www.netcyberai.com/login` (copy the list from the dev project).
2. Emails → SMTP settings: the same Resend SMTP as the dev project (host
   `smtp.resend.com`, port 465, user `resend`, password = the Resend API key,
   sender address and name as on dev).
3. Emails → Templates: Magic Link, Reset Password and Invite user from
   `docs/15_EMAIL_TEMPLATES.md` (or copy them from the dev project).
4. Sign In / Providers → Email: the same OTP expiry and length as dev.
   Multi-Factor → TOTP enabled (default). Attack Protection → leaked-password
   protection **on**.

**B. Supabase, prod project → SQL Editor:** give `app_backend` a password.
In your own terminal: `openssl rand -hex 32`. Then in the prod SQL editor:
`alter role app_backend with password '<that value>';`. Keep it in your
password manager. Run this on the **prod** project only, never on the dev
project (§2 D).

**C. Collect from Supabase, prod project → Project Settings:**
- Project URL and the anon (publishable) key (API).
- The service_role key (API; secret).
- The **transaction pooler** connection string (Database → Connect →
  Transaction pooler, port 6543). Its user is `app_backend.rkpfkqpotmpupbjfambg`
  (replace `postgres.` with `app_backend.`) and its password is the one from B.
  That string is the new `DATABASE_URL`.

**D. Rollback needs no saved values. Do not change anything on the dev
project.** §3 step 3 never deletes or overwrites a shared entry: for
`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `APP_SESSION_SECRET` the existing entry stays exactly as it is, with
**Production** only unticked, so rolling back is re-ticking it (§4). The one
entry that is edited, `SUPABASE_SERVICE_ROLE_KEY`, can be copied again at any
time from Supabase → the dev project → Project Settings → API.
**Never set a new `app_backend` password on the dev project:** the live site
signs in to the database with the current one, so changing it takes the live
site down at once (C122).

**E. A new session secret for Production only:** `openssl rand -hex 32`.
Today `APP_SESSION_SECRET` is one value shared by Production, Preview and
Development, so a preview deployment can sign tokens the live site accepts.
Production gets its own at "go" (everyone signs in again then anyway).

## 3. "Go" — in this order

Noor writes "go" in chat. Claude runs the steps marked **Claude** and says in
chat when each Noor step can start. Expected downtime: sign-in is
unavailable between steps 3 and 5 (about 10 minutes); the public website
stays up throughout.

1. **Claude:** `scripts/cutover/readiness.sql` on both databases and the
   catalog snapshot (`scripts/catalog_snapshot.sql`): prod empty, schemas
   identical. Stop if not.
2. **Claude:** copy the leads (and any applications, invitations, jobs) from
   dev to prod; counts compared and reported (numbers only).
3. **Noor, Vercel → netcyberai-core → Settings → Environment Variables:**
   the current entries are shared by several environments, so **split, do
   not overwrite, and never delete an existing entry** (rollback is
   re-ticking it, §4):
   - `DATABASE_URL`: edit the existing entry and untick **Production** (it
     stays for Preview and Development: the test database). Add a new entry,
     **Production** only, with the value from §2 C.
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the same
     (existing entry keeps Preview; new Production-only entry with prod values).
   - `SUPABASE_SERVICE_ROLE_KEY` (Production only today): edit it to the prod
     service_role key. This is the only value that is replaced; the dev one
     stays available in the Supabase dashboard (§2 D).
   - `APP_SESSION_SECRET`: untick Production on the existing entry; add a
     Production-only entry with the value from §2 E.
   Then Deployments → the latest Production deployment → **Redeploy** (the
   `NEXT_PUBLIC_` values are built into the pages).
4. **Noor, Supabase prod → Authentication → Users → Add user → Create new
   user:** your email, a password of your choice, "Auto Confirm User" on.
5. **Claude:** add your platform-admin row on prod for that account
   (`users`, role `super_admin`, same display name and phone as on dev).
6. **Noor:** sign in at `/login`: password, then the code from our email,
   then the site shows the authenticator setup: scan the new QR code, type
   its code. In Google Authenticator, delete the old NetCyberAI entry
   afterwards (the old one only works on the test database).
7. **Claude:** the job sweeper: generate the runner secret **in** prod Vault
   (never exported) and set its URL; delete the two runner secrets from the
   test database so it stops calling the live site. Check that prod's
   pg_net calls answer 200.
8. **Claude, checks (evidence in chat):** `/api/health` answers
   `{"status":"ok"}` with the new commit; Supabase prod auth log shows
   Noor's sign-in (`/token`, `/factors/…/verify`); prod `leads` count equals
   step 2's; the security advisor on prod shows no finding.

## 4. Rollback (any time, fastest first)

1. **Noor, Vercel → Environment Variables** (no saved values needed):
   - `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `APP_SESSION_SECRET`: delete the
     **Production-only** entry added in §3 step 3, then edit the original
     entry and tick **Production** again (in that order: one key cannot have
     two entries for the same environment).
   - `SUPABASE_SERVICE_ROLE_KEY`: edit it back to the dev project's
     service_role key, copied from Supabase → the dev project → Project
     Settings → API.
   Then Redeploy. The old database was never changed by the cutover except
   losing its two runner secrets (step 2 puts them back), its `app_backend`
   password is untouched, and your old account and authenticator still work
   there.
2. **Claude:** re-create the runner secrets in the test database, delete
   prod's; list anything created on prod during the window (leads,
   applications, users: counts first, then rows copied back on your "yes").
3. Nothing is deleted from either database during the cutover, so rollback
   never needs a restore.

## 5. After the cutover

- **The old project is the test database.** Vercel Preview and Development
  keep pointing at it, so preview deployments stop sharing the live database
  (the long-standing C48/C94 concern). Rename it `netcyberai-test` in the
  Supabase dashboard when convenient (display name only; the ref stays).
- **Migrations are test-first from now on:** `apply_migration` on the test
  database, run the checks there, then on prod, then the catalog snapshot on
  both (roadmap 16 §3). Real data never goes to the test database.
- **Supabase Pro + PITR** for prod is still before the first real school's
  data (build plan B2; Noor's decision, 16 §2).
