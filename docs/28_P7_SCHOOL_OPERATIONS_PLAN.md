# 28 — P7 plan: school operations

**Status:** built in part (section 11). 10a to 10g are merged (C221 to C231, with
the close-outs C224 to C226 and C232, merged in C230-C). The plan itself was C220.
**Scope:** roadmap `16` §4 phase P7, together with the founder's
differentiators (C198-B):
- Setup (complete);
- the admissions pipeline;
- the student data check (APAAR and UDISE+ readiness);
- the RTE claim desk;
- the compliance desk;
- documents and certificates;
- the timetable generator.

Payroll, Career Graph, Digital Twin and Automation OS are **blocked**
(section 6).
**Done when** (`16` §4): every module on the website exists, and AI modules
run on real data with human approval.
**Every screen** follows `19` §5: `ModulePage`, today cards, English and
Hindi, a tour, a "Show me how" guide, teaching empty states, logo tokens, AA
contrast, 44 px targets, and no invented numbers. Every number follows `21`:
where it came from, the rule and its version, and who decided.
**The public website is not touched** by P7. Its free tools stay as they
are; the product imports their pure rules (rule 2).

## 1. Where we start (one read of the code and the test database, 2026-10-14)

- **Admissions:** the module is planned. New pupils enter as students
  waiting for consent; there is no enquiry, no stage and no follow-up.
- **Students:** each record has name, admission number, class, roll number,
  date of birth, status and the RTE fields from C158–C159 (`rte_admission`,
  `rte_entry_class`, `rte_admitted_on`). It has **no gender**, and nothing
  about Aadhaar or APAAR.
- **Staff:** `teachers` holds name and joining date only. There is no
  qualification, no TET and no expiry date.
- **Documents:**
  - the certificate studio, with bulk certificates from a CSV (C198-B);
  - `certificate_requests` with a state;
  - QR tokens on ID cards (`student_qr_tokens`);
  - captured documents with OCR.
- **Compliance:**
  - the consent ledger, audit trail and data requests are live;
  - `src/lib/compliance/form6.ts` holds the Haryana Form 6 advisory, with its
    CPI and filing deadline as configuration.
- **Timetable:** entries are typed or imported, with a clash guard
  (`src/lib/timetable/plan.ts`). There is no generator.
- **Setup:** classes and sections are live; academic sessions and subjects
  have a backend but no office screen.
- **The website's free tools** hold pure rules P7 reuses
  (`src/lib/free-tools/`):
  - `student-data-check.ts`: name, date-of-birth and gender comparison, and
    the Aadhaar notice;
  - `rte-claim.ts`: the claim as the lower of the state rate and the fee,
    and ageing buckets;
  - `teacher-register.ts`: qualification stages, TET and expiry windows;
  - `admissions-tracker.ts`: sources, stages, follow-ups and the "gone quiet"
    list;
  - `fee-promise.ts`;
  - `remarks.ts`: the fixed phrase bank.

## 2. What P7 delivers

1. **Admissions pipeline.**
   - An enquiry is recorded from WhatsApp, a walk-in or a phone call, with an
     owner, a follow-up date and a stage.
   - A "gone quiet" list shows enquiries with no contact for a set number of
     days.
   - An admitted enquiry becomes a student record with a fee plan.
2. **Student data check.**
   - Name, date of birth and gender in the school's record are compared with
     Aadhaar as printed, typed by the school. There is no APAAR API.
   - A correction request goes to the parent on WhatsApp, and the reply is
     kept.
   - **No Aadhaar number is ever stored.**
3. **RTE claim desk.**
   - Each RTE child has an evidence file from admission.
   - The claim is the lower of the state rate (typed by the school) and the
     fee, under RTE Act s.12(2).
   - Unpaid claims are aged year by year.
4. **Compliance desk.**
   - Teacher qualifications and TET on staff records, with expiry alerts.
   - The mandatory public disclosure data.
   - Form 6 fee data.
   - SQAAF evidence tagged to its standards.
5. **Documents and certificates.**
   - Certificates in bulk from the school's own records, behind the
     fee-clearance check.
   - QR verification, and an issue register.
6. **Timetable generator.** A timetable proposed from teacher load,
   subject periods and constraints. A person reviews it and accepts it.
7. **Setup (complete).** Office screens for academic sessions and subjects,
   and the onboarding checklist.

## 3. Rules that hold everywhere in P7

1. **No Aadhaar number, ever.**
   - The student data check stores what Aadhaar *prints* (name, date of
     birth, gender), typed by the school, and nothing else.
   - A field that looks like a 12-digit Aadhaar number is refused by the app
     and by the database.
   - Nothing in P7 stores a scan of an Aadhaar card.
