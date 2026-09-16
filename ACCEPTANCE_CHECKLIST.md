# NetCyberAI — Acceptance Checklist

Run this before any AI session (or human) declares a deliverable done.
A claim of "passed" without a way to show the check actually ran is
not the same as passed — say what was verified and how.

## Data integrity
- [ ] No file contains a mock/dummy/fake/sample array of students,
      teachers, or fees, outside the labelled `/demo` sandbox tenant.
- [ ] Every query filters by `school_id`, enforced at the RLS layer
      (not only in application code).
- [ ] Two-school test: create data for School A and School B, confirm
      a School A login can never read a School B row, under any role.

## Consent / DPDP
- [ ] Bulk student import creates records in `pending_consent`, never
      `active`.
- [ ] No outbound message or recognition scoring reaches a
      `pending_consent` student.
- [ ] Daily Pulse, Weekly Brief, and Recognition are each independently
      consentable and default to off until granted.

## Money
- [ ] Fee payment flow: order created → Razorpay webhook verified by
      signature → ledger updated → receipt PDF generated → WhatsApp
      receipt sent → all four steps logged in `communication_log`.
- [ ] No fee amount, due date, or receipt is fabricated for a demo —
      the sandbox tenant uses clearly-fictional but arithmetically
      consistent numbers.

## Recognition
- [ ] Personal Best fires for every student clearing the threshold,
      not just a top few — verified against `netcyberai_recognition.ts`.
- [ ] Most Improved compares students only within their own baseline
      band, never across bands.
- [ ] No student appears in more than one Most Improved band per
      fortnight.

## Messaging / pilot safety
- [ ] `pilot_allow_outbound = false` blocks every outbound send and
      logs it as `blocked_pilot` — never silently drops it.
- [ ] Every `communication_log` row has a billing category and cost
      estimate populated.

## Teacher Impact Card
- [ ] Visible only to the teacher themselves and to principal/admin
      roles — verified with a teacher-to-teacher access attempt that
      must fail.

## Public site (Phase 0 only)
- [ ] Every page has title, meta description, canonical, OG tags, and
      valid FAQPage JSON-LD.
- [ ] No numeric outcome claim (percentage, ₹ figure, "increased by")
      appears anywhere without a traceable source or an explicit
      "illustrative example" label.
- [ ] Every WhatsApp price quoted is checked against Meta's current
      INR pricing card, with the check date shown.
- [ ] `/demo` is labelled as a concept demo and cannot send real
      outbound messages.

## Process
- [ ] Any deviation from `PRODUCT_CONSTITUTION_v2.0.md` was flagged
      and confirmed, not silently applied.
- [ ] The Bridge Rule (Constitution §6) was checked before any
      Control Plane or Portal work began.
