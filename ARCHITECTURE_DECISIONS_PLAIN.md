# NetCyberAI — Architecture Decisions (plain language)

Read this alongside `netcyberai_schema.sql` and
`netcyberai_rls_policies.sql`. This file explains *why*, in language
that doesn't assume you know web-framework names.

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
Before spending those months, we want proof that the core bet — parents
actually reading a daily WhatsApp message about their child — is true.
That proof is either 60-90 days of real data from one school, or 2-3
schools asking for it unprompted. Until one of those happens, the
public website is the only thing being built, because it's what
actually gets you those 2-3 schools.

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
