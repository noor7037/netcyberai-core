# PHASE 1 EXECUTION BIBLE

**Document ID:** NCA-EXEC-P1
**Repo path:** `docs/08_EXECUTION_BIBLE.md`
**Governs:** the Phase 1 build sequence, prompt by prompt.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md) (this
document records Amendment 1) and
[`04_SYSTEM_DESIGN_PRD.md`](04_SYSTEM_DESIGN_PRD.md) (every prompt
cites it by section).
**Status:** Active build manual. Supersedes
`archive/BUILD_ORDER.md`'s Phase 1 gating.
**Amendment awareness:** this document records Amendment 1 (the Bridge
Rule override) below. Amendments 2 (market scope) and 3 (AI content
governance + North Star metric) were recorded later, directly in
`01_CONSTITUTION.md` §2 and §3 — read those before Prompt J (the
recognition/Pulse prompt) and before setting any Pulse-response-rate
target, since Amendment 3 changed what that target measures.

---

## CONSTITUTIONAL AMENDMENT — RECORDED

*(This amendment now also lives inline in
[`01_CONSTITUTION.md`](01_CONSTITUTION.md) §6 itself, per §12's own
rule that changes land in the Constitution, not only in a build
document. Kept here too since this is where the mitigation table below
is operationally referenced from every affected prompt.)*

**Amendment 1 to `01_CONSTITUTION.md` §6 (The Bridge Rule).**

Per `01_CONSTITUTION.md` §12 (Amendment Process), which
requires that changes "land here, as a new version, with the reasoning
recorded" rather than being silently applied:

**§6 is overridden by founder decision.** Phase 1 platform engineering
(Platform 2 Control Plane, Platform 3 School Workspace) is authorized
to begin immediately, without the 60–90 day pilot data trigger.

**Founder's reasoning, recorded verbatim in substance:** infrastructure
is provisioned (GitHub, Vercel, Cloudflare, n8n, WhatsApp Business API,
PostgreSQL). Go-to-market strategy changed from *validate-then-build*
to *build-then-demonstrate*. A complete working ecosystem shown to a
principal converts better than a manual pilot described to one.

**What the override does not change:**
- Every other Constitution section remains in force, unamended.
- `../db/schema.sql` and `../db/rls_policies.sql` remain the
  locked data layer. Postgres + RLS, not Firestore.
- The `../src/lib/recognition.ts` formula remains locked. The v1.0
  headroom formula stays banned.
- All bans in `05_BUSINESS_LOGIC.md` §6 remain permanent.

**One risk this override creates, and how this document handles it.**
§6's function was not only to conserve effort. It was to prevent
*locking parameters whose correct values can only be learned from real
parents*. Three are affected:

| Parameter | Constitution reference | Mitigation in this build |
|---|---|---|
| Pulse comprehension response-rate target | §3 North Star (Amendment 3 changed this from open rate — see that amendment before assuming >65% or any other number) | Stored in `schools`/config, not hardcoded. Instrumented from first send. Target itself is `[GAP]` until real data exists. |
| Recognition thresholds (5-point floor, band count) | §5 | Per-school config with a fairness audit surface. See Prompt J. |
| Message cost model | §7 | Rate table configurable with verification date. Governor reads config, never a constant. |

Building against configurable parameters costs nothing now. Hardcoding
them costs a migration and a data backfill later.

---

# PHASE 1 — INFRASTRUCTURE & SECURE ACCESS

Written for an IT/network background. Where the analogy helps, it's used.

## 1.1 What Claude Code actually needs — and what it must never have

Claude Code runs as a process on your machine, inside your repo
directory. Think of it as a contractor with a desk in your office: it
can read and write files in that directory, run commands in your
shell, and use whatever credentials your shell environment already
has. It has no independent network identity and no credentials of its
own.

The security model follows directly from that:

| Asset | Claude Code gets | Rationale |
|---|---|---|
| Repo files | Full read/write | This is the job |
| Shell commands | Yes, in the repo directory | Builds, tests, migrations |
| `.env.local` **file reference** | Code reads `process.env.X` | Never the values |
| **Dev** database URL | In `.env.local`, yes | Safe to break, safe to reset |
| **Production** database URL | **Never** | One bad migration is unrecoverable |
| Supabase `anon` key | Yes | Public by design, RLS-protected |
| Supabase `service_role` key | **Never in client code** | Bypasses RLS entirely — see 1.4 |
| WhatsApp Business token | Server-side env only | Billable, and it sends to real parents |
| n8n webhook secret | Server-side env only | Signature verification |

**The single rule that covers all of it:** secrets live in files you
create, that git ignores, that Claude Code writes *references* to but
never *values* into. You never paste a credential into a chat window.
If a credential ever appears in a conversation, rotate it — treat it
as compromised the same way you'd treat a router password read aloud
in a meeting room.

## 1.2 GitHub — and why you probably don't need MCP for it

**Start here:** Claude Code already works with git natively. It's
running in your repo and can execute `git status`, `git diff`,
`git add`, `git commit`, `git checkout -b` — everything you'd do at
the terminal. For writing code, committing, and branching, **no MCP
setup is required at all.**

GitHub MCP adds a different capability: operating on GitHub's *API* —
creating pull requests, reading and commenting on issues, inspecting
CI runs. Useful, not required to start.

**Recommended sequence:**

1. **Now:** clone the repo, run `claude` inside it, work with plain
   git. Zero setup.
2. **Later, if you want PR and issue automation:** add the GitHub MCP
   server. Setup is `claude mcp add` with a GitHub personal access
   token. Check `https://docs.claude.com/en/docs/claude-code/mcp` for
   the current command syntax rather than trusting a command written
   in a document that may have aged.

**PAT scoping, when you do it.** Use a fine-grained token, scoped to
this single repository, with the minimum permissions you need
(Contents: read/write; Pull requests: read/write; Issues: read/write).
Set an expiry. Do not use a classic token with `repo` scope — that's
the equivalent of handing over enable-mode on every device in the
estate when you only needed access to one switch.

## 1.3 Environment files — the actual mechanism

Three files, three different purposes. This is the part that matters
most and is easiest to get subtly wrong.

**`.env.example`** — committed to git. Keys only, no values. This is
documentation of what the app needs.

```bash
# .env.example  — COMMITTED. Never put real values here.
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
NEXT_PUBLIC_WHATSAPP_NUMBER=
```

**`.env.local`** — **you** create this, git ignores it, Claude Code
never writes values into it. Real values, development credentials only.