2. **One rule in one place.** The product imports the pure rules of the
   website's free tools: comparisons, the claim, ageing, stages and expiry
   windows. P7 never copies them, and never edits `src/lib/free-tools/**`.
   If a rule needs a change it is raised with the supervisor, who owns the
   website.
3. **Rates and dates are typed by the school or come from a cited
   document.** The state RTE rate, the CPI, filing deadlines and expiry
   periods are settings with their source. No rate, deadline or statutory
   number is written in code.
4. **A person decides.**
   - The generator proposes a timetable; a person accepts it.
   - A correction request is drafted and a person sends it, through the
     send-gate.
   - An admission is confirmed by the office.
   - Every decision is audited.
5. **Messages go only through the send-gate,** with consent, quiet hours
   and budget. Templates are approved before use. A parent's reply is kept
   with the request it answers.
6. **Personal data stays with the roles that need it.** Admissions and the
   RTE desk are the office's; the student data check is the office's and the
   class teacher's; the compliance desk is the office's. Each is held by the
   database, and every table has its own row level security.
7. **Rules only.** No language model in P7's slices.

## 4. Slices, in order

Each is one PR with tests on the whole schema as the app's database role, a
real-browser run of its screens at 390 and 1440, and the review `CLAUDE.md`
sets. Migrations go to the test database, are checked, then go to
production, in PR order, by the lead only.

| PR | Delivers | Data model | Acceptance test |
|---|---|---|---|
| **10a. Admissions pipeline** (C221) | `/app/admissions`:<br>• record an enquiry (child, class sought, guardian, phone, source: WhatsApp, walk-in or phone), with an owner and a follow-up date;<br>• stages from `admissions-tracker.ts` (enquiry, visit, application, test or interview, offer, admitted, closed);<br>• "follow up today";<br>• "gone quiet" (no contact for the setting's number of days).<br>"Admit" creates the student record (waiting for consent, as today) and puts the child on the class's fee structure. A My Day card shows follow-ups due. | `admission_enquiries` (stage, owner, next follow-up, source, closed reason) and `admission_events` (each contact or stage change, append-only). The office reads and writes; a teacher sees none. | An enquiry moves through the stages with each step kept. One with no contact for the setting's days is on "gone quiet". "Admit" makes exactly one student record, on the class's fee structure, and the enquiry says admitted. A teacher and an accountant are refused by the app and the database. |
| **10b. Student data check** (C222) | `/app/students/data-check`:<br>• the school types, for each child, the name, date of birth and gender **as printed on Aadhaar** (never the number);<br>• `student-data-check.ts` compares them with the school record and lists mismatches by severity;<br>• "Ask the parent" drafts a correction request (an approved template, through the send-gate), and the guardian's reply is kept with it;<br>• the office corrects the record (audited) or closes the request.<br>The record gains gender (male, female, transgender, not given). | `students.gender`. `student_id_as_printed` (name, date of birth, gender, typed by and when). `data_check_requests` (the mismatch, the message, the reply, the outcome). A check refuses any 12-digit run in these fields. | A mismatch in name, date of birth or gender is found by the free tool's own rule. A request is sent only through the send-gate and its reply is kept. A 12-digit number is refused by the app and the database. The class teacher sees their own classes, the accountant none. |
| **10c. RTE claim desk** (C223) | `/app/fees/rte`:<br>• each RTE child (`rte_admission`) with an evidence file (documents attached since admission);<br>• the year's claim per child as the lower of the state rate (typed by the school, with its source) and the child's fee (`rte-claim.ts`, RTE Act s.12(2));<br>• claims raised, paid and unpaid, aged year by year;<br>• a CSV of the claim sheet. | `rte_rates` (year, rate, source, typed by), `rte_claims` (child, year, amount, state, paid on, reference) and `rte_evidence` (child, document, kind). The office and accountant read and write; a teacher sees none. | The claim equals min(rate, fee) to the rupee for each child and year. A paid claim leaves the unpaid list; an unpaid one moves to the next age bucket each year. No claim is raised without the state rate. Roles are held by the database. |
| **10d. Compliance desk** (C227) | `/app/compliance/desk`:<br>• teacher qualifications and TET (`teacher-register.ts` stages and expiry windows), on staff records, with expiry alerts on My Day;<br>• the mandatory public disclosure data, kept and exported;<br>• Form 6 fee data from the fee structures (`form6.ts`);<br>• SQAAF evidence: a document or note tagged to a standard. | `staff_qualifications` (kind, subject, valid from and to, evidence); `disclosure_items`; `sqaaf_evidence` (standard code, document, note). The standards list is data with its source. | A qualification expiring within the window shows on My Day and on the desk. Disclosure data exports exactly what is kept. Form 6 reads the fee structures, never a typed copy. Each evidence row names its standard. Only the office reads staff qualifications. |
| **10e. Documents and certificates** (C228) | Certificates in bulk from the school's records (the studio's templates), each behind the fee-clearance check (or a recorded waiver). A QR code on each certificate opens a public verification page that shows only the certificate's number, type, the school and "valid" or "withdrawn". An issue register, numbered in sequence. | `certificates_issued` (number, type, child, issued by and on, QR token, withdrawn by, when and why). | A child with dues gets no certificate without a recorded waiver. Numbers are unbroken and never reused. The QR page shows no personal data beyond what the certificate prints and says "withdrawn" once withdrawn. |
| **10f. Timetable generator** (C229) | The constraints: periods per subject per class, teachers' subjects and classes, unavailable periods, and the rules of `plan.ts`. The generator proposes a week; a person reviews it, swaps periods, and accepts it into `timetable_entries`, replacing a week only when told to. | `timetable_constraints`, `timetable_proposals` (proposed week, by, when, accepted by and when). | A proposal never puts a teacher in two classes at once or a class in two subjects in one period, and meets each subject's periods or says which it could not. Nothing reaches `timetable_entries` until a person accepts. |
| **10g. Setup: who teaches what** (C231, scoped by C230-A) | On Staff, the office (principal, school admin) keeps `teacher_subjects`: each teacher's subjects and classes. A teacher proposes one for themselves on their account page; the office confirms or declines. The timetable reads it: a class and subject with assignments take only those teachers, by hand, by CSV and in the generator. The periods-in-a-row limit has no default. The timetable page shows periods a week per teacher. Still to come from the first 10g row: office screens for academic sessions and subjects, and the onboarding checklist. | `teacher_subject_requests`; office-only writes on `teachers` and `teacher_subjects`; one `teachers` row per user. | The office gives a teacher a subject in a class, and the teacher reads and marks it; a teacher cannot write it or confirm their own proposal. No proposal is made until the school sets the limit. |

