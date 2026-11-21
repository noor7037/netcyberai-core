# Pilot readiness (supervisor, 21 Nov 2026, C534)

**Written by:** the supervisor. **For:** Noor. **Delivers:** whether the first school can start, what is proven, and
what only he can decide. Detail: `MODULE_AUDIT.md` (per module), `REHEARSAL.md` (his phone check).

## The answer

Ready to rehearse. The scripted school day passes every step that the pilot uses, three runs in a row (output in
`school_day_last_run*.txt`). After Noor's own rehearsal on his phone, the school can start.

## The pilot set

On: onboarding and the student CSV with guardians, attendance, timetable, homework, notices, exams and report cards,
guardians and School Link, the Family app (Class 10), Control. Off: fees (no payment account yet), the AI insight
modules for the first month (they need weeks of real data), and every other module not listed here.

## Proven by the school day

Control makes the school and switches modules → office imports 40 students with 40 guardians → principal adds a teacher
and the timetable → teacher marks attendance, sets homework, posts a notice (principal approves), enters marks
(published) → principal makes a School Link code → the family redeems it and sees that child's attendance, homework,
notice, marks and timetable → the child asks the tutor and says "samajh nahi aaya" → the parent's vault shows the
question → Control's ledger shows the AI attempts.

## Only Noor can decide

1. The pilot school's name and its real student CSV (with guardian phones).
2. Confirm the pilot set above.
3. The demo schools on the live database are not marked as tests. Hide them before the school starts? (Recommended:
   yes; nothing is changed until he says so.)

## Known limits

- The harness tests the tutor with a test-only stand-in (never live); the real tutor is checked on Noor's phone.
- Each guardian's consent is recorded by the school, one by one (the law; never automatic).
- WhatsApp sending waits on the school's own WhatsApp number.
- Two imports at the same moment with the same new phone could make two guardians (same as adding by hand).