**Vercel environment variables** — set in the Vercel dashboard, by
you, for preview and production separately. Production values never
touch your laptop.

**Verify the gitignore before anything else.** One command, do it now:

```bash
grep -n "env" .gitignore
# Must include: .env*.local   and ideally  .env
git check-ignore -v .env.local
# Must print a matching .gitignore rule. If it prints nothing, STOP.
```

A `.env.local` committed once is in git history permanently. Rotating
the credentials is then the only remedy.

## 1.4 The Supabase key distinction — read this twice

Supabase issues two keys and confusing them is the most common way a
multi-tenant app leaks every tenant's data at once.

| Key | Safe in browser? | What it does |
|---|---|---|
| `anon` / publishable | **Yes** | Subject to RLS. Every query filtered by policy. |
| `service_role` | **Absolutely not** | **Bypasses RLS entirely.** Full read/write on every row in every school. |

`NEXT_PUBLIC_` prefixed variables in Next.js are **embedded in the
JavaScript bundle sent to every browser**. Therefore:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — correct, by design.
- `SUPABASE_SERVICE_ROLE_KEY` — **no prefix, ever.** Server-side only:
  route handlers, server actions, migrations.

Prefixing the service role key would ship a master credential to every
visitor's browser. It would pass every test, look completely normal,
and expose every school's student records to anyone who opened
devtools. This maps directly to
`01_CONSTITUTION.md` §4 ("never rely on application code
alone to filter by tenant") and to `../db/rls_policies.sql`'s
three-role model: `nca_super` is `BYPASSRLS` and corresponds to the
service role. Guard it accordingly.

## 1.5 Two databases, not one

Provision **two** Supabase projects:

- `netcyberai-dev` — Claude Code's connection string goes here.
  Resettable. Seed data lives here.
- `netcyberai-prod` — credentials live only in Vercel. Never in
  `.env.local`. Never in a chat.

Rationale: migrations get iterated during a build. A destructive
migration against a dev database costs a reset. Against production, it
costs real student records — and per `01_CONSTITUTION.md`
§9, financial records are never deleted, which means an accidental
`DROP` is not just downtime, it's a compliance failure.

## 1.6 WhatsApp — the pilot gate applies to you first

Before any credential is wired up, confirm the safety posture defined
in `05_BUSINESS_LOGIC.md` §5 and
`../db/schema.sql` (`schools.is_pilot`,
`schools.pilot_allow_outbound`):

- Every school row is created with `pilot_allow_outbound = false`.
- The send gate blocks and logs as `blocked_pilot`.
- During development, use Meta's **test number** with your own phone
  as the sole recipient.

`01_CONSTITUTION.md` §9 bans silent failures. A message
accidentally reaching a real parent during development is the mirror
image of that, and worse — it's a silent *success* nobody authorized.

## 1.7 n8n

n8n calls into your Next.js API routes, and your routes call n8n
webhooks. Both directions are authenticated:

- **n8n → Next.js:** HMAC signature on every request, verified before
  any processing. Same discipline as the Razorpay webhook pattern in
  `04_SYSTEM_DESIGN_PRD.md` §3.3.
- **Next.js → n8n:** shared secret in `N8N_WEBHOOK_SECRET`.

n8n is an *orchestration* layer. It never holds the WhatsApp token and
never writes to Postgres directly. Per
`05_BUSINESS_LOGIC.md` §5 and
`04_SYSTEM_DESIGN_PRD.md` §3.6, there is exactly one send
gate, it lives in the Next.js app, and it is the only code path that
reaches Meta. If n8n could send directly, the consent check, budget
check, and pilot gate would all be bypassable.

## 1.8 Checklist before Prompt A

```
[ ] Repo cloned locally, Claude Code runs inside it
[ ] .gitignore covers .env*.local — verified with git check-ignore
[ ] .env.example committed, keys only, zero values
[ ] .env.local created by you, dev credentials only
[ ] Two Supabase projects: dev and prod, separate
[ ] service_role key has NO NEXT_PUBLIC_ prefix anywhere
[ ] Prod credentials exist only in Vercel, never locally
[ ] WhatsApp test number configured, your phone as only recipient
[ ] n8n reachable, HMAC secret generated
[ ] Confirmed: no credential has ever been pasted into a chat
```

---

# PHASE 2 — DATABASE & BACKEND INITIALIZATION

Copy each prompt into a fresh Claude Code session. Run its verification
before the next one. Do not batch.

---

## PROMPT A — Schema

```
Apply the locked database schema to the dev Supabase project.

SOURCE FILES — read fully before writing anything:
- ../db/schema.sql (the locked core schema — authoritative)
- 04_SYSTEM_DESIGN_PRD.md §5 (schema reconciliation),
  §6.4 (capture subsystem tables)
- 05_BUSINESS_LOGIC.md §2 (fee engine tables), §3
  (compliance_config), §4 (at_risk_flags), §5 (pulse tables)
- 01_CONSTITUTION.md §4 (Postgres + RLS is locked)

TASK
Every migration below is a numbered file under supabase/migrations/,
per 03_ARCHITECTURE_PLAIN.md's db/ vs supabase/migrations/ split.
../db/schema.sql is the locked reference baseline and is never edited
directly — it stays byte-identical so it remains a verifiable point of
comparison. Apply, in order:

1. ../db/schema.sql as the baseline migration, unmodified.
2. Additive migration: fee engine tables from 05_BUSINESS_LOGIC.md §2 —
   fee_heads, fee_structures, fee_structure_items, fee_concessions,
   payments. Add 'partial' to the fee_status enum.
3. Additive migration: compliance_config (05_BUSINESS_LOGIC.md §3,
   now also carrying filing_deadline/filing_deadline_source alongside
   cpi_percent/cpi_source — 04_SYSTEM_DESIGN_PRD.md §3.3),
   at_risk_flags (05_BUSINESS_LOGIC.md §4), pulse_messages +
   pulse_response_log (05_BUSINESS_LOGIC.md §5).
4. Additive migration: capture subsystem from PRD §6.4 —
   student_qr_tokens, qr_scan_log, captured_documents,
   ocr_extractions, and the attendance.capture_method column.
5. Additive migration: configurable parameters per Amendment 1
   (01_CONSTITUTION.md §6) — per-school config for the Pulse
   comprehension response-rate target (Amendment 3 changed this from
   open rate; see that amendment before setting any number),
   recognition thresholds, and message rate table with a verification
   date column. These must NOT be hardcoded constants anywhere.
6. Additive migration — the `not_taught` fix (Decision Log A1). The
   baseline schema's `syllabus_progress.status` check constraint only
   allows `('completed','delayed','partial')`, but every other
   document specifies four states including `not_taught`, and the
   Pulse's core honesty guarantee ("a `not_taught` topic generates no
   Pulse") is unbuildable without it:
   ```sql
   alter table syllabus_progress drop constraint syllabus_progress_status_check;
   alter table syllabus_progress
     add constraint syllabus_progress_status_check
     check (status in ('taught','delayed','partial','not_taught'));
   update syllabus_progress set status = 'taught' where status = 'completed';
   alter table syllabus_progress alter column status set default 'taught';
   ```
7. Additive migration — multi-school membership (Decision Log C14).
   The baseline schema has `users.school_id NOT NULL` (one school per
   user) and no `academic_coordinator` role; 04_SYSTEM_DESIGN_PRD.md
   §2.2 specifies multi-school memberships and that role, and Prompt D
   builds an Academic shell that needs it:
   ```sql
   alter type user_role add value 'academic_coordinator';

   create table memberships (
     membership_id uuid primary key default gen_random_uuid(),
     user_id       uuid not null references users(user_id),
     school_id     uuid not null references schools(school_id),
     role          user_role not null,
     is_active     boolean not null default true,
     created_at    timestamptz not null default now(),
     unique (user_id, school_id)
   );
   create index idx_memberships_user on memberships(user_id);
   create index idx_memberships_school on memberships(school_id);

   alter table users alter column school_id drop not null;
   -- users.school_id becomes the user's primary/home school for
   -- defaulting only. RLS session context resolves from the ACTIVE
   -- MEMBERSHIP, not from users.school_id -- this is a real change to
   -- the auth flow; call it out explicitly in Prompt B2.
   ```
   Write the actual RLS policy and index changes this table needs
   against the real schema — the DDL above is the shape, not a
   drop-in.
8. Additive migration — budget default and the missing schema pieces
   (Decision Log C15, C16):
   ```sql
   -- C15: 0 currently means "every non-transactional message blocked."
   -- Silent and confusing. NULL = not configured is explicit; the
   -- onboarding wizard (Prompt E) requires a real budget before
   -- pilot_allow_outbound can be set true, so nothing sends during
   -- pilot anyway and nothing is blocked that would have sent.
   alter table schools alter column monthly_budget_paise drop not null;
   alter table schools alter column monthly_budget_paise drop default;

   -- C16.1: the cost governor's own spec (PRD Sec5.2) logs this status
   -- on transactional sends past budget; the enum doesn't have it.
   alter type comm_status add value 'budget_exceeded_transactional';

   -- C16.2: webhook idempotency (PRD Sec3.3, Prompt I) needs somewhere
   -- to record payload_hash. school_id is nullable because a webhook
   -- can arrive before tenant resolution.
   create table webhook_events (
     event_id     uuid primary key default gen_random_uuid(),
     school_id    uuid references schools(school_id),
     provider     text not null check (provider in ('razorpay','whatsapp','n8n')),
     payload_hash text not null unique,
     payload      jsonb not null,
     processed_at timestamptz,
     created_at   timestamptz not null default now()
   );

   -- C16.3: blocked_quiet_hours is a specified comm_status, but no
   -- config for quiet hours exists anywhere.
   alter table schools add column quiet_hours_start time;
   alter table schools add column quiet_hours_end time;
   -- Set a sensible evening-to-morning default; leave configurable
   -- per school.
   ```

HARD CONSTRAINTS
- Column name is school_id everywhere. Any doc saying tenant_id
  refers to this column. Do not introduce both.
- Every operational table carries school_id. No exceptions.
- fees_ledger.status is DERIVED from sum(payments) vs amount_paise.
  Never set directly. Implement as a view or a trigger-maintained
  column, and say which you chose and why.
- audit_log stays append-only. No UPDATE or DELETE grants.
- No seed data in migrations. Seeds are a separate, clearly
  labelled script.

VERIFY — show actual output, do not summarise
- Every table exists; count them against the source files.
- Every operational table has school_id. Prove it with a query
  against information_schema, not by reading your own code.
- Enums match the source files exactly, including the added
  academic_coordinator role value and budget_exceeded_transactional
  status value.
- syllabus_progress.status accepts 'not_taught' and rejects
  'completed'; no row is left in a state the new constraint forbids.
- memberships table exists; users.school_id is nullable; a user with
  two memberships in different schools can be represented.
- schools.monthly_budget_paise accepts NULL and has no default.
- webhook_events exists with a unique constraint on payload_hash.
- schools has quiet_hours_start / quiet_hours_end.
- Migration runs clean on an empty database, and down-migrates.

REPORT per 02_AI_BUILDER_INSTRUCTIONS.md: what you picked, what you
rejected, [GAP] flags, verification output, smallest next step.

PREREQUISITE FROM ME: dev Supabase connection string is in
.env.local. Do not ask me to paste it into this chat.
```

---

## PROMPT B — Row-Level Security

```
Apply tenant isolation. This is the single most important prompt in
the entire Phase 1 build. Everything after it assumes it is correct.

SOURCE FILES — read fully first:
- ../db/rls_policies.sql (locked policies — authoritative)
- 01_CONSTITUTION.md §4 ("never rely on application code
  alone to filter by tenant — one missed WHERE clause is a
  cross-school data leak")
- 04_SYSTEM_DESIGN_PRD.md §2 (tenancy and identity), §11
  item 1 (the acceptance test)
- 05_BUSINESS_LOGIC.md §5 (Teacher Impact Card visibility)

TASK
1. Apply ../db/rls_policies.sql unmodified.
2. Extend the same pattern to every table added in Prompt A:
   fee tables, pulse tables, capture tables, at_risk_flags,
   compliance_config. ENABLE + FORCE RLS on each.
3. Implement per-request session context. Read the warning at the
   end of ../db/rls_policies.sql: set_config MUST run at the
   start of every TRANSACTION, not once per connection. Supabase
   pools connections. Getting this wrong means RLS silently sees a
   null tenant and hides every row — it looks like an empty
   database, not like a security error.
4. Implement the audit_log hash-chain trigger.

ROLE-SCOPED OVERLAYS — from the locked policies file
- Parents: only their own linked children, via parent_student_map.
- Teachers: only their own classes.
- Teacher Impact Card: principal/school_admin plus the teacher
  themselves. NEVER teacher-to-teacher. Enforce at RLS, not UI.
- pending_consent students: invisible to parent-facing reads.

VERIFY — this is a gate, not a checkbox
Write an automated two-school test suite:
- Seed School A and School B with overlapping-shaped data.
- For EVERY table, attempt a cross-tenant read under EVERY role.
  All must return zero rows.
- Include a deliberately buggy query that omits school_id from its
  WHERE clause and asserts RLS catches it anyway. This is the
  regression test that matters most — it proves the database is
  protecting you, not your application code.
- Teacher-to-teacher Impact Card read must fail.
- Parent read of an unlinked child must fail.

Show the actual test output. If any test fails, STOP and report.
Do not proceed to Phase 3 with a failing isolation suite.

REPORT per 02_AI_BUILDER_INSTRUCTIONS.md.
```

---

## PROMPT B2 — Authentication

```
Build authentication and role resolution.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §2.2 (identity model), §2.3
  (session and security)
- ../db/schema.sql (users, token_version column)
- 01_CONSTITUTION.md §11 (roles)

TASK
- Supabase Auth: email/password for staff, phone OTP where needed.
- Session claim carries role and school_id, resolved from the ACTIVE
  MEMBERSHIP row (memberships table, Prompt A migration 7 / Decision
  Log C14) — NOT from users.school_id, which is now nullable and only
  a home-school default. A user with memberships in two schools
  switches active school without a new login; the claim is re-derived
  from the database on switch, never accepted from the client.
- Middleware resolves the session and sets the RLS session context
  (app.current_tenant_id, app.current_role, app.current_user_id)
  at the start of every transaction.
- MFA mandatory for super_admin.
- token_version: incrementing it invalidates every issued token for
  that user immediately.
- Route protection, matching the URL segments in
  04_SYSTEM_DESIGN_PRD.md §1.1 (Decision Log C22): /control/* requires
  super_admin. /app/* requires an active school membership. Everything
  else (public marketing routes) stays open.

VERIFY
- A user with role=teacher cannot reach any /control/* route.
- A forged school_id in a request does not change what is returned —
  RLS is the backstop, prove it.
- A user with two memberships can switch active school; the session
  claim updates from the database, not from client input.
- Incrementing token_version invalidates an active session.
- Show actual output.

REPORT per 02_AI_BUILDER_INSTRUCTIONS.md.
```

---

# PHASE 3 — PLATFORM 2 & PLATFORM 3 UI

Dependency order matters: design system → layouts → Control Plane →
School Workspace. A school tenant must exist in Platform 2 before
anything can be built inside it in Platform 3.

---

## PROMPT C — Design System

```
Build the shared design system for Platform 2 and Platform 3.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §0.1 (Floor Device Standard),
  §0.2 (device matrix), §10.2 (client constraints)
- 05_BUSINESS_LOGIC.md §1 (mobile-only design invariants)
- The Phase 0 site's existing tokens — reuse, do not re-invent.

TOKENS — unchanged from Phase 0
Sapphire #0F4C81 (primary, trust) · Emerald #10B981 (growth,
recognition, success) · Amber #F59E0B (warnings, advisory) ·
Slate #1E293B (body text) · Off-white #F9FAFB (background)

FLOOR DEVICE STANDARD — the engineering contract, not a preference
- 360px viewport guaranteed. Test at 360, not 375.
- Zero horizontal scroll at 360, on every screen.
- 44x44px minimum tap targets, including table row actions.
- 16px minimum body text.
- WCAG AA minimum; AAA for critical states (errors, confirmations).
- System font stack with Devanagari fallback. No webfont download.
- Zero layout shift.

RESPONSIVE, NOT MOBILE-ONLY — read PRD §0.2 carefully
Breakpoints 360 / 768 / 1024 / 1440. Mobile is the floor, not the
ceiling. Some roles are desktop-primary (accountant reconciling, admin
importing 500 rows). Every component specified at 360 AND at 1440.
A component that only works at one end is not done.

BUILD
- Tokens module + Tailwind theme.
- Primitives: Button, Input, Select, Checkbox, Card, Table (with a
  documented mobile strategy — cards or horizontal scroll container,
  never a squeezed grid), Modal, Toast, Badge, Tabs, EmptyState,
  LoadingState, ErrorState.
- Form primitives with inline validation and explicit saved state.
- Data table: server-side pagination, sort, filter.

Constitution §9 bans silent failures. Every async action has a
visible pending, success, and error state. A teacher must never have
to guess whether attendance saved.

NO DUMMY DATA. Storybook-style demo pages, if any, use clearly
labelled fixtures in one allowlisted directory.

VERIFY
- Every primitive rendered at 360 and 1440, screenshotted.
- Automated contrast check on every token pairing.
- Automated tap-target check on every interactive primitive.
- Show actual output.
```

---

## PROMPT D — Layouts & Navigation

```
Scaffold the route groups, layouts, and navigation shells.

SOURCE FILES — the IA is fully specified, do not invent structure:
- 04_SYSTEM_DESIGN_PRD.md §7.2 (Platform 2 nav, 19 school
  sub-tabs), §7.3 (Platform 3 role shells and per-module sub-tabs)
- 12_RECONCILED_PLATFORM_FEATURE_MAP.md — CONFIRMED ABSENT from this
  repo (10_DECISION_LOG.md). Its §0 mismatch-resolution log, explaining
  why Pulse/Recognition/Teacher Impact/Capture were missing from an
  earlier blueprint, could not be reconstructed from source.
  04_SYSTEM_DESIGN_PRD.md §7.2 is written as if that log already
  happened — treat the 19-sub-tab list there as the resolved output
  and do not go looking for the missing file.
- 01_CONSTITUTION.md §11 (roles)

STRUCTURE — with explicit URL segments (Decision Log C22: a route
group alone adds no URL segment and same-path pages in two groups
would collide)
src/app/(admin)/control/  — Platform 2, super_admin only    -> /control/...
src/app/(school)/app/     — Platform 3, role-scoped shells   -> /app/...

PLATFORM 2 NAV — PRD §7.2
Dashboard · Schools · Users · Onboarding · Messaging & Cost ·
Monitoring · Analytics · Billing & Plans · Compliance ·
Integrations · Support · Audit Logs · System Settings

School detail: 19 sub-tabs, exactly as listed in PRD §7.2. Do not
drop Pulse & Engagement, Recognition, Teacher Impact, or Capture &
Documents — those are the differentiators and were missing from the
earlier blueprint (see the note above on the missing feature map).

PLATFORM 3 ROLE SHELLS — PRD §7.3
Four shells at one login: Office (principal, school_admin), Finance
(accountant), Academic (coordinator), Teacher.

Teacher shell: EXACTLY 6 nav items, phone-first, assume no desktop.
My Day · Attendance · Syllabus · Marks · My Impact · Class Notices
Plus a persistent scan action in the app bar.

Office dashboard is EXCEPTION-FIRST, not a KPI grid — PRD §7.3.
Top of screen is "Needs your decision today." Analytics one tap
down. On desktop the same content expands to multi-column.

THIS PROMPT: shells, navigation, routing, role-gated rendering, and
honest empty states only. No business logic. No data.

Route protection is server-side. UI hiding is not a control —
Constitution §4 and PRD §2.2.

VERIFY
- A teacher session reaching any /control/* route is rejected
  server-side.
- Teacher shell shows exactly 6 items, usable one-handed at 360px.
- Every route renders an honest empty state, never a crash or a
  fabricated placeholder row.
```

---

## PROMPT E — Control Plane: Onboarding & Tenants

```
Build Platform 2's school provisioning.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §7.2 (Onboarding workflow with
  the consent gate), §9 Stage 2
- 05_BUSINESS_LOGIC.md §1
- ../db/schema.sql (schools, users, system_config)

BUILD
- School onboarding wizard: profile, board, tenant_type, plan.
- Plan and feature-flag assignment. Flags gate at the API
  authorization layer, NOT merely in the UI. A hidden-but-reachable
  endpoint is an open endpoint.
- Pilot whitelist: is_pilot and pilot_allow_outbound. Every new
  school gets pilot_allow_outbound = false. No exceptions, no
  override in the wizard.
- Budget gate (Decision Log C15): monthly_budget_paise is nullable
  (NULL = not configured, never treated as "unlimited" — that would be
  a real-money footgun). The wizard REQUIRES a non-null budget before
  pilot_allow_outbound can be set true. This costs nothing during
  pilot — outbound is already blocked — and guarantees a budget exists
  by the time it matters.
- User invitation and credential delivery. Credentials are never
  sent in plaintext through a channel that persists in a log —
  one-time link or forced reset on first login.
- Impersonation: time-boxed, reason recorded BEFORE access is
  granted, logged as ImpersonationStarted/Ended, and VISIBLE TO THE
  SCHOOL. Support access the customer cannot see is surveillance,
  not support (PRD §2.3).

THE ONBOARDING WORKFLOW — PRD §7.2, note the gate
Lead → Approved → Tenant Created → Admin Invited → Data Imported
(students land in pending_consent) → Data Validated →
CONSENT COLLECTION ← this is a gate, not a checkbox →
Configuration → Training → Pilot Outbound Approved → Go-Live

Show a consent completion meter. Include the warning against staff
bulk-marking consent to clear it.

VERIFY
- New school defaults to pilot_allow_outbound = false.
- Attempting to set pilot_allow_outbound = true with a NULL budget is
  rejected by the wizard.
- A disabled feature flag blocks the API, not just the nav item.
- Impersonation writes both audit events and is school-visible.
```

---

## PROMPT F — Student Master & Capture

```
Build student records and the capture subsystem together.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §6 (capture: scanner, OCR, QR),
  §6.4 (schema), §9 Stage 3
- ../db/schema.sql (students, parents, parent_student_map)
- 01_CONSTITUTION.md §8 (consent precedes processing)

WHY TOGETHER: capture is what makes student data entry tolerable.
A pilot school typing 500 rows by hand forms its opinion of the
product before reaching anything else (PRD §9 Stage 3 rationale).

BUILD
- Student CRUD, guardians, enrolment, class/section.
- CSV import: validate → per-row error report → two-phase commit
  with file-hash idempotency → students created in pending_consent.
- Document capture: camera or gallery → compress → upload to
  school-scoped storage → OCR → PRE-FILL A FORM → human confirms →
  commit with source attached.
- QR: token issuance, ID card generation, scan-to-profile.

NON-NEGOTIABLE — PRD §6.1
- OCR NEVER writes directly to a student master record. It pre-fills
  a form a human confirms. Field-level confidence is surfaced so
  attention goes where it's needed.
- Store ocr_extractions.accepted and corrected_value — this builds
  the dataset showing where OCR is unreliable.
- DO NOT STORE FULL AADHAAR IMAGES OR NUMBERS. Last 4 digits and a
  name-match result only. Discard the image after extraction.

NON-NEGOTIABLE — PRD §6.2
- QR payload is an OPAQUE RANDOM TOKEN. Never name, admission
  number, class, phone, or DOB. A lost ID card must be unreadable
  to a stranger with a phone. This is child safety before it is
  data protection.
- Resolution requires an authenticated, same-tenant, authorized
  scanner. Every scan logged, including denials.
- Tokens are revocable — a lost card becomes inert on reissue.

VERIFY
- 500-row import lands in pending_consent with a per-row error report.
- Scan a document: OCR pre-fills, human corrects, commits with
  source linked and corrections recorded.
- Scan a QR from another school: denied AND logged.
- Revoked token resolves to nothing.
- grep the codebase: no Aadhaar image storage path exists.
```

---

## PROMPT G — Consent & Compliance

```
Build the consent layer. This precedes all messaging.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §3.5 (consent state machine),
  §9 Stage 4
- 05_BUSINESS_LOGIC.md §3 (Form 6 advisory)
- 01_CONSTITUTION.md §8 (DPDP)
- ../db/schema.sql (consent_ledger)

WHY BEFORE MESSAGING: building messaging first creates pressure to
ship the consent gate as an afterthought (PRD §9 Stage 4).

BUILD
- consent_ledger: append-only, purpose-scoped, versioned notice.
  Withdrawal is a NEW ROW, never a mutation.
- Purposes, restructured (Decision Log C20 — the original four,
  core_records/daily_pulse/recognition/weekly_brief, covered nothing
  for absence alerts, fee notices, class notices, or at-risk, which
  every other prompt assumes pass through this gate):
  core_records (required for service) · operational_communication
  (fee notices, receipts, absence alerts, certificates, school/class
  notices — required for service) · daily_pulse (opt-in, off) ·
  recognition (opt-in, off) · weekly_brief (opt-in, off) · at_risk
  (opt-in, off, PLUS schools.at_risk_parent_dispatch_enabled — both
  required, see Prompt J). Each independently withdrawable.
- Verification methods: dob_on_record, school_attested,
  digilocker_token, otp_plus_attestation.
- Guardian verification flow.
- Data access / correction / deletion request workflows.
- Retention configuration.
- Form 6 advisory per 05_BUSINESS_LOGIC.md §3: CPI read from
  compliance_config with source and date, NEVER a hardcoded constant.
  State is 'unknown' when CPI is unconfigured — say so, do not guess a
  number. The filing deadline is configuration too (Decision Log C18)
  — compliance_config.filing_deadline / .filing_deadline_source,
  same treatment as CPI, never a literal date in code or copy.
  Advisory ONLY, never blocking. Mute is permitted AND writes an audit
  row. Always acknowledge that a salary-linked alternative formula
  exists.

VERIFY
- A pending_consent student is invisible to every outbound path and
  to recognition scoring. Test it, do not assert it.
- Withdrawal creates a row; the prior row is unchanged.
- An absence alert with no operational_communication consent is
  blocked and logged, same as any other purpose-gated message.
- Form 6 with unconfigured CPI returns 'unknown', not a guess. Same for
  an unconfigured filing_deadline.
- Muting the advisory writes an audit_log row with actor and time.
```

---

## PROMPT H — Attendance & The Send Gate

```
Build attendance capture and THE single send gate.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §3.2 (attendance), §3.6 (send
  gate), §5 (WhatsApp surface), §6.3 (QR attendance scope decision),
  §9 Stage 5
- 05_BUSINESS_LOGIC.md §5
- 01_CONSTITUTION.md §7 (cost governance), §9 (no silent
  failures)

ATTENDANCE
- PRIMARY: present-all default, tap to mark absent. ~10 seconds for
  40 students. PRD §6.3 explains why per-student QR scanning is
  REJECTED as the primary method — it is 15-20x slower and teachers
  abandon slower tools, which poisons every downstream signal.
- 10-minute undo; audit note required after.
- Period lock: immutable after.
- capture_method column distinguishes manual from qr_gate/qr_exam.
  Gate attendance is NOT presented as equivalent to classroom
  attendance.

THE SEND GATE — build this once, correctly. Everything uses it.
Draft → Audience → Consent check → Template validation →
Approval if required → Budget check → Quiet hours → Rate limit →
Queue → Dispatch → Delivery webhook → Audit

- It is the ONLY module holding the WhatsApp token.
- Every failure writes a communication_log row with the reason:
  blocked_pilot, blocked_consent, blocked_budget,
  blocked_quiet_hours, blocked_no_template. Never a silent drop.
- communication_log records billing_category, inside_service_window,
  billable, est_cost_paise, gst_paise on EVERY row.
- Transactional class, final (Decision Log C19): receipt · OTP ·
  certificate delivery · the FIRST absence alert per student PER DAY
  only. Follow-up or repeated-pattern absence notifications are not
  transactional and go through the governor like anything else — an
  unbounded transactional class scaling with absence rate is a budget
  hole.
- Cost governor at cap (Decision Log C13 — there is no parent portal
  to degrade to; parents have no login in Phase 1): transactional
  always sends. daily_pulse queues into the weekly consolidated send
  instead of the daily one. recognition and weekly_brief hold until
  budget resets and are surfaced to staff in Platform 3. Principal
  alerted at 80%, BEFORE the cap, regardless of which path triggers.
- Rates read from config with a verification date. Not a constant.

VERIFY
- Every block reason produces a logged row — trigger each one.
- pilot_allow_outbound=false blocks everything and logs it.
- A student's SECOND absence alert same day is non-transactional and
  subject to the governor; the first is not.
- At cap: a receipt and a first-absence-of-day alert still send; a
  daily Pulse queues into the weekly batch instead of sending; a
  Recognition message holds and appears in the staff-facing Platform 3
  surface instead.
- grep: no code path reaches Meta except through the gate.

PREREQUISITE FROM ME: WhatsApp credentials in .env.local, test
number configured, my phone as sole recipient. Meta template
approval takes 1-3 business days — submit templates before you
need them.
```

---

## PROMPT I — Fees

```
Build the fee engine.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §3.3 (fees, financial controls,
  webhook idempotency), §9 Stage 6
- 05_BUSINESS_LOGIC.md §2 (schema and derivation rules)
- 01_CONSTITUTION.md §9

BUILD
Fee heads · structures · assignments · invoices · payments (partial,
multi-method) · receipts · concessions · reconciliation · Razorpay ·
reminder sequence through the send gate · Form 6 advisory surface.

FINANCIAL CONTROLS — non-negotiable
- No physical deletion of a successful payment. Ever.
- Corrections are reversals or adjustments, never edits.
- Receipt identifiers immutable.
- fees_ledger.status DERIVED from sum(payments). A fee is never
  marked paid because a payment page opened or an order was created.
- Sibling concessions from explicit parent_student_map links ONLY.
  Never surname or address matching — a wrong discount is a money
  error, and money errors destroy trust faster than any other bug.
- Every concession records kind, reason, and approver.

WEBHOOK IDEMPOTENCY — PRD §3.3
verify HMAC → compute payload_hash → INSERT ON CONFLICT DO NOTHING
→ process only if inserted. A replayed webhook must not double-credit.

VERIFY
- Partial payment: status becomes 'partial', balance correct.
- Duplicate webhook: no double-credit. Prove it.
- No code path deletes a payment. grep and show the result.
- Receipt generated, stored, WhatsApp receipt logged.

PREREQUISITE FROM ME: Razorpay test keys.
```

---

## PROMPT J — Academics, Exams, and the Differentiators

```
Build syllabus capture, exams, then the differentiators.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §3.4 (exams), §4 (the
  differentiators, in full), §9 Stages 7-8
- 05_BUSINESS_LOGIC.md §4 (at-risk), §5 (Pulse)
- ../src/lib/recognition.ts (THE LOCKED FORMULA)
- 01_CONSTITUTION.md §5

ORDER MATTERS: syllabus state capture first — the Pulse depends on
it entirely.

SYLLABUS — the most important control in the product
Four buttons on the teacher's phone: Taught · Delayed · Partial ·
Not taught. One tap. This triggers the Pulse and is what prevents
the Pulse from ever claiming a lesson happened when it didn't.

EXAMS
Draft → Marks Entry → Verification → Approval → Published.
Published is READ-ONLY. A correction creates a new version with an
audit trail and an explicit re-publication event. Never a silent edit.

DAILY LEARNING PULSE — PRD §4.1
- not_taught generates NO Pulse and NO comprehension prompt. Asking
  a parent whether their child understood a lesson that did not
  happen destroys trust in one message.
- delayed and partial are reflected in the message text.
- Exception-based. No message when nothing is noteworthy.
- DETERMINISTIC HINGLISH TEMPLATES. The template IS the send-time
  validation. LLM narrative stays behind ENABLE_LLM_NARRATIVE,
  default OFF.
- Buttons: Samajh nahi aaya / Thoda samjha / Achhe se samjha.
  Verify the current Meta character limit at build time.

THE RESPONSE LOOP — read this twice, it is a constitutional limit
Responses are a LEARNING SIGNAL ABOUT THE CHILD, routed to the
teacher as per-topic comprehension data.
There is NO per-parent engagement score, anywhere, ever — not in a
UI, not in an export, not in a report. A parent score would penalise
night-shift workers, single parents, non-literate parents, and
shared-phone households: exactly the families this product most
needs to reach. Aggregate school-level response rate is the North
Star metric. Per-parent attribution as a score is banned.

RECOGNITION — use ../src/lib/recognition.ts, do not reimplement
- Personal Best: threshold-based, non-competitive, every qualifying
  parent gets a message.
- Most Improved: logit-delta within baseline quartile bands, one
  winner per class per band.
- The Constitution v1.0 headroom formula (new-old)/(100-old) is
  BANNED — it is provably inverted and rewards the already-strongest
  student. Do not resurrect it.
- Class Shine: OFF by default.
- Thresholds are per-school CONFIG, not constants (Amendment 1 in
  01_CONSTITUTION.md §6). ../src/lib/recognition.ts's
  PERSONAL_BEST_THRESHOLD (0.05), MIN_ASSESSMENTS (2), MIN_ATTENDANCE
  (0.6), and the 4 baseline bands are DOCUMENTED DEFAULTS, not the
  locked values — wire them to per-school config that falls back to
  these (Decision Log C21).
- The file has NO TESTS as of this consolidation, despite
  04_SYSTEM_DESIGN_PRD.md §4.3 describing it as a "reference
  implementation and tests." Write src/lib/recognition.test.ts here,
  including the assertion that is the actual point of the file's
  header comment: the banned headroom formula ranks 85->90 (33.3%)
  above 40->55 (25.0%), which is backwards for "most improved." That
  assertion failing loudly is what stops the formula being reverted
  by a future session — much stronger than a comment.
- Build the fairness audit surface: what share of students received
  at least one Personal Best this cycle?

TEACHER IMPACT CARD — PRD §4.4
- Visible to the teacher themselves and principal/school_admin only.
  Never teacher-to-teacher. RLS-enforced.
- BANNED INPUTS: punctuality, leave taken, login frequency, hours in
  app. These convert growth into surveillance, which Constitution §1
  prohibits by name.
- Parent feedback: 1 per parent per teacher per month, enforced by a
  UNIQUE CONSTRAINT, not application logic.

AT-RISK — PRD §4.5
Three tones: principal (risk, aggregate), teacher (actionable, per
student), parent (supportive, never comparative, never ranked).
Parent dispatch requires BOTH at_risk_parent_dispatch_enabled = true
(school-level flag, defaults FALSE) AND the student's at_risk consent
purpose granted (Prompt G, Decision Log C20) — either one being false
blocks dispatch.

VERIFY
- not_taught produces no Pulse. Test it.
- Personal Best reaches a broad share — run the fairness audit.
- Most Improved bands correctly.
- Teacher-to-teacher Impact Card read FAILS at the database level.
- grep: no per-parent score exists anywhere.
```

---

# PHASE 4 — n8n & WHATSAPP INTEGRATION

---

## PROMPT K — n8n Orchestration

```
Wire n8n to the Next.js API routes.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §3.6, §5 (WhatsApp surface)
- 05_BUSINESS_LOGIC.md §5
- 01_CONSTITUTION.md §7, §9

ARCHITECTURAL RULE — do not violate this for convenience
n8n ORCHESTRATES. It does not send, and it does not write to
Postgres directly. It never holds the WhatsApp token. Every message
still passes through the single send gate built in Prompt H. If n8n
could send directly, the consent check, budget check, and pilot gate
would all be bypassable — which defeats the entire safety model.

BUILD
- Inbound routes for n8n → Next.js, HMAC-verified before any
  processing. Reject unsigned requests, log the rejection.
- Outbound calls Next.js → n8n with N8N_WEBHOOK_SECRET.
- Scheduled triggers: fee reminder cron, Weekly Brief (Sunday),
  Recognition fortnightly, at-risk daily. All Asia/Kolkata, timezone
  declared explicitly, never inherited.
- Dead-letter queue for failed jobs. A DLQ entry is a logged
  failure requiring action, not a silent drop.
- Retry with exponential backoff.

VERIFY
- Unsigned inbound request rejected AND logged.
- A scheduled job that fails lands in the DLQ visibly.
- No n8n path reaches Meta or Postgres directly. Prove it.
```

---

## PROMPT L — WhatsApp Cloud API

```
Wire the WhatsApp Cloud API into the send gate.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §5 (economics, cost governor,
  template governance)
- 05_BUSINESS_LOGIC.md §5 (Pulse delivery rules, button
  labels, cost arithmetic)
- 01_CONSTITUTION.md §7

PERMANENT RULES
- 1-on-1 messages ONLY. WhatsApp Groups are architecturally banned.
  A group discloses every parent's number to every other parent, has
  no consent basis, and makes per-child messaging impossible.
- Templates pre-registered, categorised, and validated against
  Meta's rules BEFORE submission. No approved template means
  blocked_no_template, logged, never silently dropped.
- Reply button titles must fit Meta's character limit. The Hinglish
  set (Samajh nahi aaya / Thoda samjha / Achhe se samjha) was chosen
  because the original English labels were 27/24/19 characters and
  would not send. VERIFY THE CURRENT LIMIT against Meta's live
  reference — it has changed before.
- Every message logs billing_category, inside_service_window,
  billable, est_cost_paise, gst_paise.
- Rates are config with a verification date, never constants.
  Re-verify against Meta's live INR pricing card before any rate
  informs a pricing decision.

BUILD
- Cloud API client, inside the send gate only.
- Delivery status webhooks → communication_log.
- Inbound reply webhook → pulse_response_log for button taps.
- Template registry with approval status tracking.
- Cost governor enforcement at send time.

VERIFY
- A test message to MY number only, with pilot_allow_outbound
  explicitly enabled for a test school, then disabled again.
- Delivery webhook updates the log row.
- A button tap lands in pulse_response_log.
- Cost recorded on every row.
- At budget cap: receipt sends, Pulse does not.

PREREQUISITE FROM ME: WhatsApp Business account verified, phone
number ID, access token, webhook verify token, templates submitted
to Meta (allow 1-3 business days for review).
```

---

## PROMPT M — Reporting, Billing, Support, Hardening

*(New, Decision Log C27: 04_SYSTEM_DESIGN_PRD.md §9 Stage 9 specifies
this work — reporting, billing, usage tracking, support, monitoring,
disaster recovery — but no prompt in this Bible built it. Added here,
after L, matching the PRD's own sequencing.)*

```
Build reporting, billing/invoicing, support tooling, monitoring
dashboards, and — the item that actually matters here — a real,
timed disaster-recovery drill.

SOURCE FILES:
- 04_SYSTEM_DESIGN_PRD.md §9 Stage 9, §10.3 (reliability targets:
  RTO < 4h, RPO < 1h for Phase 1), §11 item 18 (DR acceptance line)
- 01_CONSTITUTION.md §7 (billing/cost data), §9 (audit)

BUILD
- Report definitions with role-scoped export. No cross-tenant
  leakage in any export — test this, not just RLS in the abstract.
- Full data pack export (the "export anytime" trust promise in
  01_CONSTITUTION.md §8 needs a real implementation, not a future
  promise on /security/data-ownership).
- Subscription and invoicing, usage tracking against plan quotas
  (04_SYSTEM_DESIGN_PRD.md §8).
- Support ticket tooling, tied to the impersonation audit trail from
  Prompt E.
- Monitoring dashboards: message volume/failure rate, sync failure
  rate, consent completion, blocked-send counts by reason, QR scan
  anomalies, OCR failure rate — all named in PRD §7.2's Platform 2
  Monitoring tab, not previously wired to a data source.
- Daily automated backups with point-in-time recovery (PITR).

THE DR DRILL — this is the actual point of this prompt
A restore drill that has never been PERFORMED is not a backup
strategy, it is an assumption wearing a backup's name. Actually:
1. Take a real backup of the dev database at a known point in time.
2. Destroy or isolate the dev database.
3. Restore from the PITR backup to that point in time.
4. Time the whole operation, start to finish.
5. Verify the restored data matches what existed at that point —
   row counts, a spot-check of specific records, the audit hash
   chain still verifies.
Report the actual elapsed time against the RTO < 4h target. If it
exceeds the target, say so — do not round down or omit the number.

VERIFY
- A report export for School A contains zero School B rows — prove
  it with an actual export run, not a read of the query code.
- The DR drill was PERFORMED, not scheduled or described. Show the
  timed output from steps 1-5 above.
- Every monitoring metric listed above has a real data source, none
  are hardcoded placeholders.

REPORT per 02_AI_BUILDER_INSTRUCTIONS.md.
```

---

# EXECUTION SEQUENCE

| # | Prompt | Gate before proceeding |
|---|---|---|
| 1 | A — Schema | Every table has `school_id`, proven by query |
| 2 | B — RLS | **Two-school isolation suite passes. Hard stop if not.** |
| 3 | B2 — Auth | Forged claims defeated by RLS |
| 4 | C — Design system | 360 and 1440 verified |
| 5 | D — Layouts | Role gating server-side |
| 6 | E — Control Plane | `pilot_allow_outbound` false by default |
| 7 | F — Students & Capture | QR opaque, no Aadhaar storage |
| 8 | G — Consent | `pending_consent` invisible to outbound |
| 9 | H — Attendance & Send Gate | Every block reason logs |
| 10 | I — Fees | No double-credit, no deletion path |
| 11 | J — Academics & Differentiators | `not_taught` sends nothing; no parent score |
| 12 | K — n8n | Nothing bypasses the send gate |
| 13 | L — WhatsApp | Test message to your number only |
| 14 | M — Reporting, Billing, Support, Hardening | DR drill actually performed and timed, within RTO |

**Prompt B is the gate that matters.** Everything after it assumes
tenant isolation holds. A failing isolation suite is not a bug to fix
later — it is a stop condition.

---

# WHAT THE OVERRIDE DOES NOT SUSPEND

`02_AI_BUILDER_INSTRUCTIONS.md` applies to every prompt above,
unchanged:

- No dummy data outside an allowlisted, labelled fixture directory.
- No invented numbers, claims, or verification results.
- `[GAP]` flags instead of guesses.
- Transparent Output Template on every substantive response.
- Verification means showing actual command output. A summary claim
  of "all tests passed" is not verification — that specific pattern
  is what produced the unverifiable build reports earlier in this
  project's history.
- Never "complete", "production ready", or "secure" without
  objective evidence.

**And one carried over from the Bridge Rule, because it still holds:**
building the platform does not validate the thesis. The first real
school putting real parents on the Pulse is still the moment you find
out whether this works. The override changes the order of operations,
not the nature of the evidence.

---

# OPEN `[GAP]`s

- Current-year CPI figure and official source (Prompt G blocks on it)
- Current Form 6 deadline and official field list (also Prompt G —
  `filing_deadline`/`filing_deadline_source`, per Decision Log C18)
- WhatsApp button character limit and current India billing rules,
  verified at build time (Prompt L)
- Real fee concession types from an actual school (Prompt I)
- DPDP legal basis for parent-facing at-risk dispatch (Prompt J)
- OCR provider selection (Prompt F)
- Final plan pricing in ₹
- ID card print format and workflow
- Legal review of `/privacy` and `/terms` — still blocking for launch
- **New since the last version of this document:** the Pulse
  comprehension response-rate target (Amendment 3 changed the metric
  from open rate; the >65% figure does not carry over — instrument
  from the first real school, set the target from 30 days of data)
- The full, consolidated `[GAP]` list — including items this document
  doesn't track, like the missing `12_RECONCILED_PLATFORM_FEATURE_MAP.md`
  and the never-committed "CTO Recommendation" blueprint — lives in
  [`00_START_HERE.md`](00_START_HERE.md).