## 5. Decisions the plan makes, unless told otherwise

- **WhatsApp enquiries:** v1 records an enquiry whose source is WhatsApp by
  hand, from the conversation. An enquiry made by itself from an unknown
  sender's first message is a later step, because it needs the webhook to
  accept numbers that are not guardians.
- **Gender** values follow Aadhaar's own set, as the free tool reads them
  (`readGender`): male, female and transgender, plus "not given", which is
  never a mismatch.
- **RTE:** a claim is per child per school year. The state rate is a
  setting per year, entered by the school with its source. Ageing buckets
  are those of `rte-claim.ts`.
- **SQAAF standards** are data, seeded from CBSE's SQAAF document with its
  URL, read when 10d is built. Until then a school tags evidence to standards
  it types.
- **Certificate numbers** run per school and per type. A withdrawn
  certificate keeps its number.

## 6. Blocked: listed, not built

- **Payroll:** needs the founder's approval of the spec proposal below.
- **Career Graph, Digital Twin, Automation OS:** need specifications. Each
  stays spec-v0 until the founder gives one.

### Payroll: spec proposal for the founder to approve

- **Salary heads:**
  - earnings: basic, dearness allowance, house rent allowance, other
    allowances (named by the school);
  - deductions: provident fund, ESI, professional tax, TDS, advances,
    other.
  - Each head is a setting of the school: fixed, a percent of named heads,
    or typed each month.
- **Statutory rules as dated settings**, each with its source notification.
  No rate is written in code:
  - **PF:** the employee and employer shares, and the wage ceiling (EPF
    Scheme 1952).
  - **ESI:** the employee and employer shares, and the wage ceiling (ESIC
    notification).
  - **Professional tax:** the slab table of the school's state (that state's
    PT Act schedule).
  - **TDS:** the employee's declared regime and the year's slabs (Income-tax
    Act; Form 16 data).
- **Monthly run:** draft → checked → approved → paid. Payslips are PDFs,
  and a bank export file uses the bank's format. Every step is audited; a
  paid month never changes, and a correction is a new entry.
- **Who:** the accountant prepares, and the principal approves.
- **What the founder decides:**
  - the heads above;
  - whether PF and ESI apply to every school or only to those registered;
  - which states' professional tax tables to load first;
  - whether TDS is in v1, or only a monthly estimate.

## 7. What needs Noor

- **Payroll:** approve or change the spec proposal in section 6.
- **Career Graph, Digital Twin, Automation OS:** a specification each.
- **Whether a TC may be held for unpaid fees** (C230-A): the founder decides
  with the lawyer. Until then each school switches the fee clearance per
  certificate type, off for the TC by default (C232).
- Nothing else blocks P7. State RTE rates, CPI and deadlines are typed by
  each school with their source.

