# Review rubric (self-review before hand-off; also how Claude Code reviews)

Score each line pass/fail. A chapter ships only when every line passes. Report failures as: where (chapter/topic/
step) — the rule — what is wrong — the corrected version.

## A. Machine gates

- [ ] `bash skills/netcyber-content/scripts/check_all.sh …` → reader checker 0 problems, labs checker 0 problems, every
      new template passes `--templates-only` and smoke.
- [ ] `node skills/netcyber-content/scripts/digest.mjs …` read top to bottom; nothing surprising.

## B. Coverage

- [ ] Every NCERT section, activity (real number and title), worked-example idea and exercise theme is in the chapter.
- [ ] Nothing deleted from the current syllabus is taught (or it is marked "for the curious").
- [ ] Every topic has diagrams that carry the whole idea (cover-the-text test) and every key term appears in them.
- [ ] Every topic that can be done has its lab; each `why_no_lab` is honest.

## C. Correctness (the reviewer redoes this independently)

- [ ] Every answer key re-solved from scratch; every numerical worked with units.
- [ ] Every fact, sign, direction, unit, formula, label and equation checked.
- [ ] Every diagram's geometry and science exact; looked at in both languages at 360 px.
- [ ] Every lab played in guided mode; it never blocks the child; it claims only what it shows.
- [ ] Every image reference is planned; captions claim only what the brief shows.

## D. Teaching quality

- [ ] Plain explanation first, readable below the class level; then the board wording.
- [ ] Worked examples show every step; the faded step is the one that matters.
- [ ] Distractors are real mistakes; every `why` explains the thinking, never judges the child.
- [ ] Hooks are real Indian scenes, varied, stereotype-free; every hook is answered.
- [ ] Exam tips come after the concept and reduce worry.

## E. Language

- [ ] English: short, clear, no jargon before it is defined.
- [ ] Hindi: spoken Hindi with English words, NCERT terms with English brackets once per topic, one term per concept
      (matches `TERMS.md` and the labs), तुम register, complete natural sentences, no calques, no English in prose,
      no added words in options.

## F. Safety and inclusion

- [ ] Age-appropriate; sensitive topics factual and respectful; no fear or coaching language.
- [ ] Any gender in any role; festivals and contexts rotated; no pity stories; no personal data; no network calls.
