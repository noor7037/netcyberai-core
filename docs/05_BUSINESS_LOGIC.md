# 05 — Business Logic

**Status:** Additive to [`01_CONSTITUTION.md`](01_CONSTITUTION.md).
Does not overwrite it.
**Governs:** fee engine, Form 6 advisory, at-risk detection, the
WhatsApp Accountability Loop / Pulse response log, and the permanent
architectural bans — all as Phase 1 build detail.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md). Where
this file and the Constitution conflict, the Constitution wins.
**Build status:** Phase 1, authorized —
[`01_CONSTITUTION.md`](01_CONSTITUTION.md) §6 Amendment 1
(2026-09-16). *(Was gated behind the Bridge Rule when this file was
first written; the override lifted that gate — see §7 below.)*
**Supersedes:** `archive/00_NetCyberAI_Revised_Understanding.md`'s
Directives 1–6, whose accepted corrections are carried forward here in
full.

---

## §1. Mobile is the floor, not the ceiling

*(Retitled 2026-09-16 from "Mobile-Only Operating Assumption" — the
device matrix in `04_SYSTEM_DESIGN_PRD.md` §0.2 corrected the
mobile-only rule for roles other than teacher. The invariants below
were never actually mobile-only in substance — "≤2 taps," "zero
typing," "44×44px targets" — they hold regardless of device; only the
"every role's primary device is a phone" framing was wrong. See
`10_DECISION_LOG.md` C4.)*

### Rule
**Teacher is phone-first, absolute** — assume no desktop access at
all. Every other role is responsive across phone, tablet, and desktop
per the per-role device matrix in `04_SYSTEM_DESIGN_PRD.md` §0.2:
principal phone-primary for decisions, desktop for analytics depth;
school admin and accountant desktop-primary; academic coordinator
tablet-primary. No feature may depend on a school-side desktop, local
agent, or always-on office machine — that constraint is about
maintainability, not about which device a role prefers.

### Design invariants
1. Every daily action reachable in ≤2 taps from the role's home screen.
2. Zero typing required for: attendance marking, syllabus exception
   flagging, homework "assigned/not assigned", approval actions.
3. Tap targets ≥44×44 px. High contrast — these phones get used in
   daylight, in corridors, with cracked screens.
4. Single-column and no horizontal scroll **at the 360px floor**
   (`04_SYSTEM_DESIGN_PRD.md` §10.2). At 1024/1440, a data table is
   fine for desktop-primary roles — the floor is a minimum, not a
   ceiling on every screen at every width.
5. Principal dashboard is **exception-first**: the top of the screen is
   "what needs your decision today", not a chart grid. Analytics live
   one level down.
6. Every write shows an explicit saved state. A teacher must never have
   to guess whether attendance submitted.
7. Offline: reads served from cache, writes queued locally and
   synced with visible pending state. Never silently discarded.

### Schema impact
None directly. One operational column already exists and covers the
audit need: `attendance.marked_by` and `attendance.created_at` let you
reconstruct whether a mark was made live or synced late.

### Phase
UI principles apply from Phase 1 portal design onward. Service worker
/ IndexedDB offline layer is Phase 1, not Phase 0.

---

## §2. Complex Fee Engine

### Problem being solved
The locked schema's `fees_ledger` is flat — one amount, one due date,
one status. Indian school fee reality is not: fees decompose into
heads, structures vary by class and year, concessions are negotiated
per family, and payments arrive partially and through mixed channels.

### New tables (Phase 1 migration, additive to `../db/schema.sql`)

