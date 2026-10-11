# 23 — P3 plan: Fees and payments

**Status:** plan for review (Decision Log C156). No code in this PR.
**Number:** the brief names this file `22_P3_FEES_PLAN.md`; `22` is already
the reconstruction investigation, and two files under one number were
removed in C141, so the plan is `23`.
**Scope:** roadmap `16` §4 phase P3 and catalog `17` row 19 (Fees), with
`17` §3b items D1 (fee recovery: the list, promise-to-pay and hardship
parts), D4 (RTE tagging only) and E4 (versioned fee rules).
**Done when** (`16` §4): the payment → ledger → receipt → reminder loop
reconciles to the rupee.
**Every screen** follows `19` §5: `ModulePage`, today cards, English and
Hindi, a tour, a "Show me how" guide, teaching empty states, logo tokens, AA
contrast, 44 px targets, no invented numbers.

## 1. Where we start (checked in the code and both databases, 2026-10-13)

| Piece | Today |
|---|---|
| Screens | None. `/app/fees` is the "coming" page. The dashboards and My Day count fees from `fees_ledger`. |
| `fee_heads`, `fee_structures`, `fee_structure_items` | Tables with tenant RLS; only the principal, school admin and accountant write them, but **any staff role could read them** (closed in 6a). No screen. Fixture rows on the test database only (3 heads, 8 structures); none on production. A structure is per class and academic year with an `effective_from`. |
| `fee_concessions` | Table: per student, optionally per head; kinds `sibling`, `staff_ward`, `rte`, `negotiated`, `hardship`, `scholarship`; percent or amount; a reason and an approver are required. No screen. |
| `fees_ledger` | One row per amount due: student, amount in minor units, currency, due date, status, gateway ids. **It has no head and no period**, so a concession cannot be matched to a line (recorded as a gap in the fee engine migration). |
| `payments` | Many per ledger line; append-only; method cash, UPI, card, net banking, cheque or adjustment. A trigger recomputes the ledger line's status from its payments. |
| Status rule | Paid when payments reach the amount; `partial` when some is paid; `overdue` only when a payment event happens after the due date. Nothing marks a fee overdue when its date simply passes: the screens work it out from the date (C137). A part-paid fee past its date shows as "part paid" (C140). |
| Families | `families` and `students.family_id` exist (C116). No fee uses them yet. |
| Jobs and email | A job queue with a runner, and an email sender, exist (B2). No fee job. |
| Receipts, payment links | Nothing. |

## 2. What P3 delivers

A school's office sets what each class pays, the app raises the dues,
the office takes money at the counter or a parent pays through a link, a
numbered receipt is produced, and what is still owed is always the truth:
per fee, per student and per family.

Around that loop:

- **Concessions**, each an approved decision with a reason, including the
  **sibling concession** worked out from confirmed family links.
- **RTE tagging** (D4): a child admitted under RTE Section 12(1)(c) is
  marked as such; their fee lines are raised and fully conceded as `rte`,
  so what the State owes can be counted later (the claim desk is P7).
- **Overdue** as a stored fact, set each night by India's date, and a
  **part-paid fee past its date counted as overdue on its unpaid balance**.
- **Family dues**: everything a family owes across its children on one
  screen, with **one payment link per family**.
- **Fee recovery, the minimal loop** (D1): a daily follow-up list, a
  promise-to-pay tracker, and a hardship route that ends reminders and
  starts a concession request decided by a person.
- **Reminders by email** with the payment link (3 days before, on the due
  date, 7 days after). WhatsApp reminders switch on in P4.
- **Clearance gate**: a transfer or leaving certificate is held while dues
  are unpaid, unless a named person overrides with a reason.

## 3. Rules that hold everywhere in P3

1. **Money is whole minor units** (paise) in `bigint`. No floating point,
   anywhere. A percentage concession is rounded once, by one stated rule
   (half up, to the paisa), at the moment the due is raised.
