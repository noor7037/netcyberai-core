# 29. Payroll: specification proposal, and what the blocked modules need

**Status:** proposal for the founder (Noor) to approve, change or reject.
Nothing in this document is built. It is Decision Log C230, written by the
lead from the P7 plan (docs/28 §6) and the module catalogue (docs/17
rows 20, 30, 31 and 32).

**Rule kept here:** no statutory rate, ceiling, slab or due date is written
in this document or in code. Each one becomes a dated setting that a school or
NetCyberAI types, with the notification it comes from (docs/28 §3, rule 3).
Where this document needs one, it names the rule and the source to read, never
the number.

## 1. Payroll: what the product would do

The accountant prepares a month's salaries for every member of staff. The
principal approves them. A payslip goes to each person. The bank gets one
file. Every step is audited, and a month once paid never changes.

It reuses what exists:
- staff accounts and records (Staff, P5);
- the jobs runner;
- the settings engine;
- PDF generation (report cards, ID cards);
- the send-gate, for any message to staff;
- the audit trail;
- the month-close pattern of Fees.

## 2. Questions for the founder

Each question has the lead's proposed answer. Approve it, change it, or say
"not in v1".

### A. Scope and who

1. **Who is paid?** Proposal: every staff member with an account, plus staff
   without one (cooks, drivers, guards), entered by the office.
2. **Who prepares and who approves?** Proposal: the accountant prepares. The
   principal approves. The school admin can do either, but never both for the
   same month.
3. **Which plan?** Proposal: Growth and Compass, like the other office
   modules. The founder decides, and the supervisor adds the pricing row.
4. **Is v1 a calculator, or the record of payment?** Proposal: the record. A
   month is drafted, checked, approved, then marked paid with the bank's
   reference. Paying from inside the product (a bank API) is not in v1.

### B. Salary heads

5. **Earnings.** Proposal:
   - basic;
   - dearness allowance;
   - house rent allowance;
   - any allowances the school names.

   Each head is fixed, or a percentage of named heads, or typed each month.
6. **Deductions.** Proposal:
   - provident fund;
   - ESI;
   - professional tax;
   - TDS;
   - salary advance recovery;
   - loss of pay;
   - any deductions the school names.
7. **Loss of pay.** Proposal: from staff attendance and leave once staff
   attendance exists (docs/17 lists it under Staff, later). Until then, the
   number of days is typed. Should loss of pay wait for staff attendance?
8. **Arrears and increments.** Proposal: an increment has an effective date.
   If a past month was paid at the old rate, the next run shows the arrears
   as a separate line. Is that enough?

### C. Statutory rules: how each one is kept

Each rule is a dated setting with its source: the notification or Act, its
date, and who typed it. No number is in code.

9. **Provident fund.** Read the EPF and MP Act 1952 and the EPF Scheme 1952
   as amended: the employee and employer shares, the wage ceiling, and
   whether contributions above the ceiling are allowed. Questions:
   - Does PF apply to every school, or only to those registered with the
     EPFO?
   - Does the school choose, per employee, whether to contribute on the full
     wage or on the ceiling?
10. **ESI.** Read the ESI Act 1948 and the ESIC's current notifications: the
    shares, the wage ceiling, and the contribution periods. Same question:
    every school, or only covered establishments?
11. **Professional tax.** Each state's own Act and schedule; some states levy
    none. Proposal: one table per state, typed with its source. Which states
    are loaded first? Proposal: the states of the first schools.
12. **TDS on salary.** Read the Income-tax Act's provisions for salary, the
    year's Finance Act, and the regime the employee declares. Choose one:
    - **(a)** v1 records a TDS figure the accountant types each month;
    - **(b)** v1 estimates it from declared income and the regime's slabs,
      typed per year with their source;
    - **(c)** v1 also produces Form 16 data.

    Proposal: (a) in v1, (b) next, (c) after a chartered accountant reviews
    it.
13. **Who types the statutory settings?** Proposal: NetCyberAI types the
    central ones (PF, ESI, the TDS slabs), once for every school, with the
    source. Each school types its own state's professional tax table if
    NetCyberAI has not loaded it. Each change is dated and never overwrites
    the past.

### D. The monthly run

14. **States:** draft → checked → approved → paid. A change after "checked"
    sends the month back to draft, and the history is kept. Once a month is
    paid it never changes; a correction is a new line in the next month.
    Proposal as written. Agree?
