# 00 — NetCyberAI Revised Understanding (CTO Re-Evaluation)

**Date of evaluation:** 15 September 2026
**Evaluated against:** `PRODUCT_CONSTITUTION_v2.0.md`, `BUILD_ORDER.md`,
`netcyberai_schema.sql`, `netcyberai_rls_policies.sql`,
`ACCEPTANCE_CHECKLIST.md`
**Authority exercised:** accept / modify / delay / reject, per the
standing instruction to act as a critical technical filter rather than
a compliant executor.

**Summary verdict:** 4 directives accepted as-is or near-as-is, 1
accepted with a mandatory modification, 1 accepted in principle but
deferred to Phase 1 with two engineering corrections and one
constitutional correction that must be applied before it is ever
built. Nothing here changes the database decision, the Bridge Rule, or
the recognition formula. No existing locked file is overwritten.

---

## DIRECTIVE 1 — Mobile-Only Reality

### WHAT I PICKED (with source)
Accepted in full, and treated as a **hardening** of Constitution §2
rather than a new constraint. §2 already commits to "low-end Android
phones" and "one-tap for teachers"; this directive extends the same
assumption upward to principals and admin staff, who the original
documents implicitly assumed had a desktop (the Principal dashboard in
every earlier spec was laid out as a wide-screen analytics surface).

Concretely adopted:
- Mobile-first is the **primary** layout target for all three role
  shells, not a responsive afterthought. Desktop is the fallback.
- Zero-typing paths for every daily teacher action (attendance,
  syllabus exception, homework flag).
- PWA installability + offline resilience for the Phase 1 portal.
- Any automation that would have assumed a desktop agent, a local
  worker process, or an always-on office machine is replaced by
  server-side scheduled jobs.

### WHAT I REJECTED / DELAYED (with reason)
- **Delayed to Phase 1:** PWA service worker, IndexedDB offline cache,
  and background sync. Reason: Phase 0 is a public marketing site with
  no authenticated state and no user-entered data. There is nothing to
  cache offline and nothing to sync. Building a service worker now
  would add cache-invalidation bugs to a site whose entire job is to
  load fast and rank — a service worker mis-serving a stale blog page
  to Googlebot is a real SEO risk with zero Phase 0 benefit.
- **Rejected outright:** any architecture depending on a school-side
  desktop agent, local worker, or on-premise machine. Reason: this was
  already the correct call, and this directive confirms it from the
  field side. A semi-urban school with no IT staff cannot keep a local
  process alive, and a failed local agent is a silent failure by
  construction — it stops working and nobody knows.

### LINE-BY-LINE REASONING
- **Founder:** removes an entire class of support burden. Every
  desktop dependency is a phone call you personally have to take.
- **Teacher:** the directive matches observed behaviour — a teacher
  marking attendance between periods is standing in a corridor with a
  phone, not sitting at a desk.
- **Parent:** unchanged; parents were always WhatsApp-first.
- **Student:** unchanged.
- **Engineering consequence:** the Principal dashboard must be
  redesigned around a single-column, exception-first feed rather than
  a multi-panel analytics grid. "Three things need your decision
  today" beats a chart wall on a 5.5-inch screen. This is a genuine
  change to what earlier specs assumed and is recorded in
  `11_BUSINESS_LOGIC_ADDENDUM.md` §3.

---

## DIRECTIVE 2 — Haryana Form 6 Compliance & Advisory-Only Fee Warnings

### WHAT I PICKED (with source)
Accepted, and this is the strongest new directive in the set — it is
the only one backed by verifiable public fact rather than assertion.

Verified before accepting:
- Haryana caps annual fee increases for recognised private schools at
  **CPI + 5%** of the previous year's fee, under amendments to the
  Haryana School Education Rules notified in December 2021 (Haryana
  School Education Rule Act 1995 framework). An alternative formula
  links the permissible hike to the per-capita increase in teaching
  staff monthly salary. <cite index="14-1">The Haryana Schools Education Department devised a formula capping fee hikes in unaided private schools, linked either to the expenditure incurred by the institution or the consumer price index, under which schools can charge only CPI plus an additional five percent.</cite>
