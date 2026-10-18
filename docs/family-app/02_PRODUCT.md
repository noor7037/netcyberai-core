# 02 — Product: one family app, two modes

## 1. Mission

**Make every school day easier to understand and every exam easier to prepare for, for the child and the parent, in
the family's own language.** A feature that does not serve this sentence is not built.

## 2. Users

| User | What they need | How they use the app |
|---|---|---|
| **Parent** (the account holder, an adult) | To know how the child is doing and how to help, without calling the school or paying for coaching first | Phone, a few minutes a day; reads summaries, sets the exam date, pays school fees if linked |
| **Student** (a child profile, never an account of their own until device pairing in Phase 4) | To understand today's topic, practise, revise to a plan, get unstuck | The parent's phone, later their own paired device; 15–30 minutes a day |
| **School** (indirect) | Families who read what the school sends | Only when the school is on NetCyberAI and the family links; managed from the school app, monitored in Control |

## 3. Two modes in one app

- **Standalone:** any family, any school. The study core (§4) works with no school at all.
- **Connected:** a family links a child to a school that uses NetCyberAI (`03` §4). The school's modules (§5) appear
  for that child only, and only while the link stands. Unlinking removes them at once; the study core and everything
  the family made stays.

One account holds several children; each child can be standalone or connected on their own (siblings in two schools,
one on NetCyberAI, is a normal case). The home shows modules from a registry by mode and plan; nothing is hard-coded.

## 4. The study core (standalone and connected)

| # | Feature | What it does | Rules |
|---|---|---|---|
| S1 | **Children and the switcher** | One profile per child: first name, class, board, medium, state. Switching child switches everything. Class 3–5 see larger type and shorter sets; class 9+ see exam mode. | No surname, photo, date of birth or school name is asked in standalone mode. |
| S2 | **Syllabus** | The child's subjects and chapters, picked from a curated catalog (CBSE/NCERT classes 6–10 first). A linked child gets the school's own syllabus map automatically. | Chapter titles only; the book is linked on NCERT's site, never copied (`01` E11). Photo scan of a syllabus is Phase 4. |
| S3 | **Topic explainers** | For each topic: a short explanation in the family's language with the English term beside it, an everyday example, steps, and one check question. | Library content, reviewed by a teacher before it is shown; carries a "reviewed" mark, the reviewer's role and the day. |
| S4 | **Daily practice** | 5–10 questions a day from the plan's topics; a question answered wrong comes back on a later day. | Reviewed question banks per chapter. The only input to "what comes back" is the child's own answers in practice. |
| S5 | **Revision plan** | Day-by-day plan to an exam date; a missed day reflows from today. | No backlog wall, no "you failed" copy. |
| S6 | **Doubt help** | The child types or speaks a doubt; the reply gives a hint and a step, then the next step only after an attempt. | Marked as AI; "Report a mistake" on every reply; daily limit by plan; names, numbers and contacts are stripped before the model sees the text (`03` §6). |
| S7 | **Weekly summary for the parent** | Three lines: what was practised, where it went wrong, what is next. | Counts from the app's own records (and the school's, if linked). No comparison with other children. |
| S8 | **Learning Vault** | The child's timeline: practice history, the plan's milestones, documents the family saves (a report card, a certificate). | The family's own copy; it stays if the school link ends. Money never appears in it. |
| S9 | **Exam-day kit** | Countdown, the board's paper pattern, a checklist, the timetable. | Paper patterns carry the board's official link and the day checked. |
| S10 | **Scholarships and exams** | Government scholarships, olympiads, Navodaya and board dates matched to class, state and category, with the official link, who qualifies, the last date and the day checked. | Nothing is shown until a person in Control approves it; past last dates move to an archive. "Show nothing" beats "show unverified". |

## 5. School modules (connected children only)

