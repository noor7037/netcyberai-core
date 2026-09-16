# NetCyberAI — Build Order

## Phase 0 (now, unblocked) — Public Web Platform only

1. Design tokens + shared layout (one design system, per Constitution §4).
2. Home page + 6 feature pages (see `netcyberai_public_site_content_plan.md`).
3. `/security/data-ownership` and `/pricing`.
4. `/demo` — sandbox tenant, clearly labelled, cannot send real outbound
   messages (structurally, not just by a setting).
5. Blog posts 1-15, with #5 and #14 using the corrected titles.
6. Sitemap, robots.txt, JSON-LD FAQ schema on every page.
7. Deploy. Start driving real search traffic and demo requests.

**Go/no-go before Phase 1:** has the Bridge Rule trigger actually been
met — either 60-90 days of real Pulse data from a real school, or 2-3
schools explicitly asking for production access? If not, stop here and
keep running the public site + whatever pilot channel already exists
(n8n or otherwise) until it is.

## Phase 1 (gated — do not start until the above go/no-go is a real "go")

1. Postgres schema + RLS applied to a real Supabase project (files
   already in this pack).
2. Auth (Supabase Auth, role + `school_id` in the session claim).
3. Control Plane: school onboarding wizard, plan/feature-flag
   assignment, pilot whitelist toggle.
4. Principal dashboard: overview, approvals, TC kanban, export centre.
5. Teacher workspace: attendance, syllabus exceptions, marks, own
   Impact Card.
6. Parent portal: child profile, fees + Razorpay, Pulse history,
   Recognition panel, documents.
7. Core automations: fee recovery cron, Daily Pulse trigger, Weekly
   Brief cron, Recognition Engine fortnightly job, at-risk detector.
8. Seed one real demo school (not a fabricated case study — an actual
   sandbox with realistic but clearly-fictional data).
9. Run `ACCEPTANCE_CHECKLIST.md` before calling anything done.

## Phase 2+ (explicitly deferred, not forgotten)

Coaching/college tenant UI. Native apps. Voice Pulse, missed-call
report, homework photo queue. Library/hostel/full payroll depth.
