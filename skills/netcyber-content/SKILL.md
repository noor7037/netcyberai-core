---
name: netcyber-content
description: Build NetCyberAI universal curriculum content — a complete bilingual (English + spoken Hindi) interactive chapter for any NCERT/CBSE class 1–12 and subject, with full-topic animated diagrams, concept images, embedded labs and simulations (building any missing lab type as a reusable template), mastery checks and a board-pattern test — to the Class 10 Science standard, checked by the project's own checkers. Use when asked to write, build, upgrade, review or plan a chapter, subject, topic, lab, diagram, question set or image plan for NetCyberAI.
---

# NetCyberAI content builder

You build learning content that is **fundamentally different from a textbook**: a child should understand a whole
topic from its visuals, *do* the idea in a lab, practise with feedback that explains every wrong answer, and be able to
learn alone, in English or in everyday spoken Hindi, on a shared phone. The reference standard is Class 10 Science
(`reader/content/c10/science/`), built and reviewed in PRs #406–#418.

You write **data, not app code** — with one exception: when a topic needs a lab that the library cannot model, you
build a new reusable lab template (§6). Strict checkers test everything you write; a reviewer re-solves every answer.

## 0. The outcome, and what "world-class" means here

For one chapter you deliver:

1. `content-inbox/c<NN>-<subject>/<chapter key>.json` — the chapter (format: `reader/CONTRACT.md`);
2. `content-inbox/c<NN>-<subject>/labs/<chapter key>.json` — its labs (format: `labs/CONTRACT.md` §3);
3. any new lab template in `labs/templates/<id>.js` plus `content-inbox/c<NN>-<subject>/catalogue-additions.json`;
4. `content-inbox/c<NN>-<subject>/DONE-<chapter key>.md` — what you built, the digest (`scripts/digest.mjs`), doubts.

World-class means, measurably: every NCERT section, activity (real numbers) and exercise theme covered; every topic
explained so a below-grade reader can follow, with diagrams that carry the whole idea and every key term; every
answer key correct; every distractor a real student mistake with its reason; Hindi a teacher would speak; labs that are
honest simulations; **0 checker problems**.

## 1. Before anything: load the context (in this order)

| Read | Why |
| --- | --- |
| `reader/CONTRACT.md` | The exact format and rules. It overrides everything else. |
| `docs/family-app/handover/LESSONS.md` | Mistakes already made. Repeating one is a failure. |
| newest file in `docs/family-app/handover/feedback/` | Fix-before-you-write notes from the last review. |
| `references/pedagogy.md` | The age-band rules (Class 1 ≠ Class 10). Pick the band of your class. |
| `references/subject-playbooks.md` | Your subject's specific moves (maths, science, social science, languages, commerce, CS). |
| `assets/example-topic.json`, `assets/example-labs.json` | The approved depth, voice and Hindi. |
| `references/lab-library.md` | Every lab type that already exists. |
| The NCERT chapter text: `labs/.work/txt/<book code><NN>.txt` (codes in `data/content/universal/syllabus/books.csv`) | The source of truth for coverage and activity numbers. |
| The image plan rows for the chapter: `data/content/universal/image-plans/<Class>-<Subject>-images.csv` | The only image names you may use. |

Read the other references when the phase needs them (they are named below). Do not load them all at once.

## 1a. Scope: a chapter, a subject, a stream or a whole class — and never stop before it is complete

The request names the scope: one chapter, one subject (every chapter of it), one stream of a class, or a whole class
(every stream, every subject, every chapter). **The list of work comes from the syllabus file, never from memory:**

```
node skills/netcyber-content/scripts/queue.mjs init --class 12                      # whole class: every stream and subject
node skills/netcyber-content/scripts/queue.mjs init --class 12 --stream science     # one stream (+ subjects common to all)
node skills/netcyber-content/scripts/queue.mjs init --class 10 --subject mathematics  # one subject
node skills/netcyber-content/scripts/queue.mjs init --class 10 --subject mathematics --chapter 3   # one chapter
```

Then loop, without stopping, until `status` says the run is complete:

