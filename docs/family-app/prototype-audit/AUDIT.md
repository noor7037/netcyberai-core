# Prototype audit (wave PA): the weekend prototype

**From** the build lead, **for** the supervisor and Noor. **Delivers** a read-only audit of the weekend prototype on the
founder's Mac and a component-by-component verdict on what netcyberai-core's family app can reuse. **How:** by
C230-K and `07` (wave PA). Nothing in the prototype folder was changed (§8). No prototype code is copied here.

**Date:** 2026-10-20. **Source audited:** `~/Downloads/WeekEnd Bilder/` as it stood on that day (388 files outside
`node_modules`). **Running copy:** the production server on `http://localhost:3002` (`next start`, Next.js 14.2.15).

## 0. In plain words

- **What it is:** a polished, clickable demo of the family app. Nearly every screen runs on fixed sample data held in
  the browser's memory. Nothing is saved, no AI is called, and sign-in, school connect, photo scan and speech scoring
  are simulations on a timer.
- **What is good:** the look and feel. Colour per subject, tactile buttons and cards, a strong "Understand" button, a
  lesson laid out as clear blocks, a hands-on motion lab, and a Hindi switch on every screen. Those patterns are worth
  keeping (§6).
- **What is not usable:** the data and the logic behind it. Many facts are wrong or invented (§3): a stalled national
  exam is shown as open, deadlines that have passed are shown as open, 6 of the 8 "verified" videos do not exist, and
  a class 10 child is taught a class 9 chapter. Reduced motion is ignored, Hindi leaves a third of the opportunities
  page in English, and every page scrolls sideways on a phone.
- **Verdict:** it does not meet `02`, `03` or `09` (§7). Of 38 parts catalogued, none is ported as-is, 19 are ported
  with changes (mostly look and layout), 6 are rebuilt and 13 are discarded (§5). The port rebuilds the data, AI,
  identity and privacy layers inside netcyberai-core, as C230-K decided.

### Founder actions

1. **Rotate it:** the prototype has a hard-coded fallback key for signing session tokens in `src/lib/auth/index.ts`
   (§2.4). Nothing in netcyberai-core uses it. If the prototype was ever put online without its own secret set, take
   that copy down; never reuse the key.
2. **Keep the prototype offline:** do not share it with families or put it on a public link. Its sign-in accepts the
   code `123456` for any phone number, its one API route has no sign-in check, it names a real school brand, and its
   Next.js version has a critical published advisory (§2.5).

Nothing else is needed from the founder for this wave.

## 1. Stack

| Part | What the prototype uses |
|---|---|
| Framework | Next.js **14.2.15** (App Router), React 18.3.1, TypeScript 5.6 (strict). netcyberai-core is on Next.js 14.2.35. |
| Styling | Tailwind CSS 3.4 with its default palette (indigo, amber, emerald), not the v5 tokens in `src/lib/design-tokens.ts`. A `globals.css` adds bevelled "3D" buttons and cards. |
| Rendering | Every page is a client component (`'use client'`) under one React context (`src/context/AppContext.tsx`, 1,438 lines) that holds all state and sample data. Pages are pre-rendered as static HTML, then hydrated. |
| Database and schema | `migrations/001_cx_initial_schema.sql`: 9 tables prefixed `cx_` (parent accounts, child profiles, syllabus profiles, study plans, quizzes, vault entries, opportunities, school connections, notifications). PGlite (embedded Postgres, writing to `.pgdata/`) or `pg` with `DATABASE_URL`. No RLS, no schemas, no consent table, ids from `Math.random()`. **Not used by any page**: only the unit tests and the one API route touch it. No `.pgdata/` exists, so it has never run in the app. |
| Auth | `src/lib/auth/index.ts`: phone OTP, but the code is always `123456` and is printed on the sign-in screen; HS256 session token (jose) valid 30 days, signed with `APP_SESSION_SECRET` or a hard-coded fallback. **Not wired to any page**: the app starts signed in as a sample parent. |
| AI provider | **None.** `src/lib/ai-router/index.ts` reads `AI_PROVIDER` but never uses it and returns fixed answers. No AI key exists anywhere in the folder. `src/lib/pedagogy/doubt-saathi.ts` builds a prompt but nothing sends it. |
| 3D and animation | No WebGL or 3D library. The "3D Sim Lab" is a CSS perspective transform (`rotateX`) with an emoji vehicle. Animation by framer-motion 11.18.2; canvas-confetti 1.9.4 for celebrations; lucide-react 0.453 icons. netcyberai-core has none of these three libraries. |
| Speech | The browser's Web Speech API (speech recognition for the mic buttons; speech synthesis for "Listen"). |
| Tests | Vitest 2.1.9: 12 files, 40 tests, all on the `src/lib/**` modules (most of which no page uses). No component tests. Playwright: 2 specs (a happy-path click-through and a screenshot capture). |

## 2. Measured results

All commands ran on a copy of the source (without `node_modules` and `.next`) in a scratch folder, with Node 24.4.1
and npm 11.4.2, so the prototype folder stayed untouched. Lighthouse, axe, the motion and Hindi checks and the
pictures ran against the founder's running server on `localhost:3002`.

### 2.1 Install, typecheck, test, build

| Step | Command | Result |
|---|---|---|
| Install | `npm ci --no-audit --no-fund` | `added 328 packages in 11s`, exit 0. npm warns: `next@14.2.15: This version has a security vulnerability.` |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | No errors, exit 0. |
| Unit tests | `npm test` (`vitest run`) | `Test Files 12 passed (12)`, `Tests 40 passed (40)`, 10.6 s, exit 0. |
| Build | `npm run build` (`next build`) | `✓ Compiled successfully`, 22 static pages, exit 0. |
| E2E (extra) | `npx playwright test test/e2e/consumer-app-flow.spec.ts` | `1 passed (969ms)` against the running server. |

First-load JavaScript per route, from the build output (compressed):

| Route | `/` | `/family` | `/explain` | `/english` | `/careers` | `/quiz` | `/opportunities` |
|---|---|---|---|---|---|---|---|
| First Load JS | 154 kB | 155 kB | 156 kB | 147 kB | 148 kB | 151 kB | 144 kB |

All are under `09` §4's 200 KB budget on paper. But the top bar and the home tiles link to many pages (9 in the
desktop top bar, 15 in the menu), and Next.js prefetches the code of every visible link as soon as a page opens, so
the phone downloads more than this (§2.2).

The tests pass, but they test the parts that no page uses. One example: the opportunities module compares deadlines
written as text ("October 31, 2026") with dates ("2026-10-20"), so in real use nothing would ever expire. The test
passes because it inserts its own deadline in date form.

