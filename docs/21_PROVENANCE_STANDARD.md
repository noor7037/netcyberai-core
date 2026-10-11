# 21 — Provenance Standard (E1)

**Status:** canonical from 2026-10-11 (Decision Log C141). The standard named
in `17_MODULE_CATALOG.md` §3c row E1. It binds every module that shows a
flag, a number, a report or a message. It adds no table and needs no
migration: it says what each record must be able to show, and which
existing place holds it. Each phase adds the columns its own records need.

## 1. The one rule

> **Anything NetCyberAI tells a person must be traceable to where it came
> from.** If a principal asks "why does it say that?", the answer is on the
> screen in one tap, and a founder can follow it to the rows behind it.

This is the working form of the Constitution's first law (truth over
impression) and of "Why this?" on every exception (`19` §3.3, C104).

## 2. What must be traceable

| Kind | Examples today | Examples later |
|---|---|---|
| A **flag** | My Day cards; the dashboard's attention list; "pending consent" | at-risk signals, fee defaulters |
| A **number** | KPI tiles, chart values, Control totals, message cost | collection rate, coverage % |
| A **report** | the data-request record; the audit trail | report cards, compliance filings |
| A **message** | a WhatsApp alert through the send-gate; a ticket email | Daily Pulse, fee reminders |
| An **extracted value** | fields read from a scanned document | marks read from a sheet |

## 3. The seven facts

Every such record can answer these seven questions. A field may be empty
only where the table below says so.

| # | Fact | Question it answers | Rule |
|---|---|---|---|
| 1 | **Source** | Where did this come from? | The table and row(s), the upload, the person who typed it, or the outside page. A computed value names the query's inputs. Never "the system". |
| 2 | **Evidence** | What can I look at? | A link to the stored thing: a document, a screenshot, a ledger row, a URL with the date it was read. A pointer, never a copy of personal data. |
| 3 | **Validation status** | Has anyone checked it? | One of: `unverified`, `verified`, `rejected`, `superseded`. With who and when. A value shown to parents is `verified` or is not shown. |
| 4 | **Who and when** | Who created or changed it? | User id and role, timestamp. Already written by the audit log for every change. |
| 5 | **Rule version** | Which rule produced it? | For anything computed by a rule (overdue, at-risk, a rate, a consent notice): the rule's or the row's version or effective date. |
| 6 | **AI-assisted** | Did a model help? | `yes` or `no`, never left unsaid. If yes: which step, and that a person approved it. AI text never reaches a parent unapproved (`01` §5). |
| 7 | **Approver** | Who let it out? | For anything sent outside the school or acted on automatically: who approved, and when. For a rule-driven send, the rule and the consent it relied on. |

## 4. Where each fact lives (no new store)

Reuse what exists. A module adds a column only when no existing place fits.

| Fact | Existing place |
|---|---|
| Source, who and when | `audit_log` (append-only, hash-chained): actor, role, action, target type and id, before and after |
| Evidence | `captured_documents` and their `ocr_extractions`; `consent_ledger.evidence_ref`; ticket attachments in file storage; for an outside fact, a `verified_source` text and `verified_at` date on the row |
| Validation status | the record's own status column (`students.status`, `ocr_extractions.accepted`, guardian verification state, template `status`) |
| Rule version | the rule row's own `effective_from` or version (`message_rate_table.effective_from`, `consent_ledger.notice_version`, `retention_policy` rows) |
| AI-assisted | a boolean on the record that holds AI output, added by the module that introduces it |
| Approver | the approving action in `audit_log`; for a message, the send-gate's log row (consent checked, template approved) |

## 5. Worked examples from the code today

- **A message's cost** (`communication_log`, C140). Source: the send-gate's
  own row. Rule version: `rate_id` points at the `message_rate_table` row in
  force that day, which carries `verified_source` and `verified_at`.
  Validation: `cost_basis` says `rate_table`, or `rate_not_verified` when no
  verified rate was on record. An unverified rate is shown as a gap in
  Control, never as an amount.
- **"3 students are waiting for consent"** (My Day). Source: `students`
  rows with status `pending_consent`, counted in the person's own tenant
  context. "Why this?" states the rule in one sentence. Evidence: the card
  opens the list of those students.
- **A value read from a scanned document.** Source: the upload. Evidence:
  the stored file. Validation: each extracted field is accepted or rejected
  by a person before it changes the student's record, and that decision is
  audited. AI-assisted: yes (OCR), and never applied without the review.
- **Consent.** Source: the guardian, through the recorded method. Evidence:
  `evidence_ref`. Rule version: `notice_version`. Append-only: a withdrawal
  is a new row, never an edit.

## 6. Rules for builders

1. **No number without a query.** A value on a screen is computed from rows
   or is an honest empty state (`19` §3; `scripts/check_claims.py`).
2. **No outside fact without its source and date.** A rate, a statutory
   figure or a deadline is stored with where it was read and when. If it
   cannot be verified, store nothing and show the gap.
3. **Every exception says why.** Each flag carries a one-sentence rule the
   person can read ("Why this?").
4. **Corrections keep the old value.** A corrected record keeps what it
   replaced (audit before/after, or a `superseded` row), with the reason.
5. **AI is labelled and approved.** Anything a model wrote or scored is
   marked, and a person approves it before it reaches a parent or changes a
   record.
6. **Evidence is a pointer.** Logs and provenance fields hold ids and
   links, never the personal data itself (C41).

## 7. Definition of done (added to `16` §3 rule 4)

A module is not done until, for each flag, number, report and message it
introduces, the PR states where each of the seven facts lives, and a test
shows one record traced from the screen to its source.

## 8. Rollout

| Phase | Adds |
|---|---|
| P1-c (this document) | The standard. Already in place: audit log, consent evidence, document review, message cost basis, "Why this?" |
| P2 Teacher app | Homework and "taught today": who recorded, when, and for Pulse drafts the AI-assisted mark and the teacher's approval |
| P3 Fees | Every ledger change with its source (payment, concession, correction) and the rule version of late fees |
| P4 WhatsApp | Delivery receipts as evidence; `billable` corrected from them |
| P5–P6 | At-risk signals and report cards: inputs, rule version, approver before anything reaches a parent |

## 9. Change log

- **2026-10-11** — Created (C141).
