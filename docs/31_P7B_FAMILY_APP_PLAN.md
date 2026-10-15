# 31 — P7b plan: the Family App

**Status:** plan for review, drafted after the supervisor's answers in C230-A.
**Built so far (C230-D, at the founder's request):** a parent's login made by the founder in Control (username
and password, not the WhatsApp code of §2.1), the parent rules in the database for every table, and a read-only
home with each child's attendance and dues. Everything else below is still a plan.
**Scope:** roadmap `16` §4 phase P7b and the Family App group in `17` §3a:
dues and Pay Now, the attendance calendar, reports, receipts, notices, PTM
booking, homework submission and study material, for a parent and the
parent's children, as a PWA first.
**Done when** (`16` §4): a parent handles fees, homework and notices without
calling the school.
**Every screen** follows `19` §5: today cards, English and Hindi, a tour, a
"Show me how" guide, teaching empty states, logo tokens, AA contrast, 44 px
targets, and no invented numbers. Every number follows `21`. The family
screens are phone first (360 to 390 wide) and work at 768, 1024 and 1440.
**WhatsApp stays the main channel** (`17` §3a, C84): everything the app
shows also reaches the family as it does today. The app is optional; nothing
in it is the only way to reach the school.

## 1. Where we start (one read of the code, 2026-10-15)

- **No parent login.** Phase 1 decided none (C13), and no student login
  (C24). `parent` and `student` are in the `user_role` enum, but
  `src/lib/auth/types.ts` issues sessions to staff roles only. Staff sign in
  by email with a password or an email code, and an authenticator (TOTP) for
  the roles that need it.
- **Parents are records, not users.** `parents` (name, the WhatsApp phone,
  email if given, relation) and `parent_student_map` link a guardian to each
  child; `students.family_id` groups siblings (C116), and a merged guardian
  keeps their row but loses their links.
- **Row level security for a parent already exists on four tables:**
  `students`, `attendance`, `marks` and `fees_ledger`
  (`parent_scope_*`, restrictive; a parent session would carry the guardian's
  `parent_id` as `app.current_user_id`). Every other table a family screen
  reads needs its own parent policy.
- **What a family already gets, by link or by WhatsApp:**
  - dues and one payment link per family (C168), paid on `/pay/[token]`
    through the school's own rails (`24`: UPI to the school's account, or
    Razorpay where switched on);
  - receipts (`receipts`), numbered per school;
  - published report cards (`exam_publications`, P6);
  - class notices (`class_notices`) and school events (`school_events`);
  - PTM slots booked by a WhatsApp reply or by staff (`ptm_bookings.booked_via`
    is `reply` or `staff`);
  - homework set by teachers (`homework`, `homework_targets`), marked done by
    the teacher (`homework_status`): there is no submission by the family;
  - certificate copies by a 30-day link (C228);
  - the ID card QR (`student_qr_tokens`).
- **No study material** table and **no online exams**.
- **The PWA exists for staff:** `public/sw.js` (C143) keeps the app's static
  files and the first pages of a teacher's day, never anything under `/api`,
  and clears its pages at sign-out. It is registered with the scope `/app`.
- **The send-gate** (`src/lib/whatsapp/gate.ts`) already knows the
  `authentication` billing category, so a sign-in code can be a WhatsApp
  authentication template that goes through it like every other message.

## 2. What P7b delivers: a parent's day as screens

1. **Sign in** with a one-time code sent to the guardian's WhatsApp number on
   the school's record. No password. The app remembers the device until the
   parent signs out or the school removes the guardian.
2. **Home:** one card per child (the sibling switcher, C116), with today's
   attendance, dues, the next PTM slot and new notices.
3. **Fees:** each child's dues and the family total, one Pay Now for the
   family (or for a part), and the receipts.
4. **Attendance:** a month calendar per child, with the school's holidays.
5. **Reports:** the child's published report cards, as PDFs.
6. **Notices and events:** the class's notices and the school's events.
7. **PTM:** book, change or cancel a slot.
8. **Homework:** what is set and when it is due; a photo or PDF handed in for
   it; what the teacher marked.
9. **Study material:** what the class's teachers have shared.
10. **Account:** the children, the devices signed in, sign out, language,
    and the school's privacy notice.

A student uses the app under the parent's account (`17` §3a): there is no
separate login for a minor.

## 3. Rules that hold everywhere in P7b

1. **Own children only.** A parent session reads only the children linked to
   that guardian in `parent_student_map`, through restrictive row level
   security on every table it reads, tested as `app_user` with a parent
   session for each table, as the staff scopes are.
