# 12 — The universal lessons and the content factory

**Who / for whom / what:** the build lead (Claude Code) for Noor and the supervisor session. This file sets how
NetCyberAI's own lessons are written (by any AI), checked, brought into the app and taught to a child topic by topic.
**How to work:** it builds on what exists (`src/lib/family/blocks.ts`, the catalog of C250/C262, Understand of C251,
progress of C252, every class and board of C263/C264). Nothing here changes the school product. Status: **proposed**;
the Decision Log row comes with the first PR.

---

## 1. What we keep from the outside brief, and what we do not

The founder shared a brief written by another AI tool. Its goal is right; parts of it do not fit the app or are not
safe. Decisions, with reasons:

| Brief says | Decision | Why |
|---|---|---|
| A tutor that teaches step by step, hooks, Indian analogies, checks in between | **Keep.** It is the lesson flow in §4. | It is how a good tutor teaches. |
| Explain every wrong answer | **Keep, stricter.** Every wrong option has its own explanation (§5.4). | The app already shows `why` and `wrong[]`; authored lessons must fill every one. |
| "Master the subject in a single read" | **Change.** One read must give full *understanding*; *mastery* stays as the app defines it: right on two days at least 7 days apart (C252). | No reading makes knowledge stay. Remembering comes from being asked again later. Promising one-read mastery to parents would be a false claim. |
| Three.js 3D models in every topic | **Not now.** Our own SVG diagrams first; a small set of interactive pieces built by us later (§8, phase 3); no AI-written 3D or code. | Most families use low-cost Android phones; C251 rule: only our components draw, no model output runs as code. |
| English, Hindi, Hinglish and regional languages | **English and Hindi.** Hindi is a separate file of the same lesson, reviewed by a Hindi reader before it is labelled reviewed. Others later. | Hinglish has no fixed spelling; a regional language needs a reviewer we do not yet have. |
| Paths `content/lessons/...`, files `CLAUDE_CONTENT_LAYER_DIRECTIVE.md` etc. | **Ignore.** Those files do not exist. Lessons live under `data/content/universal/` (§6). | |
| "No rate limits or security blocks during testing" | **Rejected.** | Children's data and paid AI keys; the gates stay on in every environment. |
| Content studio in Control | **Keep, inside Control → Content** (a lesson preview beside approval), not a new site. | One place for review and release (C250). |

**Uncommitted files on this machine** (`data/content/topic-packs/`, `data/content/blueprints/`,
`scripts/validate_topic_packs.ts`, `test/content/topic-packs.test.ts`): made by that tool for CBSE Class 10 Science
only, in a shape the app cannot draw (`model_3d`, `interactive_visual_blocks`). They are not merged. Their two
chapters can be re-made in the format below as the first test batch; the files are left as they are until the founder
says what to do with them.

---

## 2. What "universal" means

- **One default track for every child**, whatever the board: the *universal* lessons. A child sees them from day one.
- **Its spine is NCERT's chapter order and learning outcomes**, because CBSE teaches from NCERT's books, many state
  boards adopt or adapt them, and NCERT publishes learning outcomes for every class. The chapter and topic list is the
  catalog the app already holds (C250, C262), extended class by class from official documents, never from memory.
- **Every word of a lesson is our own.** No sentence, exercise, figure or question is copied from a textbook, a guide
  or a past paper (§7). Chapter and topic titles may follow the official list.
- **A board's or a school's own syllabus is a second layer** ("personalised syllabus", already planned): it maps its
  chapters to universal topic keys, changes the order, hides what it does not teach, and adds "extra" topics written
  in the same format. The lessons themselves are shared.
- **Keys** (stable forever, never re-used):
  - chapter: `u.c10.science.ch09`
  - topic: `u.c10.science.ch09.t02`
  - Class part: `nur`, `lkg`, `ukg`, `c01` … `c12`. Subject: the app's ids (`src/lib/family/subjects.ts`:
    `mathematics`, `science`, `evs`, `social_science`, `english`, `hindi`, `sanskrit`, `physics`, `chemistry`,
    `biology`, `accountancy`, `business_studies`, `economics`, `history`, `geography`, `political_science`,
    `computer_science`, `informatics_practices`, `psychology`, `sociology`).
