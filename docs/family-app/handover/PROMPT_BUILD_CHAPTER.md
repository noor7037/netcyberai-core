# Prompt: write one NetCyberAI chapter (master prompt for the writer AI)

You are writing one chapter of NetCyberAI's universal curriculum: a bilingual (English and Hindi) interactive chapter
for Indian school students that is fundamentally different from a textbook. You write data, not code. A strict
checker will test your files; a reviewer will re-solve every answer and read every Hindi sentence. Write as an expert
teacher who loves the subject and knows Indian classrooms.

## 0. Inputs you are given

- `reader/CONTRACT.md` — the exact JSON format and rules. **It overrides anything else.** Read it fully.
- `LESSONS.md` — mistakes earlier writers made and the rule for each. Read it fully; repeating one is a failure.
- The latest `feedback/<subject>-<n>.md`, if any — fix-before-you-write notes from the last review.
- `example-topic.json`, `example-labs.json` — approved models of the depth, voice and Hindi expected.
- `templates.md` — the lab library (every template already built); `labs/CONTRACT.md` — the rules for labs and for
  building a new template when the library has none that fits (§2a).
- The subject's image plan (CSV rows for this chapter) — the ONLY images you may reference, by `file_name` without
  the extension, using its `pin_targets` for labels.
- The NCERT textbook chapter (current 2025-26 edition) and, if available, the CBSE curriculum for the session, NCERT
  Exemplar and a CBSE sample paper.

The subject, class and chapter number are given in the request ("Subject: Class 10 Mathematics. Chapter: 1.").

## 1. Research first (do not skip)

1. Read the NCERT chapter end to end. List every section, every definition, every theorem or law, every activity
   (with its real NCERT number), every worked example idea, every in-text question and every exercise theme.
2. Check the CBSE curriculum for the session: drop what is deleted; mark anything beyond the syllabus "for the
   curious".
3. List the chapter's common student mistakes (these become misconception steps and distractors).
4. Plan 6–9 topics that together cover the whole chapter; each topic one idea a student can finish in 10–15 minutes.
5. For every topic, decide: the full-topic diagrams (what each shows, every key term placed in one), which planned
   images it uses, which lab (existing template that models it honestly) or why no lab, the worked example and its
   faded version, the misconception, the board tip.

Write this plan at the top of your first reply (chat mode) or into `content-inbox/<…>/PLAN.md` (Antigravity) before
writing any JSON.

## 2. Write the chapter

Follow `reader/CONTRACT.md` exactly. The essentials (the contract has the full list):

- **Every topic:** `retrieve` first; `explain` with `plain` (simple words) then `board` (exact board wording); one or
  more `diagram` steps that explain the WHOLE topic (every `terms[].en` appears in a diagram label with its short
  meaning; every step of a process drawn; what moves is animated); `figure` steps for the planned images; a `worked`
  example with a faded "your turn"; a `lab` step after the idea is taught (or `why_no_lab`); `guided`;
  `misconception`; `keypoints`; `examtip` after the concept; `close` that answers the topic's hook.
- **Check pool:** exactly 8 auto-marked items per topic (`mcq`, `ar`, `case`); correct options spread (no position
  above 35% across the chapter); every option has a `why`; distractors are real student mistakes; feedback names the
  process, never the child.
- **Chapter test (Classes 9–12):** 20 items in the CBSE 50/20/30 mix by marks (competency 45–55%: case, assertion-
  reason, source/data-based MCQ marked `"comp": true`; plain MCQ 15–25%; short/long 25–35%); at least 3 case, 3 AR,
  4 short, 1 long; interleave topics; pass 0.7.
- **Numericals and proofs (Maths, Physics, Chemistry):** every worked example shows every step; the faded version
  hides one step; units and significant figures as NCERT does; answers checked twice.
- **Diagrams (inline SVG):** viewBox about 360 wide; labels ≥ 13 units; locked Family colours (CONTRACT §3); every word
  is an empty `<text data-t="key">` filled from `texts`; motion with CSS `@keyframes` inside the SVG's own `<style>`,
  and **every class name and keyframe name must start with a prefix unique to that diagram** (for example
  `m1t3d2-`), because a shared name like `rise` once blanked a whole chapter; no script, no `<image>`, no external
  links; under 12 KB; geometry and science exact.
- **Labs:** every topic that has an NCERT activity, a natural experiment, a process to explore, a skill to practise or
  anything a student understands better by doing gets its own lab, whatever kind it is (chemistry bench, circuit,
  geometry construction, graph, probability, human body, brain and mind, computer and code, map, economy, language
  practice …). First look in `templates.md`: use a template with its exact config keys, targets and events; 5–12
  steps (predict → do → explain → check → explore); bilingual; every wrong check option explained. **If no template can
  model it honestly, build the new lab template now** (§2a) and use it — do not leave the topic without the lab it
  needs. `why_no_lab` is only for a topic where doing something would not teach more than the diagrams (one line,
  both languages).
- **Images:** reference only planned names; captions, `notice` lines and `labels` in both languages; place pins on the
  `pin_targets` the plan lists (approximate x/y; Claude Code corrects them on the real image).

## 2a. Building a new lab template (when the library has none that fits)

The lab library grows with every chapter: a template you build is reused by every later class and subject, so build it
general (configurable), not for one question.

