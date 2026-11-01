# AI tutor and Control: progress log

**Written by:** the supervisor, for Noor. **Delivers:** one dated list of what changed for you after each of your
re-tests, item by item, and the plan for what is not built yet. **Rule:** updated with every PR that answers a re-test;
the Decision Log holds the reasons, this file holds the status.

## 1 Nov 2026: your onboarding and AI-marking test of 31 Oct (C423–C432)

What changed for each finding, and where I disagree with the finding and why.

| Your finding | What changed | Status |
|---|---|---|
| (a) New password fails on seeded staff | The seeded teacher had no sign-in account behind her record (Supabase answered 404). A password or sign-in link now creates the account first. | Fixed |
| (b) No way to remove or switch off a person | Deactivate, Reactivate and Remove on a school's People, with a reason, signed out everywhere at once, audited. | Built |
| (c) Create a login makes a duplicate teacher | "Existing staff with no sign-in" picker links the login to the real record; a matching name warns; a second person with the same email is refused. | Fixed |
| (d) View as and "Confirm it is you" stack | The step-up now opens above View as and takes the keyboard; Escape closes only the top dialog. | Fixed |
| (e) My Day → empty marks boxes; tour hides Skip | Marks entry fills from approved AI marks with one button; My Day says how many scripts wait for approval and opens the review; the tour sits in the page, never over it. | Fixed |
| (f) Approved students still under Needs a look | An approved script leaves Needs a look; approving clears the "unsure" flag; one state on the script page. | Fixed |
| (g) Founder and school accounts sign out on their own | Two real defects: a refresh race (two tabs refreshing at once signed one out) and End of View as answering 400 when the founder was already back. Both fixed. "Keep me signed in" was already on by default. | Fixed |
| (h) Same correct working, different marks | Marking prompt v2 (full marks for a correct answer when no steps are given, never "coincidental", same answer same marks), temperature 0, "Suggest steps" for questions without a scheme. | Fixed; your sheets must be run again to prove it |
| (i) Reason says correct, marks say zero | A consistency check sends any contradiction to Needs a look with the reason beside the mark. | Fixed |
| (j) No Back or breadcrumbs anywhere | Back and breadcrumbs on every nested page of the school app, Control and the public site. The Family app already had a Back chip on every nested screen, so nothing changed there. | Built |
| (k) Report cards not made on publish; no bundle; parents cannot see the sheets | Every child's card is made when a class is published (and again on republish), with progress on the publish page; "Get every report card" (one zip) and "Class report"; the Family app has "Get report card" beside "See the checked paper". | Built. Gap: stored PDFs print Hindi as "?", the in-app Hindi card still works |
| 1. Teachers open office-only pages | Office-only pages now refuse other roles with "This part is for the office". Students, Admissions and Parents stay open to teachers by design (read only, their own classes); the APIs you named already refused a teacher. | Fixed |
| 2. AI marking caught 2 of 10 planted errors | See (h) and (i); plus a rule that an unreadable answer is reported unreadable, never guessed correct, and a transcript per script for audit. | Improved; needs your re-run |
| 3. Early Warning crashes | Not reproducible: the loader, both routes, a new-school test and the screen at 390 and 1440 all pass. The screen is guarded against a missing list anyway. If it still crashes for you, the browser console line on `/app/early-warning` is what I need. | Guarded; needs your console line |
| 4. Report cards not built for families | See (k). | Built |
| 5. DAV goes read-only after 4 Nov | A billing state: paid until 20 Oct, grace to 4 Nov. One click for you in Control (below). | Yours |
| 6. No syllabus maps | "Use the NetCyberAI syllabus" on the school's Syllabus screen fills every class-subject from the library in one click; Curriculum Gap, Pulse and Taught today then have units. | Built |
| 7. Staff invite emails fail; sessions sign out | Invites: every failure in the auth log is a QA `example.com` address, which the mail service refuses; Supabase already sends through Resend. Not a bug. Sessions: see (g). | Not a bug / Fixed |
| 8. Family sign-in code fails; blank scans; overview counts | Code: the same `example.com` refusal; the screen now says so plainly. Overview: the school's numbers now show as tiles with the school named. Blank scans: not reproducible from the code; two likely causes recorded, needs the live 404s. | Fixed, except blank scans |
| 9. Student import hidden; duplicate rolls; 80 vs 67 | Import on the Students page; a roll belongs to one live student in a class (the seeded duplicates were renumbered); the heading counts what the list shows. | Fixed |
| 10. Notices only by WhatsApp | Linked families now get notices in the Family app and by email; the Communication screen counts each channel. | Built |
| 11. Online payments not wired | Needs your Razorpay account (below). | Yours |
| 12. Control users: duplicates, no remove, dialog stacking | See (b), (c), (d). | Fixed |

