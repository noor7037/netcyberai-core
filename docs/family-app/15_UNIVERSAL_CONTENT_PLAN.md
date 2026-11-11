# Universal content plan: every subject, Classes 1–12

Written by Claude Code (build lead), 11 Nov 2026, for Noor and the supervisor. It says how the rest of the
universal content gets built after the Class 10 Science pilot (PRs #406–#417): who writes, who makes images, who
reviews, how it is published, and what each outside AI is given. The handover pack for the outside AIs is in
`docs/family-app/handover/`.

## 1. What "done" looks like (the Class 10 Science standard, now the standard for everything)

Every chapter is one bilingual JSON file in `reader/content/c<NN>/<subject>/<chapter key>.json` that passes
`node reader/scripts/check.mjs`, plus its labs in `labs/defs/…`, plus the founder's images in `labs/assets/…`.
Every topic has:

- the Rosenshine flow: recall → hook → explain (plain words first, then board wording) → visuals → worked example and
  a faded "your turn" → lab → practice with a hint → common mistake → key points → board tip → close;
- **visuals that explain the whole topic** (everything defined, everything visual): animated SVG diagrams with labels
  that switch language, plus real concept images where the real thing matters;
- **its own lab** where the topic has an NCERT activity, a natural experiment or a simulation, otherwise a one-line
  reason;
- an 8-question check (5 drawn, 4 to pass, calm retry), every option explained, distractors that are real mistakes;
- spoken Hindi with English words, NCERT terms kept (`reader/CONTRACT.md` §1).

Every chapter has a 20-item test in the CBSE 50/20/30 mix (Classes 9–12) and a 7-day "Remember it?" card. The age-band
rules (`12_CONTENT_FACTORY.md` band table, feedback §5) change the format for younger classes — see §6.

## 2. Who does what (decision)

| Role | Who | Does | Never does |
| --- | --- | --- | --- |
| Writer | One outside AI per subject (Google Antigravity first choice; ChatGPT or Gemini for chat-only work) | Writes the chapter files to the contract, runs the checker if it can, fixes until it passes | Pushes to GitHub, edits engine code, invents images or lab templates |
| Second reader | A different AI from the writer | Reads science/maths accuracy and the Hindi with `prompts/content-factory/REVIEW.md` | Rewrites the chapter |
| Images | Noor | Generates the images from the subject's image plan, names them exactly | Hands images to the writer AI |
| Lead | Claude Code | Image plans, review, fixes, image placement, new lab templates, publishing PRs, the feedback file | Writes whole chapters again (only fixes) |
| Integration | The supervisor | Merges PRs, wires new books into the Family app (`src/lib/family/books.ts`), live checks | — |

**Why an outside AI writes and Claude Code reviews:** writing 13 chapters cost Claude Code about 5–6 million agent
tokens; reviewing a chapter that already passes the checker costs a small fraction of that. The checker enforces the
mechanical rules, so the outside AI corrects itself before anyone reads it.

## 3. GitHub access: no (decision)

Do **not** give any outside AI GitHub access or a token. Reasons: a token can push to `main` (there is no branch
protection and Actions is off), content needs a human-quality review before children see it, and every published
change must come through a PR the supervisor merges.

How files move instead:

1. **Google Antigravity** (preferred): it runs on Noor's Mac. Open this repository folder in it, read-only for code,
   and let it write only into `content-inbox/<class>-<subject>/` (git-ignored). It can run `node reader/scripts/check.mjs`
   and `node labs/scripts/check.mjs` itself and fix until both pass. No git commands.
2. **ChatGPT / Gemini / Meta AI** (chat only): they reply one topic at a time as JSON (§5). Noor saves each reply as a
   file in `content-inbox/<class>-<subject>/<chapter key>/` (one file per topic plus `chapter.json` and `test.json`), or
   pastes them into one Google Doc per chapter and shares the link with me.
3. Claude Code picks the folder up, joins the parts, runs the checkers, reviews, fixes, places images and opens the PR.

## 4. Images: Noor makes them, and gives them to Claude Code (decision)

- Before a subject starts, Claude Code writes its **image plan** (CSV + short guide), to the concept-image standard:
  every image explains a whole idea; 3D objects come as a set of views (front, side, three-quarter, top), cutaways
  and exploded views; processes come as frames; applications as real Indian scenes; no words in any image (the app
  adds bilingual numbered labels).
- The writer AI is given the **same plan** and refers to images only by their planned file names, with the labels
  (pins) the plan lists. It never invents an image.
- Noor generates the images and gives the folder to **Claude Code**, not to the writer AI. Claude Code compresses
  them (WebP 1280 + 640), checks each against its brief, places the label pins by looking at the real picture, and
  reports wrong images (the Class 10 Science review found eight).
- An image can arrive after the chapter is written; the chapter is still checked with the planned names, and any
  image that does not match its brief is flagged before publishing.

The plan for the next subject is `data/content/universal/image-plans/Class-10-Mathematics-images.csv` (and `.md`). The
prompt that produces image plans for any other subject is `handover/PROMPT_IMAGE_PLAN.md`.

## 5. The build loop for one subject

| Step | Who | Output | Gate |
| --- | --- | --- | --- |
| 0. Plan | Claude Code | Image plan; chapter list from `data/content/universal/syllabus/chapters.csv`; band format; lab template gaps | — |
| 1. Images | Noor (in parallel) | Image files named per the plan | Claude Code checks each against its brief |
| 2. Write | Writer AI, one chapter per session (§2 of the handover README) | Chapter JSON + labs defs JSON in the inbox | Both checkers pass (Antigravity) or Claude Code runs them |
| 3. Second read | A second AI | A list of accuracy and Hindi issues | — |
| 4. Review and fix | Claude Code | Fixed chapter; every answer key re-solved; labs played through; browser smoke at 390/1280 in EN/HI | 0 checker problems, smoke clean |
| 5. Publish | Claude Code → supervisor | One PR per subject (or per 4–6 chapters); supervisor wires the book into the Family app | Noor tries it on the phone |
| 6. Feedback | Claude Code | `handover/feedback/<subject>-<n>.md` for the writer AI; new rules added to `handover/LESSONS.md` | The next session starts with LESSONS + the feedback |

**The feedback loop** is what stops repeat mistakes: every review ends with a numbered list (what was wrong, where,
the rule, a corrected example). Generic rules go into `LESSONS.md`, which every writer session reads first. When a rule
can be checked by a program, Claude Code adds it to `reader/scripts/check.mjs` so no AI can repeat it.

## 6. Order of work (waves)

| Wave | Subjects | Why first | Format |
| --- | --- | --- | --- |
| A (now) | Class 10: **Mathematics (next)**, Social Science (History, Geography, Political Science, Economics), English, Hindi | Board year; children and parents pay attention here first | Secondary 9–10 contract (as Science) |
| B | Class 9: Science, Mathematics, Social Science, English, Hindi | Same band, same contract, feeds Class 10 | Secondary 9–10 |
| C | Classes 11–12: Physics, Chemistry, Biology, Mathematics, Accountancy, Economics, Business Studies, Computer Science, then the humanities | Second board year; needs evaluate/create items and numericals with faded examples | Secondary 11–12 (same contract, more evaluate/create) |
| D | Classes 6–8: Science, Mathematics, Social Science, English, Hindi, Sanskrit | New NCERT books; inquiry labs | Middle-band contract (to write before the wave: shorter tests, 4/5 gate, caselets) |
| E | Classes 3–5: Mathematics, EVS, English, Hindi | Activity and discovery | Preparatory contract (3/5 gate, audio first, no board items) |
| F | Classes 1–2 | Play, no tests (NCF-FS) | Foundational contract (Class 1 and Class 2 apart, NIPUN lines, picture checks) |
| Gaps | Urdu (all classes), `kham1`/`klss1` chapters, Class 12 PE, CBSE subjects with no NCERT book | From the 406–409 review | Source to be decided per subject |

Each new band's contract is a short addition to `reader/CONTRACT.md` and its checker, written by Claude Code before the
wave starts (topic minutes, gate, test size and mix, item types, Bloom mix).

## 7. Interactive things and where they go

| Kind | How it is built | Who decides placement |
| --- | --- | --- |
| Animated diagram | Inline SVG in the chapter JSON (`diagram` step), labels from `texts`, CSS motion with names unique to that diagram | Writer AI, one or more per topic |
| Concept image | Noor's image, `figure` step with frames and numbered pins | Image plan (Claude Code), placed by the writer |
| Lab / simulation | A lab in `labs/defs` on one of the 57 templates (`labs/catalogue.json`), embedded with a `lab` step after the idea is taught | Writer AI; needs a template that models it honestly |
| New interaction | A new template (like `balance` and `scatter` in Class 10 Science) | Writer AI lists it in `lab_requests`; Claude Code builds it |
| 3D object | The `solids`, `molecule`, `atom`, `body`, `globe` templates, or a multi-view image set | Image plan + writer |

The writer AI never writes JavaScript. If no template fits, it writes a `lab_requests` entry (what the child would do,
what they should see, which NCERT activity) and gives the topic a `why_no_lab` until the template exists.

## 8. Research the writer AI must do (and must not)

- **Must use:** the NCERT textbook of the class and subject (PDF links in `data/content/universal/syllabus/books.csv`,
  2025-26 editions), the CBSE curriculum for the current session (what is deleted or added), the NCERT Learning
  Outcomes, NCERT Exemplar and CBSE sample papers (for question styles), the chapter's NCERT activities with their real
  numbers.
- **Must not:** copy NCERT sentences, figures or exercise wording; invent statistics; quote coaching material; use
  content that is not in the current syllabus without marking it as "for the curious".

## 9. Quality gates before a chapter is published

1. `node reader/scripts/check.mjs` and `node labs/scripts/check.mjs`: 0 problems.
2. Every answer key re-solved by the reviewer; every numerical worked independently.
3. Every new lab played through in guided mode in English and Hindi.
4. Every diagram looked at in both languages at 360 px; physics, chemistry and geometry exact.
5. `node reader/scripts/smoke.mjs`: every topic and the test at 390 and 1280 px, EN and HI, no errors.
6. Images: each checked against its brief; mismatches listed for Noor.
7. The PR lists what changed, what was checked and what was not.

## 10. Effort and timing (estimates, not promises)

- Writer AI: one chapter per session, about 2–4 hours of AI time with retries; a 14-chapter subject in 1–2 weeks of
  Noor's sessions.
- Claude Code: review and fix about 20–40 minutes per chapter; a subject in one PR.
- Images: about 100–180 files per science or maths subject (the Maths plan has the exact count).