1. Read `labs/CONTRACT.md` §2 (the template contract) and study two existing templates as models, for example
   `labs/templates/balance.js` (equation balancer) and `labs/templates/scatter.js` (light scattering), plus the one
   closest to your idea.
2. Check that no existing template already does it with a different config (read `templates.md` again). Prefer
   extending your idea into a general template (for example "construct with compass and ruler" for all geometry
   constructions, not "construct a tangent").
3. Write `labs/templates/<new-id>.js` (a NEW file only; never edit an existing template): plain browser JavaScript, no
   libraries, no network, `NCA_T.register({ id, css, validate, keys, demo, mount })`; every visible word bilingual via
   `api.t`; every control a button or input with `data-key`, at least 44 px, keyboard usable; `api.allowed`,
   `api.emit`, `api.nudge` used as the contract says; CSS classes prefixed with the template id; the Family colours;
   motion off under reduced motion; works at 360 px; honest physics/maths/biology (compute it, do not fake it).
4. Add its catalogue entry to `content-inbox/c<NN>-<subject>/catalogue-additions.json` (same fields as
   `labs/catalogue.json`).
5. Test it: `node labs/scripts/check.mjs --templates-only` (0 problems) and `node labs/scripts/smoke.mjs <new-id>`
   (mounts at 390 and 1280 px in English and Hindi, no errors). Look at the screenshots in `labs/.smoke/`.
6. Write the lab(s) that use it in your chapter's labs file, and list the new template in `DONE-chNN.md`.

Sensitive themes stay educational and age-appropriate (for example a "surgery" idea becomes "how a doctor finds the
problem" with a body model, never graphic). Never build a template that collects personal data or contacts the internet.

## 3. Language

- **English:** short sentences, one idea each, written below the class level; then the precise board wording.
- **Hindi: everyday spoken Hindi with English words, not shuddh Hindi** (CONTRACT §1 and LESSONS). Everyday words stay
  English in Devanagari (टेस्ट, टॉपिक, चैप्टर, मार्क्स, स्टेप, लैब, ग्राफ़, टेबल …). Keep NCERT Hindi-medium terms
  for the science and maths concepts, with the English term in brackets the first time in each topic. तुम register.
  One word per concept across the whole chapter and its labs. No calques, no wedged clauses, complete verbs, fixed
  noun genders. Digits as in English. Write each Hindi sentence fresh; never translate word by word.
- Both languages must be complete: a student must learn the topic from either alone.
- Indian contexts, rotated (kitchen, market, monsoon, cricket, trains, farms, festivals of many faiths); any gender in
  any role; no stereotypes; no pity stories; no coaching or fear language.
- Original words only. Never copy NCERT sentences, figures or exercise wording.

## 4. Output

**Antigravity (files):** write
- `content-inbox/c<NN>-<subject>/<chapter key>.json` — the reader chapter;
- `content-inbox/c<NN>-<subject>/labs/<chapter key>.json` — the chapter's labs file in the `labs/defs` format (start
  from the existing `labs/defs/c<NN>/<subject>/<chapter key>.json`, keep the labs you use, fix their Hindi, add new
  ones);
- `content-inbox/c<NN>-<subject>/lab_requests.json` if any.

Then run, and fix until both report 0 problems:

```
node labs/scripts/check.mjs content-inbox/c<NN>-<subject>/labs/<chapter key>.json
node reader/scripts/check.mjs content-inbox/c<NN>-<subject>/<chapter key>.json --labs content-inbox/c<NN>-<subject>/labs/<chapter key>.json --plan data/content/universal/image-plans/<Class>-<Subject>-images.csv
```

Do not run git. Do not edit anything outside `content-inbox/`, except NEW files in `labs/templates/` for new lab
templates (§2a).

**Chat mode (replies):** reply in parts, each one complete JSON in a single code block, and say the file name above it:
1. `PLAN.md` (the research and plan from §1) and `chapter.json` (everything except `topics[].steps`,
   `topics[].check` and `test`);
2. `t01.json` … one topic per reply (the full topic object);
3. `test.json` (`{ "pass": 0.7, "items": [ … ] }`);
4. `labs.json` (the labs file) and `lab_requests.json` if any.
Wait for "next" between parts. Never shorten or skip a part to save space; if a topic is too long for one reply, end
at a step boundary and continue in the next reply.

## 5. Before you say "done", check yourself

- [ ] Every NCERT section, activity (real numbers) and exercise theme is covered.
- [ ] Every topic: retrieve first, diagram(s) with every key term, worked + faded, lab or `why_no_lab`, guided,
      misconception, keypoints, examtip after the concept, close that answers its hook. The chapter hook is answered.
- [ ] 8 auto items per topic; 20-item test in the 50/20/30 mix; answer positions spread; every `why` written.
- [ ] Every answer key solved twice; every number, unit, formula, label and arrow direction checked.
- [ ] Every Hindi string reads as natural spoken Hindi; no banned word from LESSONS; no English left in Hindi prose.
- [ ] Every diagram's classes and keyframes carry its unique prefix.
- [ ] Only planned image names; every topic that needs a lab has one (new templates built, tested, listed).
- [ ] (Antigravity) both checkers report 0 problems.
