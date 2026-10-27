# Brief for the build lead: assessment, faster and lighter (supervisor, 2026-10-27)

Supervisor → build lead. The founder's goals for assessment are minimum storage, maximum speed, and no teacher work that
is not needed. Most of it exists (`docs/35`, C347–C354, C230-AG/AH); extend that, never rebuild it.

Rules: CLAUDE.md, including Token discipline (C230-AC) and Parallel agents: up to 5 sub-agents, each on the model its
task needs (C230-AI). Every P6 and `docs/35` rule still holds: only a person's approval writes marks; nothing reaches a
family before publication; no rank (C76); the marking AI runs only on a provider cleared for children's words.

## Decided (C230-AJ, the founder's words made exact)

1. **Scans are kept 45 days by default**, replacing C230-AG's 90 and C230-AH's 180.
   - A published result: 45 days after publication.
   - A paper with no result in force (never published, or reopened and not published again): 45 days after the later
     of its last upload and its reopening.
   - A school may choose 30 to 365 days in Exams settings.
   - Seven days before a deletion, the marking hub says so.
   - Marks, question marks, teachers' notes, report links and the audit stay, by the school's own retention.
   - What is deleted: the picture files. Each page keeps its row (hash, size, when deleted). The sweep's audit row
     holds counts only.
2. **Exam types are the school's own list** (the configuration framework, `17` §1a).
   - Defaults: Weekly test, Monthly test, Unit test, Periodic test, Sessional, Half-yearly, Annual, Practical, Mock or
     pre-board, Other. Each has English and Hindi names.
   - A school renames, hides or adds types.
   - Each exam names one type; existing exams become "Other".
   - The grading scheme builder (P6 9a) chooses which types count toward a report card, and their weights.
   - Genome, gaps and Early Warning group by type and session.
   - Scans need no change: they hang off the paper (exam × class × subject), so the type and session follow.
3. **Pages are scanned in the teacher app, on the phone, small and clear.**
   - The camera (rear, highest resolution, torch where offered) shows the page's edges live and captures by hand or
     when held steady.
   - In a Web Worker, each page is cropped, its perspective corrected, deskewed, turned to grayscale and its contrast
     evened.
   - No hard black-and-white by default: it loses pencil and diagrams.
   - The document-detection library (OpenCV.js or a lighter one; measure the size) loads on the scan screen only and
     is cached.
   - **Size from evidence, not a guess.**
     - Take sample sheets: handwriting and diagrams, in English and Hindi.
     - Try a long edge of 1600, 1400 and 1200 px at a few qualities, in JPEG, and WebP only if every enabled AI vendor's
       adapter accepts it.
     - Keep the smallest setting that reads as well as today's 2000 px.
     - The target is a median of 150 KB or less a page; `PAGE_MAX_BYTES` stays the hard cap.
     - Put the measured table in the PR.
   - PDF and photo import stay, for schools with scanners.
   - Later, and only if a teacher Android shell exists: Google ML Kit's on-device document scanner. A note, not this
     brief.
4. **The teacher never waits.**
   - The scan screen offers the next child in roll order (the exam's candidates, C348). Capture the pages, tap **Next
     child**: no typing.
   - **Absent**, **Skip** and "pick another child" are one tap each.
   - Each page goes to an on-device outbox (IndexedDB) the moment it is taken.
   - Uploads run in the background: retry with back-off, resume after the app is closed, wait while offline, and use
     Background Sync where offered.
   - A page is removed from the phone once the server confirms it. The outbox clears on sign-out. Pages are children's
     work, so nothing lingers on a teacher's phone.
   - The server's reading and marking jobs (C353) run as now.
   - A live progress strip shows uploaded, read, marked and "needs a look", without blocking capture.
   - **Matching:** the roll-order choice is the key. The AI's reading checks the name, roll or exam number written on
     the sheet. A mismatch flags the script; it is never silently moved to another child.
   - **Exceptions in one list:** unreadable or missing page, identity-like page (C230-AG), mismatch. Each is fixed with
     one tap.
5. **One step from approved marks to every output.**
   - **Reuse:** report cards (P6 9c), class results, the genome (C352), certificates (P7 10e), the family views (AM-4),
     WhatsApp (AM-5, through the send-gate) and push (M3-8b).
   - **Build only the gaps:**
     - a **progress report**: one child across the session's assessments, by type, from approved marks;
     - **merit and participation certificates** from results: the documents studio's layout, the school's seal and
       signature as in C228, rules the school sets (for example a grade or a percentage);
     - **Publish and notify:**
       - after the existing approval and the principal's publish, one action makes the class's report cards and
         progress reports;
       - they appear in the Family app;
       - WhatsApp messages (an approved template, the previewed send) and pushes are queued.
   - Nothing changes who approves or publishes.

## How to build it (tokens and order)

- Read narrowly: `src/lib/marking/*`, `src/components/marking/*`, `src/lib/exams/*`, `docs/35`, and the rows above. Do
  not read the whole repository.
- **Slices, collision-free:**

  | Slice | Scope | Model |
  |---|---|---|
  | A | Retention to 45 days | haiku or sonnet |
  | B | Exam types: a migration and settings | sonnet |
  | C | The scanner (client, worker, measurement) | opus |
  | D | Outbox and roll-order flow | sonnet |
  | E | Outputs | sonnet |

  - C and D share the scan screen: one agent, or C's worker first and then D.
  - One `opus` security review covers C/D (children's pages on a phone) and E (messaging).
- **Kept serial, by you:**
  - the migrations: test project first, the file renamed to the version recorded there, md5 matched;
  - the Decision Log numbers;
  - the order of the PRs.
- **Verify:**
  - per slice: `tsc` and its tests;
  - once on the top of the batch: `ci_local.sh`;
  - harness pictures of the scan screen and the hub at 390 and 1440, in English and Hindi.
- **Report:** at most 15 lines. Founder actions first, then one line per PR, then the measured page sizes.