### 2.2 Lighthouse mobile

Lighthouse 12.8.2, mobile preset (Moto G Power emulation, simulated slow 4G: 150 ms round trip, 1.6 Mbps, CPU slowed
4×), performance only, **3 runs per page, median shown**. Command per page:
`lighthouse http://localhost:3002<route> --only-categories=performance --output=json` (headless Chrome for Testing 156).

| Page | Score | FCP | **LCP** (≤ 2.5 s) | **TBT** | **CLS** (≤ 0.1) | **JS transferred** (≤ 200 KB) | Total |
|---|---|---|---|---|---|---|---|
| `/` | 99 | 0.76 s | 2.27 s ✓ | 0 ms | 0.000 ✓ | 218 KB ✗ | 255 KB |
| `/family` | 99 | 0.76 s | 2.11 s ✓ | 0 ms | 0.000 ✓ | 219 KB ✗ | 258 KB |
| `/explain` | 97 | 0.75 s | **2.56 s ✗** | 0 ms | 0.000 ✓ | 209 KB ✗ | 241 KB |
| `/english` | 96 | 0.76 s | **2.71 s ✗** | 0 ms | 0.000 ✓ | 217 KB ✗ | 251 KB |
| `/careers` | 95 | 0.76 s | **2.86 s ✗** | 0 ms | 0.000 ✓ | 216 KB ✗ | 249 KB |
| `/quiz` | 99 | 0.76 s | 2.11 s ✓ | 0 ms | 0.000 ✓ | 209 KB ✗ | 240 KB |
| `/opportunities` | 99 | 0.75 s | 2.10 s ✓ | 0 ms | 0.000 ✓ | 219 KB ✗ | 254 KB |

- **INP:** a page-load run cannot measure INP; TBT (its lab stand-in) is 0 ms on every page.
- **LCP:** 3 of 7 pages miss 2.5 s. Lighthouse puts 80–84% of LCP in "render delay": the text is already in the HTML
  but is counted as painted only after the scripts have loaded and run. Every page hydrates one large client-side
  context, and some elements are server-rendered at `opacity: 0` until framer-motion fades them in.
- **JS:** 16–18 script files per page, because every visible link prefetches its route. The 3D lab adds no 3D library;
  it is CSS inside the `/explain` bundle.

### 2.3 Licences

`npx license-checker --summary` (license-checker 25.0.1), all packages:

```
├─ MIT: 235
├─ ISC: 17
├─ Apache-2.0: 13
├─ BSD-2-Clause: 2
├─ BSD-3-Clause: 2
├─ MIT-0: 1
├─ CC-BY-4.0: 1
├─ UNLICENSED: 1
└─ 0BSD: 1
```

- No copyleft licence. `CC-BY-4.0` is `caniuse-lite` (browser data that every Next.js app ships; attribution only).
  `UNLICENSED` is the prototype itself.
- Licence risk to a port is therefore nil. The content risk is separate: hot-linked Unsplash pictures and YouTube
  embeds (§4, §5).

### 2.4 Secrets scan

A read-only pattern scan over all 313 text files outside `node_modules` (including `.next`, the docs and the planning
notes). It looked for cloud, AI, GitHub, Slack, payment and Supabase keys, private-key blocks, JWTs, database URLs
with passwords, hard-coded secret assignments and secret fallbacks after `process.env`. It printed file, line and
rule only, never the value.

| File | Kind of secret | Action |
|---|---|---|
| `src/lib/auth/index.ts` (line 5) | Hard-coded fallback signing secret for HS256 session tokens, used when `APP_SESSION_SECRET` is not set | **Rotate it** (founder action 1). It is not in the built `.next` output, because no page imports the auth module. |

No `.env` files, AI keys, database passwords or tokens were found.

### 2.5 Dependency advisories (extra)

`npm audit --omit=dev`: **2 vulnerabilities (1 high, 1 critical)**, both through `next@14.2.15` and its bundled
`postcss`. The advisories include SSRF in rewrites, cache confusion and remote code execution in image optimisation.
netcyberai-core's 14.2.35 is a separate line and is not affected by this audit.

### 2.6 Accessibility (axe with Playwright)

axe-core 4.10.3 through `@axe-core/playwright` (WCAG 2.0 and 2.1, A and AA), at 390 × 844, English, default state of
each page. The 44 px column counts visible interactive elements smaller than 44 × 44 px (CLAUDE.md rule).

| Page | Violations (impact, nodes) | Targets under 44 px |
|---|---|---|
| `/`, `/family` | color-contrast (serious, 7) | 8 |
| `/explain` | color-contrast (serious, 5) | 11 |
| `/explain`, 3D Sim Lab tab | color-contrast (serious, 1); **label (critical, 1)**: the throttle slider has no label | 9 |
| `/english` | **button-name (critical, 1)**: the speaking-practice mic button has no name; color-contrast (serious, 3) | 4 |
| `/careers` | color-contrast (serious, 1) | 10 |
| `/quiz` | color-contrast (serious, 1) | 4 |
| `/opportunities` | color-contrast (serious, 1) | 27 |

- **Contrast examples:** `text-slate-400` labels on white at 2.56:1 (needs 4.5:1); "Syllabus Chapters:" at 2.47:1;
  Hindi lines in `text-purple-200` on purple at 3.95:1.
- **Also visible in the pictures:** the "Daily English practice phrase" card on `/explain` paints pale text
  on a white card, so the sentence is nearly invisible (`pictures/explain-1440.webp`).
- `<html lang="en">` never changes, so screen readers read Hindi with English rules.

### 2.7 Reduced motion

**Not honoured.** There is no `prefers-reduced-motion` rule in the CSS, no `useReducedMotion` and no
`MotionConfig reducedMotion="user"`, and canvas-confetti is called without `disableForReducedMotion`. Playwright
measured the same pages with `reducedMotion: 'reduce'` and without it:

| Page | Elements moving over 0.7 s (off → on) | Running CSS/WAAPI animations (off → on) |
|---|---|---|
| `/` | 8 → 8 | 6 → 6 |
| `/explain` lab, running | 5 → 5 | 5 → 5 |
| `/english` | 2 → 2 | 2 → 2 |
| `/quiz` | 2 → 2 | 2 → 2 |

With reduced motion on, answering the `/english` check still launches the confetti canvas (0 → 1 canvas).
`matchMedia('(prefers-reduced-motion: reduce)')` was confirmed true in the "on" runs.