- **Nursery to UKG are not in this format.** They learn by play with a parent (audio, pictures, tapping, tracing). Their
  format is a separate small spec (Wave B, C263). Classes 1 and 2 use this format with short steps and picture-word
  checks.

---

## 3. The child's path

```
Study → Subject → Chapter list
          Chapter 1  ✓ done
          Chapter 2  ← open
             Topic 2.1  ✓ passed
             Topic 2.2  ← open:  Teach me  |  Read
             Topic 2.3  🔒 opens when 2.2's check is passed
             Chapter test 🔒 opens when every topic is passed
          Chapter 3  🔒 opens when Chapter 2's test is passed (or the parent opens it)
```

**Inside a topic** (8 to 15 minutes), one step on the screen at a time, "Next" to go on:

1. **Hook** — a real situation or puzzle the child already knows ("Why does a spoon look broken in a glass of water?").
2. **Explain** — the idea in small parts, in plain words, with an Indian everyday example; new words with their Hindi.
3. **See it** — a diagram (our SVG). Later, an interactive piece the child moves (§8 phase 3).
4. **Worked example** — solved step by step; every number is recomputed by our calculator before it is shown.
5. **Quick check** — 1 to 3 questions in the middle. A wrong answer explains itself at once; the child goes on.
6. **Common mistake** — "Many students think … Actually … because …".
7. **Remember / exam tip** — key points, one memory hook; for Classes 9–12, how the board asks it.
8. **Practice** — 3 to 6 questions, easy to hard, each wrong option explained.
9. **English moment** (optional) and **sources** (official pages only).
10. **Topic check (the gate)** — 5 questions drawn from the topic's pool of 8. **4 of 5 right opens the next topic.**
    A wrong answer shows why it is wrong and why the right one is right. Below 4: the step that the wrong answers point
    to (by their mistake tag) is shown again in a new way, then 5 fresh questions.