- **Form 6** is a real, mandatory annual filing to the Director of
  Education, covering student and staff strength, staff salary, last
  year's fee structure, the current structure, the proposed hike, and
  facilities provided. <cite index="17-1">Schools must submit Form-6 online on or before February 1 each year to the Director-Education, no school may charge any mandatory fee component other than what was submitted in Form-6, and the form must be displayed publicly on the school notice board and website.</cite>
- Non-submission has teeth: <cite index="13-1">schools that have not submitted the form are not allowed to increase their fee in that session.</cite>
- Schools genuinely struggle with it: <cite index="13-1">even after the deadline was extended four times, only 56 per cent of over 10,000 schools required to file had submitted, with school bodies citing the form's complexity and the difficulty of comparing last year's and current salaries.</cite>

That last data point is the actual product opportunity. Nearly half
the addressable schools in your own state fail an annual statutory
filing because a salary-comparison spreadsheet is hard. That is a
concrete, verifiable, recurring pain — unlike most of the "market
gaps" in the previous directive set, which cited a single fabricated
footnote for every claim.

**Advisory-not-blocking is accepted and is the correct design.** A
fee cap is enforced by the Education Department, not by a vendor's
software. Hard-blocking would make NetCyberAI a regulator it has no
standing to be, would be wrong in every legitimate edge case (the
salary-based alternative formula, a school with a genuine exemption,
a correction to a mis-entered prior-year figure), and would get the
product thrown out of the first school that hit it.

### WHAT I REJECTED / DELAYED (with reason)
- **Modified, not rejected — the mute switch.** The principal may mute
  advisory warnings. But **muting is itself an audited event**, written
  to `audit_log` with actor, timestamp, and scope. This is not a
  restriction on the school; it protects *you*. If a school mutes
  compliance advisories, hikes fees 20%, and is later challenged, the
  only thing standing between NetCyberAI and "the software told us it
  was fine" is a log showing the warning existed and who switched it
  off. A silent mute is a silent failure, which Constitution §9 bans
  outright. The UI wording should be neutral, not scolding — "Hide fee
  advisory notices" with a one-line note that the setting is recorded.
- **Delayed to Phase 1:** the actual Form 6 generator (auto-populating
  the filing from internal data). Reason: it needs real fee, salary,
  and staff data in the canonical database, which does not exist
  pre-pilot. Logic is specified now, built later.
- **Flagged `[GAP]`, not invented:** the current-year CPI figure, the
  exact current Form 6 field list and its official schema, and whether
  the February 1 deadline still holds for the coming session. These
  change annually and by notification. The system must **read the CPI
  from a configurable value an admin sets, with the source and date
  recorded** — never a hardcoded constant, never a number an AI
  guessed. Any published claim about the current year's permissible
  percentage must be re-verified against the Department's own
  notification at time of display.

### LINE-BY-LINE REASONING
- **Founder:** this is a wedge feature with a verifiable buyer pain
  and a hard annual deadline attached. A recurring statutory deadline
  is a far better sales hook than a soft benefit, because it has a
  date on it.
- **Principal:** gets a compliance position they currently compute by
  hand on a spreadsheet, with the freedom to override it — which is
  what they actually want from software, not a gate.
- **Teacher / Parent / Student:** no direct effect. Indirect: correct
  fee structures mean fewer wrong fee demands reaching parents, which
  is the trust gap the product exists to close.

---

## DIRECTIVE 3 — Complex Fee Engine (siblings, partials, negotiated rates)

### WHAT I PICKED (with source)
Accepted. The existing `fees_ledger` in `netcyberai_schema.sql` is
too flat for this — it carries `amount_paise`, `due_date`, `status`
and nothing else. That is SaaS-subscription shaped, and this directive
correctly identifies it as insufficient. Accepted additions,
specified in `11_BUSINESS_LOGIC_ADDENDUM.md` §2:
- `fee_heads` (tuition, transport, lab, annual, etc., with a Haryana
  Form 6 terminology mapping column)
- `fee_structures` per class per academic year, composed of heads
- `fee_concessions` (sibling, staff ward, RTE, negotiated, hardship)
  with an approving actor and a reason — every concession is an
  audited human decision, not a silent discount
