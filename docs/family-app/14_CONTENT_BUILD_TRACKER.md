# Content build tracker (content factory, labs, chapter reader)

A living record of what is built, what is in progress and what is pending, kept by Claude Code (build lead) for the
supervisor and Noor. Newest first inside each section. Update it at the end of every batch.

## Locked decisions

| Date | Decision | Source |
| --- | --- | --- |
| 9 Nov 2026 | Learning pages (chapter reader, labs, every chapter and syllabus page) use the Family app's lesson colours: warm paper, ink, saffron actions, teal progress, plum AI, one pastel tint per section kind; no navy, no gradients. | Noor |
| 9 Nov 2026 | The age-band framework in the feedback file §5 (and `AGE-BAND-PEDAGOGY-RESEARCH.md`) governs every syllabus slice, topic, lab, image and question. | Noor |
| 9 Nov 2026 | Agents: Sonnet for technical subjects, Haiku for non-technical; never Fable; no Opus agents. | Noor |
| 8 Nov 2026 | Content factory and labs must cover every subject of every class, 1–12. | Noor |

## Class 10 Science (NCERT jesc1) — reader build, in progress

The pilot subject. Each chapter is one JSON file in `reader/content/c10/science/`, checked by
`node reader/scripts/check.mjs`, opened at `reader/index.html`. Founder images live in `labs/assets/c10/science/`
(WebP, 1280 px and 640 px, 147 MB of originals → 19 MB). After all 13 chapters: stop for Noor's review before any other
subject.

| Ch | Title | Status | Notes |
| --- | --- | --- | --- |
| 1 | Chemical Reactions and Equations | Built, checker 0 problems | 9 topics, 72 topic items, 20-item test (37 marks), 20 images, 10 labs (3 new: reverse displacement, reaction sorter, lead nitrate). NCERT Activities 1.1–1.11 with the book's numbers. Every review fix from feedback §3 applied. |
| 2–13 | Acids, Bases and Salts … Our Environment | Built, checker 0 problems | 8–9 topics each, 8-item topic pools, 20-item tests; every chapter image used; NCERT activities with the book's numbers. Ch13: 12 planned images were not made (deer, tiger, phytoplankton, fish ×2, compost f2, kulhad, leaf plate, jute bag, plastic cup and plate, polythene bag). |
| 1–13 | All chapters | Feedback round 1 in progress | Noor's part 1 (a full-topic visual in every topic, a lab in every topic that needs one) and part 2 (spoken Hindi with English words, the Ch1 fixes, the 50/20/30 test mix). |

Images to review (from the build): ionic crystal "34" has a baked-in checkerboard; yeast f4 shows flatworms; planaria "cut" shows whole worms; endocrine glands show only a male outline; the opened heart is drawn mirror-wise; rainbow photo has the sun inside the arc; the two pupil photos are different eyes; house wires are red/blue/green-yellow, not NCERT's red/black/green.

## Built and merged

- PRs #406–#409 (9 Nov 2026): content-factory docs and prompts; universal syllabus 1–12 (164 books, 1,827 chapter rows);
  labs engine with 55 templates; 5,390 labs across 1,331 chapter files.

## In this branch (not yet merged)

- `reader/`: the chapter reader (mobile-first; EN/हिं switch; read aloud; figures with numbered labels and zoom; labs
  inside lessons; 5-of-8 topic checks with calm retry; 20-item board-pattern test with self-marked written answers;
  7-day "Remember it?" card; parent "open every topic").
- `labs/`: embed mode for the reader; Family colours; Chapter 1 labs and Hindi terms.
- Factory docs: per-band rules in `12_CONTENT_FACTORY.md` and `prompts/content-factory/GENERATE.md`.
- CI: the labs and reader checkers run in `checks.yml` / `ci_local.sh`.

## Pending (from the feedback file and earlier reports)

1. Urdu for Classes 1–12 (missing from the syllabus).
2. `kham1` Abhivyakti Aur Madhyam and `klss1` Sanskrit Sahitya Parichay: combined Class XI–XII books listed as class 13 with 0 chapters.
3. Confirm whether Class 12 needs a Physical Education book.
4. A source for CBSE subjects with no NCERT book (Applied Maths, Engineering Graphics, Entrepreneurship, Legal Studies, Music, Dance, AI/skills).
5. Review the 496 syllabus rows with no lab file (mostly PE, arts and activity lines); the 5 no-lab files are deliberate (reading-only and poetry).
6. Put `reader/` and `labs/` where students can open them (a Next.js route or `public/`); today they are static folders.
7. `main` push `verify` runs that never started (no runner, no logs): investigate.
8. Native-speaker review of the Hindi in every chapter.
9. The rest of the subjects and classes, after Noor approves Class 10 Science.
