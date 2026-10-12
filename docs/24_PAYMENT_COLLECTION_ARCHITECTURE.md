# 24 — Payment collection architecture

**Status:** canonical from 2026-10-12 (Decision Log C170). It replaces the
payment parts of `23_P3_FEES_PLAN.md` §4 (6f onwards) and §6 where they differ.
**Why it exists:** the founder spoke with 2–3 schools. They do not want an
intermediary taking a cut or holding their money; they want fees in their own
bank account as fast as possible. The founder asked for fee collection without
Razorpay for now, with Razorpay kept fully built and switched on later only by
entering credentials, and with one hard rule: **a payment is never marked
successful from a screenshot or an unverified UTR.**

---

## 1. The finding

**Fully automatic, real-time verification of a payment into the school's own
bank account is not technically possible today if all three of these must
hold: no intermediary, no integration with each bank's own API, and nothing
taken on trust.**

Only three parties know that a credit reached the school's account: the
payer's bank or UPI app, NPCI, and the school's bank. For NetCyberAI to learn
of it automatically, one of them must send a machine-readable signal. Every
way to get that signal needs one of the three things the founder ruled out:

| Way to learn a payment happened | What it needs | Why it is out (for now) |
|---|---|---|
| A gateway's signed webhook (Razorpay, Cashfree, PayU) | An intermediary. The money passes through the gateway's escrow and reaches the school later. | The schools' objection: fees and delay. |
| The school's bank's merchant or collection API | A separate integration and agreement for each bank (SBI, HDFC, ICICI each differ) | Ruled out: one integration per bank. |
| Account Aggregator (RBI framework) | NetCyberAI would have to be a **Financial Information User**, which must be registered with RBI, SEBI, IRDAI or PFRDA. NetCyberAI is not and cannot simply become one. Using a regulated partner makes that partner an intermediary. Data comes on consented fetches, not instantly. | Not open to us. |
| Bharat Connect (BBPS), Education Fees category | A Biller Operating Unit (a bank or authorised operator) under an agreement. It works for every bank and every UPI app, and the money settles to the school's own account. | It is a regulated intermediary, but a standard one, not a gateway. **See §4: the recommended next step.** |
| Bank alert emails or SMS to the school | Reading each bank's alert format; the school sets up forwarding | Per-bank formats that change without notice; an email without a valid DKIM signature can be forged. A later option, not a basis. |
| What the parent says (UTR typed in, a screenshot) | Nothing | Unverified. **Never accepted as proof (founder rule).** |

So the closest viable design without an intermediary keeps the money path
direct and instant, but the **proof** comes from the one record every bank in
India gives every account holder: **the bank statement**. It is downloaded
from net banking and given to NetCyberAI, and NetCyberAI matches it
automatically and exactly. The money is instant; the confirmation is as fast
as the statement upload (daily, or more often). That trade-off is stated to
schools plainly, never hidden.

## 2. The options compared

Figures are from the sources in §9. Where a figure is not published, it says
**GAP** and the build does not rely on it.

