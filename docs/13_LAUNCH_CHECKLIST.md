# 13 — Launch Checklist (infrastructure upgrades and the claims they unlock)

Founder direction, 2026-09-27: build everything to launch standard now;
infrastructure plans (database tier, backups, monitoring, providers) are
upgraded before launch, and the platform may move provider later. Build
work never waits on these. What does wait is the **public claim**: each
website promise below goes live only when its row here is done, by
flipping its status to `confirmed` in `src/content/pricing.ts` (the page
publishes confirmed claims automatically).

| # | Upgrade before launch | Why | Unlocks claim / feature |
|---|---|---|---|
| 1 | Supabase (or successor) paid tier with daily backups + point-in-time recovery; confirm a restore drill works | Leads and school data must be recoverable; free projects can pause | `daily-backups` |
| 2 | Uptime + error monitoring with alerting (and the `control/monitoring` screen fed from it) | Needed to measure and honour any availability promise | `sla` (once a target is chosen) |
| 3 | `DATABASE_URL` for `app_backend` set on the production host and a live form test of all six lead sources | Proves browser → API → database → Control Plane in production | Lead forms verified live |
| 4 | Razorpay live keys + webhook secret (test mode first, task 89) | Fee payments, receipts, reconciliation | Fees & receipts module |
| 5 | WhatsApp Business provider approved, templates approved, per-school `pilot_allow_outbound` switched on deliberately | Outbound messages beyond the pilot gate | Daily Pulse, fee reminders, receipts on WhatsApp |
| 6 | Lawyer review of `/privacy` and `/terms` (DPDP Act), incl. the enquiry-form retention and deletion wording | The policy is marked draft | Remove "draft" notice |
| 7 | Approved commercial terms: per-student price, first-month offer, free plan scope, setup/hosting fees, exit terms | Pricing page shows only confirmed claims | `per-student-15`, `first-month-free`, `free-plan-permanent`, `no-setup-fees` |
| 8 | Per-tenant full data export built and tested (docs/03 "recorded requirement, not built") | Constitution: full export must remain possible | "Export your data" claims (currently "planned") |
| 9 | Migration playbook timed on a real school's data | A migration time can only be promised after measuring it | `migration-24h` (with the measured figure) |

Provider moves: the app talks to Postgres through `src/lib/auth/db.ts`
(one choke point, enforced by `scripts/check_choke_point.py`) and to
WhatsApp through one send-gate (`scripts/check_whatsapp_send_gate.py`), so
changing database host or messaging provider is a configuration and
adapter change, not a rewrite. Migrations in `supabase/migrations/` are
plain SQL and replay on any PostgreSQL 15+.