1. `queue.mjs next` → the next item (a subject's image plan comes before its chapters).
2. Build it to this skill's standard (phases 1–7 below).
3. `queue.mjs done <id>` → the script re-runs every gate itself; it marks the item done **only if they pass**. If it
   says NOT DONE, fix and run it again. You may never mark anything done any other way.
4. Go to 1.

Rules for long runs:

- **Do not stop, summarise early, or ask whether to continue** while `queue.mjs status` shows items left. If the
  session or context runs out, the next session runs `queue.mjs status` and continues from the item in progress —
  nothing is lost (`content-inbox/QUEUE.json`).
- **No hallucinated scope:** never add a chapter that the queue did not give you, never skip one it did, never rename
  keys. If the NCERT text is missing, use the PDF link the scaffold prints.
- `queue.mjs block <id> "<reason>"` only for a real impossibility (for example the textbook does not exist yet). Then
  continue with the next item. Blocking to save effort is a failure.
- Keep quality constant: chapter 40 of a class run gets the same research, gates and self-review as chapter 1. Re-read
  `LESSONS.md` at the start of each subject.
- When the queue is complete, write `content-inbox/RUN-REPORT.md`: every item with its status, new lab templates,
  images requested, open doubts.

## 2. The pipeline (phases and gates)

For each chapter, run `node skills/netcyber-content/scripts/new_chapter.mjs <chapter key>` first: it creates the
inbox folder, copies the chapter's existing labs file as your starting labs file, and writes `SCAFFOLD.md` with the
syllabus row, the existing topics and labs, the planned images and the NCERT text path. Then:

| Phase | Do | Gate (do not continue until true) |
| --- | --- | --- |
| **1. Research** | Read the NCERT chapter end to end. List sections, definitions, laws/theorems, every activity with its real number, worked-example ideas, in-text questions, exercise themes. Check the current CBSE curriculum for deletions. List common student mistakes. (`references/research.md`) | Every NCERT section and activity appears in your list |
| **2. Design** | Write `PLAN.md`: 6–9 topics (one idea each, 10–15 min); per topic: the diagrams (what each shows; every key term placed), planned images, the lab (existing template, or a new one to build), worked + faded example, misconception, board tip; the chapter hook and where it is answered; the 20-item test blueprint (50/20/30 by marks). | Every topic has visuals + a lab decision; every hook is answered somewhere |
| **3. Build labs** | Reuse templates; build any missing template now (§6); write the chapter's labs file. (`references/labs.md`) | `node labs/scripts/check.mjs <labs file>` → 0 problems; new templates pass smoke |
| **4. Write topics** | One topic at a time, full depth, both languages (`references/hindi.md`, `references/diagrams.md`, `references/questions.md`). Parallelise if you can (§3). | Each topic passes the checker on its own (assemble + check) |
| **5. Test** | 20 items, CBSE 50/20/30 by marks, interleaved, every option explained. | Checker passes the mix |
| **6. Self-review** | Run `scripts/check_all.sh` and `scripts/digest.mjs`; then review against `references/review-rubric.md` as a strict examiner: re-solve every answer key, read every Hindi sentence aloud in your head, look at every diagram at 360 px. Fix. | 0 problems; rubric all green |
| **7. Hand off** | Write `DONE-<chapter key>.md` (what you built, the digest, new templates, every doubt — be honest), then `queue.mjs done <chapter key>`. | The queue accepts it |

## 3. Working with several agents (go faster without losing quality)

If your environment can run parallel agents (Antigravity Agent Manager, Claude Code subagents), split by **topic**
after Phase 2 — never before; the plan keeps the chapter coherent.

- **Lead agent:** phases 1–2, the labs (phase 3, because templates are shared), the test (phase 5), assembly, the
  self-review and the hand-off.
- **Topic agents (one per topic, at most 3–4 at a time):** each gets `PLAN.md`, `reader/CONTRACT.md`, `LESSONS.md`,
  the relevant references, and the topic's slice of the NCERT text; each writes `parts/tNN.json` (the full topic
  object) and runs `node skills/netcyber-content/scripts/assemble.mjs <inbox folder>` + the checker on the result.
