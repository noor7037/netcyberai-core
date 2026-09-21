# NetCyberAI — Architecture Decisions (plain language)

**Governs:** nothing normatively — this is an explanatory companion.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md) §4 (which
this file explains), [`../db/schema.sql`](../db/schema.sql),
[`../db/rls_policies.sql`](../db/rls_policies.sql).

Read this alongside [`../db/schema.sql`](../db/schema.sql) and
[`../db/rls_policies.sql`](../db/rls_policies.sql). This file explains
*why*, in language that doesn't assume you know web-framework names.

**Naming note (2026-09-16):** the RLS session variable is named
`app.current_tenant_id` in the policy file. That is a Postgres session
variable, not a table column — no column named `tenant_id` exists
anywhere in the schema. The column it filters against is always
`school_id`. If you see `tenant_id` in any document, it means
`school_id`; the session-variable name was left as-is rather than
renamed across a locked, working RLS file for no functional benefit.
See `10_DECISION_LOG.md` C2.

**Migrations, once Phase 1 build starts (2026-09-16):** `db/schema.sql`
and `db/rls_policies.sql` are the **locked reference baseline** — what
the system looked like when this was decided, kept byte-for-byte
stable so it stays a verifiable point of comparison. Every actual
schema change from that baseline forward is a numbered file under
`supabase/migrations/`, Supabase's own convention, which is what
`supabase db reset` replays. Nobody edits `db/schema.sql` directly once
migrations exist — a change is a new migration file, never a diff to
the baseline. See `10_DECISION_LOG.md` C-migrations and
`08_EXECUTION_BIBLE.md` Prompt A for the first four migrations this
produces.

## Database: Postgres, hosted on Supabase

Think of Postgres as a single, very strict filing cabinet. Every
drawer (table) has a rule stapled to it: "you may only open this
drawer if the file's `school_id` matches the school you're logged in
as." That rule (Row-Level Security) is enforced by the filing cabinet
itself — not by whoever built the app remembering to check it every
time. That matters because the one bug that actually costs you a
customer is one missed check that lets School A see School B's
students.

Supabase is a hosted version of this filing cabinet that also gives
you login/auth and file storage in the same place, so you're not
stitching together three different vendors.

## Why not Firestore (the alternative that came up)

Firestore is more like a set of folders that sync instantly to a
phone, which is genuinely good for parents on patchy internet. But it
has two costs for this specific product:
- Money math (fees, receipts, reconciliation) is much easier to get
  right with the kind of strict relational joins Postgres does
  natively.
- "Download all your data anytime" — a promise you're making to
  principals — is a real spreadsheet export from Postgres. From
  Firestore it means writing extra code to flatten folder structures
  into something a principal can actually open in Excel.

Decision: Postgres. If a future AI session suggests Firestore again,
that's not new information — it's the same trade-off already decided.

## The three surfaces, one login

Imagine one door with three different rooms behind it, and the door
checks your ID badge before deciding which room to open:
- **Public website** — anyone can walk up, no badge needed. This is
  where a principal Googling "WhatsApp fee reminder software" lands.
- **Control Plane** — only NetCyberAI's own badge opens this. It's
  where you onboard a new school and turn features on/off for them.
- **School Portal** — a school's own badge opens this, and the badge
  itself decides what you see inside: a teacher's badge shows only
  their classes; a parent's badge shows only their own child.

One codebase serves all three; the badge (login role) decides the
room, not three separate apps to maintain.

## WhatsApp as the parent channel

Parents already live on WhatsApp; getting them to install one more
app has a much lower success rate than sending a message they already
check. So WhatsApp is the *primary* channel — the web portal exists
as backup for anyone who wants to log in and look something up, not as
the main way parents interact with the school.

The catch: WhatsApp is a paid messaging service (like SMS used to be),
and Meta (who owns WhatsApp) changes its pricing periodically. Every
message sent gets logged with its cost, so you can see exactly what
you're spending per school, per month — instead of finding out from a
surprise invoice.