- `payments` as a separate table from `fees_ledger`, so partial
  payments are N payments against 1 ledger line rather than a mutated
  `status` field
- Ledger status becomes derived (`paid_paise` vs `amount_paise`),
  not manually set — this closes the "marked paid because someone
  opened a payment page" failure the Constitution §13 equivalent warns
  about.

### WHAT I REJECTED / DELAYED (with reason)
- **Delayed to Phase 1 build, specified now.** Reason: Bridge Rule.
  Fee logic is core platform automation. The schema design lands now
  so Phase 1 doesn't start from a flat table, but no code ships.
- **Rejected:** auto-applying sibling discounts by surname or address
  matching. Reason: false-positive discounts are money errors, and
  money errors destroy trust faster than any other bug class. Sibling
  linkage must come from an explicit guardian link in
  `parent_student_map`, confirmed by a human, never inferred.

### LINE-BY-LINE REASONING
- **Founder:** the fee engine is the module that gets you paid. It
  must be right before it is fast.
- **Principal / accountant:** negotiated family rates are real and
  currently live in a register or someone's memory. Capturing them
  with an approver and a reason turns an informal practice into an
  auditable one without forcing the school to abandon it.
- **Parent:** a partial payment that shows as partial, with the
  remaining balance visible, is the single most common source of
  fee-related distrust in existing systems.

---

## DIRECTIVE 4 — At-Risk Tone Differentiation

