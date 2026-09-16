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