2. **The reconciliation rule.** For every ledger line:
   `gross − concession = net`, and `net − sum(payments) = balance ≥ 0`.
   For every school: `sum(balance)` equals what the screens show as owed.
   One query checks it; it runs in the tests and in the nightly job, and a
   mismatch is reported, never repaired silently.
3. **Payments are append-only.** A wrong payment is corrected by a reversal
   row that names the payment it reverses, with a reason; nothing is edited
   or deleted. A receipt number is never reused.
4. **A payment from a gateway is applied once.** The gateway's payment id is
   unique; the same notice arriving twice changes nothing.
5. **Every concession is a person's decision**: who, when, why (`21`
   provenance). The app may propose (the sibling rule); a person approves.
6. **Fee rules are versioned** (E4): a structure or a rule is never
   overwritten. A change adds a row with `effective_from`; dues already
   raised keep the amounts they were raised with.
7. **Who:** the principal, school admin and accountant work fees. A teacher
   sees no fee data. RLS holds this; the app's checks repeat it.
8. **No ranking of named children.** The follow-up list is a list of
   families and amounts for the office. It is never shown to teachers,
   students or other parents, and no child's dues are shown on a class
   screen.
9. **Nothing reaches a parent without the send rules.** Email reminders go
   through the job queue with a per-family daily cap and stop the moment a
   promise or a hardship request is open.

## 4. Slices, in order

Each is one PR under ~1,500 lines (it touches money), with tests on the
whole schema as the app's database role, a real-browser run, the migration
applied to the test database, checked, then production, and one review at
medium with a security read.

| PR | Delivers | Data model change | Acceptance test |
|---|---|---|---|
| **6a. Heads and structures** | The Fees page for the office: fee heads; a structure per class and session with its items and frequencies; a change makes a new version from a date. Fees becomes partly live and is switched on for existing schools (C149 rule). | `fee_structures` gains `session_id` and a unique version key; nothing is overwritten. | A structure changed mid-year leaves the earlier version in place and both are listed with their dates. A teacher can read none of it (as `app_user`). |
| **6b. Raising dues, concessions, RTE** | "Raise dues" for a class and period from the structure in force on that date, net of approved concessions; safe to run twice. Concessions screen with approval. RTE tag on a student; their lines are raised and conceded as `rte`. | `fees_ledger` gains `head_id`, `period_key`, `gross_minor`, `concession_minor` (`amount_minor` stays the net) and a unique key per student, head and period. `students.rte_admission` (boolean, with the entry class and date). `fee_concessions` gains `status` (proposed, approved, ended) and `decided_at`. | Raising dues twice makes no second line. Gross, concession and net add up on every line; a percentage is rounded half up to the paisa. An RTE child's tuition line is net 0 and counted under RTE. An unapproved concession changes nothing. |
| **6c. Counter payments and receipts** | Take a payment for a student or a family: cash, UPI, cheque. Money is put against the oldest due first, or as the office chooses. A numbered receipt that prints. A reversal with a reason. | `receipts` (number from the numbering framework, family or student, total, issued by); `payments` gains `receipt_id` and `reverses_payment_id`. | **Reconciles to the rupee:** for seeded dues and a mix of full, part and reversed payments, every balance matches a hand count and the school total equals the sum of balances. A payment cannot exceed what is owed. A receipt number is never reused, even after a reversal. |
| **6d. Overdue, part-paid past due, late fee** | The nightly job marks a pending fee `overdue` once India's date passes its due date. A late fee, if the school has switched it on in settings (off by default, C158), is raised by the same job as a new due line. A part-paid fee past its date is `overdue` too, on its remaining balance. Dashboards and My Day read the stored status and the balance. | The status trigger uses India's date and the balance; a `fee_status_runs` row per night (how many changed, the reconciliation result). | A fee due yesterday (India) is overdue after the job and not before midnight India time (fixed clock). A fee of ₹1,000 with ₹400 paid, past its date, counts ₹600 overdue. The job run twice changes nothing the second time. |
| **6e. Sibling concession and family dues** | A sibling rule in Fees settings (which child, which heads, how much), proposed from **confirmed** family links only, approved by a person, ended when a sibling leaves. The family dues screen: every child's lines and one total. | Fees settings schema; `fee_concessions.source` (rule or person) and `family_id`. | Two confirmed siblings: the rule proposes the concession for the right child and nothing applies until approved. An unconfirmed link proposes nothing. When a sibling is marked transferred the concession ends from that date and later dues are raised without it. The family total equals the sum of its children's balances. |
| **6f. Payment link and the stand-in provider** | `PaymentProvider` (as `FileStorage` and `AIProvider`): create a link for a family's dues, receive the gateway's notice, apply it once, issue the receipt. A stand-in provider for tests and the harness. The Razorpay adapter is added, behind the same interface, when the founder's test keys exist. | `payment_links` (family, amount, lines covered, status, provider reference); a unique gateway payment id on `payments`. | With the stand-in: a link for a family covers exactly its open lines; the notice applies the money oldest first and issues one receipt; the same notice twice changes nothing; a notice with a wrong signature or amount is refused and logged. Nothing is ever marked paid by a browser redirect alone. |
| **6g. Fee recovery, reminders, clearance** | The daily follow-up list for the office (amount, age, last contact); record a promise to pay with a date; mark hardship, which stops reminders and opens a concession request for a person to decide. Email reminders at −3, 0 and +7 days with the link. The clearance gate on certificates. | `fee_followups` (family, kind: call, promise, hardship; promise date; outcome; by whom); `fee_reminders` (family, due line, which reminder, sent or held and why). | A family with a promise open gets no reminder until the promise date passes. Hardship stops every reminder and creates a concession request; nothing is conceded until a person approves. No family gets more than one reminder a day. A certificate for a student with dues is held, and an override needs a reason and is audited. |

