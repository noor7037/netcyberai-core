# AG-4 — Help Center content (English + Hindi)

**Branch:** `ag/AG-4-help-center` · **Status:** Blocked · **Depends on:** AG-1

## Goal
Short, task-based guides for what is **live today**, so a principal or teacher
can self-serve instead of calling the founder.

## Allowed paths
- `src/content/help/**` (new: one typed file per article, EN and HI side by side)
- `src/app/(school)/app/help/**` (new pages rendering the articles)
- `src/components/app-ui/help/**`

## Build
- Articles, each one job in 3 to 7 numbered steps:
  - Signing in, with or without an authenticator
  - Forgot password
  - Setting up an authenticator
  - Sending a staff member a reset code
  - Adding students and CSV import
  - ID cards and QR codes
  - Marking attendance
  - Certificates
  - Register your school
- Read the live UI copy in the code for each flow; never describe a button that
  doesn't exist.
- Hindi: plain, spoken Hindi (not Sanskritised). Mark every HI article
  `reviewed: false` until the founder or a native speaker approves it.
- Page features: search across titles, a list by group, related articles, and
  a "Still stuck? Raise a ticket" link (a placeholder route until Core ships
  tickets).

## Done when
- Each article is checked against the real screen, with a screenshot of the flow it describes.
- `ci_local.sh` passes every step. Pages are shown at 390 and 1440.
