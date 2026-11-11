# Review feedback: Class 10 Mathematics, batch 1 (chapters 1–14)

Written by Claude Code for the writer AI (Google Antigravity), 11 Nov 2026. Read this, `../LESSONS.md` (rules 33–40 are
new) and the model chapter **`reader/content/c10/mathematics/u.c10.mathematics.jemh1.ch04.json`** before you start.
Then upgrade chapters 1–3 and 5–14 to the level of the model chapter.

## Result of the review

- Your 14 chapters passed the old checker, and the mathematics in the samples checked is correct (worked examples and
  answer keys). Good: clear worked steps, sensible topic splits, all 20-item tests in the 50/20/30 mix.
- But they are **below the standard** in five ways. The checker has been tightened, so all 14 now fail it until fixed:
  `node reader/scripts/check.mjs reader/content/c10/mathematics` (run it on your copies in the inbox the same way).
- One lab (chapter 12, `ice-cream volume`) was broken although the run reported 0 problems: its check item used
  `answer: "a"` and an array `why` (the lab format is `answer: 0`, `why: {en, hi}`, `wrong: [...]`), its config said
  `ice-cream` (the template's id is `icecream`), and two steps used a target and an event the template does not have
  (`face:0` in volume mode, `answer` / `answered:right`). Claude Code fixed it. **Always run the labs checker on the
  labs file itself and read every line it prints.**

## Fix these patterns (with the corrected example)

1. **Diagrams are text boxes, not mathematics.** Your diagrams are flowcharts of 3–4 boxes of words, drawn on a
   ~720-wide viewBox, so the words are about 6 px on a phone. Rule: 2–3 diagrams per topic that SHOW the maths —
   algebra-tile area models, plotted graphs from computed points, number lines, constructions step by step, solids with
   hidden edges dashed, data charts drawn to scale. viewBox about 360 wide, labels 13+. See every topic of chapter 4.
   (The checker now fails labels under ~11 px at phone width; the review digest flags diagrams with fewer than 6 shapes.)
2. **Too many topics without a lab** (3–5 per chapter). Rule: every topic gets a lab where the student DOES the idea;
   at most 30% of a chapter's topics may go without (checker). Use `grapher`, `algebra`, `number-line`, `shapes`,
   `solids`, `trig`, `probability`, `data`, `geometry`… and build a new general template when none fits (skill §6) —
   chapter 4 shows a new template built for the job.
3. **Labs were not upgraded.** 13 of 14 labs files were the old starter files unchanged (old Hindi, labs that do not
   match your topics). Rule: rewrite each chapter's labs file for your topics; spoken Hindi; every step's target and
   event checked against the template.
4. **Bookish Hindi.** Examples: "गुणनखंडन द्वारा हल करने के लिए", "उभयनिष्ठ गुणनखंड बाहर निकालो", "सेमी". Right: "फ़ैक्टर
   बनाकर हल करने के लिए", "जो फ़ैक्टर दोनों में है, उसे बाहर निकालो — उसे उभयनिष्ठ गुणनखंड (common factor) कहते हैं",
   "cm". Units and digits exactly as in English. Write each Hindi sentence fresh (skill `references/hindi.md`).
5. **Formula-first "plain" explanations.** Rule: start from an everyday Indian situation, then the picture, then the
   symbols. Wrong: "To solve ax² + bx + c = 0 by factorisation, find two numbers p and q…". Right (chapter 4 t03):
   start from a rangoli of tiles that must form a rectangle, show that the tile count is the product, then the rule.
6. **Not all images used.** You referenced the planned file names; the founder sometimes made one combined image for a
   whole set (for example `C10-MAT-CH12-10_cone-fills-cylinder` instead of `…-f1` to `…-f4`), and five "master poster"
   images (`C10-MAT-CH10-00_…` to `C10-MAT-CH14-00_…`). Claude Code remapped your references to the files that exist
   and removed four sets that do not exist (8-08, 8-09, 8-10, 12-03). Rule: use the files that are in
   `labs/assets/c10/mathematics/`, use every one of them (checker), and put each chapter's master poster as a `figure`
   in the last topic, just before `keypoints`, captioned "The whole chapter in one picture".
7. **The founder's images may contain short English words** (the founder allowed short labels where they teach). Your
   captions and pins must match what the picture really shows; do not pin what the image already labels.

## Keep doing

- Correct, complete worked examples with every line.
- Clean topic splits that follow NCERT sections.
- Tests in the 50/20/30 mix with real-mistake distractors.

## Keep these four new visuals

Claude Code added four animated diagrams in place of image sets the founder did not make: chapter 8 t04 "half a
triangle" (sin 30°), t06 "sand squares" (a² + b² = c², sin²θ + cos²θ = 1), t02 "knotted rope" (3-4-5 right angle), and
chapter 12 t02 "tent canvas" (2πrh + πrl). Keep them (ids prefixed `m8d8-`, `m8d9-`, `m8d10-`, `m12d3-`) when you
upgrade those chapters. The founder's images keep their short English labels (decision of 11 Nov 2026).

## Answer keys

Rebuilding chapter 4 found a **wrong answer key** in your draft (topic 1: the item asking which equation is NOT
quadratic marked a quadratic option; the right answer, (x−2)(x+1) = (x−1)(x+3), is linear). Re-solve every answer key
and every distractor in every chapter from scratch before you finish it.

## Your next run

1. Your inbox already holds the 13 chapters and labs files with the image references fixed (the run-1 notes are in
   `content-inbox/archive-run1/`). The queue is set to these 13 chapters; chapter 4 is the published model.
2. In Antigravity paste: `Use the netcyber-content skill. Read docs/family-app/handover/feedback/c10-mathematics-1.md
   first, then continue the queued run until queue.mjs status says it is complete.`
3. For each chapter, `bash skills/netcyber-content/scripts/check_all.sh …` until it passes, then `queue.mjs done`.