### 2.8 Hindi

**Not complete.**

- **The dictionary:** the 86 dictionary keys exist in both English and Hindi. Most text, though, sits in 296 inline
  `isHi ? … : …` choices, and the data (opportunities, careers, programme labels) has no Hindi fields.
- **The test:** Playwright switched each page to हिंदी and counted visible lines with no Devanagari and at least two
  English words.

| Page | Visible lines | English-only lines | Examples |
|---|---|---|---|
| `/`, `/family`, `/quiz` | 110, 110, 31 | 0 | — |
| `/explain` | 66 | 4 (6%) | Vocabulary terms (by design) and the English phrase |
| `/explain` lab | 55 | 1 | "4 (Bumrah Stride)" |
| `/english` | 69 | 11 (16%) | Mostly English-learning sentences (by design); the 90-day phases ("Phase 1: Days 1–30 • Foundation & Confidence") and benchmark labels are English-only |
| `/careers` | 60 | 11 (18%) | Exam names, "Career Launch", scholarship lines, institutions |
| `/opportunities` | 132 | **45 (34%)** | Every title, issuing body and benefit, e.g. "National Means-cum-Merit Scholarship Scheme (NMMSS)" (`pictures/opportunities-390-hi.webp`) |

`09` §6 bans "any English-only screen when Hindi is on"; `/opportunities` and `/careers` fail it.

### 2.9 Layout (extra, found in the pictures)

- **Sideways scrolling on every page at every width.** The top bar is wider than the screen:
  - 608 px wide on a 360 or 390 px phone (sibling switcher, language switch and bell overflow);
  - 1,737 px wide on a 1,440 px desktop (logo, XP chips, child switcher, language switch, bell and 9 links in one
    row).
- **Pictures:** for that reason the 390 pictures are 608 px wide and the 1,440 pictures are 1,737 px wide.
- **Bottom bar:** the mobile bottom bar is fixed, so it appears part-way down the full-page pictures.

## 3. Truth checks

**How checked:**
- **"Read"** means the official document itself was read in this audit.
- **"Reported"** means the official site could not be read by the tool, and the fact was taken from at least two
  independent reports that cite it. The official URL is still the one to check.

### 3.1 Five scholarships, schemes and exams from `/opportunities`

| Item | The prototype says | Official source | What the source says | Match |
|---|---|---|---|---|
| NMMSS | ₹12,000 a year (₹1,000 a month), classes 8–12, "state/government aided schools", deadline 31 Oct 2026, verified 2026-10-15 | <https://scholarships.gov.in>; <https://www.dsel-education.gov.in/scheme/nmmss> (reported) | ₹12,000 a year for classes 9–12. Students are selected by a state test taken in class 8. Parental income up to ₹3.5 lakh. Government, aided and local-body schools only (not KV, JNV or residential). 2026-27 NSP deadline reported as 31 Aug or 30 Nov. | **Partly.** The amount matches. The income limit is missing. Class 8 is the test year, not a paid year. The deadline has no source. |
| PM YASASVI (Top Class School Education) | Up to ₹75,000 a year (classes 9–10) and ₹1,25,000 (11–12); classes 9–12; link to the NTA YASASVI test site; deadline 15 Nov 2026 | <https://socialjustice.gov.in/schemes/101> (read) | Official page: an umbrella scheme **for OBC, EBC and DNT students**, with Top Class School Education as one part (amounts not on that page). Reported: the amounts shown; income up to ₹2.5 lakh; the entrance test was dropped from 2026-27 and selection is on previous-class marks through NSP. | **Partly.** The amounts match the reports. Category and income are missing, so every class 9–12 child is "matched". The link points to the dropped test. The deadline has no source. |
| NTSE | Open; deadline 5 Dec 2026; ₹1,250 a month (11–12) and ₹2,000 (UG/PG); verified 2026-10-08 | <https://ncert.nic.in> (NTS scheme; reported) | NCERT's notice: the scheme was approved only until 31 March 2021, and its implementation "has been stalled till further orders". The last exam was held in October 2021. | **No.** A stalled scheme is shown as open, with an invented deadline and "verified" date. |
| INSPIRE-MANAK | ₹10,000 one-time to the student's bank account; classes 6–10; deadline 25 Oct 2026 | <https://www.inspireawards-dst.gov.in> and its 2026-27 nomination letter (read) | Schools nominate up to five ideas on E-MIAS from 15 July to 15 September 2026. Classes 6–12 (at most two ideas from classes 11–12, science stream). The site says FY 2026-27 nominations are closed. | **No.** Wrong deadline, wrong classes, and a family cannot apply on its own. The amount was not on the official pages read: unverified. |
| JNVST (Navodaya) | Classes 5, 6, 8 and 9 eligible; deadline 23 Sep 2026 | <https://navodaya.gov.in> (reported) | Class 6 entry (applicants in class 5): registration closed 7 Aug 2026; test 28 Nov 2026. Class 9 lateral entry (applicants in class 8): closed 30 Sep, reported extended to 15 Oct 2026; test 10 Apr 2027. | **No.** The date matches neither window, and children in classes 6 and 9 are not applicants. |

