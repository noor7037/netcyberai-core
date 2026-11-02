# AI tutor and Control: progress log

**Written by:** the supervisor, for Noor. **Delivers:** one dated list of what changed for you after each of your
re-tests, item by item, and the plan for what is not built yet. **Rule:** updated with every PR that answers a re-test;
the Decision Log holds the reasons, this file holds the status.

## Programme W16: the NetCyberAI Tutor (2 Nov 2026, the supervisor's plan)

**Written by:** the supervisor, for Noor. **Delivers:** the plan for the founder's proposal ("NetCyberAI Claude Code Build
Instructions", 31 Oct), what it keeps, what it changes, and the waves that build it. **Rule:** additive on the codebase;
no rebuild of Control, the school app or the Family shell; one gateway, one job queue, one block schema; migrations
TEST-first; everything on by default (C398); Opus for children's data, RLS and schema, Sonnet for screens and routes,
Haiku for words and docs.

### What the proposal asked for, and what already exists

| Proposal module | Already in the codebase | Gap this programme builds |
|---|---|---|
| M1 Study streaming, hang, memory | Done: first-text deadlines and the time share (C410, C421), chat memory and feed (C406, C413) | A latency tile per profile in Control (M11) |
| M2 Ten-agent registry | The pieces exist as functions (planner, retrieval, resolver, visuals, moderation, Lab) | A typed registry that names each agent, its profile, inputs, outputs and live-or-job (A1) |
| M3 Handoffs, slow work | The gateway, the pg job queue, `LONG_JOB_TYPES` | An orchestrator that calls the specialists as tools and enqueues the slow ones; one event line per handoff (A1) |
| M4 Syllabus-grounded tutor | Retrieval by full-text search over the library (C407), "From your chapter" quoting in v8, bands, school syllabus through School Link | A citation chip on every grounded answer, a chapter map the quizzes and reports share, a Class 8 Science eval set with a measured baseline (A2, A5) |
| M5 Voice | Voice input (Whisper on Workers AI), server voice route, caps, consent | A **call**: listen → answer → speak, sentence by sentence, with captions and barge-in; a realtime slot for a provider key later (A4) |
| M6 Live drawing, simulations | figure, steps (animated), timeline, scene, chart, mind map (C408, C414) | A `board` block: numbered drawing commands drawn in step with the words or the voice; three Class 8 Science simulations (A2) |
| M7 Quizzes | Chapter tests with sealed answers | A short quiz made from the session at its end, kept with review dates (B1) |
| M8 Photo doubts | Tutor attachments, photo gate, vision homework helper | "Check my work": a photo of the child's own answer marked step by step, grounded (B2) |
| M9 Parent reports | Notices with principal approval, the Family notifications feed and email (C432) | A weekly report per child in the Family app and by email, a class summary to the school, a teacher's list of recent doubts, a 1,000-guardian simulation (B3) |
| M10 Metering | The usage ledger, daily caps, billing plans, per-school limits (C433) | Tutor dimensions (text turns, voice minutes, photo doubts) on the Control AI dashboard and in the Family plan caps (B4) |
| M11 Quality check | Quality Lab, eval cases, reply checks | Rules on the hot path (citation present, blocks valid, board commands valid, hang detector), the eval set run and stored, latency targets watched (A5) |
| Tutors (the founder's ask) | Nothing | **Tutor Hall:** platform tutors per subject (name, voice, language, teaching style) a child calls or chats with; a school adds its own tutors, which appear in the Family app after School Link pairing (A3) |

### Decisions (recorded as C434–C446 when each wave lands)

1. **No agent framework.** Thin tool calls on the existing gateway, not LangGraph or an Agents SDK: one provider system, one place that cleans children's data before it leaves, no second runtime. The proposal's own verdict ("only the Orchestrator is live") needs nothing more.
2. **Search stays full-text.** No pgvector now: the planner plus full-text retrieval already finds the chapter; vectors are a second index to keep in step, for a gain the eval set has not yet shown is needed. The eval baseline decides (A5); the retrieval module keeps one door so vectors can be added behind it.
3. **A call is a chain, not a realtime stream, today.** Listen (Whisper) → answer (the resolver, streamed) → speak each sentence as it completes. It works with the keys we have and with Sarvam for Indian languages later. A realtime provider (OpenAI Realtime, Gemini Live) gets a profile slot and a token-mint route, built but idle until a key exists; media never goes through Vercel.
4. **The board is a block, not a canvas library.** `board` joins the docs/39 schema: numbered commands (shape, label, arrow, text, equation, graph, axis, point, highlight, erase, step) the renderer draws progressively, synced to the sentence being spoken. tldraw would cost the Family bundle budget and a second visual language.
5. **Tutors live in two places.** Platform tutors in `content.tutors` (subject, language, voice, style, avatar colour), school tutors in `school_tutors` under the school's own RLS, read by the family as the guardian through School Link. One persona line enters the resolver's system prompt; the teaching engine is unchanged.
6. **Parent reports are per child in the Family app and by email,** which needs no WhatsApp template (the PoC's open product decision is closed this way); the school gets a class summary through the existing notice with the principal's approval.
7. **Integrated now, behind switches.** The founder asked for end to end; every new surface sits behind a Control → Apps switch (on by default, C398), and the readiness check at the end says go or no-go per item.
8. **Metering packaging:** text turns, voice minutes and photo doubts per child per day, capped by the Family plan; the founder sets numbers in Control; no new billing system; Razorpay untouched.

### Waves

| Wave | Agents (model) | Lands as |
|---|---|---|
| A | A1 registry + orchestrator + job types (opus) · A2 board block + citation chip + 3 sims + prompt v9 (opus) · A3 Tutor Hall (sonnet) · A4 the call (sonnet) · A5 QC rules + Class 8 Science eval set + latency tiles (sonnet) | one PR |
| B | B1 quiz after session (sonnet) · B2 check my work (sonnet) · B3 weekly parent report + teacher doubts + 1,000 simulation (opus) · B4 metering dimensions (sonnet) · B5 Study chrome integration + Apps switches + screenshots (sonnet) | one PR |
| C | readiness check, docs and words (haiku), full CI, the founder's key list | the report |

### Module log (the proposal's template), 2 Nov 2026

| Module | Status | Built | Reused | Tests | Decision freedom |
|---|---|---|---|---|---|
| M1 Study streaming, hang, memory | pass (before this programme) | nothing new | C410, C413, C421 | existing | the 3 s first-text bar is not met with the free models (first words 4–8 s on Scout); it is the speed tile's target and a key decision for the founder |
| M2 Agent registry | pass | `src/lib/ai/agents/registry.ts`, four profiles | gateway profiles | `test/ai/agents.test.ts` | retrieve before plan (the planner reads passage titles) |
| M3 Handoffs | pass | `orchestrator.ts`, `jobs.ts`, `events.ts`, the dev graph | job queue, understand route | same | thin tool calls, no framework (C434) |
| M4 Syllabus-grounded tutor | pass, baseline pending | the citation chip, prompt v9, the Class 8 Science set | retrieval, bands, School Link syllabus | `w16-a2-board`, `lab-class8` | full-text search stays; the baseline waits on the founder's keys and one Lab run |
| M5 Voice | pass with the phone's voice; server voice waits on a key | the call screen, the chain, the realtime slot and token route | voice input, caps, consent | `call.test.ts` | chain first, realtime later (C438) |
| M6 Drawing and simulations | pass | the `board` block (11 commands), BoardView, three sims, SimView | figure, scene, steps | `w16-a2-board` (25) | a block, not a canvas (C436) |
| M7 Quizzes | pass | `session_quizzes`, the job, the sweep, the cards, the player | chapter-test scorer | `quiz.test.ts` (11) | a pg_cron sweep, not the orchestrator hook (C440) |
| M8 Photo doubts | pass | Check my work, homework v2 | attachments, photo gate, vision | `check-my-work` (12) | vision read then resolver marking (C441) |
| M9 Parent reports | pass | `parent_reports`, the job, the feed and email, the class summary, the teacher's doubts | notices, School Link, email job | `parent-report` and the 1,000 run | per child in the app, no WhatsApp template (C442) |
| M10 Metering | pass | the three dimensions, caps, tiles, the parent card, `ai_ops_daily` | ledger, daily cap, plans | `metering.test.ts` (15) | counts, not a wallet (C443) |
| M11 Quality check | pass, eval baseline pending | the rules, `ai_qc_results`, the speed tiles | Quality Lab | `qc-rules`, `lab-class8` | always-on rules; sampled model QC later |
| Tutor Hall (the founder's ask) | pass | `content.tutors`, `school_tutors`, the Hall, the school module, the persona | School Link | `tutors.test.ts` (14) | two homes for tutors (C437) |

### Integration-readiness check (go / no-go), 2 Nov 2026

| Item | State |
|---|---|
| M1–M11 bars | green on the harness; the two measured bars (first text ≤ 3 s, eval ≥ 90 %) wait on the founder's keys and are recorded as targets |
| No rebuild of Control, school, teacher or Family shells | kept: every change is additive; the Study chrome gained one button and one chip |
| Same Vercel project, same database, slow work only through `/api/jobs/run` | kept; three pg_cron schedules added (quiz sweep, daily ops, and the existing sweeper) |
| Study hang fixed in the shipping branch | yes (C410, C421) |
| Citations on; Class 8 Science path demoable | yes: the chip on every answer; 13 chapters in the library; the 50-question set in the Lab |
| Voice smoke | the chain works with the phone's voice; a server voice and the realtime leg need keys (below) |
| Live draw and one simulation demoable | yes (pictures in `docs/screenshots/w16-tutor`) |
| Quiz after session; photo doubt fixture | yes |
| Parent report through the existing path; 1,000 simulated | yes (about 18 s on the harness) |
| Metering visible in Control; no accidental spend | yes; caps default to today's numbers |
| Quality Lab baseline; QC on | QC on; the baseline needs one Lab run with the founder's keys |
| Secrets: names only | kept |
| Children: consent flows preserved; no new policy layer | kept; every new table carries the family's own-account policies |
| Security review | one opus pass on every W16 migration and route (its result is in the next row of this file) |

**Verdict:** GO for the test database and your phone test; the two measured bars are yours to confirm with the keys.

### What needs you, in one go (keys and one run)

1. **Text-to-speech key** in Control → AI → `family.text_to_speech` (OpenAI or Google): the call then speaks with a server voice instead of the phone's.
2. **A stronger text model** for `family.resolver` if you want the 3 s first-word bar (Scout's first words are 4–8 s); Gemini Flash or GPT, set in Control → AI, cleared for children's words.
3. **Run the eval set:** Control → AI → Lab → "Run only Class 8 Science (50 questions)" with two to four models; the speed tiles and the rules grade fill in.
4. **Sarvam and a realtime provider** when you want Indian-language speech and the realtime call: slots, not blockers.
5. **Set the tutor caps** in Control → Family (text turns, voice minutes, photo doubts a day, the Plus multiplier) if the defaults 40/20/5 and ×3 are not what you want.

## What needs you (keys and accounts), after the build

- A text-to-speech key (Google or OpenAI) in Control → AI for `family.text_to_speech`: today no provider is set, so the call speaks through the phone's own voice until then.
- Sarvam (Indian-language speech) and a realtime provider key when you want the realtime call; both are slots, not blockers.
- A stronger vision model key for photo doubts if NVIDIA's reading of handwriting proves weak in your test.

## 1 Nov 2026, evening: your verification of PR #395 (C433)

| Your finding | What changed | Status |
|---|---|---|
| 1. Invite refusals shown as a raw 500 in Monitoring | A refused invite is final (no retries); Monitoring says "The email service refused this address" and the like in plain words. | Fixed |
| 2. Publish has no confirm step | "Publish the result" now asks, in words that say what happens; Cancel changes nothing. | Fixed |
| 3. Family sign-out is instant on visit | The page asks "Sign out?" with Sign out / Stay; the visit itself ends nothing. | Fixed |
| 4. No per-school AI marking limit | Control → a school → Modules & access → Exams row: set this school's monthly pages above the plan's, or go back to the plan's. | Built |

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

## Security review (2026-11-02, before the PR)

One `opus` pass over the gateway, the Tutor Hall, the call and the parent reports. No high finding. Three medium findings,
all fixed in the batch (Decision Log C445): the school-written persona is framed as data, not an instruction; the
realtime voice session carries the safety rules from the first word, and `family.voice_call` keeps no provider until a
moderation path for realtime answers exists; the teacher's doubts need three linked children, like the class summary.

## Browser test of PR #397 (2 Nov 2026), every observation and what changed (Decision Log C446)

| # | What the test saw | What changed |
|---|---|---|
| F2 | Older Science answers showed "A pendulum 1 m long" under Healthy Habits, Heart Rate, Protein Folding | A simulation is shown only where the question, its syllabus line or its own title is about what it models; a kept answer that fails this is made afresh |
| F2 | "12 x 15" explained step by step, 180 never said | The tutor prompt's last rule: a sum asked ends by stating its result |
| F2 | "3/4 + 1/8" and "adding fractions" failed twice | Not code: the ledger shows the tutor's primary service (Workers AI, llama-4-scout) timing out at 28 s three times and the backup (Gemini) refusing its key. **Founder:** fix the Gemini key or make the OpenRouter service Backup 1 of "Tutor answers" in Control → AI |
| F3 | Silence transcribed as "Thank you." was answered "not about Mathematics or Science" | A quiet room is no question: the call says "I did not catch that" and sends nothing; the off-subject line now names the class's own subjects |
| F4 | No quiz after "Done for now" (no service set for Session quiz) | The quiz and the weekly report run on the tutor's services until one of their own is set; "Done for now" promises a quiz only when one can be made |
| F4 | A written quiz item unmarked beside "3 of 3" | Every quiz item is multiple choice; the score covers the whole quiz |
| F5 | "45 x 2 = 90" marked wrong; a "missing" step invented | A verdict that restates a plain sum is settled by our own arithmetic; the prompt says a right one-line sum has no missing step |
| F7 | No tutor section in the parent area | Shown in testing mode too: the counts, with "no limits while NetCyberAI is testing" |
| 8 | "<b>x</b>" saved as "b x /b"; an empty save said nothing | A tag is removed whole; an empty save says what is needed |
| 9 | Control lists the platform's tutors read-only | Control → Family → Tutors: add, change, switch, with a reason, audited |

Not changed, by design: a failed question is not kept in the history; the checked-paper PDF has no text layer (the in-browser view prints Hindi); the realtime voice leg waits for a key.

## Programme W17: voices for India, Try it, and the rest of the 2 Nov findings (2 Nov 2026, the supervisor's plan)

**Written by:** the supervisor, for Noor. **Delivers:** the plan for your 2 Nov brief (Sarvam, ElevenLabs, OpenRouter's
free audio, Try it on every feature, Gemini and Google Cloud for voice, read-aloud on tutor answers, and the bugs), what
it keeps, what it changes, and the waves. **Rule:** one gateway and one adapter registry; a child's words leave the server
only through the gateway; the founder's minors switch stays the one gate for every new voice; migrations TEST-first.

### Where I changed the brief, and why

1. **OpenRouter is its own service, not a switch on `openai_compatible`.** The generic service is the door for any
   text vendor with a chat endpoint; audio routes, voices and PCM wrapping are one vendor's own shape. A named `openrouter`
   adapter (text with photos, speech to text, voice) needs no schema change and no per-service switches; `openai_compatible`
   stays as it is.
2. **A Sarvam or ElevenLabs voice is chosen as one model string**, `<model>/<voice>` (`bulbul:v4-flash/chhavi_hi_kids`,
   `eleven_flash_v2_5/<voice_id>`), as Google's voice already is, so the profile table, the route revisions, the rollback
   and the model picker all work unchanged; "Test the key" fills the picker with the vendor's live list.
3. **Languages stay English and Hindi.** The app speaks those two; a Bengali or Tamil voice setting with no Bengali
   content would be a dead switch. Sarvam's `target_language_code` follows the child's language (hi-IN, en-IN).
4. **Sarvam's translation (mayura) is not wired.** No feature consumes a translation, and your own test shows it
   mistranslating a curriculum term. It comes back with the feature that needs it.
5. **Gemini is offered for voice but cannot be cleared for children on the free tier**: Google says free-tier data is
   used to improve its products. Control's minors switch stays off for it; Try it and your own tests may use it.
6. **Written quiz items come back and are marked by the AI** with a kind note, which reverses C446's choice-only quiz:
   your call, recorded as C454. The score line counts the choice items; each written item shows its verdict and note.
7. **The Hindi report-card PDF needs a text shaper, not only a font.** Devanagari conjuncts and matras are drawn by a
   shaping engine; a font embedded into our hand-written PDF alone prints them broken. The card is written with pdfkit
   (fontkit shapes Indic text) and Noto Sans Devanagari, bundled in the repo.
8. **Already fixed in PR #398:** fractions failing (not code: the primary timed out and the backup's key fails; yours to
   set), "12 × 15" without 180, the pendulum under other titles, the wrong "45 × 2" verdict, the empty tutor name, the
   "Thank you." silence (now also an energy check before any request, this programme).
9. **The call's board is not empty by a bug.** The one call of the test was refused (silence read as off-subject), so
   nothing was drawn; an answered call draws its blocks there (test/family/call.test.ts). The silence fix covers it.

### Waves (Decision Log C447–C456 reserved)

| Slice | What | Model |
|---|---|---|
| A1 | `sarvam`: speech to text (saaras), voice (bulbul, child voices, chunked at the vendor's limit, WAV), chat (sarvam-105b: max_tokens ≥ 1,500, reasoning stripped, empty-with-length is a failure, "slow" note) | sonnet |
| A2 | `elevenlabs`: voice (multilingual v2, flash v2.5, voice list), speech to text (scribe), speech to speech (`sts`, Try it only), the paid-plan badge, scope errors | sonnet |
| A3 | `openrouter`: text with photos, speech to text, voice (PCM to WAV, mp3 as is), 402/403 as "needs credit"/"not by API" | sonnet |
| A4 | Google: `gemini` voice and speech to text (the formats it takes), a Live token mint; `google_stt` (Cloud Speech-to-Text); `google_tts` voice ids normalised, a `voice_model` error, the "used as" hint | sonnet |
| B1 | Try it on every feature card: one live call of the feature's chain with made-up inputs, inline output, provider, model, time, backup used; usage marked `try_it`; audited; founder without the step-up | opus |
| B2 | Read aloud on tutor answers: `tutor_answer` line source, a speaker button on every answer, the voice named | sonnet |
| B3 | The quiz's written items marked with a kind note (migration), shown to the child | sonnet |
| B4 | The microphone's energy check: silence never reaches speech to text; a tiny recording refused server-side | sonnet |
| B5 | Report-card PDFs in Hindi: pdfkit with Noto Sans Devanagari | sonnet |
| C | Integration by the lead: the registry, Control's menus for every voice feature, the call passing the child's language (already does), migrations on TEST, the Decision Log, one CI run, the PR | supervisor |

### W17 status (2 Nov 2026, end of the build)

Built and merged on the branch: A1 Sarvam, A2 ElevenLabs, A3 OpenRouter, A4 Google voice and speech, B1 Try it, B2 read
aloud on answers, B3 marked written quiz items, B4 the silence check, B5 Hindi report-card PDFs (Decision Log C447–C456).
Migrations on TEST: all six (the four provider rows, the quiz's written mark, the Try it ledger source; the founder confirmed
the function drop on 2 Nov, 17:04 UTC), each recorded under its version with a matching md5. PR #399 can be deployed.
Keys (Sarvam, ElevenLabs, OpenRouter, Google Cloud Speech-to-Text) go into Control → AI → AI services; "Test the key"
fills each picker; Try it on a feature card shows what the chosen chain answers.

## Programme W18: the tutor teaches like a tutor; three live-verified fixes (2 Nov 2026, the supervisor's plan)

**Written by:** the supervisor, for Noor. **Delivers:** your brief of 2 Nov evening: the board in step with the voice,
history keeping every visual, a sketch pad, physics simulations for Classes 6–10, a timeline that reveals, a "Teach me"
autoplay; and the three fixes you verified live (Sarvam's speakers and key test, Gemini Live's token body, socket and
safety text, Check my work always giving a verdict). **Rule:** one renderer for answers (UnderstandView's AnswerBlock);
every simulation computed in our code; a child's sketch goes through the existing file door; your live findings are
taken as facts; prompt v10 registered in code, no migration.

### Waves (Decision Log C457–C463 reserved)

| Slice | What | Model |
|---|---|---|
| P1 | Board ↔ voice: the call, read-aloud and the chapter reader pass the spoken sentence to the board; one renderer for saved answers; the speaker button without a reload; "Teach me" autoplay with pause and replay | opus |
| P2 | Physics simulations (circuit, dc_motor, electromagnet, magnet_field) typed and computed in code, Classes 6–10; prompt v10 (sims and the sketch rule) | sonnet |
| P3 | The child's sketch pad (pen, three colours, eraser, undo, clear) through the tutor's file door, the tutor annotating it on the board; the timeline revealing step by step | sonnet |
| Q1 | Sarvam: the key test with a child voice, the speaker lists as the API accepts them | sonnet |
| Q2 | Gemini Live: `bidiGenerateContentSetup` with the shared child-safety text, the constrained v1alpha socket, Try it showing the status | sonnet |
| Q3 | Check my work: a verdict guaranteed in check mode, a whole-expression evaluator (precedence, fractions, Indian commas), typed "check my work" routed to check mode | opus |
| R | Integration by the lead: merges, the Decision Log, one CI run, the PR | supervisor |

### W18 status (2 Nov 2026, end of the build)

Built and merged on the branch: P1 board ↔ voice with one renderer and "Teach me", P2 four physics simulations and prompt
v10, P3 the sketch pad and the timeline reveal, Q1 Sarvam, Q2 Gemini Live, Q3 Check my work (Decision Log C457–C463).
No migration. Control keeps prompt v9 until the founder switches "Tutor answers" to v10 (Control → AI → the card's prompt
version); v10 is the code's fallback. Unverified by the builders: the drawing pad and the new simulation pictures on a
real phone; the Hindi labels of the simulations by a native speaker.
