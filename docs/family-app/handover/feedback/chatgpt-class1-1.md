# Review feedback: ChatGPT, Class 1 first slice (PR #421)

Written by Claude Code, 12 Nov 2026. The full instructions for the rest of Classes 1–3 are in
`docs/family-app/handover/CHATGPT_BRIEF.md`; this file records the review of the first slice.

## Result

- Three chapters (English ch1, Hindi ch1, Mathematics ch1), 4 topics each, pass the checker and the reader smoke test
  (every topic, 390/1280 px, English and Hindi). The foundational band contract you added is right and is kept.
- Claude Code changed in the PR: the foundational path covers Classes 1–2 and now also runs the shared rules (banned and
  bookish Hindi words, no LaTeX, labels readable for a young child at phone width — 15+ — images exist, photo credits);
  `book.json` `"list": "built"` replaces the hard-coded Class 1 filter in `books-lib.mjs`; a duplicated guard in
  `reader.js` removed; figures can show a photo `credit`; "गतिविधि" → "एक्टिविटी" (3 chapters).

## Fix these patterns in the next chapters

1. **Definition questions** ("किस शब्द का मतलब है: '…'?") — Class 1 checks are picture checks about a visible scene;
   use emoji or tiny pictures in options (see the brief §3.1).
2. **Explanations too long for Class 1** — 4–5-word captions and short spoken sentences, one idea per step.
3. **English words inside Hindi lessons** ("On का मतलब ऊपर") — only in the English book.
4. **Visuals too plain** — every topic a scene a child enjoys, animated, in the illustration palette (brief §5); real
   photos only from open-licence libraries with credits.
5. **Labs reused unchanged** — make them real play; build a general template when none fits.
6. **Only chapter 1** — every chapter of every subject, one PR per subject.

## Keep doing

The warm, inclusive voice; hooks that close; bilingual `data-t` diagrams; honest PR notes ("draft, needs native-speaker
review"); never merging.