### WHAT I PICKED (with source)
Accepted. Three audiences, three tones, one underlying fact set:
- **Principal:** risk-framed, aggregate-first ("6 students in Class 8
  crossed the attendance threshold this week").
- **Teacher:** actionable, per-student, with a suggested next step.
- **Parent:** supportive, specific, never comparative, never ranked,
  never implying fault. No "your child is falling behind the class."

### WHAT I REJECTED / DELAYED (with reason)
- **Delayed AND flagged for legal review before any parent-facing
  dispatch.** Reason: an at-risk detector is behavioural monitoring of
  a child. Under DPDP §9 the tracking and behavioural-monitoring
  restriction on children's data is a live constraint, and Constitution
  §8 already requires purpose-scoped consent per communication type.
  Consequence: the detector may compute and surface internally
  (principal/teacher, who have a legitimate educational role) **before**
  it may dispatch to a parent. Parent dispatch stays behind a
  default-off flag until the consent basis is confirmed. This is not a
  rejection of the feature — it is a sequencing decision that keeps the
  useful 80% (staff visibility) while the risky 20% waits.
- **Rejected:** any automated parent message that names another
  student, a class average, or a rank as context. Reason: Constitution
  §9's anti-shaming rule applies to at-risk messaging as much as to
  recognition.

### LINE-BY-LINE REASONING
- **Principal:** needs the aggregate to allocate attention, not 40
  individual alerts.
- **Teacher:** needs the specific child and one concrete action, on a
  phone, in under ten seconds.
- **Parent:** a supportive message that offers help converts; a
  risk-flavoured one produces defensiveness and, in the worst case, a
  child punished at home for a software alert. That outcome would
  directly invert the product's mission.
- **Student:** the person with the most at stake and no voice in the
  message. Tone rules exist for them.

---

## DIRECTIVE 5 — Hard Bans on IoT, RFID, Blockchain

### WHAT I PICKED (with source)
Accepted permanently and promoted into the refuse-to-build list
(Constitution §9 equivalent, recorded in the addendum §6). Reasoning
stands independently of where the directive came from:
- **RFID / cafeteria wallets:** hardware procurement, card issuance,
  reader maintenance, and — for a stored-value wallet — potential
  prepaid-instrument regulatory exposure. Fails the no-IT-staff
  constraint on day one.
- **IoT utility analytics:** requires physical meters and a
  maintained campus network. Violates the software-only premise.
- **Blockchain credentials:** solves a verification problem that a
  signed PDF with a QR code pointing at a verification endpoint already
  solves, at a fraction of the complexity and with no third-party
  dependency. The proposed pivot — a school-signed JSON payload behind
  a QR code — is the right answer and is recorded in the addendum.

### WHAT I REJECTED / DELAYED (with reason)
Nothing to reject; the directive *is* a rejection and it is correct.
One caution recorded: the signed-badge pivot requires the school's
private signing key to be managed server-side and rotated — do not
ship per-school key material to a client. Specified in addendum §6.

### LINE-BY-LINE REASONING
Every one of these three would have consumed months of solo capacity
to serve a feature no semi-urban school asked for. Banning them in
writing prevents a future AI session from re-proposing them as
"differentiators."

---

## DIRECTIVE 6 — The WhatsApp Accountability Loop

This is the directive with real problems. Accepted **in concept**,
deferred to Phase 1 per your own instruction, and it must not be built
until three corrections are applied. Logging them here so they are not
lost between now and then.

### WHAT I PICKED (with source)
- **1-on-1 private messages, never WhatsApp Groups.** Correct and
  non-negotiable. A group exposes every parent's phone number to every
  other parent — a straightforward personal-data disclosure with no
  consent basis, and it makes per-child messaging impossible. Adopt
  permanently.
- **Webhook → PostgreSQL directly, no Forms/Sheets.** Correct, and
  consistent with the locked architecture.
- **Cloud LLM APIs, no on-premise hardware.** Correct. Shipping a
  server to a school is the desktop-agent failure mode wearing a
  different hat.
- **The underlying idea** — closing the loop by asking the parent
  whether the child could actually explain the day's topic — is
  genuinely strong. It converts the Pulse from a broadcast into a
  two-way signal and produces the exact engagement data the Bridge
  Rule needs. This is the best product idea in the set.

### WHAT I REJECTED / DELAYED (with reason)

**Rejection 1 — the name and the framing: "Parent Engagement Score"
and "keeping parents accountable."**

This violates Constitution §9 by direct analogy and must not ship in
this form. The Constitution bans public teacher leaderboards and
anxiety-inducing student rankings for one reason: scoring a person on
a number they can't fully control, and showing that number to someone
with power over them, produces defensiveness and gaming rather than
improvement. A parent score does exactly this. Consider who scores
low: night-shift workers, single parents, non-literate parents,
families where the phone is shared or owned by someone else, and
parents of children who are struggling — precisely the families the
product most needs to reach. A visible low score converts those
parents from under-served to judged.

**Required modification:** the signal is kept, the score is reframed.
- Store the responses. They are valuable.
- Use them **for the child's benefit** — a child whose parent
  repeatedly reports "couldn't explain" on a given subject is a
  learning signal for the teacher, which is the actual mission.
- Never display a per-parent aggregate score to a teacher or
  principal as a judgment of that parent.
- Never let the response rate affect anything the child receives —
  not recognition eligibility, not at-risk flags, nothing.
- Internally, call it what it is: `pulse_response_log`. A response
  rate may be computed **in aggregate, per school** as the Bridge
  Rule's North Star metric (Constitution §3) — that is a product
  metric, not a per-parent verdict.

**Rejection 2 — the three button labels as written will not send.**

WhatsApp Cloud API interactive reply buttons cap at three buttons per
message with a short title each (on the order of 20 characters — verify
against Meta's current reference before implementing, as this has
changed before). The proposed labels are 27, 25, and 19 characters:

| Proposed | Chars | Status |
|---|---|---|
| "Discussed, couldn't explain" | 27 | over |
| "Described, but hesitated" | 24 | over |
| "Described perfectly" | 19 | fits |

Rewritten to fit, in Hinglish, which also reads better to the actual
audience:

| Tier | Button label | Chars |
|---|---|---|
| 1 | `Samajh nahi aaya` | 16 |
| 2 | `Thoda samjha` | 12 |
| 3 | `Achhe se samjha` | 15 |

Semantics preserved, ordering preserved, fits the constraint, and
reads naturally to a Hindi-first parent. `[GAP]` — confirm exact
current character limit and whether reply buttons or a list message is
the better carrier, against Meta's live API reference at build time.

**Rejection 3 — the cost model needs checking before this is
committed to.**

A daily Pulse carrying interactive buttons is a business-initiated
template message, billable per recipient per day. Illustrative
arithmetic at the India utility rate referenced in Constitution §7
(₹0.1150 + 18% GST ≈ ₹0.1357 per message — **this rate must be
re-verified against Meta's live INR pricing card before it informs any
pricing decision**):

- 1 school, 500 students, 1 Pulse per school day, ~22 school days:
  500 × 22 = 11,000 messages/month ≈ **₹1,493/month** in raw
  messaging cost for one school.
- 10 schools of that size: ≈ **₹14,930/month**.

Two consequences. First, this must be priced into the plan tiers
before the feature is sold, not after. Second, Constitution §7's cost
governor and `schools.monthly_budget_paise` cap are not optional
niceties for this feature — they are what stops a 2,000-student school
from quietly becoming a ₹6,000/month messaging bill. The parent
*reply* (a button tap) opens a service window; whether the reply
itself or subsequent in-window messages are billable depends on Meta's
current rules, which changed in 2025 and were scheduled to change
again — **verify, do not assume**.

**Rejection 4 — LLM generation for the Pulse body, at this stage.**

The directive specifies a cost-effective cloud LLM (DeepSeek, Llama-3
8B class) for text generation. Deferred, not rejected, for three
reasons:
1. The Pulse is a short, highly-structured message: class, topic,
   one home question, exception state if any. A deterministic
   template produces this correctly, for free, every time. An 8B-class
   model produces it correctly *most* of the time, for a cost, with
   occasional Hinglish that reads wrong to a native speaker.
2. Constitution §9 requires that no AI-generated factual assertion
   reaches a parent without a deterministic re-validation against
   source data at send time. A template *is* that validation; an LLM
   output needs a separate checking layer built around it. Template
   first is strictly less work and strictly safer.
3. Hinglish quality at the 8B scale is unverified for this use case.
   If it produces stilted or subtly wrong Hindi, the trust cost is
   immediate and the parent has no way to tell you.

**Decision:** deterministic Hinglish templates as the default path,
LLM narrative behind an off-by-default flag (`ENABLE_LLM_NARRATIVE`),
introduced only for the Weekly Confidence Brief — which is genuinely
narrative and where a template reads mechanical — and only after the
validation gate exists. This matches what Constitution §9 already
requires and does not need a new decision.

### LINE-BY-LINE REASONING
- **Founder:** this feature generates the exact data the Bridge Rule
  gate needs (parent engagement with the Pulse). It is arguably the
  fastest path to opening the gate. That makes getting it right more
  important, not less.
- **Teacher:** a per-topic comprehension signal from home is
  genuinely new information they cannot get any other way. Delivered
  as a learning signal it is useful; delivered as a parent scorecard
  it becomes something they're asked to police.
- **Parent:** three taps, no typing, no app, in their own language.
  This passes the Palwal test cleanly — provided they are never shown,
  or implicitly told, that they are being graded.
- **Student:** the intended beneficiary. Protecting them means the
  parent's response rate must never touch the child's record.

---

## WHAT DOES NOT CHANGE

Recorded explicitly so no future session treats these as reopened:

1. **Database:** PostgreSQL + RLS on Supabase. Nothing in these six
   directives touches this, and all six are implementable on it.
2. **Bridge Rule:** not met. No pilot data exists. Phase 0 (public
   web platform) remains the only authorized build.
3. **Recognition formula:** Personal Best threshold + logit-delta
   banded Most Improved. Unchanged.
4. **The 10 locked files:** not overwritten. This evaluation and the
   addendum are additive.

## OPEN ITEMS REQUIRING YOUR INPUT (not invented, not assumed)

- `[GAP]` Current-year CPI figure and its official source, for the
  Form 6 advisory calculation.
- `[GAP]` Whether the February 1 Form 6 deadline holds for the coming
  session, and the current official field list.
- `[GAP]` Confirmation of WhatsApp interactive button character limit
  and current India per-message billing rules, at build time.
- `[GAP]` Which fee concession types your target schools actually use
  (sibling, staff ward, RTE, hardship — the real list, from a real
  school, not a guess).