## The Bridge Rule, in plain terms

Building the Control Plane and School Portal is months of solo work.
The original plan wanted proof first that the core bet — parents
actually reading a daily WhatsApp message about their child — is true,
before spending those months: either 60-90 days of real data from one
school, or 2-3 schools asking for it unprompted.

**Updated 2026-09-16 (Amendment 1 to `01_CONSTITUTION.md` §6):** the
founder overrode that gate. Infrastructure was already provisioned and
the go-to-market plan changed from *prove-it-first* to *build-it-and-
show-it* — a working system demonstrated to a principal converts
better than a pilot described to one. Phase 1 is authorized now. What
didn't change: the three numbers this rule was protecting (the Pulse
response-rate target, the recognition thresholds, the message cost
rates) still have to come from real schools, not a guess — so they're
built as configuration from day one instead of hardcoded, which costs
nothing now and would cost a migration later. See
`01_CONSTITUTION.md` §6 Amendment 1 for the full reasoning.

## Recognition without demotivating anyone

Instead of a single class ranking (which makes 90% of students feel
like losers every fortnight), the system does two separate things:
- **Personal Best** — checks each student against *their own* last
  result. If they improved by more than a small threshold, on
  anything (marks, attendance, homework), their parent gets a
  positive message. Most students improve at *something* most
  fortnights, so most parents get something good to read.
- **Most Improved** — a smaller, optional "who improved the most"
  award, but only compared against other students who started at a
  similar level — so a student who was struggling isn't compared
  against the class topper on the same yardstick.

## Scaling transition points (recorded, not built)

Pre-F Architecture Hardening's own REJECTED list explicitly declined
multi-region architecture and table partitioning at pilot scale — not
because they're wrong ideas, but because building them now would be
architecture for a load this platform doesn't have yet. Recording
*where* the current design actually runs out of road, so a future
session inherits a specific trigger instead of a vague "someday":

- **National (roughly 50–500 schools):** a scheduled job that iterates
  every school inside one serverless function invocation will start
  hitting the platform's function-duration limits well before 500 —
  fan the job out per-school (one invocation per school, or a small
  batch per invocation) instead of one invocation looping over all of
  them. `audit_log` and `communication_log` grow with every school's
  every action and message; partition both by month before either
  becomes the table where an unindexed scan silently gets slow.
  WhatsApp dispatch moves from direct-call-per-message to a real queue
  once concurrent schools start competing for the same per-number
  throughput cap the send gate (Prompt H) already tracks.
- **Global:** the forcing function is data residency law, not load —
  a school's data needing to legally stay in-region is not something a
  bigger single database solves. The answer is regional stacks (one
  full deployment per data-residency region), not one global database
  serving every region. `school_id` as the tenant boundary (Decision
  Log C34, and every composite FK Pre-F Architecture Hardening added)
  is exactly what keeps that split possible later without a rewrite:
  a school's entire footprint is already reachable by one column,
  which is what a regional-migration script needs to exist at all.

## Per-tenant export (recorded requirement, not built)

OPS-003 §7.1's tenant offboarding requirement, and DPDP's own data-
access-request right, both reduce to the same tool: `select * from
<table> where school_id = $1` run across every tenant table, in one
place. Worth building once, deliberately, rather than growing ad hoc
inside whichever prompt needs it first — it serves three purposes at
once:
- **Offboarding** a school that leaves — a clean export, then delete.
- **DPDP access requests** — a parent or staff member asking "what do
  you have on us" is answerable by the same query, scoped further to
  their own rows.
- **Single-tenant restore** — restoring a school's data into a
  separate instance and extracting just that school, rather than a
  full point-in-time restore of the shared database for one tenant's
  sake (Decision Log, PRD §10.3's backup/restore section covers the
  shared-database PITR path; this is the narrower, per-tenant
  complement to it).

Own prompt, later — not scoped here.