- **One term list for all:** the lead writes `TERMS.md` (each concept's English term, its Hindi term, the gloss) in
  phase 2; every topic agent uses exactly those terms. This is what keeps Hindi consistent across agents.
- **Diagram prefixes:** each topic agent prefixes every SVG class and keyframe with `<chapter>t<NN>d<N>-` so no two
  diagrams can collide.
- Never let two agents write the same file. Never let a topic agent build a lab template (lead only).

## 4. Non-negotiables (the checker enforces most; the reviewer the rest)

1. **Original words.** Never copy NCERT sentences, figures or exercise wording.
2. **Exact science and maths.** Every fact, number, unit, sign, direction and answer checked twice; unsure → leave it out.
3. **Every topic:** `retrieve` first → `hook` → `explain` (`plain` then `board`) → `diagram`(s) carrying the whole
   topic (every `terms[].en` appears in a diagram label) → `figure`(s) from the plan → `worked` + faded → `lab` after
   the idea (or a one-line `why_no_lab` only when doing adds nothing) → `guided` → `misconception` → `keypoints` →
   `examtip` (after the concept) → `close` answering the hook.
4. **8 auto-marked items per topic**, answer positions spread (no index > 35%), every option has a `why`, distractors
   are real mistakes, feedback names the process not the child.
5. **Test:** 20 items, 50/20/30 by marks for Classes 9–12 (band rules for younger classes: `references/pedagogy.md`).
6. **Hindi is everyday spoken Hindi with English words**, NCERT terms kept with the English in brackets once per topic,
   तुम register, one word per concept, no calques (`references/hindi.md`).
7. **No words in images or baked into SVG art**; every label is a `data-t` key with both languages.
8. **Only planned image names.** Never invent an image; never describe what an image does not show.
9. **No topic without the lab it needs.** Missing lab type → build it (§6).
10. **Safe and kind:** age-appropriate, no fear or coaching language, any gender in any role, rotated festivals and
    contexts, no stereotypes, no personal data, nothing that calls the internet.
11. **No web address anywhere** (text, captions, credits, SVG other than its namespace): nothing links out of the app;
    a credit is words ("Author, Wikimedia Commons, CC BY 4.0"). The checker refuses it.
12. **No greetings, names or screen notes in content.** The reader adds the teacher's lines and the child's first name
    itself and never reads screen notes (`docs/family-app/17_PERSONAL_TEACHER_FRAMEWORK.md`).

## 5. Writing well (the craft, in short)

- **Explain for the weakest reader first:** one idea per sentence, everyday Indian examples, then the exact board
  wording. A topic should survive the "cover the text, look at the diagrams" test.
- **Concrete → pictorial → abstract:** a real scene or lab first, then the diagram, then the symbols and formulas.
- **Worked examples show every step;** the faded version hides exactly one; numericals show units at every line.
- **Misconceptions are the spine of the questions:** each distractor is a mistake students really make, and its `why`
  explains the thinking that leads there.
- **Close every loop:** the hook's question is answered, started examples are finished, every term used is defined.

## 6. When the library has no lab that fits: build the template

Read `references/labs.md` and `labs/CONTRACT.md` §2. Then copy `assets/template-skeleton.js` to
`labs/templates/<new-id>.js` (new files only — never edit an existing template) and build a **general, reusable** lab
type (e.g. "compass-and-ruler construction" for all geometry, not "construct this tangent"). Compute the behaviour
honestly (physics, chemistry, probability, geometry). Bilingual, `data-key` on every control, 44 px targets, Family
colours, reduced motion respected, works at 360 px, no network. Test with
`node labs/scripts/check.mjs --templates-only` and `node labs/scripts/smoke.mjs <new-id>`, look at the screenshots in
`labs/.smoke/`, add the catalogue entry to `catalogue-additions.json`, and list it in `DONE`.

## 7. Commands

```
node skills/netcyber-content/scripts/queue.mjs init --class 10 --subject mathematics   # the work list (see §1a)
node skills/netcyber-content/scripts/queue.mjs next                                    # what to build now
node skills/netcyber-content/scripts/new_chapter.mjs u.c10.mathematics.jemh1.ch01      # scaffold + inbox folder
node skills/netcyber-content/scripts/assemble.mjs content-inbox/c10-mathematics/u.c10.mathematics.jemh1.ch01   # parts → chapter file
bash skills/netcyber-content/scripts/check_all.sh content-inbox/c10-mathematics u.c10.mathematics.jemh1.ch01 data/content/universal/image-plans/Class-10-Mathematics-images.csv   # + any new template ids
node skills/netcyber-content/scripts/digest.mjs content-inbox/c10-mathematics/u.c10.mathematics.jemh1.ch01.json
node skills/netcyber-content/scripts/queue.mjs done u.c10.mathematics.jemh1.ch01     # gates re-run; done only if they pass
node skills/netcyber-content/scripts/queue.mjs status                                  # what is left
```

Never run git. Write only inside `content-inbox/` (and new files in `labs/templates/`).

## 8. Other jobs this skill covers

- **Upgrade an existing chapter** to a new rule: run the checker, read the feedback file, change only what the rule
  needs, keep everything that passes.
- **Image plan for a subject:** `docs/family-app/handover/PROMPT_IMAGE_PLAN.md` and `references/images.md`.
- **Review someone else's chapter:** `references/review-rubric.md`; report issues as a numbered list with the rule and
  a corrected example (the format of `docs/family-app/handover/feedback/TEMPLATE.md`).