```sql
-- Fee heads: the named components a fee decomposes into.
-- form6_term maps an internal head to Haryana Form 6 terminology.
create table fee_heads (
  head_id        uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  name           text not null,              -- 'Tuition', 'Transport', 'Lab'
  form6_term     text,                        -- state-filing terminology, nullable
  is_mandatory   boolean not null default true,
  is_annual      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_fee_heads_school on fee_heads(school_id);

-- Fee structure: what a given class pays, for a given academic year.
create table fee_structures (
  structure_id   uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  class_id       uuid references classes(class_id),
  academic_year  text not null,              -- '2026-27'
  effective_from date not null,
  created_by     uuid references users(user_id),
  created_at     timestamptz not null default now()
);
create index idx_fee_structures_school on fee_structures(school_id, academic_year);

create table fee_structure_items (
  item_id        uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  structure_id   uuid not null references fee_structures(structure_id),
  head_id        uuid not null references fee_heads(head_id),
  amount_paise   bigint not null,
  frequency      text not null check (frequency in ('monthly','quarterly','half_yearly','annual','one_time'))
);
create index idx_fee_items_school on fee_structure_items(school_id, structure_id);

-- Concessions: every discount is an explicit, approved, reasoned human decision.
create table fee_concessions (
  concession_id  uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  student_id     uuid not null references students(student_id),
  head_id        uuid references fee_heads(head_id),   -- null = applies to all heads
  kind           text not null check (kind in ('sibling','staff_ward','rte','negotiated','hardship','scholarship')),
  percent_off    numeric,                    -- use one of percent_off or amount_off_paise
  amount_off_paise bigint,
  reason         text not null,
  approved_by    uuid not null references users(user_id),
  valid_from     date not null,
  valid_to       date,
  created_at     timestamptz not null default now(),
  check (percent_off is not null or amount_off_paise is not null)
);
create index idx_concessions_school_student on fee_concessions(school_id, student_id);

-- Payments: N payments against 1 ledger line. Partial payment is first-class.
create table payments (
  payment_id     uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(school_id),
  fee_id         uuid not null references fees_ledger(fee_id),
  amount_paise   bigint not null check (amount_paise > 0),
  method         text not null check (method in ('cash','upi','card','netbanking','cheque','adjustment')),
  razorpay_payment_id text,
  received_by    uuid references users(user_id),      -- for cash, who took it
  received_at    timestamptz not null default now(),
  receipt_url    text,
  reconciled     boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_payments_school_fee on payments(school_id, fee_id);
```

### Ledger status becomes derived, not set
`fees_ledger.status` must be computed from `sum(payments.amount_paise)`
against `fees_ledger.amount_paise`, not assigned by application code:

- `sum = 0` and `due_date >= today` → `pending`
- `sum = 0` and `due_date < today` → `overdue`
- `0 < sum < amount` → `partial` (add this value to the `fee_status` enum)
- `sum >= amount` → `paid`
- concession covers full amount → `waived`

**Rule:** a fee is never marked paid because a payment page was opened,
a Razorpay order was created, or a reminder was acknowledged. Only a
row in `payments` moves the status. This closes the most common and
most damaging class of fee bug.

### Sibling linkage
Sibling concessions derive **only** from explicit rows in
`parent_student_map` sharing a `parent_id`. Never from surname
matching, never from address matching, never inferred. A wrongly
applied discount is a money error, and money errors cost trust faster
than any other bug.

### RLS
Every table above carries `school_id` and gets the same tenant
isolation policy as the rest of the schema. Accountant role may read
and write fee tables but has no academic write access — this is already
expressed in the role model; add the corresponding policies when the
migration lands.

---

## §3. Haryana Form 6 Advisory Module

### Verified regulatory basis
Haryana caps annual fee increases for recognised private schools at
**CPI + 5%** of the previous year's fee, with an alternative formula
tied to the per-capita increase in teaching staff monthly salary.
Form 6 is the mandatory annual filing (student and staff strength,
staff salaries, prior-year and current fee structure, proposed hike,
facilities), filed online to the Director of Education, and must be
publicly displayed. Schools that fail to file are not permitted to
raise fees for that session.

**Sources (verify currency before any public claim):**
- Tribune India — Form 6 submission rules, February 1 deadline,
  public-display requirement
- Tribune India — CPI + 5% formula notification
- Tribune India — non-filing schools barred from fee increase; ~56%
  filing rate across 10,000+ schools

### `[GAP]` — must be supplied, never invented
- The current-year CPI figure and its official source.
- The current filing deadline for the coming session (see correction below — do not assume it is fixed).
- The current official Form 6 field list and schema.

### Correction, 2026-09-16: the filing deadline is not a fixed constant either

