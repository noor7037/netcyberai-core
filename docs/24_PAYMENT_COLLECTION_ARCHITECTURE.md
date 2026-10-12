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
| `direct_upi` | The school's own merchant UPI ID; proof by bank statement | **Build next (6h)** |
| `razorpay` | Gateway, the school's own Razorpay account | **Built and dormant (6f-2):** switched on by entering keys, nothing else |
| `stand-in` | Test gateway | Built (6f); never in a production build |
| `bharat_connect` | Biller network | Designed here; built only after Noor decides on a BOU |

The **payer page** (`/pay/<token>`, 6f) shows every enabled method for that
school. A school with none enabled shows "Pay at the school office".

### 3.3 Direct UPI, end to end

1. **Set-up (school office, once).** Settings → Fees → Payments: the school's
   **merchant UPI ID** (from its own bank, on its current account), the payee
   name, and the bank account it lands in (bank, last 4 digits, IFSC). Then
   upload one recent statement; the app guesses the columns (date, narration,
   reference, credit, balance) and the office confirms them on a preview.
   That **statement profile** is saved for the account. Profiles for common
   banks may be pre-filled, but any bank works through the mapping.
2. **The link.** A reminder (email in P3, WhatsApp from P4) carries the
   family's payment link. The page shows the amount, the school's name, a
   **reference code** (8 characters, no look-alike letters, unique in the
   school, e.g. `NCA-7K3Q9MPD`), a UPI QR, and on a phone an "Open UPI app"
   button. Both carry `upi://pay?pa=<school UPI ID>&pn=<payee>&am=<amount>&cu=INR&tn=<reference>&tr=<reference>`.
3. **The parent pays** in any UPI app. The money is in the school's account
   in seconds.
4. **"I have paid" (optional).** The parent may type the 12-digit UTR shown
   in their app. The link becomes **"Payment reported, being confirmed by the
   school's bank record"**. No receipt and no ledger change. There is no
   upload field: screenshots are never taken.
5. **Proof.** The accountant downloads the statement from net banking
   (Excel/CSV) and uploads it: once a day, or whenever they like. The app:
   - reads it with the saved profile, keeps **credit rows only** (the
     school's spending is not our business), and shows a preview with the
     row count and credit total, which the uploader confirms against the
     statement;
   - checks continuity where the file has balances (opening balance = the
     previous upload's closing balance) and warns on a gap;
   - matches each new credit row (§3.4) and applies matched ones through the
     one ledger door. Receipts are issued and the parent is told.
6. **Exceptions** go to a list for the office (§3.5). Nothing waits silently.

### 3.4 The matching rule (deterministic, no guessing)

A bank row is matched **automatically** only when exactly one open link
qualifies under one of these, tried in order:

| Rule | Both must hold |
|---|---|
| **R1. Reference** | The row's narration contains the link's reference code, **and** the credit is within the window (the link's creation to the upload date). |
| **R2. UTR** | The row's UTR/RRN equals a UTR the parent reported for the link, **and** the amount equals the link's amount. |

- An amount different from the link under **R1** is applied as 6f does: oldest
  due first, excess to the refund list.
- Two links qualifying for one row, or one link for two rows under R2, means
  **no automatic match**: both go to exceptions.
- A bank row is used **at most once**, ever (unique key on the row's
  identity: account + UTR, or account + date + amount + narration hash when a
  bank gives no UTR column).
- **Amount and date alone never match automatically**, however likely it
  looks.

### 3.5 Exceptions: a person decides, with the bank row as proof

The office sees: unmatched credit rows; reported payments not yet seen in a
statement; rows two links could claim. A person may **match a row to a link
by hand**. The bank row is required (so this is still verified money), along
with a reason. It is audited. Above an amount the school sets, the principal
must approve. A person can also mark a row "not a fee" (a donation, a
refund), again audited.

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
| The office stops uploading statements, so payments sit "being confirmed" and parents get angry | My Day card: "Upload today's bank statement: N payments waiting". The nightly job alerts the principal when a reported payment is more than 1 working day old with no upload since. |
| A wrong column mapping (credit read as debit; Indian digit grouping `1,00,000.00`) | Preview with total and count confirmed by the uploader; parser tests for Indian formats, Dr/Cr columns, negative signs, merged cells; a file whose credit total is 0 or whose dates fall outside its stated period is refused. |
| The same statement, or overlapping ones, uploaded twice | Bank-row identity is unique; a re-upload adds only the new rows and says so. |
| A credit the payer's app stripped the note from | R2 (UTR) or exceptions; never a guess. |
| A UPI app limits or warns on a dynamic QR for a merchant UPI ID | **Gate before any school goes live (§6):** tested on the pilot bank's UPI ID in GPay, PhonePe, Paytm and BHIM at ₹1,999, ₹2,001 and ₹25,000. Fallback: show the school's own bank-issued QR, with the parent typing the amount and reference, and rely on R2. |
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
- **Switching on** = keys saved + "Test connection" passed + the method
  turned on. **Switching off** stops new links at once; notices for links
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
| `payment_reports` | Parent's "I have paid": link, UTR, when. Status: reported, matched, unmatched, expired |
| `payment_evidence` | `(source, external_id)` **unique**, amount, what it was applied to, receipt, rule (R1/R2/manual), who and why if manual |

`payment_links` (6e) gains `reference_code` (unique per school) and `method`.

## 6. Done when (acceptance)

- Upload the same statement twice → the second adds 0 rows and credits ₹0.
- R1 and R2 each match and issue one receipt; amount alone never does; two
  candidates → exception, no credit.
- Excess and duplicate payments → refund list; partial → oldest first, the
  rest still owed; the school reconciles to the rupee (`23` §3 rule 2).
- A manual match without a bank row is impossible (database constraint).
- Razorpay: with recorded signed examples, a valid notice credits once;
  tampered, replayed or other-school notices credit nothing; the server-side
  fetch disagreeing with the notice → not credited, flagged. Credentials
  never appear in a response, log or audit row (test greps them).
- **Live-readiness gate (before the first school, not before merge):** the
  UPI-app test in §3.7 on the pilot school's real merchant UPI ID, and one
  real statement from that school's bank parsed and matched.

## 7. Blind spots (accepted, watched)

- **The statement file is trusted.** A staff member with upload rights could
  edit it. Guards: only finance roles upload; each file's hash is kept; balance
  continuity; the principal sees every upload and manual match. NetCyberAI
  cannot prove a file is untampered. For that, a school needs B or C.
- **Confirmation lag** depends on the school's habit, not on us.
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

- **2026-10-12**: Created (C170). Founder asked for collection without a
  gateway; direct UPI + bank-statement proof chosen; Razorpay kept dormant
  behind credentials; Bharat Connect recommended for Noor to explore.