| # | Module | Source in the school system | Notes |
|---|---|---|---|
| C1 | **Today at school** | attendance, taught-today log, homework | The calm daily line that replaces hunting in groups. |
| C2 | **Tonight's practice** | taught-today log + the question banks | Practice on exactly what the class covered today. Only NetCyberAI can do this. |
| C3 | **Fees, Pay Now, receipts** | fee ledger, family payment link, receipts | Its own section; never on a screen with marks or learning. A receipt shows only after the school's ledger is credited. |
| C4 | **Attendance calendar** | attendance, school calendar | An unmarked day shows "not marked", never "present". |
| C5 | **Report cards, notices, events** | published exams, class notices, school events | Only published report cards; only the child's class and the whole school's notices. |
| C6 | **PTM booking** | PTM slots | Same rules as a WhatsApp reply. |
| C7 | **Homework hand-in** | homework | Photo or PDF; the Aadhaar rule on every file. |
| C8 | **Study material** | teachers' shared material | Only from the child's own teachers. |
| C9 | **How to help at home** | Parent AI (C196) | A tip about today's topic for the parent. |

Every C-module also works by WhatsApp where the school's WhatsApp is live (`25` §8): the app is never the only way to
reach the school (C84).

## 6. Not built, and why

| Not built | Why |
|---|---|
| Advertising of any kind | DPDP section 9(3) bars targeted advertising at children; and trust (`01` P8). |
| Ranks, leaderboards, class comparisons | The Constitution's rule for parents; anxiety (`01` E4). |
| Chat or community between children or strangers | Child safety. |
| A marketplace of live tutors | Safety vetting and operations NetCyberAI cannot run yet. |
| Selling, sharing or "anonymised" export of family data | Illegal under DPDP without purpose and consent, and the end of trust. |
| Loans, EMIs, counsellor sales calls | `01` E8. |
| Copying or adapting NCERT or DIKSHA text | `01` E11. |
| "X% accuracy" or "saves Y hours" claims | No invented numbers (Constitution); measured figures only, from real use. |

## 7. Gates that hold the launch, not the build

| Gate | What must be true | Who |
|---|---|---|
| L1 | The lawyer approves the family privacy notice, the consent words and the verifiable-parental-consent method under DPDP Rule 10. | Founder with the lawyer |
| L2 | The lawyer says whether adaptive practice (S4) is "behavioural monitoring" for NetCyberAI as a non-school fiduciary, and what limits make it lawful. Until then S4 adapts only within a practice set the parent started, and keeps only answers. | Founder with the lawyer |
| L3 | A real AI provider with a key and a monthly spend limit (C235). Until then the stand-in provider runs and the library content is the only learning content. | Founder |
| L4 | The first reviewed library: every topic of the pilot classes and subjects has a reviewed explainer and question bank. | Reviewers the founder appoints; Control's queue |
| L5 | The founder's live server key fix (roadmap §5 action 8), so uploads and logins work live. | Founder |

## 8. Definition of done for the first public release

1. A parent signs up, consents, adds two children of different classes, and each child's home differs by class.
2. Each child has a syllabus from the catalog, a plan to an exam date, and practice every day from reviewed banks.
3. A doubt gets a hint-first reply within the plan's limit; a reported mistake reaches Control's queue.
4. The weekly summary arrives in the family's language.
5. A family links a child with a school's code; C1–C5 appear for that child only; unlinking removes them in the same
   minute, and the study core keeps every record.
6. Scholarships show only approved items with source and day; an expired one moves to the archive by itself.
7. Control shows counts, flags, AI spend and the review queues, and no child's personal data.
8. Every screen passes the ModulePage family rules, English and Hindi, 360 to 1440 px, 44 px targets, reduced motion.
9. Gates L1–L5 are closed.

## 9. Silent failures to guard against (each has a test or a monitor)

| Failure | Guard |
|---|---|
| Another family's child appears | RLS on `family.*` keyed to the account, tested with two accounts on every table. |
| School data still visible after unlinking | Link status checked on every school read; a test unlinks and reads in the same request. |
| An unreviewed explainer shows as reviewed | Status is a database column with a check; only `published` rows reach the API. |
| A child's name or number reaches the model | The pre-processor strips it; a CI test sends a doubt with a name, a phone and a 12-digit number and inspects the provider call. |
| AI spend runs away | Per-account daily caps and a platform monthly cap in Control; at the cap, a clear message, never a silent failure. |
| A scholarship shown as open after its last date | A nightly job archives it; the API filters on the date too. |
| A family is charged for its own school's data | School modules are outside every paid entitlement, by registry rule and test. |
| The phone keeps a family's pages after sign-out | The service worker never stores `/api`; sign-out clears its cache; tested. |