## 5. Decisions the plan makes, unless told otherwise

- **Period keys.** Dues are raised per head and period: `2026-04` for a
  monthly head, `2026-Q1`, `2026-H1`, `2026-27` for annual and one-time.
  The school's session decides which months a period covers.
- **Rounding.** Half up to the paisa, once, when the due is raised.
- **Allocation** (decided, C158). A payment goes to the oldest due first by
  default; the office may pick a different due when recording it, and the
  choice is audited. A family payment is spread the same way across its
  children.
- **Late fee** (decided, C158): a school setting, **off by default**. The
  rule and its amounts are configuration, never constants. When a school
  switches it on, a fine is a new due line raised by the nightly job (6d),
  never a change to an old line.
- **Receipt.** One numbered receipt per payment event, printable from the
  browser. The three-copy layout waits for a real school's format.
- **RTE.** P3 tags the child and keeps their lines visible as conceded
  under `rte`. It claims nothing from the State and prints no claim sheet.
- **Reminders.** Email only in P3, to the guardian's email if there is one.
  A family with no email is on the follow-up list and gets no reminder.
- **Sibling rule default** (decided, C158). None. Each school sets its own,
  applied only from confirmed family links, with approval (C116).

## 6. What needs Noor

Nothing for 6a to 6e, the stand-in part of 6f, or 6g.

For the **Razorpay adapter in 6f** only, because they cannot exist without
him: Razorpay sign-up (KYC) and the **test** keys. Needed when 6f's stand-in
is merged, not before. Live keys are a launch item, not a P3 item.

**Real concession types** (roadmap input): the six kinds already in the
schema are used until a real school's list is known.

## 7. Limits of what I can verify

- No real money moves in P3 until the test keys exist; the loop is proven
  on the stand-in provider and in the tests.
- Email reminders are proven up to the job queue and the sender's
  interface; delivery to a real inbox depends on the deferred cutover
  (`18` §0), as sign-in emails do.
- A printed receipt is checked in the browser's print view, not on paper.
