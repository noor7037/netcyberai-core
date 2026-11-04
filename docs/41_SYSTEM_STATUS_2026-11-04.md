# 41 — System status, 4 November 2026

**Written by:** the supervisor, for Noor. **Delivers:** one honest picture of the four surfaces (Control, the principal's
school app, the teacher's use of it, the Family app), every service behind them, and what is complete, partial, pending,
tested or untested. **Rule:** "Working" means you verified it live on www.netcyberai.com; "Built" means it is in the code
with CI green but nobody has used it on the live site; everything else is named for what it is. Sources: the module
registry (`src/lib/contracts/modules.ts`), the Family registry (`family-modules.ts`), the Decision Log C1–C463, your test
reports of 31 Oct and 2 Nov, and `docs/00_CURRENT_MILESTONE.md`.

## 1. The numbers

| What | Count |
|---|---|
| Surfaces | 4: Control (31 pages), school app (73 pages, principal / office / teacher / coordinator / accountant by role), Family app (42 pages), public website (16 pages) |
| School modules in the registry | 35: **5 live**, **25 partial**, 1 foundation, 4 spec only |
| Family modules (Control → Apps switches) | 24, all built and on by default |
| AI features (profiles) | 20, on one gateway; 13 provider adapters |
| Database migrations | 251, all applied to the test database (the live site runs on it) |
| Test files | 361 (CI mirror: 27 steps, green on every merged PR) |
| Decision Log | C1–C463 |
| Pull requests merged | #1–#400 |

**Reading the "partial" count honestly:** a partial module has its daily screens and data working, and lacks the deep end
of its catalog line (for example Fees has heads, structures, ledger, receipts and UPI; it lacks Razorpay because you have not
signed up, and reminders on WhatsApp because Meta's payment method is not set). Partial is not broken. Section 3 says per
module what is missing.

## 2. The four surfaces at a glance

| Surface | Complete and working (you verified live) | Built, not yet used live | Partial | Pending / blocked |
|---|---|---|---|---|
| **Control** | Schools, onboarding with one-click provisioning, People, AI dashboard with keys, chains, Try it, Quality Lab, Content library and studio, Apps switches, Family (tutors, caps), Leads, Monitoring, Billing plans, Tickets | Audit logs, Analytics, Compliance, Integrations, System settings, Templates, WhatsApp screen (built in W13 as read-only views) | Messaging cost (no live WhatsApp traffic yet) | Production cutover (deferred to P8), GitHub Actions (minutes exhausted, mirror in use) |
| **School app (principal, office)** | Setup, Students (CSV import, roll numbers, ID cards), Staff, Attendance, Fees (UPI, receipts, RTE), Exams (scheme, marks, AI marking, publish, report cards with Hindi), Papers, Syllabus from the library, Notices to families, AI Tutors, Help and tickets | Timetable generator, Admissions pipeline, Documents and certificates, Compliance desk, Reports, Early Warning, Learning Genome, Curriculum Gap, School Auditor, Proxy, PTM, Events, Complaints, Parent AI | Communication (built; sends wait on Meta), Daily Pulse (compose; sends wait on Meta), Homework, Academics | Payroll, Career Graph, Digital Twin, Automation OS (spec only) |
| **Teacher (the school app on a phone)** | My Day home, attendance marking, marks entry, AI marking review, taught today | Homework setting, lesson plans, Pulse compose, PTM slots, Teacher Copilot (foundation only) | Offline tolerance not verified on a phone | — |
| **Family app** | Sign-in by code, children and PIN, Study feed with memory, visual answers (figure, steps, timeline, scene, chart, board, simulations), Tutor Hall, the call (listen, answer, speak), quiz after a session, Check my work (photo and typed), read aloud, parent area (six sections, vault, tests, checked papers in Hindi), School Link, notices, English course and live tutor, Future hubs, offline packs | Teach me, sketch pad, four physics simulations, timeline reveal, written quiz marking, weekly parent report, Sarvam and ElevenLabs voices (W17–W18, merged 2–3 Nov, not yet on your phone) | Live voice call (a token mints; the phone's socket leg is a stub) | Play Store release, Focus Lock on a real child's phone (M2b built, untested outside the harness) |

## 3. Control, page by page

| Page | State | Tested |
|---|---|---|
| Schools, School detail (modules and access, limits, people) | Complete | Live, 31 Oct and 1 Nov |
| Onboarding, applications, provision | Complete (one click, under two minutes) | Live, 31 Oct |
| Users / People (make a login, deactivate, remove) | Complete | Live, 1 Nov |
| AI: services, keys, chains, prompt versions, rollback, Try it, latency tiles, tutor use, ledger | Complete | Live, 2 Nov (keys for Sarvam, OpenRouter, ElevenLabs, Gemini tested through Try it) |
| AI Lab (Quality Lab, Class 8 Science set) | Built | Cases run with the free models; no eval baseline recorded yet |
| Content: library coverage, hubs, responses, studio, boards | Complete | Live, 31 Oct |
| Apps (every Family switch, AI by profile) | Complete | Live, 2 Nov |
| Family: counts, platform tutors (add, change, switch), caps, voice allowance | Complete | Tutors list live 2 Nov; add/change built 2 Nov, not yet used live |
| Leads (website leads, auto first reply, your replies from your address) | Complete | Live, 31 Oct |
| Monitoring (jobs, uptime every 30 min, failed invites with plain reasons) | Complete | Live, 1 Nov |
| Billing plans, Messaging cost | Built | Plans live; cost has no real WhatsApp traffic to show |
| Tickets, Support | Complete | Live |
| Audit logs, Analytics, Compliance, Integrations, System settings, Templates, WhatsApp | Built as read-only views (W13) | Not re-tested since 31 Oct |
| Account (your own login, authenticator step-up) | Complete | Live |

## 4. School app, module by module (the registry's own status)

| Module | Registry | What works | What is missing from the catalog line |
|---|---|---|---|
| Students | live | Profile, 360 search, CSV import, roll numbers, ID cards, data check, documents | OCR autofill of scanned documents |
| Attendance | live | Class marking, codes, staff attendance, trends | Chronic-absence signal to parents (waits on WhatsApp) |
| AI Tutors | live | The school adds its own tutors; platform tutors switched per school | — |
| Help Center, Raise Ticket | live | Guides, tickets to Control | — |
| Setup | partial | Sessions, classes, subjects, teacher assignment, branding, grading schemes, onboarding checklist, syllabus from the library | One-click promotion |
| Admissions | partial | Enquiries, waiting list, offer | Full pipeline with online form, Kanban, conversion analytics |
| Parents | partial | Guardians, verification, consent ledger, data requests, Family codes | WhatsApp linkage (Meta) |
| Staff | partial | Records, invitations, accounts, leave, profile with nine tabs, workload | Staff attendance trends |
| Academics | partial | Syllabus map, taught today, lesson plans | Coverage %, objectives met |
| Timetable | partial | Entry, CSV import, clash guard, teacher and class views, generator v5 | Generator constraints beyond v5, changes history |
| Proxy | partial | Suggestions by free period, one-tap assign, substitute told in-app | Notify by WhatsApp |
| Homework | partial | Set with files and due dates; completion by family reply in the app | Class completion stats, copy to many sections |
| Homework Recovery | partial | v1 detector | Catch-up plan approval flow |
| Exams and Report Card | partial (most of it works) | Boards, scheme builder, exams, candidates, marks entry, AI marking (prompt v2, temperature 0, transcripts), review, publish with a confirm, report cards per child with Hindi, class bundle, insights, question papers and bank, bubble sheets, online tests, checked paper PDF on WhatsApp (built) | Personal Best / Most Improved, HPC card |
| Daily Pulse | partial | Compose from taught today, the app's own Pulse to families | Send on WhatsApp, replies (Meta) |
| Communication | partial | Notices to the Family app and by email, send-gate, delivery log, templates in Meta's shape, Meta review from Control | Live WhatsApp sends (Meta payment method), retry on failure |
| PTM, Events, Complaints | partial | Slots, calendar, intake with SLA | Parent booking and reminders over WhatsApp |
| Fees | partial | Heads, structures, concessions incl. sibling, ledger, family dues, direct UPI with statement proof, receipts, RTE, reminders by email | Razorpay (your sign-up), WhatsApp reminders (Meta) |
| Documents and Certificates | partial | TC, bonafide, character, study certificates; ID cards | Request to fee-clearance to delivery flow |
| Compliance / APAAR | partial | Consent ledger, audit trail, DSR, data check desk, disclosure | APAAR validation, UDISE+ readiness |
| Reports | partial | Fixed reports by role with CSV | Report builder, scheduled reports |
| Early Warning, Learning Genome, Curriculum Gap, School Auditor, Parent AI | partial (v1 each) | Flags with reasons, skill map v1, untaught chapters, N-of-M checks, what-to-do drafts | v2 on real data; parent dispatch waits on Meta |
| Teacher Copilot | foundation | The AI feature exists in Control with a chain | The teacher-facing drafts screen |
| Payroll, Career Graph, Digital Twin, Automation OS | spec only | — | Everything; your decision whether they stay in scope |

## 5. Family app, feature by feature

| Feature | State | Tested |
|---|---|---|
| Sign-in by emailed code, children, PIN, profile, sign-out with a confirm | Complete | Live, 2 Nov |
| Study feed per subject with memory, follow-ups, history | Complete | Live, 2 Nov (F6 pass) |
| Visual answers: figure, steps, timeline, scene, chart, image, videos, mind map, board, simulations | Complete | Live, 2 Nov (board and sims seen; the wrong-topic simulation fixed in #398) |
| Tutor Hall (six platform tutors, a school's own after pairing), chat or call per tutor | Complete | Live, 2 Nov (F1 pass) |
| The call: listen, answer, speak sentence by sentence, captions, barge-in, silence refused | Complete (chain) | Live, 2 Nov (F3 pass); the silence fix merged after |
| Live voice call (realtime) | Partial | A token mints for OpenAI and Gemini; the phone's socket leg is a stub; no child reaches it |
| Quiz after a session, scored; written items marked with a note | Complete | Live, 2 Nov (3 of 3 after the key); written marking merged 3 Nov, untested live |
| Check my work: photo and typed, a verdict always, the evaluator | Complete | Live, 2 Nov (F5 partial), fixed in #398 and #400; the evaluator untested live |
| Read aloud on answers, Teach me, the board in step with the voice | Built | Merged 3 Nov; not yet on your phone |
| Sketch pad | Built | Merged 3 Nov; drawing untested outside jsdom |
| Weekly parent report (app and email), class summary to the school, teacher's doubts | Built | Runs on Sundays; none has run for a real family yet |
| Parent area: six sections, vault, English progress, progress report, tests, checked paper (Hindi), tutor use | Complete | Live, 2 Nov (F7 pass) |
| School Link (code, matched children, today at school, homework, notices, results, timetable) | Complete | Live, 1 Nov |
| English: 90-day course, live spoken tutor | Complete | Live (earlier waves); not re-tested in November |
| Future: careers, exams, schemes | Complete | Live (earlier waves) |
| Offline packs, data-saver | Complete | Live (earlier waves) |
| Focus Lock (learn to unlock), Android shell APK v2 | Built | The harness only; not on a child's phone |
| Play Store listing | Pending | Needs your developer account |

## 6. Services and integrations

| Service | State | What it needs |
|---|---|---|
| Supabase (test project, the live site's database) | Working; 251 migrations recorded | The production cutover at P8 (your "go"), the key rotation with it |
| Vercel (Hobby, Mumbai) | Working; builds skip previews and docs-only | Fluid compute's 300 s limit holds the AI routes |
| Email (invites, notices, reports, lead replies, sign-in codes) | Working | — |
| WhatsApp (Meta): templates in Meta's shape, review from Control, send-gate, delivery log | Built | Meta's payment method on the business account; then the first live send |
| AI providers with a key: Workers AI (Llama, Whisper, Llama Guard), NVIDIA NIM, OpenRouter (free), Sarvam, ElevenLabs (free plan), Gemini | Working through Try it | Gemini's backup key fails (fractions failed on it: replace it or make OpenRouter Backup 1 of Tutor answers); ElevenLabs paid plan before children hear it; NVIDIA's terms before testing mode ends |
| AI providers without a key: OpenAI, Anthropic, Vertex AI, Google Cloud TTS and STT, openai_compatible | Built | Keys if you want them |
| Testing mode (C404) | On | Switch off before the Play Store; then clear each provider for children |
| Push (Web Push, VAPID) | Built | Firebase not used; Android shell push later |
| Razorpay | Not started | Your sign-up and KYC; direct UPI works without it |
| GitHub Actions | Dead since 13 Oct (free minutes) | The `ci_local.sh` mirror runs 27 steps before every merge |
| Monitoring: uptime every 30 min, job monitor, AI spend alert, ledger 90 days | Working | — |
| Lawyer: privacy, terms, DPDP consent | Pending | Public launch says "Draft" until then |

## 7. What is known not to work, or not verified

- The Gemini backup key on "Tutor answers" fails authentication: a slow primary has nothing to fall back to (ledger, 2 Nov).
- The live voice call's phone leg is a stub (the token mints; the socket is never opened by the app).
- W17 and W18 features (voices, Try it on every card, Teach me, sketch pad, physics simulations, written quiz marking, Hindi report-card PDFs) are CI-green and merged but not yet used on your phone.
- The Hindi words of the simulations and of several new screens are the builders', unread by a native speaker.
- Teacher offline use on a phone (P2's "done when") has never been tested on a real phone.
- No real school's data has touched the system: every number you have seen is the demo fixture or your own test accounts.
- Every vendor field for Sarvam, ElevenLabs, OpenRouter and Gemini Live was written from memory and then corrected by your live tests; one more live pass after #400 is the proof.

## 8. Blocked on you or a third party

1. Meta payment method (WhatsApp sends: Pulse, reminders, PTM, complaints, Early Warning to parents).
2. Razorpay sign-up (only if card/net-banking payment links are wanted; UPI works).
3. Lawyer review (public launch).
4. Google Play developer account (the Android app; the Focus Lock on a child's phone).
5. The production cutover date and the first school's name, board, classes and subjects (pilot scope).
6. A working Gemini key, or OpenRouter as Backup 1 of Tutor answers (five minutes in Control).
7. NVIDIA's terms read and accepted before testing mode goes off.

## 9. The supervisor's view for the next ten days (for your decision, not yet a plan)

1. **Stop building wide; close the loop on one real school.** The system has more features than any school will use in month one. The missing pieces that decide whether a school pays are: WhatsApp sends live (Meta payment), the cutover to a real database, one real class of real children on the Family app with a parent on the phone.
2. **One live verification pass of W17–W18 on your phone** (an hour), then fix only what you see.
3. **Freeze the spec-only modules** (Payroll, Career Graph, Digital Twin, Automation OS) out of the ten days.
4. **Teacher day on a phone**: one teacher, one day, attendance, taught today, homework, marks; fix what breaks.
5. **Turn testing mode off and clear the providers you keep** before any child outside your family uses the app.