| | **A. Direct UPI to the school's own account, verified by bank statement** | **B. Bharat Connect (BBPS) as an education biller** | **C. Payment gateway (Razorpay etc.)** |
|---|---|---|---|
| Where the money goes | Straight to the school's current account, through the school's own bank's merchant UPI ID / QR | To the school's account through the BOU's settlement | To the gateway's escrow, then to the school |
| When the school has the money | **Seconds** | Settlement cycle set by the BOU (**GAP**: commonly T+1, not confirmed) | Agreed with the gateway; T+1 is no longer fixed by RBI (2025 PA directions); "instant settlement" costs extra |
| When NetCyberAI knows it is paid | When the statement is uploaded and matched (target: same or next working day) | **At once** (network confirmation) | **At once** (signed webhook) |
| Cost per payment (UPI) | The school's bank's merchant fee only. **From 15 Oct 2026, 0.4 % on merchant UPI payments above ₹2,000, capped at ₹300**, unless education gets a lower rate (**GAP**: the Finance Ministry FAQ promises "flat-fee or capped" education rates but no number is published). Under ₹2,000: 0. | Negotiated with the BOU (**GAP**: no published education rate) | Razorpay standard: **2 % platform fee + 18 % GST** on UPI for education (₹236 on ₹10,000), plus any network fee; custom above ₹5 lakh a month |
| Verification strength | Strong when matched to a bank row (§3.4). Not instant. Rests on the statement file the school's own finance role uploads (§7). | Strong (network) | Strong (signed webhook + server fetch) |
| Works with any bank | Yes. Any bank that gives a statement download (Excel/CSV) and a merchant UPI ID. Column mapping is set once per account (§3.3), no bank API. | Yes: every UPI and bank app shows Bharat Connect billers | Yes |
| School onboarding | Merchant UPI ID / QR on its current account, from its own bank (whether pilot schools already have one: to confirm, §8) + one statement column mapping | Biller registration through a BOU: PAN, bank details, agreement, UAT (CBSE has advised schools to join since 2020) | KYC with the gateway |
| Parent experience | Opens the link → pays in any UPI app → "Received, being confirmed" → receipt when matched | Pays from "Bill payments → Education fees" in any app, or from our link | Pays on a hosted page; receipt at once |
| NetCyberAI touches the money? | **Never** | Never | Never (the school's own gateway account) |
| Needs Noor or an outside party now | No | **Yes**: an agreement with a BOU (Noor's decision: contacting external parties, money) | Yes: the school's (or Noor's) KYC |

**Rejected:**
- **Unique paise per payment** (asking ₹2,300.37 to tell payments apart). It
  changes what the parent owes and breaks the rule that dues reconcile to the
  rupee.
- **Screenshots or UTRs typed by the parent as proof.** Founder rule; a UTR is
  used only as a key to find the bank row.
- **NetCyberAI collecting into its own account and paying schools.** That is
  acting as a payment aggregator, which needs RBI authorisation and a
  ₹15 crore+ net worth (reported). The design never routes money through
  NetCyberAI.
- **A school's savings or personal UPI ID.** NPCI's P2PM limits (₹10,000 a
  payment, ₹1 lakh a month, 2024 circular) make it unusable for fees, and an
  institution's account is a current account.

## 3. The design: one ledger door, many ways to pay

### 3.1 The principle

Every way of paying ends in the same function, the one 6f built
(`src/lib/payments/apply.ts`). It is fed **evidence**, never a claim:

```
evidence = { source, external_id, amount_minor, what it pays for }
source   ∈ gateway_notice      (signed webhook: Razorpay, stand-in, later Cashfree…)
           school_confirmed    (direct UPI: a named school verifier saw the UTR's credit in the school's bank)
           bank_statement_row  (direct UPI or bank transfer, matched to a statement)
           network_notice      (Bharat Connect, later)
           counter             (cash and cheque at the desk, 6c, as today)
```

- **Idempotent by `(source, external_id)`:** a unique key. The same notice,
  the same bank row or the same file uploaded twice credits once.
- **One allocation rule:** oldest due first across the family, never beyond a
  due. An excess goes to the refund list (C169), never to an advance.
- **One receipt series** (6c numbering), whatever the source.
- **Every application is audited** with its evidence id.

### 3.2 Collection methods, chosen per school

A school has a list of **collection methods**, each on or off, shown to the
payer in the school's chosen order:

| Method | Kind | Status at C170 |
|---|---|---|
| `counter` | Cash and cheque at the desk | Built (6c) |
| `direct_upi` | The school's own merchant UPI ID; parent enters the UTR; the school verifies (one by one, or by statement) | **Build next (6h)** |
| `razorpay` | Gateway, the school's own Razorpay account | **Built and dormant (6f-2):** switched on by entering keys, nothing else |
| `stand-in` | Test gateway | Built (6f); never in a production build |
| `bharat_connect` | Biller network | Designed here; built only after Noor decides on a BOU |

The **payer page** (`/pay/<token>`, 6f) shows every enabled method for that
school. A school with none enabled shows "Pay at the school office".

### 3.3 Direct UPI, end to end (founder's flow, C170 amended)

The founder's flow, kept as he described it, with the verification made
firm. **The school confirms its own money; NetCyberAI records who confirmed
what, and checks it against the bank whenever a statement is given.**

```
Parent                         NetCyberAI                          School (accountant / principal)
──────                         ──────────                          ───────────────────────────────
WhatsApp/email: fee due  ◀──── reminder with "Pay now" link
taps link → payer page
taps "Pay with UPI" ─────────▶ (UPI app opens; amount, school UPI ID, reference filled)
pays in the UPI app → money is in the school's account in seconds
back on the page: enters UTR ▶ status: "Payment initiated. The school
                               will verify it; you will get the
                               receipt once verified."  ─────────▶ notification: "₹2,300 reported by
                                                                   the family of class 5-A, UTR …"
                                                                   checks the school's bank app:
                                                                   [Found in bank]  [Not found]
                               ◀──────────────────────────────────  (or uploads today's statement:
                                                                    every waiting payment is checked at once)
receipt (slip) + "Payment  ◀── receipt issued through the one ledger door
confirmed" on WhatsApp/email
```

1. **Set-up (school office, once).** Settings → Fees → Payments: the school's
   **merchant UPI ID** (from its own bank, on its current account), the payee
   name, the bank account it lands in (bank, last 4 digits, IFSC), and **who
   may verify** (default: accountant and principal). The statement column map
   (§3.4 path B) is set the first time a statement is uploaded, not before.
2. **The reminder** (email in P3; WhatsApp from P4, after Meta verification)
   carries the family's "Pay now" link.
3. **The payer page** shows the amount, the school's name, a **reference
   code** (8 characters, no look-alike letters, unique in the school, e.g.
   `NCA-7K3Q9MPD`), a UPI QR, and on a phone a "Pay with UPI" button. Both
   carry `upi://pay?pa=<school UPI ID>&pn=<payee>&am=<amount>&cu=INR&tn=<reference>&tr=<reference>`.
4. **The parent pays** in any UPI app. A web page cannot learn from the UPI
   app that the payment happened; that is why step 5 exists.
5. **The parent enters the UTR** (12 digits, shown in every UPI app after
   paying). It is checked for form and **must not already be used in this
   school**: an old or another family's UTR is refused at once. The page
   then says: **"Payment initiated. The school will verify it; you will get
   the receipt once it is verified."** No receipt, no ledger change, no
   screenshot field anywhere. A parent who skips this still pays; the
   payment is then found by the statement (path B) or at the counter.
6. **The school is told at once:** an in-app notification and a My Day card
   for the verifiers; email to the principal (a daily digest, or each one,
   as the school chooses); WhatsApp from P4.
7. **The school verifies** (§3.4) and the receipt is issued through the one
   ledger door; the parent gets the slip and "Payment confirmed".
8. **Not found** → the parent is told, without blame: "The school could not
   find this payment yet. Please check the UTR, or contact the office." The
   report stays open for the office; nothing is credited.

### 3.4 How the school verifies: two paths, both proof from the bank

| Path | When it suits | What the verifier does | Evidence recorded |
|---|---|---|---|
| **A. Confirm one by one** | A few online payments a day; no set-up needed | Opens the waiting payment (family, amount, UTR, time), checks the school's own bank app or passbook, presses **Found in bank**, ticking "I checked the school's bank account: this UTR shows a credit of ₹X". If the amount seen differs, they enter the amount seen. | `school_confirmed`: the UTR, the amount seen, **who confirmed and when** (audited, never edited). |
| **B. Upload the statement** | Fee season (many payments a day), or once a week as a check | Downloads the statement from net banking (Excel/CSV) and uploads it. Every waiting payment is checked at once. | `bank_statement_row`: the bank's own line. |

**Path B's matching rule (automatic, deterministic):** a credit row confirms
a payment only when exactly one open report or link qualifies:

- **R1. Reference:** the row's narration contains the link's reference code,
  and the credit falls within the window (from the link's creation to the
  upload date).
- **R2. UTR:** the row's UTR/RRN equals the UTR the parent entered, and the
  amount equals the link's amount.

Two candidates means no automatic match: both go to the office's list.
**Amount and date alone never match.** A bank row is used **at most once**,
ever. The statement upload keeps **credit rows only**, shows a preview with
the count and total for the uploader to confirm, and checks the opening
balance against the last upload's closing balance.

**Path B also checks path A.** When a statement arrives, every payment
confirmed one by one since the last statement must appear in it. One that
does not is shown **in red to the principal**: "Confirmed by <name> on
<date>, not in the bank statement". This is how a mistaken or dishonest
confirmation is caught.

**Amounts:** a different amount (seen in the bank under path A, or under R1)
is applied as 6f does: oldest due first; any excess goes to the refund list.

**Who may verify** is a school setting. Above an amount the school sets, a
path-A confirmation by the accountant also needs the principal's tap. The
principal always sees the day's confirmations in one list.

### 3.5 The office's list: nothing waits silently

- A payment reported but not verified after **1 working day** reminds the
  verifiers; after **2** it alerts the principal; the parent's page keeps
  saying "being verified" and never "paid".
- Statement credits that match nothing (a parent who never entered a UTR, a
  donation) are listed. A person may match one to a family's link by hand
  (the bank row is the proof, with a reason, audited) or mark it "not a fee".
- Path-A confirmations missing from a later statement (red, above).
- A report is **never confirmed automatically by time passing.**

### 3.6 Counter UPI and cheques are reconciled too

Today (6c) the desk can record "UPI" or "cheque" and print a receipt on what
the parent shows. From 6h, every non-cash counter payment is **expected in
the bank statement**. It is matched by the same rules (amount + date + UTR if
typed), and the reconciliation report lists those not yet seen after N days
(a school setting, default 3). The receipt stays valid, because the school
issued it, but the gap is visible to the principal. A cheque that never
arrives is caught here.

### 3.7 Silent-failure guards

| What could go wrong unseen | Guard |
|---|---|
| The school does not verify, so payments sit "being verified" and parents get angry | Notification at once; My Day card "N payments waiting"; reminder after 1 working day, principal alert after 2 (§3.5). |
| A verifier presses "Found in bank" without looking, or falsely | Named and audited; the principal's tap above the school's limit; every path-A confirmation is checked against the next statement and shown in red if missing. |
| A parent enters someone else's or an old UTR | A UTR can be used once per school; the verifier checks the amount against the bank; path B checks the amount too. |
| A wrong column mapping (credit read as debit; Indian digit grouping `1,00,000.00`) | Preview with total and count confirmed by the uploader; parser tests for Indian formats, Dr/Cr columns, negative signs, merged cells; a file whose credit total is 0 or whose dates fall outside its stated period is refused. |
| The same statement, or overlapping ones, uploaded twice | Bank-row identity is unique; a re-upload adds only the new rows and says so. |
| A credit the payer's app stripped the note from | Path A, R2 (UTR) or the office's list; never a guess. |
| A UPI app limits or warns on a dynamic QR for a merchant UPI ID | **Gate before any school goes live (§6):** tested on the pilot bank's UPI ID in GPay, PhonePe, Paytm and BHIM at ₹1,999, ₹2,001 and ₹25,000. Fallback: show the school's own bank-issued QR, with the parent typing the amount and reference, and rely on the UTR. |
| A gateway is switched on while direct UPI also shows | Allowed: each source has its own evidence key, and a double payment is caught as excess and goes to the refund list. |

### 3.8 Razorpay (and any gateway) switched on by credentials only

The adapter is **fully built now and stays dormant** (6f-2):

- **Credentials** are entered either in **Control** (NetCyberAI staff, for a
  school, with the reason audited) or in the school's **Settings → Fees →
  Payments** (principal or school admin). Both write to one store:
  - **encrypted in the app** (AES-256-GCM, with a key held only in the server's
    environment, a key version for rotation), so a database copy alone
    reveals nothing;
  - **write-only**: never sent back to a browser. The screen shows "Key
    ending 4F2A, saved 12 Oct by …";
  - test and live are kept apart; the school's mode is shown everywhere a
    payment appears.
- **"Test connection"** calls a harmless provider endpoint and shows the
  result in plain words.
- **Each school has its own webhook address**
  (`/api/public/payments/webhook/<provider>/<config id>`), so the notice is
  checked with that school's webhook secret and can only credit that school.
- **The Razorpay adapter:** Payment Links API (a hosted page, so no
  third-party script on our domain); the webhook `X-Razorpay-Signature` is
  HMAC-SHA256 of the raw body with the webhook secret, compared in constant
  time; `payment_link.paid` and `payment.captured` both map to "captured",
  and `payment.failed` to "failed". Before crediting, the server **fetches
  the payment from Razorpay** and checks the amount and status, so the
  notice is not the only proof.
- **Test keys never credit a real school (C173).** A payment made with test
  keys, or on the stand-in, moves no money. For a school that is not a
  test-fixture school (`schools.is_test_fixture = false`):
  - the method can be switched on only with **live** keys that passed "Test
    connection";
  - no checkout is ever opened with test keys or the stand-in;
  - a test-mode notice is recorded and flagged, never credited;
  - the database refuses it as well: every `payment_evidence` row carries
    its mode, and a trigger refuses mode `test` for a real school, whoever
    writes it.
  Test-fixture schools take test payments, which is how the path is tried.
- **Switching on** = keys saved + "Test connection" passed + the method
  turned on (for a real school: the live keys). **Switching off** stops new links at once; notices for links
  already made are still accepted and credited.
- **Which schools may use a gateway** is a Control setting per school (and
  later per plan).

What cannot be verified until real keys exist: a real Razorpay call. The
adapter is tested against Razorpay's documented request, response and
signature formats with recorded examples. A test-mode run with real test keys
is the first step after keys are entered.

### 3.9 Bharat Connect (when Noor decides)

Same door, a third source: NetCyberAI answers the BOU's **bill fetch**
(student or family ID → dues from our ledger, the live truth) and receives
the **payment notice** → evidence `network_notice`. The school is the biller;
NetCyberAI is its technology provider. No code until a BOU is chosen; the
interface is reserved in `src/lib/payments/` so nothing is rebuilt.

## 4. Recommendation

1. **Now: build A (direct UPI + bank-statement proof)** as the default
   method. It meets the schools' wishes (their own account, money in
   seconds, the lowest fee possible) and the founder's rule (proof from the
   bank, never the parent). Its weakness, confirmation only after an upload,
   is guarded (§3.7) and stated to schools.
2. **Keep C (Razorpay) built and dormant**, switched on per school by
   credentials. Offer it to a school that wants cards, net banking and
   instant confirmation and accepts the fee.
3. **Have Noor explore B (Bharat Connect)** with 2–3 BOUs. It is the only
   option that gives **automatic, instant confirmation with any bank and the
   money in the school's own account**. It is a regulated, standard network,
   and CBSE has asked schools to join it. Ask each BOU for: the per-payment
   fee for the education category, the settlement time, and onboarding for a
   technology provider serving many schools. If the terms are good, B becomes
   the default and A the fallback.

## 5. Data model (for the build)

All tables have tenant RLS, forced, with rights pinned in `test/db/grants.test.ts`.

| Table | Holds |
|---|---|
| `payment_methods` | Per school: method, enabled, order, public settings (UPI ID, payee name, bank account ref) |
| `payment_credentials` | Per school + provider + mode: ciphertext, iv, tag, key version, last 4, saved by/at. **No role reads it except the server's payment path**; the screen sees only metadata. |
| `bank_accounts` | Per school: label, bank name, last 4, IFSC, statement profile (column map, date format, amount style) |
| `bank_statement_imports` | Per upload: account, file SHA-256, period, rows read, credit total, opening/closing balance, uploaded by, status |
| `bank_credit_rows` | Per credit row: account, dates, narration, UTR/RRN, amount, row identity (unique), import, match status |
| `payment_reports` | Parent's UTR for a link: UTR (unique per school), when. Status: reported, verified, not_found, withdrawn. A verification row: who, when, path A or B, amount seen. |
| `payment_evidence` | `(source, external_id)` **unique**, amount, what it was applied to, receipt, rule (A, R1, R2, manual), who and why if a person decided |

`payment_links` (6e) gains `reference_code` (unique per school) and `method`.

## 6. Done when (acceptance)

- Upload the same statement twice → the second adds 0 rows and credits ₹0.
- R1 and R2 each match and issue one receipt; amount alone never does; two
  candidates → the office's list, no credit.
- Excess and duplicate payments → refund list; partial → oldest first, the
  rest still owed; the school reconciles to the rupee (`23` §3 rule 2).
- Path A: a UTR used twice in a school is refused; "Found in bank" issues one receipt and tells the parent; "Not found" credits nothing; above the limit it waits for the principal; a path-A confirmation missing from a later statement is shown red to the principal.
- A hand match of a statement credit without a bank row is impossible (database constraint).
- Nothing is confirmed by time passing; reminders at 1 and 2 working days.
- Razorpay: with recorded signed examples, a valid notice credits once;
  tampered, replayed or other-school notices credit nothing; the server-side
  fetch disagreeing with the notice → not credited, flagged. Credentials
  never appear in a response, log or audit row (test greps them).
- **Live-readiness gate (before the first school, not before merge):** the
  UPI-app test in §3.7 on the pilot school's real merchant UPI ID, and one
  real statement from that school's bank parsed and matched.

## 7. Blind spots (accepted, watched)

- **A person's "Found in bank" is trusted until a statement checks it.** A
  school that never uploads a statement relies on its verifiers' honesty, as
  it does at the counter today. NetCyberAI names who confirmed, and the
  principal sees every confirmation.
- **The statement file is trusted.** A staff member with upload rights could
  edit it. Guards: only finance roles upload; each file's hash is kept; balance
  continuity; the principal sees every upload and manual match. NetCyberAI
  cannot prove a file is untampered. For that, a school needs B or C.
- **Confirmation lag** depends on the school's habit, not on us.
- **Fee season load:** confirming 50+ payments a day one by one is slow; the
  statement upload is the answer, and the screen says so when the queue grows.
- **MDR from 15 Oct 2026 is new and contested** (a Supreme Court petition,
  no stay reported). The education rate above ₹2,000 is unpublished. The
  cost row above must be re-checked when it is.
- **Bank statement rows hold parents' names and UPI IDs**: personal data under
  DPDP. Keep credit rows only, finance roles only, and a retention period;
  add this to the lawyer's list.
- **UPI app behaviour on dynamic merchant QRs** is unverified until the §3.7
  test.

## 8. What needs Noor

- **Nothing to build A or the dormant Razorpay adapter.**
- **Razorpay KYC is no longer needed now.** It is needed only when a school
  wants the gateway.
- **From the schools he already meets** (a conversation, not a task): their
  bank, whether they have a merchant UPI QR on their current account, and
  whether net banking gives them an Excel/CSV statement. One real statement
  (with the school's permission) before the first school goes live.
- **Decision: approach BOUs for Bharat Connect** (an outside party, money
  terms). Optional, recommended.

## 9. Sources (checked 2026-10-12)

- Razorpay education pricing and UPI fee breakdown: [razorpay.com/blog/payment-gateway-pricing-by-business-category-india](https://razorpay.com/blog/payment-gateway-pricing-by-business-category-india/), [razorpay.com/blog/?p=25839](https://razorpay.com/blog/?p=25839)
- UPI MDR from 15 Oct 2026 (0.4 % above ₹2,000, ₹300 cap, small-merchant exemption, education rate): [Finance Ministry FAQ (PDF)](https://financialservices.gov.in/sites/default/files/2026-09/FAQs---Merchant-Discount-Rate--MDR--on-Select-UPI--P2M--Transactions_0.pdf) (could not be opened from the build environment; terms taken from coverage of it), [SCC Online](https://www.scconline.com/blog/post/2026/09/16/npci-released-upi-mdr-faqs-explained/), [BusinessToday](https://www.businesstoday.in/personal-finance/news/story/are-school-college-fee-payments-exempt-from-standard-upi-mdr-heres-the-answer-555734-2026-09-15), [fintechspecs](https://fintechspecs.com/blog/india-upi-mdr-october-15-2026-merchant-fee-explained/), [BW Disrupt (Supreme Court notice)](https://www.bwdisrupt.com/article/supreme-court-issues-notices-to-rbi-npci-over-upi-mdr-framework-626040)
- NPCI P2PM limits: [TaxGuru](https://taxguru.in/finance/implementation-maximum-upi-credit-limits-p2pm-merchants.html), [Lexplosion](https://lexplosion.in/npci-fixes-maximum-upi-inward-credit-limit-for-p2pm-merchants-acquiring-banks-and-payment-service-providers-to-comply-with-directions-before-30th-april-2024/)
- RBI Payment Aggregator Directions 2025 (settlement terms, escrow): [AZB & Partners](https://www.azbpartners.com/bank/rbi-issues-consolidated-reserve-bank-of-india-regulation-of-payment-aggregators-directions-2025/), [Vinod Kothari (PDF)](https://vinodkothari.com/wp-content/uploads/2025/09/Key-Highlights-of-PA-2025-2.pdf)
- Account Aggregator FIU eligibility: [Sahamati FIU](https://sahamati.org.in/fiu/)
- Bharat Connect for education: [KVS goes live (PDF)](https://bharat-connect.com/pdfs/press-release/Press-Release-Kendriya-Vidyalaya-Sangathan-Goes-Live-on-Bharat-BillPay.pdf), [CBSE circular (PDF)](https://saras.cbse.gov.in/saras/Circulars/\OSAMS_Circular\Circular%20BBPS.pdf), [Axis Bank (PDF)](https://www.axisbank.com/docs/default-source/press-releases/axis-bank-ropes-in-the-untapped-education-sector-on-bbps-digital-platform.pdf), [CareerIndia on the 2026 CBSE advisory](https://www.careerindia.com/news/cbse-digital-payments-advisory-2026-schools-asked-to-promote-upi-066533.html)

## 10. Change log

- **2026-10-19**: §3.8: test keys never credit a real school (C173).
- **2026-10-12**: §3.3–3.5 rewritten to the founder's flow (parent enters the
  UTR, the school is notified and verifies, then the receipt goes out), with
  two verification paths and the statement as the cross-check (C170 amended).
- **2026-10-12**: Created (C170). Founder asked for collection without a
  gateway; direct UPI + bank-statement proof chosen; Razorpay kept dormant
  behind credentials; Bharat Connect recommended for Noor to explore.