**"Teach me"** reads each step aloud (the phone's own voice, already in the app) and pauses at every question.
**"Read"** shows the same steps without the voice. **"Ask a doubt"** on any step sends the child's question to
Understand *with that step's text as context*, so the AI explains our lesson rather than inventing its own.

**Chapter test** — 10 questions drawn from a pool of 20 (8 from 15 for Classes 1–5), across all topics, every wrong
answer explained. 70 % passes the chapter. The result shows which topics to revisit.

**Mastered** stays the C252 rule. Seven days after a topic is passed, Home offers a 3-question "remember it?" card;
right on that second day makes it mastered. This is what makes it stay.

**Locks:** a parent can open any locked topic or chapter from the parent area (a child who already knows it should
not be held back). Answer keys never reach the phone (C251): every answer is checked on the server.

---

## 4. The lesson file (format version 2)

One file per topic and one per chapter, per language. The lesson steps are the app's existing block shapes
(`src/lib/family/blocks.ts`) plus three new small blocks. Everything is plain text: no Markdown, no HTML, no LaTeX.
Maths uses Unicode (x², √, π, ×, ÷, ≤, ½ or 3/4).

### 4.1 Chapter file `chapter.en.json`

```json
{
  "format": "netcyberai.lesson",
  "format_version": 2,
  "kind": "chapter",
  "language": "en",
  "class_level": 10,
  "subject": "science",
  "chapter_key": "u.c10.science.ch09",
  "chapter_number": 9,
  "title": "Light: Reflection and Refraction",
  "big_idea": "One or two sentences: what the child will be able to do after this chapter.",
  "prerequisite_keys": ["u.c08.science.ch10"],
  "topics": [
    { "key": "u.c10.science.ch09.t01", "order": 1, "title": "…" },
    { "key": "u.c10.science.ch09.t02", "order": 2, "title": "…" }
  ],
  "chapter_test": { "pass_percent": 70, "draw": 10, "items": [ "20 question items (§4.4), each with topic_key" ] },
  "made_by": { "tool": "Gemini / ChatGPT / …", "date": "2026-11-05", "prompt": "G1" }
}
```

### 4.2 Topic file `t02.en.json`

```json
{
  "format": "netcyberai.lesson",
  "format_version": 2,
  "kind": "topic",
  "language": "en",
  "class_level": 10,
  "subject": "science",
  "chapter_key": "u.c10.science.ch09",
  "topic_key": "u.c10.science.ch09.t02",
  "order": 2,
  "title": "Refraction: why light bends",
  "minutes": 12,
  "outcomes": ["Explain why light bends when it passes from air into water or glass.", "…"],
  "misconceptions": [
    { "id": "m1", "belief": "Light bends because the glass pulls it.", "truth": "…", "fix": "…" }
  ],
  "steps": [ "blocks in teaching order (§4.3)" ],
  "topic_check": { "pass": 4, "draw": 5, "items": [ "8 question items (§4.4)" ] },
  "visual_ideas": ["What an animation of this topic should show, for our designers (not drawn as is)."],
  "made_by": { "tool": "…", "date": "…", "prompt": "G1" }
}
```

### 4.3 Steps (blocks)

Existing blocks keep their exact shape and limits; the new ones are marked **new**.

| Block | Fields and limits | Count in a topic |
|---|---|---|
| `hook` **new** | `scene` ≤ 400, `question` ≤ 200 | exactly 1, first |
| `explanation` | `title` ≤ 120, `idea` ≤ 300, `example` ≤ 600, `steps` 2–6 × ≤ 400, `terms` 0–8 of `{en ≤ 60, local ≤ 60}` (local = Hindi in Devanagari) | 1–4 (one per idea) |
| `diagram` | `title` ≤ 120, `kind` `flow`/`cycle`, `nodes` 2–8 `{id [a-z0-9_-] ≤ 20, label ≤ 60}`, `edges` 1–12 `{from, to, label? ≤ 40}` | 0–2 |
| `worked_example` | `problem` ≤ 500, `steps` 1–8 `{text ≤ 400, expression?, result?}`, `answer` ≤ 200. `expression` uses only digits, `+ - * / ^ ( ) . %`, and `result` must equal it | 0–3 (≥ 1 in Maths, Physics, Chemistry, Accountancy) |
| `check` | `items` 1–3 (§4.4) | 1–2, after an explanation |
| `misconception` **new** | `belief` ≤ 200, `truth` ≤ 300, `why` ≤ 400, `ref` = a misconception id | 1–3 |
| `key_points` | `points` 2–6 × ≤ 240 | exactly 1 |
| `exam_tip` **new** | `tip` ≤ 300, `memory_hook` ≤ 200 (optional) | 0–1 (1 for Classes 9–12) |
| `practice` | `items` 3–6 (§4.4), easy → hard | exactly 1 |
| `english_moment` | `words` 1–3 `{en ≤ 40, meaning ≤ 80}`, `sentence`, `pattern`, `sayIt` ≤ 200 | 0–1 |
| `sources` | `links` 1–4 `{label ≤ 120, url}`; https on ncert.nic.in, cbseacademic.nic.in, cbse.gov.in, diksha.gov.in, epathshala.nic.in, education.gov.in only | 0–1 |

Order: hook → (explanation → diagram? → worked_example? → check?) repeated per idea → misconception(s) → key_points →
exam_tip → practice → english_moment → sources.

### 4.4 A question item

```json
{
  "id": "t02-p3",
  "format": "mcq",
  "skill": "apply",
  "level": 2,
  "question": "≤ 400 characters",
  "passage": "only for format 'case': ≤ 900 characters",
  "options": ["…", "…", "…", "…"],
  "answer": 2,
  "hint": "A nudge that does not give the answer away. ≤ 300",
  "why": "Why the right answer is right, step by step. ≤ 400",
  "wrong": ["Why option A is wrong and what thinking leads to it", "…", "", "…"],
  "wrong_tags": ["m1", "", "", "m2"],
  "topic_key": "only in the chapter test",
  "expression": "optional: arithmetic whose value must equal the keyed option"
}
```

- `format`: `mcq` (2–4 options), `true_false` (2 options), `assertion_reason` (the four standard options), `case`
  (a short passage, then one question). Each is answered by tapping, so the server can check it.
- `skill`: `remember`, `understand`, `apply`, `analyse`. `level`: 1 easy, 2 medium, 3 hard.
- `answer` counts from 0. `wrong` has one entry per option, `""` at the answer. Every other entry is filled, says what
  the child probably thought, and why it fails. `wrong_tags` points a wrong option at a misconception id.
- Distractors are real mistakes children make, never silly options; no "all of the above"; options of similar length.

---

## 5. The quality bar

### 5.1 Checked by the computer (a file that fails is not imported)

1. The file parses and every block passes the app's own block check (`checkBlock`), unchanged.
2. Every `expression` (worked examples and items) recomputes to its stated result.
3. Counts in §4.3 hold; the topic check has 8 items, the chapter test 20 (15 for Classes 1–5).
4. Every wrong option has its own explanation; every `wrong_tags` id exists.
5. Keys match the manifest (§6); no topic is missing or extra; ids unique.
6. Plain text only: no Markdown, HTML, LaTeX, links outside the list, emoji, or placeholder text ("…", "TBD").
7. A Hindi file has the same keys, steps and item ids as its English file, and Devanagari in every text field.
8. Readability by class (sentence length, word length) within the band set for the class.
9. No answer is the same position in more than half of a pool; no two items are near-duplicates.

### 5.2 Checked by a second AI (a different company from the writer)

The review prompt (`prompts/content-factory/REVIEW.md`): solve every question without the key, compare, check every
fact, number, unit and Hindi term, rate the lesson against the rubric, and list exact fixes.

### 5.3 Checked by Claude Code at import

Re-solves every item independently, compares with both AIs, fixes or drops what disagrees, and writes a short report
per chapter in the PR.

### 5.4 The rubric (each 0–2; a topic needs 16 of 20 and no zero)

1. Correct: no factual, numeric, unit or sign error. (A zero here rejects the file.)
2. Matches the class: not above or below the syllabus of that class.
3. Hook makes the child want to know.
4. Each idea explained in small steps, one idea at a time.
5. Examples from Indian everyday life, varied, respectful, no stereotype.
6. Worked examples show every step, including the "why".
7. Checks test understanding, not just recall.
8. Wrong-answer explanations name the wrong thinking and repair it.
9. Exam tip / key points are exactly what a board answer needs.
10. Language a child of that class reads without help.

### 5.5 Who signs off

- Import is always `in_review`. Release needs a super_admin who did not import (C250's two-person rule): the founder,
  in Control → Content, with the lesson preview.
- The label is "Checked by NetCyberAI" only after that approval; never "reviewed by a teacher" unless a teacher did.
- After release, the app counts each item's answers. An item more than 60 % of children get wrong, or one wrong option
  chosen by most, is flagged in Control → Content for a look (the item may be wrong, or the teaching unclear).

---

## 6. The factory, step by step

```
 1 Plan        Claude Code      manifest per class+subject from the catalog: chapters, topics, keys, outcomes
 2 Write       any AI           GENERATE prompt + one chapter's manifest → chapter file + one file per topic
 3 Cross-check another AI       REVIEW prompt → fixes list
 4 Hand over   founder          paste the AI's output to Claude Code ("ingest these lessons"),
                                or save the files in data/content/universal/inbox/
 5 Validate    Claude Code      §5.1 checks, re-solve, fix, write the files in place, report
 6 PR          Claude Code      one PR per chapter batch; import into the test database as in_review
 7 Approve     founder          Control → Content: preview, approve to staff preview, then release
 8 Learn       the app          item statistics flag weak items back to step 5
```

**Folders**

```
data/content/universal/
  manifests/c10-science.json          the plan the AIs follow (step 1)
  inbox/                              what the AIs wrote, as given (step 4); emptied at step 6
  lessons/c10/science/ch09/chapter.en.json
  lessons/c10/science/ch09/t01.en.json
  lessons/c10/science/ch09/t01.hi.json
  reports/c10-science-ch09.md         step 5's report
```

**Working rules for the founder**

- One chapter per AI conversation. Give the AI the GENERATE prompt, then the chapter's manifest block. Ask for the
  chapter file first, then "next topic" until every topic file is written. Long answers get cut off; one topic per
  answer avoids that.
- Use one AI to write and a *different* AI to review (for example, write with Gemini, review with ChatGPT).
- Do not edit the JSON by hand; tell Claude Code what is wrong and it edits.
- Hindi: after the English chapter is approved, ask an AI with the HINDI prompt for the `.hi.json` files. They import
  as "Hindi wording not reviewed" until a Hindi reader marks them, the same rule as WhatsApp templates.

---

## 7. Copyright, safety and fairness rules (in every prompt)

- Original words only. Never copy or closely paraphrase a textbook, guide, coaching material or past paper; never
  reproduce an NCERT exercise or figure (NCERT prints "not to be republished", C262). "Board-style" means the *kind*
  of question, written new.
- No invented facts, dates, statistics, quotes or people. If unsure, leave it out.
- No brands, no religion or caste, no politics, no unsafe experiments (fire, mains electricity, chemicals at home are
  described, never suggested to try); names across India's regions and genders.
- No child's name or data in any lesson; the app never sends a child's name to an AI (C263).

---

## 8. Build plan (engineering)

Each phase is one or a few PRs, in order. Sizes are rough.

| Phase | What | Main files | Done when |
|---|---|---|---|
| **1 Format and import** | the v2 types and checker (reusing `checkBlock`), the three new blocks, item formats, `scripts/content/lessons.mjs` (validate, report, inbox → lessons), manifests for the first batch | `src/lib/content/lesson.ts`, `scripts/content/`, `test/content/` | the first chapter validates and its report reads right |
| **2 Database and Control** | `content.lessons` (topic, language, version, status, steps without keys) and `content.lesson_items` (keys sealed, server only), import as `in_review`, two-person approval, lesson preview in Control → Content, item statistics | one migration (test first, then production), Control → Content | the founder previews and releases one chapter |
| **3 The reader** | chapter list with locks, the topic player one step a screen, Teach me / Read, quick checks, the topic gate with re-teach, the chapter test, the 7-day "remember it?" card, parent unlock, Ask a doubt with the step as context | `src/app/family/…`, `src/components/family/lesson/` | a child completes a chapter on a phone at 360 px, Hindi complete, axe clean |
| **4 Interactive pieces** | a registry of our own SVG/canvas pieces chosen from the `visual_ideas` already collected (e.g. ray through glass, number line, fraction bar, circuit, balance), each with a fixed set of parameters and a diagram fallback; AI may only name a piece and its parameters | `src/components/family/interactive/` | runs smoothly on a low-cost phone; reduced motion respected |
| **5 Personalised syllabus** | board and school syllabus versions map to universal keys; order and extras follow the school | content mapping table, Study | a CBSE and a state-board child see their own order over the same lessons |

## 9. Production order and size

About 3,000–3,500 topics across Classes 1–12 (roughly 750 for 1–5, 1,400 for 6–10, 1,100 for 11–12), each about
20 questions: some 60,000–70,000 questions in English, the same again in Hindi. So it goes in batches, best first:

1. Class 10 Mathematics and Science (board year; catalog exists).
2. Class 9 Mathematics and Science; Class 12 Physics, Chemistry, Mathematics, Biology.
3. Classes 6–8 Mathematics and Science (catalog exists, C262).
4. Social Science 6–10, English grammar 6–10.
5. Classes 1–5 (Mathematics, EVS, English, Hindi).
6. Class 11, then commerce and humanities subjects.

Each batch's Hindi follows once its English is approved. The first batch is two chapters only, to prove the format,
prompts and reader before scaling.

## 10. Founder decisions

1. **Locks:** next topic opens at 4 of 5 in the topic check, next chapter at 70 % in the chapter test, and a parent
   can open anything. (Recommended.) Or: everything open, with the order only suggested.
2. **First batch:** Class 10 Science chapters 1 and 9 (re-made from the other tool's draft) or Class 10 Mathematics
   chapter 1.
3. **Reviewer of record:** AI cross-check plus the founder's approval in Control (recommended for now), or a paid
   subject teacher per batch, which would allow "reviewed by a teacher".
4. **The other tool's uncommitted files:** keep as input for the first batch, then delete; or delete now.