## 8. Limits of what I can verify

- Whether the generator's proposals suit a real school is unknown until one
  uses it.
- The student data check compares what the school types from Aadhaar as
  printed. It cannot check the card itself, and there is no APAAR API.
- Hindi wording is unreviewed by a Hindi reader.

## 9. How the work is split (C198, "Parallel agents")

- **Wave 1, in parallel:** 10a, 10b and 10c (separate modules, screens and
  tables).
- **Wave 2:** 10d, 10e and 10f.
- **Then:** 10g.
- The lead keeps the migrations serial, edits `docs/10`, `16`, `17` and
  this file, and keeps the PR order. Decision Log numbers C221 to C223
  went to wave 1.
- **Wave 1 close-out (C223-A), before wave 2, in parallel and split by
  tables:**
  - C224: admissions, the data check, erasure and the audit rows;
  - C225: the RTE desk's close-out, and the one Aadhaar-number rule;
  - C226: plan placement and the free first month.
- **Reserved:**
  - C227: 10d;
  - C228: 10e;
  - C229: 10f;
  - C230: docs/29, the payroll specification proposal and what the blocked
    modules need;
  - C231: 10g.
- **Wave 2 close-out (C230-A), in parallel and split by tables:** C232 part
  A (documents and certificates, and the upload check), C232 part B (the
  compliance desk, and the founder's reason for viewing a school), and 10g
  (C231).
- One full `ci_local.sh` on the top of the stack.

## 10. What the audit history still holds (C224)

From C224, audit rows hold no names, phones, dates of birth, addresses or free
text (C56, C223-A answer 7). A call-site test (`test/audit/audit-pii.test.ts`)
keeps it so.

Rows written before C224 are append-only and stay as they were. Their
before_state and after_state still hold, by event_action:

- **student.create:** the student row: name, admission number, date of
  birth, class, roll and status.
- **student.update:** the name, admission number, date of birth and roll,
  before and after.
- **guardian.update:** the name, phone, email, relation and language, before
  and after.
- **student.data_check_corrected:** the corrected value, before and after: a
  name, a date of birth or a gender.
- **The typed reason:**
  - attendance.office_enter, attendance.office_correct,
    attendance.request_applied and attendance.request_dismissed;
  - bank.row_matched_by_hand and bank.row_not_a_fee;
  - exam.reopened, fees.clearance_overridden, fees.receipt_reversed and
    fees.upi_reopened;
  - payments.credentials_saved (from Control) and
    payments.gateway_access_changed;
  - whatsapp.budget_set and whatsapp.stop_lifted;
  - qr_token.revoke.
- **attendance.correct:** the late-correction note.
- **billing.terms.added, billing.terms.ended and
  billing.terms.period_changed:** the founder's reason.
- **followup.done and followup.not_needed:** the outcome text.
- **homework.edit:** the title and details, before and after.
- **payments.direct_upi_changed:** the UPI ID, payee name, bank name, the
  account's last four digits and the IFSC, before and after.
- **syllabus.record and syllabus.update:** the topic and the note.
- **syllabus.unit_removed:** the chapter and the topic.
- **rte.claim_written_off:** the write-off note.
- **rte.claim_paid:** the state's payment reference.
- **rte.rate_typed:** the source sentence.
- **ImpersonationStarted** (before C232): the founder's reason for viewing the
  school. From C232 the reason is kept on the viewing's own row
  (`impersonation_sessions`), which the school reads on its Compliance page.

These rows are not reached by a data request's erasure. Whether to scrub
them, and how without breaking the audit hash chain, waits for the lawyer
(P8), together with the retention periods.

## 11. What is built (2026-10-18)

| Slice | Decision Log | State |
|---|---|---|
| 10a. Admissions pipeline | C221; close-out C224 | Merged |
| 10b. Student data check | C222; close-out C224, C225 | Merged |
| 10c. RTE claim desk | C223; close-out C225 | Merged |
| Plan placement and the free first month | C226 | Merged |
| 10d. Compliance desk | C227; close-out C232 part B | Merged (close-out #169) |
| 10e. Documents and certificates | C228; close-out C232 part A | Merged (close-out #168) |
| 10f. Timetable generator | C229 | Merged |
| 10g. Who teaches what | C231 | Merged (#170) |
| Payroll, Career Graph, Digital Twin, Automation OS | C230 (`29`) | Blocked: waiting for the founder |

Still to build in P7: the office screens for academic sessions and subjects,
and the onboarding checklist (the rest of the first 10g row), with the academic
coordinator also assigning teachers and the database enforcing the
assigned-teacher rule (both answered in C230-C); APAAR capture (`17` row 22). The Family App (P7b) is planned in `31`.