Also found while checking:
- **Begum Hazrat Mahal scholarship:** shown open to 15 Nov 2026. The Maulana Azad Education Foundation was ordered
  closed on 7 Feb 2024, and a Rajya Sabha answer of 2 Dec 2024 says the scholarship was subsumed into the ministry's
  scheme (<https://rsdebate.nic.in>, PQ 266).
- **IOQM:** shown to a class 10 child as open, with its own deadline of 12 Aug 2026.
- **Past deadlines:** 5 of the 23 items have deadlines before today (JNVST, NSEP, IOQM, DHBBC, RMS CET). The page does
  not filter by date.

### 3.2 Five career steps from `/careers`

| Step shown | Official source | What the source says | Match |
|---|---|---|---|
| Doctor: "MBBS (5.5 yrs)" | <https://www.nmc.org.in> (GMER 2023; reported) | 4½ years of study plus a 1-year compulsory rotating internship | **Yes** |
| Doctor: "Class 11–12: PCB stream", "NEET UG" | <https://neet.nta.nic.in> (reported) | NEET-UG is required for MBBS. Class 12 with Physics, Chemistry, Biology or Biotechnology, and English. | **Yes** |
| Armed forces: "Class 12: crack UPSC NDA written exam in April / September"; core subjects "General Science + Mathematics + English" | <https://upsc.gov.in> (reported) | NDA & NA is held twice a year. The Army wing takes class 12 in any stream; the **Air Force and Navy wings need Physics, Chemistry and Mathematics** in class 12. | **Partly.** The timing is right; the subject rule for two of the three wings is missing. |
| Civil services: "UPSC CSE: Prelims, Mains (9 papers) & Interview"; graduation in any discipline | <https://upsc.gov.in> (reported) | Mains has 9 papers (2 qualifying language papers, 7 counted for merit), then the interview. A degree in any discipline. | **Yes** |
| Engineer: "Class 10: 90%+ in Math & Science + NMMS / Olympiad Prep" | <https://jeeadv.ac.in> (reported) | IIT admission needs JEE Advanced and 75% in class 12 (or the board's top 20 percentile). There is no class 10 marks rule. NMMS is a class 8 scholarship test, not a career step. | **No.** Invented. |

Also wrong on the same page:
- **INSPIRE Scholarship (₹80,000/yr)** is shown as the "linked govt scholarship" for an AI and robotics engineer.
  DST's notification (on cbseacademic.nic.in) gives it to B.Sc. and M.Sc. students in **natural and basic sciences**,
  not engineering.
- **PM YASASVI** is shown as the doctor's scholarship, but it is a school scholarship for OBC, EBC and DNT students.

### 3.3 Three quiz answers and the simulation's physics

Source: NCERT's 2026-27 Class 9 Science, Chapter 4 "Describing Motion Around Us",
<https://ncert.nic.in/textbook/pdf/iesc104.pdf> (read).

| Check | The prototype | NCERT | Match |
|---|---|---|---|
| Quiz q8: a ball dropped from rest, after 3 s (g = 9.8 m/s²) | 29.4 m/s | Example 4.4 lists velocities of 9.8, 19.6 and 29.4 m/s at 1, 2 and 3 s | **Yes** |
| Quiz q3: a runner completes a 400 m lap and returns to the start | Displacement 0 m | §4.1.2 defines displacement as "the net change in the position" of an object, and asks when an athlete's displacement is zero | **Yes** |
| Quiz q10: a train at 20 m/s stops in 20 s | Retardation 1 m/s² | Eq. 4.4a, v = u + at, gives a = −1 m/s² | **Yes** |
| The motion lab | v = u + at and s = ut + ½at², with a slider for a (0–8 m/s²) and u fixed at 0 | Eq. 4.4a and 4.4b. "These kinematic equations are valid only when the acceleration is constant." | **Partly.** The formulas are right, but the code caps v at 60 m/s while s keeps growing at the full acceleration. At a = 8 m/s² after 10 s the lab shows v = 60 m/s and s = 400 m; a consistent run would show 375 m (or 80 m/s with no cap). It is wrong whenever a > 6 m/s². |

The syllabus around these answers is wrong:
- **Wrong class:** the class 10 sample child is taught "Ch 8: Motion", "Ch 9: Force and Laws of Motion" and "Ch 6:
  Tissues". CBSE's Class X Science curriculum for 2026-27
  (<https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Science_SecP1_2026-27.pdf>, read) has five
  units: Chemical Substances, World of Living, Natural Phenomena, Effects of Current and Natural Resources. It has no
  unit on motion, which is class 9 content.
- **Old chapter numbers:** NCERT's new class 9 book puts kinematics in Chapter 4, not 8.
- **Class 6 (not checked):** the class 6 chapters ("Getting to Know Plants", "Fractions", "Motion and Measurement of
  Distances") look like the older NCERT books.

### 3.4 Every invented number or claim found

**Learning screens**
- Home: "Targeting 95%+ in Term 1 Finals".
- Home: subject mastery 85%, 90%, 75%, 70% and 95%.
- Home: chapter counts (16, 15, 90, 18, 24) and "Class 10 Full Coverage".
- Home: "Plan auto-reflowed: 0 missed backlog".
- `/explain` and home: "Exam Weight: 10 Marks", and per-topic "~N Marks" in the mind map (the 10 divided by 4).
- "Bumrah's run-up accelerates from 0 to 145 km/h" (home and `/explain`). 145 km/h is the ball's release speed; a
  run-up is a sprint far slower than that.
- Streak "12 Days", "890 XP", XP rewards per topic and a "+250 XP Mastery Chest".

**English**
- "Excellent pronunciation! 98% accuracy score": shown after a 2-second timer. No audio is analysed.
- "AI assesses pitch, rhythm and articulation": there is no AI.
- "Today's 15-minute quota complete (+50 XP)": shown whatever answer is chosen.
- "CEFR Pre-A1 → B1" in 90 days, "CEFR B1 Fluency" target and "Projected CEFR A1+". This contradicts `02` §6.2: about
  200 guided hours per level, against about 30 hours in 90 days.
- "Listen to Native Pronunciation": it is the device's text-to-speech.

**Opportunities and careers**
- "100% Verified Government & National Portals".
- Every "verified on" date and every deadline: no record of any check exists.
- The NTSE, Begum Hazrat Mahal and past-deadline items in §3.1.
- "PM SHRI Schools Special Talent Scheme": PM SHRI upgrades selected government schools; there is nothing a family
  applies for.
- Unverified figures: "70,000+ schools" (SOF IMO), "₹1,00,000 + 15 national cash awards" (CSIR), "60 exceptionally
  gifted students" (DHRUV), "Cash awards up to ₹50,000" (SOF NSO).
- "Verified Career Pathways", "High global demand", "Highest societal trust", "90%+ in Math & Science", the INSPIRE
  and YASASVI links, and "Ministry of Defence Officer Training Stipend" given as a scholarship.

**Videos:** a "verified curated library" of 8 videos. Checked against YouTube's public oEmbed: 6 IDs do not exist;
the other 2 exist but belong to different channels from the ones named. Its "verified on" dates are invented too.

**Trust and privacy claims:** "DPDP Act 2023 Compliant • Zero Aadhaar Stored" (no consent ledger, no legal review),
"Data Retention Guarantee: 100% … preserved permanently", "100% Family Owned … 100% Portable", "Zero Spam Guarantee".

**School data:** "Delhi Public School, Sector 45" (a real school brand), attendance 94.2%, marks and A1 grades, and fee
status, all presented as data mirrored from the school.

**Labels that claim AI:** "Doubt Saathi AI" and "Voice AI", where no AI exists.

## 4. Privacy

**Where child data lives today**

- **In the browser's memory only.** It holds two sample children (full first and last names, Hindi names, class,
  board, state, medium, emoji avatar, XP and streak). For each child it also holds a syllabus, plan, vault, weak
  topics, quiz results and mock school records (roll number, attendance, marks, fees).
- **Forms:** the "Add child" form takes a child's name, class, board and medium. The sign-in form takes the parent's
  WhatsApp number.
- **Nothing persists:** no cookies, `localStorage` or IndexedDB are used, and a page reload resets everything.

**What the unused server code would store**

- The `cx_` tables would hold:
  - the parent's phone number;
  - the child's full name, class, board, medium, XP and streak;
  - syllabus extracts, including raw OCR text;
  - every quiz score and weak topic;
  - vault entries;
  - the school name and student school ID;
  - notifications.
- They would sit in a plain file (`.pgdata/`) or a database, with no RLS and no consent record.
- The only deletion path is a cascade on the parent row.
- `03` §5 allows a first name only, under forced RLS.

**What reaches an AI provider:** nothing today, because no provider is wired. But the prompt builder
(`src/lib/pedagogy/doubt-saathi.ts`) puts the **child's full name**, class, board, streak, XP and weak topics into the
prompt text. A port that connected it would break C230-H and `03` ("no child data in any provider request").

**What leaves the device**

- **Network log:** during every Playwright run on the seven audited pages, the browser contacted only `localhost`.
- **Voice:** the mic buttons (on the opportunities, quiz, homework, scan, toolkit, vault, videos and doubt-helper
  pages) use the browser's speech recognition. In Chrome that sends the audio to Google's servers for transcription
  (as documented by Mozilla and Brave). That is a child's voice going to a third party, with no consent purpose
  (`03` §11 has none for it).
- **Invented input:** when recognition fails, the button types a made-up sentence into the field as if the child had
  said it.
- **`/videos`** loads Unsplash pictures from `images.unsplash.com` and a privacy-enhanced YouTube embed with
  `autoplay=1`. `02` §5 says no autoplay.

**Photos:** the scan page lets a parent pick an image or PDF, but never reads or uploads it. A fixed result appears
after a timer.

## 5. Component inventory

**Verdicts:**
- **port as-is:** move the code with no change;
- **port with changes:** keep the pattern, layout or logic, rewritten on core's tokens, components, contracts and data;
- **rebuild:** keep the idea, write new;
- **discard:** do not carry over.

**Targets:** the wave (`07`) · the module path (`06`) · the response block (`02` §4, rendered by `03` §6).

**Effort:** S is up to a day, M up to a week, L longer, for the port's share only.

| # | Path | What it does | Libraries | Data | Tests | Quality findings | Verdict | Target | Effort | Risks |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `src/context/AppContext.tsx` | All app state (children, syllabus, plan, vault, school, notifications) and the EN/HI dictionary (86 keys) | React | Fixture | None | 1,438 lines; memory only; mixes copy, sample data and logic; class 10 child on class 9 chapters | Discard (harvest the Hindi wording as input to `fam.` keys) | FA-1 · `src/lib/family/children/`, `en.ts`/`hi.ts` | S | Privacy: full names |
| 2 | `src/components/Navigation.tsx` | Top bar (9 links, child switcher, language, bell; 15 links in the mobile menu); mobile bottom bar with a raised centre "Understand" button | framer-motion, lucide | Fixture | None | Overflows at every width (§2.9); every visible link prefetches its route; XP and streak chips in the header | Rebuild (keep the raised "Understand" bottom bar) | FA-1 · `(family)/family/layout.tsx` shell | M | Performance (prefetch), 44 px targets |
| 3 | `src/components/ui/SiblingSwitcher.tsx` | Child switcher dropdown with an add-child form | framer-motion, lucide | Fixture | None | Avatar server-rendered invisible; asks for a full name | Port with changes | FA-1 · shell child switcher (`09` §2 2.5D) | S | Privacy: first name only |
| 4 | `src/components/ui/LanguageSwitcher.tsx` | EN/हिंदी pill with a sliding active state | framer-motion | — | None | Not saved; `<html lang>` never changes | Port with changes (save to the account, set `lang`, CSS transform) | FA-1 · `account/` | S | — |
| 5 | `src/components/ui/NotificationDrawer.tsx` | Per-child notification tray and a weekly WhatsApp digest preview | framer-motion | Fixture | None | "Zero Spam Guarantee" claim | Rebuild | FA-4 weekly summary; WhatsApp after P4 through the send-gate | M | Messaging gate |
| 6 | `src/components/ui/{Button,Card,Badge,EmptyState,SkeletonShimmer}.tsx` | UI primitives | framer-motion | — | None | Core already has `components/ui` and `app-ui` equivalents | Discard | — | — | — |
| 7 | `src/components/ui/SubjectChip.tsx` + `tailwind.config.js` subject colours | One colour per subject (math blue, science green, English violet, SST orange, Hindi rose) with matching shadows | Tailwind | — | None | Default Tailwind hues, not v5 tokens | Port with changes (map onto `design-tokens.ts`, AA-checked) | FA-1 · family register of the tokens (`09` §2) | S | Contrast |
| 8 | `src/app/globals.css` (`btn-3d`, `card-3d`, `glass-panel`, `token-3d`) | Bevelled tactile buttons, lifting cards, glass panels | CSS | — | None | Animates `border-bottom-width` (layout, not transform); no reduced-motion rule | Port with changes (translate and shadow only; reduced-motion block) | FA-1 · family register | S | Performance on budget phones |
| 9 | `src/components/ui/MascotSaathi.tsx` | Emoji "mascot" with moods and a floating loop | framer-motion | Fixture | None | Endless motion; labelled "AI" | Discard (a mascot is the founder's brand decision, `09` §3) | — | — | Motion |
| 10 | `src/components/ui/GamifiedJourneyPath.tsx` | Zig-zag topic path: done, active, locked; XP per node; "mastery chest" | framer-motion, lucide | Fixture | None | XP and chest are engagement devices `09` §1 rejects | Port with changes (the path as the syllabus progress map, driven by checked mastery; no XP, no chest) | FA-3 · `learn/` topic progress | M | `09` §6 |
| 11 | `src/components/ui/CelebrationModal.tsx` | Trophy modal with confetti, score, XP and streak | framer-motion, canvas-confetti | Fixture | None | Fires after any quiz; ignores reduced motion | Port with changes (only for mastery checked twice; fade under reduced motion; no streak) | FA-4 · mastery loop (`09` §3 celebration) | S | Motion |
| 12 | `src/components/ui/AnimatedMindMap.tsx` | SVG concept map whose edges draw themselves | framer-motion | Fixture topics | None | Fixed 680 px canvas (scrolls on phones); invented marks weightage | Rebuild (Diagram block renderer from a structured description; keep the self-drawing edges) | FA-3 · `components/family/blocks/` · **Diagram** | M | Invented marks |
| 13 | `src/components/ui/Interactive3DSimulation.tsx` | Motion lab: perspective track, live v and s readouts with their formulas, acceleration slider | framer-motion, lucide | Computed | None | v cap breaks the physics above 6 m/s² (§3.3); u fixed; slider unlabelled; "3D" is CSS | Port with changes (fix the physics, add u, label the controls, reduced-motion still frame, call it what it is) | FA-4 · `components/family/blocks/` · **Simulation** (own component, no third-party licence) | M | Accuracy, a11y |
| 14 | `src/components/ui/VoiceMicButton.tsx` | Mic button over the browser's speech recognition | Web Speech API | — | None | Sends a child's voice to Google in Chrome; types an invented sentence when it fails | Discard | P-AI `speech_to_text` adapter, after a consent purpose | — | Privacy |
| 15 | `src/app/page.tsx` (`/` and `/family`) | Home: greeting band, mascot tip, ask box with Understand and Scan, today's focus, journey path, subject portals, quick tiles | framer-motion, lucide | Fixture | E2E only | Invented numbers (§3.4); XP and streak prominent; hard-coded module list; the ask box does a full page reload to `/explain`, which resets the language and the chosen child | Port with changes (keep the greeting band, ask box and today's focus card; modules from the registry) | FA-1 · `(family)/family/page.tsx` | M | `09` §6 |
| 16 | `src/app/explain/page.tsx` | "Understand": real-world example, Indian analogy, numbered steps, formula box, EN↔HI vocabulary, check question, English phrase; tabs for lab and mind map | framer-motion | 3 hard-coded lessons | None | Content fixed; a wrong answer reveals the answer at once (not hint-first); Bumrah claim; unreadable phrase card | Port with changes (the block layout and colour-coded block borders; content from the resolver) | FA-3 · `learn/[childId]` + `components/family/blocks/` · **Explanation, Worked example, Understanding check, English moment** | M | Accuracy |
| 17 | `src/app/quiz/page.tsx` | 10-question practice: progress bar, large lettered options, explanation and analogy per answer, "weak topic resurfacing" banner | framer-motion | Fixed bank | E2E only | Answers checked (§3.3); no misconception tags; XP and streak | Port with changes (Practice UI; items from content with misconception tags; "try again" before the reveal) | FA-3 · **Practice**; FA-4 · mastery loop | M | — |
| 18 | `src/app/english/page.tsx` | 90-day programme mock: dialogue bubbles (EN with HI), flip vocab cards with IPA, speaking task, comprehension check, roadmap, benchmarks | framer-motion, canvas-confetti, speech synthesis | Fixture | None | Fake speech scoring; success shown for any answer; fluency targets (§3.4); mic button unnamed | Rebuild (keep the dialogue bubbles and vocab card visuals) | FA-6 · `english/` programme; FA-3 · **English moment** | L | Invented claims; minors' voice |
| 19 | `src/app/careers/page.tsx` | Four hard-coded career paths: subject combination, exam, "linked scholarship", milestone timeline, institutions | framer-motion, lucide | Fixture | None | 1 invented step and 2 wrong scholarship links (§3.2); English-only fields in Hindi | Rebuild (keep the two-column picker and milestone timeline visuals) | FA-5 · `careers/` on `content.career_nodes/edges` | L | Accuracy |
| 20 | `src/app/opportunities/page.tsx` | Filters, search, class toggle, opportunity cards; a "founder review queue" inside the parent screen | framer-motion, lucide | 23 seeded items | None | Stale, closed and invented items (§3.1); review actions on a family screen; raw URLs as text; 34% English in Hindi | Port with changes (card anatomy: type chip, deadline pill, "checked on" line, official-link button; filters) | FA-5 · `opportunities/`; review moves to Control → Family (`03` §12) | M | Accuracy, `09` §6 |
| 21 | `src/lib/opportunities/data.ts` | The 23 seeded opportunities | — | Fixture | Via 22 | Wrong or unverified (§3.1) | Discard | FA-5 content operations (`07` §4) | — | Accuracy |
| 22 | `src/lib/opportunities/index.ts` | Seed, archive, match by class and state, review queue | pg/PGlite | DB | 4 | Text deadlines never expire; no category, income or gender rules; no "likely eligible" | Discard | FA-5 · `content.opportunities` (`03` §10) | — | — |
| 23 | `src/lib/ai-router/index.ts` | "AI router" returning fixed syllabus, explanation, mind map, quiz and videos | — | Fixture | 2 | No provider; type shapes resemble block fields | Discard (P-AI is the router) | P-AI · `src/lib/ai/` | — | — |
| 24 | `src/lib/pedagogy/doubt-saathi.ts` | Builds a tutor prompt: Socratic, Indian analogy, end with a check | — | — | 4 | Puts the child's full name and streak into the prompt | Port with changes (the guardrail wording only, into versioned prompt text; no child identifiers) | P-AI · `prompts/family.resolve.*` (`08` §7) | S | Privacy |
| 25 | `src/app/doubt-saathi/page.tsx` | Chat UI with keyword-matched canned replies and inline checks | framer-motion | Canned | None | An open chat, which `02` §13 rules out | Discard (follow-ups stay on the topic inside the response) | — | — | Child safety |
| 26 | `src/lib/homework/index.ts` + `src/app/homework-helper/page.tsx` | Three-step method (givens → SI units → formula) that leaves the final calculation to the student | — | Two templates by keyword | 4 | Keyword routing; nothing computed | Port with changes (the "your step" pattern, with numbers recomputed by the calculator) | FA-3 · **Worked example** (hint-first) | M | Accuracy |
| 27 | `src/app/scan/page.tsx` | Syllabus photo scan: confidence score, clarifying question, chapter list to confirm | framer-motion | Fixed result after a timer | 3 (lib) | The file is never read | Port with changes (the confirmation screen: low-confidence lines asked as questions); rebuild the pipeline | FA-3 · `syllabus/` family upload (`03` §9) | M | Photos of children |
| 28 | `src/app/plan/page.tsx` + `src/lib/plans-quizzes/index.ts` | Day-by-day plan to an exam; missed days reflow from today with no backlog wall; quiz → stars, streak, vault | pg/PGlite | Fixture / DB | 5 | Topics cycle round; dates use UTC (wrong day in India before 05:30); streak and stars | Port with changes (the reflow rule, rewritten with tests on `family.*`; no streak) | FA-4 · revision plan (`learn/`) | M | — |
| 29 | `src/app/vault/page.tsx` | Learning Vault timeline and an export modal | framer-motion | Fixture | None | "100% Family Owned … Portable" claims | Port with changes (timeline visual; items with `/verify/<token>` links) | FA-5 · `vault/` | M | Claims |
| 30 | `src/app/toolkit/page.tsx` + `src/lib/toolkit/index.ts` | Exam countdown, paper-pattern marks sum (80-mark check), days per chapter | — | Computed | 4 | Pure, tested functions; the pattern must come from the board's published one | Port with changes | FA-5 · exam-day kit | S | — |
| 31 | `src/app/videos/page.tsx` + `src/lib/videos/index.ts` | "Curated" video list with filters and a tap-to-play privacy-enhanced embed | — | Fixture | 4 | 6 of 8 IDs do not exist; channels misnamed; `autoplay=1`; hot-linked Unsplash pictures | Discard the data; port with changes the tap-to-load player (no autoplay, the honest note) | FA-4 · `video/` (`03` §8) · **Video** | S | Provenance, third parties |
| 32 | `src/app/insight/page.tsx` | Parent "insight" summary for the active child | framer-motion | Fixture | None | Fixture text | Rebuild | FA-4 · weekly summary | M | — |
| 33 | `src/app/school-connect/page.tsx` + `src/lib/school-connect/index.ts` | Mock school connect (OTP 123456 or 000000), mirrored attendance, marks and fees, disconnect summary | pg/PGlite | Mock | 3 | Names a real school brand; fake OTP; data never from a school | Discard (keep only the idea of a "what stays, what goes" screen on unlink) | FA-1 · `link/` (School Link, `03` §4); FA-2 | — | Impersonation |
| 34 | `src/app/login/page.tsx` + `src/lib/auth/index.ts` | Phone OTP sign-in and a 30-day session token | jose | — | 2 | Universal code shown on screen; hard-coded fallback key; not wired | Discard | FA-1 · `accounts/` (email code, `03` §3) | — | Security |
| 35 | `src/lib/db/index.ts` + `migrations/001_cx_initial_schema.sql` | PGlite/pg client; runs every SQL file on every start; 9 `cx_` tables | pg, PGlite | — | 1 | No RLS, schemas or consent; random string ids | Discard | FA-1 · `family.*` migrations (`03` §5) | — | Privacy |
| 36 | `src/lib/notifications/index.ts` | At most 2 notifications per child per day; Sunday digest grouping; stubbed WhatsApp queue | pg/PGlite | DB | 4 | The cap is a good rule | Port with changes (the cap as a requirement, on core's notification and send-gate paths) | FA-4 · reminders and weekly summary | S | Messaging gate |
| 37 | `src/app/api/consumer/route.ts` | One POST route switching on `action` | Next.js | — | None | No session check; returns raw error messages | Discard (one route per action behind the family session) | — | — | Security |
| 38 | `test/**`, `scripts/capture_*`, `src/app/showcase/` | Unit tests of the stubs, two e2e specs, screenshot scripts, a primitives demo | Vitest, Playwright | — | — | They test discarded code | Discard (reuse the toolkit and homework test cases as fixtures for rows 26 and 30) | — | — | — |

**Totals:** port as-is 0 · port with changes 19 · rebuild 6 · discard 13.

**What each wave's prompt should name** (`07` asks this of FA-3 to FA-6):

| Wave | Rows |
|---|---|
| FA-1 | 2, 3, 4, 7, 8, 15 |
| P-AI | 24 |
| FA-3 | 10, 12, 16, 17, 26, 27 |
| FA-4 | 5, 11, 13, 28, 31, 32, 36 |
| FA-5 | 19, 20, 29, 30 |
| FA-6 | 18 |

## 6. Design moments worth keeping

Judged against `09` from the pictures in `pictures/`. Each one survives only in the form described: rebuilt on the
v5 tokens, with transforms and opacity only, and reduced motion honoured.

| # | Moment | Where to see it | Why it works (09) | Keep as |
|---|---|---|---|---|
| 1 | The raised centre "Understand" button in the mobile bottom bar | `home-390`, `quiz-390` | Learning first (§1): the main action is the learning loop, one thumb away | The family shell's bottom bar |
| 2 | The greeting band: a gradient header with the child's name and big display numbers | `home-1440`, `home-390` | §2: gradients for headers and progress; large display numbers | The home header, showing **topics mastered this week** and the next exam countdown, not XP or streak |
| 3 | The lesson as stacked blocks, each with a coloured left edge and a small label (example, Indian analogy, steps, check, English phrase) | `explain-1440` | The block-based response (§5, the guided-learning pattern), no wall of text (§6) | The block renderers' shared frame in `components/family/blocks/` |
| 4 | Numbered steps with the formula in its own highlighted line, and vocabulary as EN↔HI pairs | `explain-1440` | Hierarchy for young readers; Hindi as a first language (§2) | The Explanation and Worked example blocks; the English moment |
| 5 | The motion lab: a dark panel with live readouts, each with its formula beside the number | `explain-sim-390`, `explain-sim-1440` | Depth that teaches, not decoration (§3); interactive first (§5, Brilliant) | The in-house Simulation block (corrected physics) |
| 6 | Subject colours carried through chips, card edges and coloured shadows | `home-1440` | §2: one colour per subject, so a child knows the subject before reading | The family register's subject colours, mapped to v5 tokens |
| 7 | Tactile buttons that press down and cards that lift | All pages | §2: 2.5D depth from layering | Translate and shadow only (not border width), off under reduced motion |
| 8 | The journey path of topics (done, active, locked) | `home-390` | Progress felt (§1) | The syllabus progress map, moved only by checked mastery; no XP, no chest |
| 9 | Practice with large lettered options, a slim progress bar and an explanation after each answer | `quiz-390`, `quiz-1440` | Short sets, instant feedback (§5, Duolingo) | The Practice block; feedback says "try again" before it reveals |
| 10 | English dialogue as chat bubbles with the Hindi line under each English line; vocabulary cards with IPA | `english-1440`, `english-390` | Class-adaptive, supportive language (§2) | The English moment and the programme's day screen |
| 11 | The opportunity card: type chip, deadline pill, "checked on" line and an official-portal button | `opportunities-1440` | Designed components instead of raw links (§6) | The opportunities card, fed from `content.opportunities` with "likely eligible" wording |
| 12 | Mind-map edges that draw themselves | `/explain` mind-map tab (running app; no picture) | "A diagram drawing itself" (§3 motion) | The Diagram block's entrance, a simple fade under reduced motion |

**Not to keep:** streak and XP chips in the header; the mastery chest; the mascot; confetti on ordinary correct
answers; "Live Lab", "Consumer" and "Syllabus v2" labels (internal jargon, banned by `09` §6); 10–11 px grey uppercase
micro-labels (they fail contrast); the crowded top bar.

## 7. Verdict

**The weekend prototype does not meet `02`, `03` or `09`.** It is a good visual sketch, and the port should treat it
as one.

### Against `02` (product)

| `02` requires | The prototype | Status |
|---|---|---|
| A dynamic learning loop from topic, search, question or photo, with typed blocks (§4) | Three hard-coded lessons; the ask box reloads to them whatever is typed; the photo is never read | ✗ |
| Progress only on checked understanding; mastered = right on two days a week apart (§4.1–4.2) | Progress is quiz score, stars and streak | ✗ |
| Not an open chat (§13) | "Doubt Saathi" is an open chat | ✗ |
| Video found per topic, honest player, no autoplay (§5) | Invented library, autoplay | ✗ |
| Measured English progress; the fluency guarantee withdrawn (§6.2) | Fake speech score; Pre-A1 → B1 in 90 days | ✗ |
| Careers from a vetted graph, each step with a source (§7) | Four hand-written paths, one invented step | ✗ |
| Opportunities approved, dated, "likely eligible", stale ones hidden (§8) | Stalled and closed items shown open; no conditions | ✗ |
| School information through School Link (§9) | Mock with a real school's name | ✗ |
| Two children with different homes by class (§15.1) | Junior and senior registers exist | ✓ (as a pattern) |
| No ranks or leaderboards (§13) | None found | ✓ |

### Against `03` (architecture)

- **Identity (§3):** no family session or guard; the demo runs signed in.
- **Data (§5):** no `family`/`content` split, no RLS, full names stored.
- **AI (§7):** no AI platform; the prompt carries the child's identity.
- **Consent (§11):** no consent purposes; speech goes to a third party without one.
- **Routes (§14):** one unauthenticated API route.
- **App shell (§13):** no PWA, no data-saver mode.

None of this can be ported; it is built in FA-1 and P-AI as planned.

### Against `09` (experience and design)

| `09` | Result |
|---|---|
| §1 learning first, not engagement | ✗ Streak, XP and the chest are at the centre of home |
| §2 subject colours, rounded cards, 2.5D, Devanagari, class-adaptive | ✓ Mostly met, on the wrong palette (Tailwind, not v5) |
| §3 3D only where depth teaches, lazy, with a 2D fallback | ✓ No WebGL; the lab is 2.5D CSS. ✗ No reduced-motion fallback |
| §3 reduced motion turns into fades | ✗ Not honoured anywhere (§2.7) |
| §3 celebration only for real mastery | ✗ Confetti after every quiz, every correct English answer and every simulated speaking attempt |
| §4 LCP ≤ 2.5 s | ✗ 3 of 7 pages (2.56–2.86 s) |
| §4 INP ≤ 200 ms (TBT as the lab proxy) | ✓ TBT 0 ms |
| §4 CLS ≤ 0.1 | ✓ 0.000 |
| §4 ≤ 200 KB JS on first load; no 3D library in it | ~ 144–156 KB per route in the build, but 209–219 KB downloaded with prefetching; ✓ no 3D library |
| §6 no English-only screen with Hindi on | ✗ `/opportunities` 34%, `/careers` 18% |
| §6 no internal jargon or build labels | ✗ "Consumer", "Syllabus v2", "Founder Review Queue" on family screens |
| §6 no raw URLs as text | ✗ The candidate queue prints source URLs |
| §6 no `alert()`, no leaderboards, skeletons for loading | ✓ |
| CLAUDE.md: AA contrast, 44 px targets, no sideways scroll at 360–1440 | ✗ Contrast on every page; 4–27 small targets per page; sideways scroll everywhere |

### Gaps a port must close

1. **Data:** every fact (opportunities, careers, videos, syllabus) comes from `content.*` with a source and a
   "checked on" date, or it is not shown. No prototype data is carried over.
2. **Learning loop:** resolver blocks render from data. Progress moves only on checked mastery. Feedback is hint-first.
3. **Engagement:** remove streaks, XP and the chest. Celebrate only real mastery.
4. **Motion:** honour reduced motion everywhere, confetti included. Animate transform and opacity only.
5. **Hindi:** add Hindi fields for content data, set `<html lang>` to the language, and add a CI test that a Hindi
   screen has no English-only lines (by-design English learning text excepted).
6. **Accessibility:** AA contrast on v5 tokens, 44 px targets, labels on every control.
7. **Layout:** a shell that fits 360–1,440 px with no sideways scroll; fewer top-level items, from the registry.
8. **Performance:** content visible without waiting for JavaScript; no prefetch of every route; budgets checked by
   Lighthouse in the harness.
9. **Privacy:** first names only. Child identifiers never go into prompts. Voice only through the AI platform with a
   consent purpose. No third-party pictures; no autoplay.
10. **Security:** family accounts and sessions from FA-1, one guarded route per action, and no prototype auth, API or
    keys.
11. **Simulation:** correct physics (constant acceleration, or a model that handles the cap), labelled controls, a
    still fallback.

## 8. How this audit was run

- **Read-only.** The prototype folder was fingerprinted with `shasum` over every file outside `node_modules` and
  `.next/cache` (388 files) before the audit and again after it: **unchanged**. Install, typecheck, tests and build
  ran on a copy in a scratch folder.
- **Tools:** Lighthouse 12.8.2; Playwright 1.56.1 driving Chrome for Testing 156; axe-core 4.10.3; license-checker
  25.0.1; a redacted pattern scan for secrets (§2.4); `npm audit`.
- **Pictures** (`pictures/`, WebP, 16 files, 1.12 MB in all):
  - `home`, `explain`, `explain-sim` (the "3D Sim Lab" tab), `english`, `careers`, `quiz` and `opportunities`, each
    at `-390` and `-1440`;
  - `home-390-hi` and `opportunities-390-hi` in Hindi.
  - `/` and `/family` render the same component, so `home` stands for both.
  - All are full-page and in English unless marked `-hi`.
  - Widths are 608 px (529 px in Hindi) and 1,737 px because of the overflow (§2.9).
- **Not done:** INP in the field (a lab run cannot measure it); pictures at 360 px and with reduced motion on (motion
  was measured instead, §2.7); the routes outside the brief (`/plan`, `/scan`, `/vault` and the others) were read in
  code, not measured.