Phase 0 build work (Prompt 3, feature page verification) live-checked the
February 1 deadline claim against actual reporting rather than carrying it
forward unverified, and found it does not hold as a single fixed date:
the standing rule sets **1 February** annually, but Haryana has granted
extensions in practice in multiple past years to different dates (e.g.
31 March in one year's reporting, 30 April in 2024). Treating "1
February" as a hardcoded constant would have been exactly the kind of
unverified-number failure Constitution §9 and this pack's anti-
hallucination rules exist to prevent. The filing deadline must therefore
be **configuration, alongside the CPI figure, not a constant baked into
the advisory logic or the UI copy.**

The CPI value and the filing deadline are both **configuration, not
constants**. Store each with its own source and the date it was
recorded:

```sql
create table compliance_config (
  config_id           uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(school_id),
  state               text not null default 'HR',
  cpi_percent         numeric,                    -- null until an admin supplies it
  cpi_source          text,                        -- where it came from
  cpi_recorded_at     timestamptz,
  filing_deadline     date,                        -- null until an admin supplies it; the
                                                     -- standing rule is 1 Feb, but Haryana has
                                                     -- extended this in practice in past years —
                                                     -- never hardcode a date in application code
  filing_deadline_source text,                      -- where the current-year date came from
  filing_deadline_recorded_at timestamptz,
  advisory_muted      boolean not null default false,
  muted_by            uuid references users(user_id),
  muted_at            timestamptz,
  updated_at          timestamptz not null default now()
);
```

### Advisory logic

```
permissible_increase_percent = cpi_percent + 5

proposed_increase_percent =
  ((this_year_total - last_year_total) / last_year_total) * 100

if cpi_percent is null:
    state = 'unknown'   -- show "CPI not configured", never guess a number
elif proposed <= permissible:
    state = 'within_advisory'
else:
    state = 'above_advisory'

if filing_deadline is null:
    deadline_state = 'unknown'   -- show "Filing deadline not configured", never assume 1 Feb
elif today > filing_deadline:
    deadline_state = 'past_deadline'
else:
    deadline_state = 'before_deadline'
```

### Behaviour rules — non-negotiable
1. **Advisory only. Never blocking.** The system displays the position
   and permits the school to proceed regardless. NetCyberAI is not the
   regulator and has no standing to gate a school's fee decision.
2. **The alternative salary-based formula must be acknowledged.** The
   advisory text states that a salary-linked formula also exists and
   that the school may be compliant under it — otherwise the product
   asserts non-compliance it cannot actually determine.
3. **Mute is permitted and is audited.** The principal may switch off
   advisory notices. Doing so writes to `audit_log` with actor,
   timestamp, and scope, and sets `compliance_config.advisory_muted`.
   The UI label is neutral ("Hide fee advisory notices") with a
   one-line note that the setting is recorded. A silent mute is a
   silent failure and is banned by Constitution §9.
4. **No legal advice.** The module shows a computed position against a
   published formula. It never says "this is legal" or "this is
   illegal." Copy must be reviewed before release.
5. **The filing deadline is never hardcoded.** Like the CPI figure, the
   current-year filing deadline is admin-entered configuration with a
   recorded source, never a literal date in application code, UI copy,
   or marketing content. Haryana has extended this deadline differently
   in different years — a hardcoded date is a live correctness bug
   waiting to happen, not just a stale-content risk.

### Form 6 pre-fill (Phase 1+)
Once real fee, salary, and strength data exist, generate a Form 6
draft from canonical data. Given the documented ~56% filing rate and
the cited difficulty of the year-on-year salary comparison, this is
the highest-value compliance feature in the product. It remains a
**draft for human review and human submission** — NetCyberAI never
files on the school's behalf.

---

## §4. At-Risk Detection & Tone Differentiation

### Trigger (configurable per school, these are defaults)
- Attendance below 75% over a rolling 30-day window, **or**
- The last 2 assessments in a subject both below 40%

Guard: exclude students with fewer than 2 assessments in the window and
students below a minimum attendance floor where the signal is an
absence artefact rather than a performance one.

### Three audiences, three tones, one fact set

| Audience | Framing | Granularity | Example shape |
|---|---|---|---|
| Principal | Risk, aggregate | School/class rollup | "6 students across Class 8 crossed the attendance threshold this week." |
| Teacher | Actionable, specific | Per student, one next step | "Aarav: 68% attendance, 30 days. Suggested: flag for counsellor follow-up." |
| Parent | Supportive, specific, non-comparative | Own child only | "We noticed Aarav has missed a few days this month. Is there anything the school can help with?" |

### Hard prohibitions on the parent message
- No class average, no rank, no comparison to any other student.
- No language implying fault, negligence, or failure.
- No automated escalation tone. If the situation is serious enough to
  need escalation, a human sends it.

### DPDP sequencing — deliberate
An at-risk detector is behavioural monitoring of a child. The detector
may compute and surface to **staff** (legitimate educational role)
before it may **dispatch to parents**.

```sql
alter table schools
  add column at_risk_parent_dispatch_enabled boolean not null default false;
```

Default off. Stays off until the consent basis for parent-facing
behavioural alerts is confirmed and recorded. Staff-facing detection is
not gated by this flag.

### Schema
```sql
create table at_risk_flags (
  flag_id      uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  student_id   uuid not null references students(student_id),
  reason       text not null check (reason in ('attendance','marks','both')),
  detected_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  notified_staff boolean not null default false,
  notified_parent boolean not null default false
);
create index idx_at_risk_school_student on at_risk_flags(school_id, student_id, detected_at desc);
```

---

## §5. The WhatsApp Accountability Loop

**Build status: Phase 1, authorized under Amendment 1 — not part of
the Phase 0 build, which has no messaging integration at all.** This
section specifies the logic for `08_EXECUTION_BIBLE.md` Prompts H, K,
and L to implement.

### Delivery rules — permanent
1. **1-on-1 private messages only. WhatsApp Groups are permanently
   banned.** A group exposes every parent's phone number to every
   other parent, has no consent basis, and makes per-child messaging
   impossible. This is a Constitution-tier rule.
2. Webhook responses write directly to PostgreSQL. No Google Forms, no
   Sheets, no intermediate spreadsheet of any kind.
3. Every outbound Pulse and every inbound button tap writes to
   `communication_log` and `pulse_response_log` respectively. A dropped
   webhook is a logged failure, never a silent one.
4. No cloud LLM and no on-premise hardware server is required for the
   Pulse body — see "Generation" below.

### The three-tier comprehension prompt

Sent with the daily Pulse. Parent taps one button. No typing.

| Tier | Button label (Hinglish) | Chars | Meaning |
|---|---|---|---|
| 1 | `Samajh nahi aaya` | 16 | Discussed, child could not explain |
| 2 | `Thoda samjha` | 12 | Described, but hesitated |
| 3 | `Achhe se samjha` | 15 | Described confidently |

The original English labels (27/24/19 chars) exceed the WhatsApp
interactive reply-button title limit and will not send. `[GAP]` —
confirm the exact current character limit and whether reply buttons or
a list message is the correct carrier, against Meta's live API
reference at build time.

### Schema
```sql
create table pulse_messages (
  pulse_id     uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  class_id     uuid not null references classes(class_id),
  subject_id   uuid references subjects(subject_id),
  topic        text not null,
  exception_state text check (exception_state in ('taught','delayed','partial','not_taught')),
  body_hinglish text not null,
  sent_on      date not null default current_date,
  created_at   timestamptz not null default now()
);
create index idx_pulse_school_date on pulse_messages(school_id, sent_on desc);

create table pulse_response_log (
  response_id  uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  pulse_id     uuid not null references pulse_messages(pulse_id),
  student_id   uuid not null references students(student_id),
  parent_id    uuid not null references parents(parent_id),
  tier         int check (tier in (1,2,3)),
  responded_at timestamptz not null default now(),
  provider_message_id text
);
create index idx_pulse_resp_school_pulse on pulse_response_log(school_id, pulse_id);
create index idx_pulse_resp_student on pulse_response_log(school_id, student_id, responded_at desc);
```

### CONSTITUTIONAL CORRECTION — no "Parent Engagement Score"

The originally proposed "Parent Engagement Score," framed as "keeping
parents accountable," is **rejected in that form** as a violation of
Constitution §9 by direct analogy to the banned teacher leaderboard.

Who scores low on such a metric: night-shift workers, single parents,
non-literate parents, shared-phone households, and parents of
struggling children — exactly the families the product most needs to
reach. A visible low score converts them from under-served to judged,
and the child is the one who absorbs the consequence at home.

**Binding rules:**
1. No per-parent aggregate score is ever displayed to a teacher,
   principal, or any school staff member as a judgment of that parent.
2. A parent's response rate **never** affects anything the child
   receives — not recognition eligibility, not at-risk flagging, not
   report card content, nothing.
3. Responses are used as a **learning signal about the child**, routed
   to the teacher as subject-level comprehension information. A pattern
   of Tier-1 responses on one subject is a teaching signal, not a
   parenting verdict.
4. An **aggregate, school-level** response rate may be computed and is
   in fact the North Star metric under Constitution §3. Aggregate is
   fine. Per-parent attribution surfaced as a score is not.
5. The internal name is `pulse_response_log`. Do not reintroduce
   "engagement score" terminology in code, UI, or documentation.

### Generation: deterministic templates first
The Pulse body is short and structured (class, topic, one home
question, exception state). A deterministic Hinglish template produces
it correctly, at zero token cost, every time, and **is itself** the
send-time validation that Constitution §9 requires for factual
assertions reaching parents.

LLM narrative generation is deferred behind `ENABLE_LLM_NARRATIVE`,
default off, and is introduced first for the **Weekly Confidence
Brief** — genuinely narrative content where a template reads
mechanical — and only after the deterministic validation gate exists.
An 8B-class model's Hinglish quality for this audience is unverified;
if it reads wrong to a native speaker, the trust cost is immediate and
the parent has no channel to tell you.

### Exception-state invariant
If a teacher flags a topic as `delayed`, `partial`, or `not_taught`,
the Pulse **must reflect that state** and must never claim the topic
was taught. No comprehension prompt is sent for a `not_taught` topic —
asking a parent whether their child understood a lesson that did not
happen destroys trust in a single message.

### Cost governance
A daily Pulse with buttons is a business-initiated template message,
billable per recipient per day. Illustrative, at the India utility rate
referenced in Constitution §7 (₹0.1150 + 18% GST ≈ ₹0.1357 —
**re-verify against Meta's live INR card before this informs pricing**):

- 500 students × 22 school days = 11,000 messages/month ≈ **₹1,493/month**
  for one school
- 10 such schools ≈ **₹14,930/month**

`schools.monthly_budget_paise` and the Constitution §7 cost governor
are mandatory for this feature, not optional. On budget breach:
transactional messages (receipts, OTP, certificate delivery, and the
first absence alert of the day — Decision Log C19) always send.

**On budget breach, corrected 2026-09-16 (Decision Log C13) — there is
no parent portal to degrade to** (parents have no login in Phase 1;
see `04_SYSTEM_DESIGN_PRD.md` §1.4, §2.2). Pulse queues and batches
instead: hold the day's sends, deliver one consolidated weekly message
rather than daily — one message instead of five, not zero. Recognition
holds until the budget resets and is surfaced to **staff** in
Platform 3, so the school can recognise the student in person
(assembly, notice board) rather than the signal disappearing entirely.
The principal is alerted before the cap, not after, either way.

---

## §6. Permanent Architectural Bans

Promoted to refuse-to-build status. A future AI session proposing any
of these should be pointed here.

| Banned | Reason |
|---|---|
| RFID cards / readers / cafeteria POS | Hardware procurement, card issuance, reader maintenance, possible prepaid-instrument regulatory exposure. Fails the no-IT-staff constraint on day one. |
| IoT smart-campus utility metering | Requires physical meters and a maintained campus network. Violates the software-only premise. |
| Blockchain credentials / e-portfolios | Solves a problem a signed PDF already solves, with added cost, complexity, and third-party dependency, and no standardised acceptance. |
| School-side desktop agents / local workers | Cannot be kept alive without IT staff. A dead local agent is a silent failure by construction. |
| On-premise LLM hardware in schools | Same failure mode as the desktop agent, with a larger price tag. |
| WhatsApp Groups for parent communication | Exposes every parent's number to every other parent. No consent basis. |

### Approved alternative to blockchain credentials
Verifiable digital badges: generate a PDF containing a QR code whose
payload is a JSON claim cryptographically signed by the school's key;
the QR resolves to a verification endpoint that checks the signature.

**Key management constraint:** the school's private signing key is
held and rotated server-side. Per-school key material is never shipped
to a client, never embedded in a PDF, never exposed to the browser.

---

## §7. What this file does NOT change

1. **Database:** PostgreSQL + RLS on Supabase. Unchanged.
2. **Bridge Rule:** overridden 2026-09-16 — `01_CONSTITUTION.md` §6
   Amendment 1. Phase 1 platform engineering is authorized. *(This
   point originally read "not met. Phase 0 only. Unchanged" — that was
   true when written and is the reason §1's header above notes it was
   gated at the time.)*
3. **Recognition:** Personal Best threshold + logit-delta banded Most
   Improved. Unchanged.
4. **The locked reference files:** `db/schema.sql`,
   `db/rls_policies.sql`, `src/lib/recognition.ts` — not overwritten.

## §8. Open items requiring human input

- `[GAP]` Current-year CPI figure and official source.
- `[GAP]` Current-year Form 6 filing deadline and official field list —
  confirmed 2026-09-16 that this is not a fixed date year to year (see
  §3 correction), so it must be entered as configuration each year, not
  assumed from a prior year's date.
- `[GAP]` WhatsApp interactive button character limit and current India
  per-message billing rules, verified at build time.
- `[GAP]` The real list of fee concession types used by your target
  schools — from an actual school, not assumed.
- `[GAP]` Legal basis for parent-facing at-risk dispatch under DPDP.

## §9. SEO/AI-crawler infrastructure (Prompt 8, built 2026-09-16)

**Status: built and verified.** Recorded here so a future session finds
the actual implementation instead of re-deciding it. Named plainly —
this addendum does not adopt marketing labels like "4-Pillar Visibility
Protocol" or "AEO/GEO/AIO" for what is, concretely, four things: a
generated sitemap, a crawler policy, per-page share images, and a
plain-text summary for AI answer engines.

- `src/lib/seo.ts` is the single builder every page metadata export goes
  through (`buildMetadata`), plus the JSON-LD generators
  (`organizationJsonLd`, `faqPageJsonLd`, `articleJsonLd`). No page
  hand-rolls its own `<title>`, canonical, Open Graph, or structured
  data — verified by grepping for a second, independent
  `export const metadata` construction outside this file; there is none.
- `src/lib/site-config.ts` holds `siteUrl`, `siteLanguage` (`en-IN`),
  `ogLocale` (`en_IN`), and `serviceRegion` — the values every canonical
  URL, `<html lang>` tag, and Organization schema address are derived
  from. A grep for the literal domain string outside `site-config.ts`
  returns nothing.
- `sitemap.ts` walks `src/app` for `page.tsx` files at build time and
  appends every blog post from `src/content/blog`, so it cannot list a
  route that does not exist or omit one that does — verified by
  comparing the sitemap's URL set against the actual built `.next`
  output, which matched exactly (28/28) at last check.
- `robots.ts` allows all crawlers, with `GPTBot`, `ClaudeBot`,
  `PerplexityBot`, and `Google-Extended` named explicitly rather than
  left to the wildcard alone, and points at the sitemap.
- Every page gets a real, generated 1200×630 PNG share image
  (`opengraph-image.tsx`), rendered from the same five design tokens as
  the rest of the site (sapphire background, off-white text) — one card
  for the home page, one shared card for all `/features/*` pages, and
  one per blog post carrying that post's own headline. Verified by
  fetching every image URL in the built sitemap and confirming each
  resolves to a real `image/png` at exactly 1200×630.
- `llms.txt` is generated from the same `pageMeta` registry and
  `blogPosts` data the pages themselves render from, not hand-typed, so
  it cannot drift from what the site actually says. It states plainly
  that no pilot, customer, or case-study data exists yet.

**The `/demo` route — SUPERSEDED by `06_VISIBILITY_PROTOCOL.md` §3,
2026-09-16.** The original decision here kept `/demo` in `sitemap.ts`
and `robots.ts` for every crawler, on the reasoning that it is a real,
public, bottom-funnel marketing page the content plan wants found, and
excluded it from `llms.txt` alone as the narrower AI-specific mitigation.

That was half right: `/demo` should stay findable in search, exactly as
argued above. It was not restrictive enough on the AI side — `llms.txt`
is a low-traffic, unadopted convention, while the actual AI training and
live-fetch crawlers (`GPTBot`, `ClaudeBot`, `PerplexityBot`, and others)
were still being allowed onto the page itself, where they flatten it to
plain text and lose the non-dismissible "fictional school" banner that
is what makes the fixture data safe to show a human in context.

**Current rule, implemented in `src/app/robots.ts`:** search crawlers
(`Googlebot`, `Bingbot`) are allowed on `/demo`, exactly as before. AI
training and live-fetch crawlers (`GPTBot`, `OAI-SearchBot`,
`ChatGPT-User`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`,
`CCBot`) are disallowed from `/demo` specifically, while still allowed
everywhere else on the site — this generalises to any future route
holding illustrative or fictional data, not `/demo` alone. The
`llms.txt` exclusion stays as an additional, narrower belt-and-braces
measure. See `06_VISIBILITY_PROTOCOL.md` §3–§4 for the full reasoning
and the per-crawler policy table.