2. **A parent session is not a staff session.** Separate claims (the role
   `parent`, the guardian's `parent_id`, the school), its own cookie, and its
   own route guard. A parent session can never reach `/app`, `/control` or a
   staff API, and a staff session never reaches the family API. A check in
   the style of `scripts/check_route_guards.py` holds this for every route.
3. **Consent first (DPDP).** A guardian signs in only when the school's
   consent for that guardian is on the ledger. Withdrawn consent ends the
   guardian's sessions.
4. **The sign-in code** goes only to the number on the school's record,
   through the send-gate, never to a number a person types. It is short-lived
   and single-use, with limits per number and per device. "Not on record",
   "no consent" and "merged" all get the same neutral answer, so nobody can
   learn whether a number is a guardian.
5. **Money moves only through the existing rails** (`24`, C170). The app
   opens the family's payment link; a receipt appears only once the payment
   is credited, never before.
6. **Uploads** (homework) take the same rules as every stored upload: type and
   size, the school's own storage prefix, and the Aadhaar rule on the text
   read from the file (C232 A6). Never an Aadhaar number, stored or shown.
7. **Nothing personal is kept on the device** beyond the pages last loaded.
   The service worker never keeps `/api` answers, and sign-out clears what it
   kept, as for staff.
8. **Audit rows** for family actions hold ids, codes and counts only (C56).
9. **Every family action the school must know about** (a PTM booking, a
   homework hand-in) appears on the staff screens that already exist, marked
   as made in the app.

## 4. Slices, in order

| PR | Delivers | Data model | Acceptance test |
|---|---|---|---|
| **11a. Family sign-in and the family shell** | The `/family` app: install (manifest and its own service worker, scope `/family`), sign in by a WhatsApp code, the home with one card per child, the sibling switcher, the account page (children, devices, sign out, language, privacy notice). | `family_sessions` (guardian, device, created, last seen, ended), `family_sign_in_codes` (hashed code, number on record, expiry, tries); the claims type `FamilySession`; parent policies for each table the home reads. | A guardian with two children signs in with the code sent to the number on record and sees exactly those two children. A number not on record, a merged guardian, or one without consent gets the same answer as a wrong number, and no code is sent. A family session is refused by every `/app`, `/control` and staff API route, and a staff session by every family route. Sign-out ends the session and clears the device's pages. |
| **11b. Fees, Pay Now and receipts** | Each child's dues and the family total (C168), Pay Now through the family's payment link, the receipts list and each receipt's PDF. | Parent policies on the fee, payment-link and receipt tables. | The family sees, to the paisa, the dues the office sees for these children and no other. Paying through the link credits the ledger by the existing rails. The receipt shows only after the credit. |
| **11c. Attendance calendar** | A month calendar per child (present, absent, late, leave, holiday) and today's state on the home. | Parent policies on the calendar tables (the attendance policy exists). | Every day matches the attendance rows and the school calendar. A day the school did not mark shows as "not marked", never as present. |
| **11d. Reports, notices and events** | Published report cards as PDFs; the class's notices; the school's events. | Parent policies on `exam_publications`, `class_notices`, `school_events`. | Only published report cards. Only the notices of the child's own class and the school's. A notice withdrawn by the school disappears. |
| **11e. PTM booking** | Book, change or cancel a slot, by the rules the reply path already keeps. | `ptm_bookings.booked_via` gains `app`. | No slot is booked twice. The rules are the same as for a WhatsApp reply. The teacher's PTM screen shows the booking, marked "app". |
| **11f. Homework hand-in** | For each homework item: hand in a photo or PDF, see what was handed in and what the teacher marked. The teacher sees the hand-ins on the homework screen. | `homework_submissions` (homework, child, file key, size, by, at); storage under the school's prefix. | A hand-in is kept for that child and that homework only. An Aadhaar card or a file with an Aadhaar number is refused. A hand-in after the due date is kept and marked late. The teacher's list matches. |
| **11g. Study material** | Teachers share a note, a link or a file with a class and a subject; the family reads it under that subject. | `study_materials` (class, subject, title, kind, file key or https link, by, at); a teacher-scope write policy. | A teacher shares only with the classes and subjects they teach (`teacher_subjects`, C231). A family reads only its child's class's material. A withdrawn item disappears. |

Online exam attempts (`16` §4) are left for later: the brief for this plan
does not list them. They need an exam engine and anti-cheating rules of their
own.

## 5. Decisions the plan makes, unless told otherwise

- **PWA first**, no store listing (`16` §4 names the store listing as a
  decision for the founder). A store app can wrap the same pages later.
- **Sign-in by a WhatsApp authentication template** to the number on record.
  If a guardian has an email on record and no WhatsApp, an email code is the
  fallback. SMS is not used: it needs DLT registration and adds a cost.
- **One sign-in per guardian per school.** A guardian with children in two
  schools signs in to each separately. One sign-in across schools is later.
- **Devices stay signed in for 30 days of no use.** The office can sign a
  guardian out of every device.
- **The family app is part of every plan.** It is the family's access to
  what the school already sends, so it is not a plan feature; Pay Now follows
  the school's payment rails as today.
- **The app adds no message:** every message a family already gets stays as
  it is, through the send-gate.

## 6. What needs Noor

- **The store listing decision:** PWA first is the default, so P7b can start
  without it.
- **A WhatsApp authentication template** for the sign-in code, approved by
  Meta on the school's account. Nothing else can stand in for it: the code
  must reach the number on record.
- **The lawyer's review** of the family privacy notice and the consent words
  for the app (DPDP verifiable parental consent).

## 7. Limits of what I can verify

- Delivery of the sign-in code on a real phone, and Meta's approval of the
  template.
- Installing the PWA on iOS and Android browsers: the harness uses one
  browser engine.
- Payment by a real UPI app: the rails are tested as in P3.

## 8. How the work is split (C198, "Parallel agents")

- **11a first, alone.** It brings the family session, its guards and the
  parent policies every later slice relies on: `/code-review` (medium) and
  `/security-review` on it.
- **Then 11b, 11c and 11d in parallel:** separate tables and screens.
- **Then 11e, 11f and 11g in parallel:** separate tables and screens.
  11f and 11g both touch storage, through the one storage module, each under
  its own prefix.
- The lead keeps migrations, the Decision Log, the shared docs and the stack
  order, as for P7.
