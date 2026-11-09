# The universal syllabus: Classes 1–12, every subject

The chapter spine of NetCyberAI's universal track (docs/family-app/12 §2), taken from NCERT's current textbooks,
book by book. It is the one source for chapter keys; lesson files, lab plans and image plans all point at these keys.
Only Claude Code edits these files. `manifests/c10-science.json` is superseded by this folder.

## Files

| File | One row per | Columns |
|---|---|---|
| `books.csv` | NCERT book in use (164) | class, stage, subject_id, subject, streams (Classes 11–12), scope, book_title, book_code, chapters, source_url |
| `chapters.csv` | chapter, lesson or poem as the book's contents lists it (1,827) | key, class, stage, subject_id, subject, book_title, book_code, unit, chapter_no, title, title_printed, title_script, page, source_url, notes |

Both are UTF-8 (with a byte-order mark so Excel shows Hindi correctly).

## How it was made (2026-11-07)

1. **Which books:** NCERT's own book list (`https://ncert.nic.in/textbook.php`, read from the page's code): every
   English-medium book, plus the Hindi and Sanskrit language books, for Classes 1–12. Where NCERT still lists an old
   book beside the new NCF-2023 one, the new one is used: Classes 3–4 use Maths Mela, Santoor, Veena and Our
   Wondrous World (not Math-Magic, Marigold, Rimjhim, Looking Around, Aas Paas); Class 8 uses Ganita Prakash,
   Curiosity, Poorvi, Malhar, Exploring Society and Deepakam (not the older Mathematics, Science, Honeydew, It So
   Happened, Vasant, Durva, Bharat Ki Khoj, Ruchira, Our Pasts III, Social and Political Life, Resource and
   Development). Class 9 uses NCERT's new 2026 books (Ganita Manjari, Exploration, Kaveri, Ganga, Understanding
   Society). Classes 10–12 use the current rationalised books.
2. **Which chapters:** each book's preliminary pages (`https://ncert.nic.in/textbook/pdf/<code>ps.pdf`, linked on
   every row) were read and the Contents copied exactly. Hindi and Sanskrit contents, whose PDF text layer is
   broken, were typed from page images. Nothing was filled from memory.
3. **Keys:** `u.c<class>.<subject_id>.<book_code>.ch<nn>`, e.g. `u.c10.science.jesc1.ch01`. Unnumbered items
   (poems in English readers, starred readings in Hindi books) are `.x<nn>` by position. Where a book restarts its
   numbering in each section, `.s1`, `.s2` … tell the sections apart. A key never changes or is reused.
4. **Titles:** `title_printed` is exactly as printed; `title` is the same, except that titles printed in capitals are
   shown in normal case. Roman numerals and Sanskrit ordinal words in numbers are written as digits (printed form
   in `notes`). Authors and poets of literature pieces are in `notes`.

## Scope

- **core** (1,344 chapters): the subjects the Family app teaches (`src/lib/family/subjects.ts`): English, Hindi,
  Sanskrit, Mathematics, EVS (The World Around Us), Science, Social Science, and in Classes 11–12 Physics,
  Chemistry, Biology, Accountancy, Business Studies, Economics, History, Geography, Political Science, Sociology,
  Psychology, Computer Science and Informatics Practices.
- **extended** (483 rows): Arts, Physical Education, Vocational and Skill Education, Home Science, Biotechnology
  and Fine Art. Listed so nothing is missing; their subject ids are not in the app yet.
- **Streams** begin in Class 11 (`streams` column: science, commerce, humanities, all). Classes 9 and 10 study the
  same subjects.

## Known judgement calls (details in each row's `notes`)

- First Flight (Class 10) and Hornbill, Kaveri: poems the contents lists without numbers are rows with `.x` keys.
- Khel Yoga / Khel Yatra / Khel Praveen, Poorvi, Kaushal Bodh: NCERT hosts one file per unit while the contents
  lists lessons; rows follow the contents.
- Antra (Class 12) lists 17 items while NCERT hosts 21 files; rows follow the contents.
- Home Science and Physics Part I/II contents disagree slightly between parts; each part's own contents is used.
- Skipped as not chapters: forewords, prefaces, "Introduction: Why Social Science?" (Class 6), "A Note on
  History's Darker Periods" and "Looking back and forward" (Class 8), appendices, answers, author profiles.

## Not here yet

- **Topics inside each chapter.** They come from each chapter's own section headings when that chapter's lab and
  image plan is made (`../plans/`), batch by batch.
- **State boards and other boards:** mapped onto these keys later (the personalised syllabus layer).
- **Nursery to UKG:** their play-based format is separate (Wave B).