15. **Payslips.** Proposal: a PDF per person. Should it reach the person by
    email, or on WhatsApp through the send-gate (a template needs Meta's
    approval), or only on their own account in the app?
16. **The bank file.** Proposal: one file per month in the format of the
    school's bank. Which banks first? The format is the bank's own document,
    read from the bank and never guessed.
17. **Statutory returns** (the EPF ECR file, ESI challans, PT returns,
    Form 24Q). Proposal: not in v1. v1 gives the month's totals per rule so
    the school's accountant files them. Agree?

### E. Personal data and access

18. **Who sees salaries?** Proposal:
    - each person sees their own payslips;
    - the accountant, the principal and the school admin see everyone's;
    - nobody else does: not teachers, not the coordinator, not the
      platform role.

    The database holds this rule, as it does for fees.
19. **Bank account numbers and PAN.** These are personal data, and a PAN
    must never be confused with an Aadhaar number. Proposal: the PAN and the
    account number are stored encrypted, like the payment credentials (C171).
    Screens show only the last four characters. Audit rows hold none of them.
    Should the PAN be in v1?
20. **Retention.** Salary records are kept for the period the tax and labour
    laws require. The lawyer sets that period at P8, together with the other
    retention periods.

### F. What would make v1 done

21. Proposal for the acceptance test: "For a school with three staff and a
    PF rule, a professional tax table and a typed TDS line:
    - the accountant drafts the month and the principal approves it;
    - each payslip shows every head, and the totals equal the bank file to
      the paisa;
    - a paid month cannot be changed, and a correction appears in the next
      month;
    - a teacher sees only their own payslip, and the database refuses
      everything else."

## 3. The other blocked modules: what each needs from the founder

None of these is built. Each stays at "spec v0" in docs/17 until the founder
answers.

### Career Graph (`career`, docs/17 row 30)

The idea is to suggest career clusters and stream guidance from class 9,
using interests and subject performance, with counsellor notes. It needs:
- **Who it is for, and who decides.** A counsellor, a class teacher, or the
  family? Every suggestion would be a person's, never a model's verdict.
- **A source for the career clusters and stream guidance.** A published
  framework (a board's, or a government career portal's) is cited with its
  URL and the date it was read. The product never invents clusters.
- **The lawyer's view first.** Profiling a minor from marks and interests
  may count as "tracking or behavioural monitoring of children" under the
  DPDP Act, 2023. The lawyer to confirm whether it does, what consent it
  needs, and what is out of bounds.
- **Whether interests are collected,** how, and from whom: the child, or
  the guardian?
- **What the first school would use.** One class, one screen, one decision
  it helps with.

### Digital Twin (`twin`, docs/17 row 31)

The idea is a what-if simulator on the school's own data: a fee change,
hiring a teacher, an attendance target. It needs:
- **The three questions a principal would actually ask first,** in their
  own words. Each becomes one simulation with every assumption written on
  the screen.
- **For each question:** which of the school's numbers it uses, and what it
  assumes. For example: "a fee rise of X loses Y families". Who supplies Y?
  The product shows the school's own history and never an invented elasticity.
- **How results are worded.** A range and its assumptions, never a promise.
  The claims check (`scripts/check_claims.py`) applies to every number.
- **Whether it is a Compass feature.**

### Automation OS (`automation`, docs/17 row 32)

The idea is a rule builder on the jobs pipeline (trigger → condition →
action), with prebuilt automations, every run audited, and a person approving
anything sent to parents. It needs:
- **The first five automations** a school wants, in plain words. For example:
  "when a child is absent three days running, put a card on the class
  teacher's My Day". Prebuilt rules come first; a free-form builder only
  later, if schools ask for it.
- **The allowed actions.** Proposal: cards, tasks and drafts only. A message
  to a parent is always a draft that a person approves and the send-gate
  sends. Agree?
- **Limits:** how many rules per school, and how often each may run.
- **Who builds rules:** the principal only, or the school admin too?

## 4. Next step

The founder answers the questions above, in one message or in parts. The
lead turns the payroll answers into a phased plan (data model, slices,
acceptance tests) in docs/16 and docs/17, and reserves Decision Log numbers.
The other three modules wait for their answers. Nothing is built before then.
