# 11 — Feature map: every planned feature, judged

**Status:** plan (C230-L, 2026-10-20). **Sources:** the plan in `00`–`10`; the founder's four mockup boards
(`mockups/`); the founder's 10 private features and 3 recommendations (2026-10-20); the build-lead's master prompt v2
for the Family App, which first drew this map. This file is the copy that binds; the supervisor's corrections to v2
are marked **(C230-L)**.

**Two rules over every row:**
- The mockups are the reference for look, feel and scope, **not for facts**: their names, schools, numbers, dates,
  "% match" figures and prices are samples, and some are wrong (for example INSPIRE shown for classes 9–12). None of
  it reaches the product (`scripts/check_claims.py`).
- The weekend prototype is not a source of code, data or design (the founder's ruling, 2026-10-20). Its audit
  (`prototype-audit/AUDIT.md` §2–§4) is a list of failures the gates must prevent. The audit's "port" verdicts are
  read as "rebuild the idea from the mockups and `09`", never as "copy the file" **(C230-L)**.

**Verdicts:** Adopt (build as described) · Adapt (the useful core, changed for law, truth or learning) · Later (after
launch, by evidence) · Founder (needs the founder) · Out (not built).

**Money:** Free · 1-subject (free for one subject per child, Plus for the rest) · Plus · Pack (one-time, season) ·
School (school information, always free to linked families). Every price is a test band until `05` §4's evidence.

## Learn

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| L1 | Understand (the Concept Resolver) | Adopt | Topic, search, typed or photo question → streamed typed blocks: explanation, worked example, key points, diagram, check, practice, English moment, sources; follow-ups "simpler / another example / explain differently / practise more"; English, Hindi, and **Hinglish as an explanation style (decided, C230-L)** | M1 text, M2 photo | 1-subject |
| L2 | Visual learning: mind map, diagram, interactive diagram, simulation, 3D model | Adopt within `09` §3 | Our own renderers from structured data; interactive maths diagrams; in-house simulations with verified physics; true 3D only on tap, lazy, with a 2D fallback | M1 diagram; M2 interactive and simulations; 3D later | 1-subject |
| L3 | Socratic homework helper (founder #3) | Adopt | Photo of a question → topic detected → hint ladder (hint 1 of 3 → the child's attempt with feedback → next hint → "I'm stuck" → step by step); the child writes the final answer; never the answer first. Aadhaar and face screen on photos; photos deleted within 24 hours | M2 | Free: 3 photo questions a day (a Control setting); Plus: a higher fair-use cap |
| L4 | Checks, practice, misconception to mastery, spaced revision | Adopt | Distractors tagged with the misconception they reveal; a wrong answer brings a different explanation and 2–3 targeted items; revisits at 3 and 10 days; mastered = correct on 2 days at least 7 days apart | M1 core, M2 full | 1-subject |
| L5 | Adaptive study plan (recommendation 1) | Adopt | Each day: due revisits, then weak topics, then the next syllabus topic (and today's school topic for linked children), within 15–30 minutes; reflows from today; never a backlog wall | M2 | 1-subject |
| L6 | Board 30-day plan (founder #10) | Adapt | Practice sets from the board's official unit weightage, sample papers, marking schemes and published past papers; reviewed; labelled "practice priorities, not predictions"; called a plan, never a "panic button" | M4 | Pack per subject, or Plus |
| L7 | Practice worksheets | Adopt | Practice sets on screen, plus a printable PDF | M2 | 1-subject |
| L8 | Video in the response | Adopt, corrected | Video finder; tap to load; never autoplay; the note says the provider may show ads and suggestions, **never "no distractions"** | M2 | 1-subject |
| L9 | Offline and low-data packs (recommendation 3) | Adopt | A chapter pack (reviewed responses, practice, notes) with its size shown; answers sync later; live AI, voice and video say "needs internet"; data-saver loads text first | M2 | Free for the free subject; Plus for all |
| L10 | Tonight's practice (linked) | Adopt | Practice on what the class covered today | M3 | 1-subject |
| L11 | Exam-day kit and past papers | Adopt | Countdown, paper pattern, checklist, official links; past papers mapped to topics | M4 | 1-subject |
| L12 | Board answer-writing feedback | Later | Answers checked against the marking-scheme style | After launch | Plus |

## English

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| E1 | English moment, 3–5 lines | Adopt | Key words with their Hindi meaning, a model sentence, a pattern, and "read aloud" (device speech, labelled) | M1 | Free |
| E2 | 90-day English programme | Adopt | Foundation, Confidence, Expand, and Mastery/Workplace for older learners; a daily 15-minute lesson; assessments on days 0, 45 and 90; **no fluency promise**, measured progress only | M6 | Plus |
| E3 | Parent + child English duet (founder #7) | Adapt | 5 minutes a day, 3 everyday sentences together, sound-level feedback; "try again", never "wrong"; **no percentage score** until accuracy on Indian accents is measured; consent purpose `voice_practice`; a speech provider cleared for minors | M6 | Plus |
| E4 | AI conversation partner, 15 minutes a day | Later (costed pilot) | Topic role-plays by voice or text, a daily limit set in Control; an illustrated character, never a photo-real person | Pilot after launch | Plus or add-on, on measured cost (`05` §5) |
| E5 | Domain English packs | Later | Interviews, office, IT, finance | After launch | Plus |

## Future

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| F1 | Competitive exam runway: Navodaya, Sainik (AISSEE), Military Schools, NMMS, Olympiads (founder #1) | Adopt | Per exam: verified dates and official links, pattern and syllabus from the official notice, form-open alerts, a weekly plan to the exam date (the L5 engine), **our own mock tests** (reviewed, answers re-solved), and only past papers the issuer publishes | M4 | Information and alerts free; mock series Pack or Plus |
| F2 | Scholarships, schemes and readiness (recommendation 2) | Adopt | Structured eligibility → "likely eligible: check these conditions" or "not eligible because…"; document checklist, deadlines, tracker, reminders; official sources only; **unverified items never shown; no "% match"** | M4 | Free |
| F3 | Career compass, classes 8–10 (founder #9) | Adapt | Game-based activities on an established interest framework plus aptitude puzzles on recognised dimensions; results as "strengths to explore" with reasons, **never a % match or a diagnosis**; a parent conversation guide; routes only from the vetted pathway graph; a counsellor reviews the pilot | M4 | Summary free; in-depth roadmap Plus or one-time |
| F4 | Career pathways explorer | Adopt | A vetted graph with a source on every step, a roadmap timeline, skills, exams and plain uncertainty | M4 | Free; saved plans Plus |

## Family and records

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| R1 | Lifetime academic record (founder #2) | Adopt | Timeline of report cards, certificates, TC and sports; "verified by school" **only** with a `/verify` link, everything else "added by family"; survives any change of school | M5 | Free up to a storage limit (a Control setting; the founder's 50 MB as the start); more in Plus |
| R2 | Health record: vaccination, blood group (founder #2) | Adapt | Optional; consent purpose `health_records`; family-entered; encrypted; never sent to AI; never seen by a school unless the family exports it | M5 | Free |
| R3 | Admission dossier, one-tap share (founder #2) | Adopt | Choose records → preview → a PDF and an expiring, view-only, revocable link; "certified" only if every item carries a verification link | M5 | One-time or Plus |
| R4 | DigiLocker / APAAR link | Later | Official documents only through official partner APIs, if approved; we never handle Aadhaar (C232) | After launch | Free |
| R5 | PTM → 14-day home plan (founder #6) | Adapt | Input: the parent's own notes (typed or spoken) or, for linked schools, the teacher's notes through School Link; recording only with the teacher's agreement, transcribed then deleted; output: 15 minutes a night for 14 days, mapped to syllabus topics and the mastery loop; "Request teacher follow-up" goes to the existing follow-up queue | M3 | Plus |
| R6 | Learn-to-unlock screen time (founder #4) | **Adapt; step 2 reopened by the founder, gated (C230-M)** | **Step 1:** a learning-first routine: the child agrees a daily goal; the parent sees "today's learning done" from our own data only; a guided hand-off to the phone's own parental tools (Google Family Link, iOS Screen Time), where the parent grants time. Step 1 also defines an unlock-credit contract in our API. **Step 2 (a native Android companion that locks other apps)** was reopened by the founder on 2026-10-21 and waits for its four gates (docs/34 §9: lawyer, Play approval, pilot evidence, own-phone share) | Step 1 M2; step 2 after launch, gated | Step 1 free; step 2 decided with its gates |
| R7 | Streaks, rewards, micro-scholarships (founder #5) | Adapt, part Founder | A forgiving weekly goal (for example 5 of 7 days), never "you broke your streak", **no leaderboard**; badges for **mastered topics**, not days; a family reward jar the parent sets and pays; sponsor-funded micro-scholarships only later as a pooled fund with no brand messages to children and no child data to sponsors, after the lawyer | Jar M2; sponsor pool Founder | Free |
| R8 | Books and uniform exchange (founder #8) | Adapt, Later | Parents only (18+); school community first, then locality; area only; sell or donate, no in-app payments; photo screening, report and block, moderation, a grievance officer; advertising only by founder exception to `05` rule 4 | Pilot after launch | Free |
| R9 | Weekly parent summary and tonight's talk question | Adopt | Three lines a week; a talk question each evening from what the child learned; for linked schools, the school's Daily Pulse | M2; Pulse M3 | Free |
| R10 | Several children, child switcher, class-adaptive homes | Adopt | One account, several children; everything keyed to the child; registers for classes 3–5, 6–8 and 9–12 designed now, classes 6–10 built first | M1 | Free |

## School-connected (linked children only; always free)

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| S1 | School Link | Adopt | A school-issued, single-use connect code; unlinking ends access in the same request | M3 | School |
| S2 | Today at school, attendance, report cards, notices, events, fees and receipts, PTM booking, homework hand-in, study material, how to help at home, Daily Pulse with in-app replies | Adopt | Per `02` §9, through `SchoolLink` only | M3 | School |
| S3 | Exam transparency: rubric, answer sheet, re-evaluation | Later | Needs a pilot school and the ERP P6 extension first (`07`) | After launch | School |
| S4 | Class story in the Pulse | Out for now | Teacher workload and media consent (`02` §13); revisit with pilot schools | — | — |

## Platform

| # | Feature | Verdict | What we build | Milestone | Money |
|---|---|---|---|---|---|
| P1 | Plan and subscription screen | Adopt | One free subject; Family Plus for all children; packs; prices hidden until pilot retention (`05` §4); cancel in two taps | M7 | — |
| P2 | Settings and privacy | Adopt | Language (English, Hindi; Hinglish as a style), consents per purpose, see and delete answers, delete the account | M1 | Free |
| P3 | Control: Family, AI, Apps, Integrations, Content (`10`) **(C230-L)** | Adopt | Flags with audiences, kill switches, banners, versions, health and usage counts, providers and sealed credentials, caps, the content library with review and publish; never a child's data | M1 thin, then each milestone | — |

## Not built from the mockups

- A leaderboard tab; "% match" on careers or scholarships; "no distractions" on videos; a photo-real AI person;
  "predicted" exam questions; sample facts shown as real; a 20-item "More" grid (the five tabs group everything).
- **(C230-M)** The "Focus Routine" screen's app limits, focus window and bedtime lock are not in the web app. They
  belong to R6 step 2, after its gates (docs/34 §9). The child-started study timer that pauses only our own
  notifications stays after launch (`02` §13).