### For you, in one go

1. **Merge the PR** when it opens (CI is run locally; GitHub Actions is still off).
2. **DAV Agra:** Control → Schools → DAV Public School, Agra → Overview → **Start free month** (one click). That ends the 4 Nov read-only date.
3. **Run your marked sheets again** on 6-A Maths and English after the merge, and send me the marks you get. That is the only proof for (h), (i) and finding 2.
4. **Razorpay:** open the account (finding 11). Nothing in payments moves without it.
5. **Meta:** add a payment method to the WhatsApp business account if you want WhatsApp invites and notices (code 131042).
6. **Gemini:** the key answers `auth_failed`; check its standing with Google or leave the backups to cover it.

## 31 Oct 2026: your Control re-test (C421)

| Your item | What changed | Status |
|---|---|---|
| Staff invites on `/control/monitoring`: "invite failed: 500" ×3, attempts exhausted | The three invites went to the QA's `example.com` addresses. The mail service refuses them (`550 Invalid 'to' field`), so the job retried and stopped, as designed. A real address sends. | Not a bug |
| Provider code 131042 on WhatsApp invites | Meta's code for "payment method missing" on the WhatsApp account. Email invites do not need it. | Yours: add a payment method in Meta Business when you want WhatsApp invites |
| `/control/ai` requests failing and falling back (9 of 20, 5 of 105) | Three causes in the last 30 hours: Nemotron timing out at 60 s before Scout became Primary (gone with the new route); Scout cut at 15 s by the time share (fixed in this PR: Scout now gets 28 s); Gemini `gemini-3.8-flash` answering `auth_failed` (the key's own standing with Google, not our code). | Fixed, except Gemini (yours) |
| `/control/templates` first load timed out at 8 s | A cold start on the Hobby plan: the page and its API are two functions that each wake and connect. Warm loads are under a second. | Known; goes with the production plan |
| School Overview QA Principal/Teachers "Not sent" | Same `example.com` refusal, reported honestly on the screen. | Not a bug |
| PR #393 change: replies from Noor@netcyberai.com | Both lead replies now go out from `LEADS_FROM_EMAIL` ("Noor <noor@netcyberai.com>", set in Vercel), signed "Noor, Founder, NetCyberAI". | Done |
| Control has no link to the apps | The dashboard has an "Open the apps" card: public site, school sign-in, Family app, teacher view. | Done |

## The screens marked "Not built yet": the plan

Each Control tab is a read-only view of the school's own module, built on the module's existing loader and contract,
so nothing is written twice. Three waves, in your order.

| Wave | Screens | Status |
|---|---|---|
| 13 | School tabs **Students, Staff, Attendance, Fees**; platform **Audit Logs, System Settings** | Built 31 Oct (C422), in the C421 PR |
| 14 | School tabs **Admissions, Academics, Communication**; platform **Analytics, Compliance, Integrations** | PRs open 3–4 Nov |
| 15 | School tabs Profile, Users, Pulse & Engagement, Recognition, Teacher Impact, Capture & Documents, Compliance, Integrations, Usage, Billing, Reports, Audit | PRs open 5–7 Nov |

Each wave is one batch for you to merge by hand, as now, until GitHub Actions is back.
