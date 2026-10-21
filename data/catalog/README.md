# Syllabus catalog files

Files here are loaded into the content library (`content.*`, Control → Content) as syllabus versions **in review**.
Nothing in them reaches a family until a NetCyberAI super_admin approves the version (staff preview) and then
releases it to everyone (docs/family-app/10 §4.2, docs/34 §10).

Load a file into a database (the build lead runs this, test database first):

```
node scripts/content/catalog-sql.mjs data/catalog/cbse-2026-27-maths-science.csv --ref "<the PR that committed it>" > load.sql
```

The SQL is one transaction, every value a quoted literal, and it skips a syllabus already loaded from the same `--ref`.
`test/content/catalog-csv.test.ts` checks every committed file with the importer's own checker
(`src/lib/content/catalog-csv.ts`).

## cbse-2026-27-maths-science.csv

CBSE, academic year 2026-27, Mathematics and Science. One line per unit, chapter and topic, worded as the CBSE
curriculum document prints it. Columns: `board,class,subject,academic_year,level,key,parent_key,position,title_en,
title_hi,source_url,source_page,checked_on,status`. Every line is `in_review`; every line was read on **2026-10-21**.

| Class | Subject | Units | Chapters | Topics | Source (CBSE, Secondary Curriculum Part 1, 2026-27) | Pages used |
|---|---|---|---|---|---|---|
| IX | mathematics | 6 | 15 | 88 | https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Maths_SecP1IX_2026-27.pdf | 4 (course structure: units and chapters), 4–12 ("Key Concepts" column: topics) |
| IX | science | 4 | 12 | 78 | https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/ScienceSt_SecP1_2026-27.pdf | 4 (course structure: units), 4–18 (chapter headings and their "Key Concepts": topics) |
| X | mathematics | 7 | 15 | 34 | https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Maths_SecP1X_2026-27.pdf | 3 (course structure: units), 3–7 (chapters and their numbered items: topics) |
| X | science | 5 | 12 | 0 | https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Science_SecP1_2026-27.pdf | 4–6 (unit headings; chapter names printed as "Name:") |

276 lines in all. All four documents are linked from https://cbseacademic.nic.in/curriculum_2027.html ("Curriculum for
the Academic Year 2026-27", Secondary Curriculum Part 1, Class IX and Class X → Main Subjects).

### How the lines were taken from the documents

- **Units and chapters** are the names the course structure table or the unit and chapter headings print. Class IX
  Mathematics chapters use the course structure table on page 4 (for example "Triangles – Congruence Theorems",
  where the detailed table says "Triangles: Congruence Theorems").
- **Topics** only where the document lists them under a chapter: the "Key Concepts" bullets (class IX), and the
  numbered items under each chapter (class X Mathematics). An unnumbered line printed before the numbered items is
  kept as the first topic, with key ending `.t00`: X Mathematics "TRIANGLES" ("Definitions, examples, counter
  examples of similar triangles.") and "CIRCLES" ("Tangent to a circle at point of contact."); and IX Science
  "Tissues" ("Tissues: Introduction and importance", printed without a bullet).
- **Wording** is the document's: line breaks joined, repeated spaces made one, a trailing `;` dropped. Capitals are
  kept as printed (class X Mathematics prints its unit and chapter names in capitals). Spelling slips are kept (IX
  Mathematics "leading to Aps"; X Mathematics "…120° only." with the bracket never closed). Formulas printed with
  maths symbols are written in plain characters: "ax² + bx + c = 0, (a ≠ 0)" and "sin² A + cos² A = 1".
- **Two bullets joined into one topic** where a bullet is clearly a typesetting break inside one phrase (the
  supervisor should confirm): IX Mathematics "Arithmetic Progressions" + "(AP): nth term, visualising an AP, and
  practical contexts leading to Aps" (page 5); IX Science "Nature of solar energy: solar radiation, electromagnetic"
  + "spectrum, and speed of light" (page 13). Conversely a bullet printed in the middle of a line starts a new topic
  (IX Science, Reproduction: "…sexual and asexual • Types of asexual reproduction with examples"; "Reproductive health
  and hygiene • Introduction to birth control methods and importance").
- **IX Science units.** The course structure (page 4) gives each unit its textbook chapter numbers (I: 2, 3, 11, 12;
  II: 5, 8, 9; III: 4, 6, 7, 10; IV: 13) but the chapter pages print names, not numbers. Chapters are placed in units
  by the order and grouping the document prints them in (four, three, one and four chapters, matching the counts),
  and their position follows the printed order, not the textbook numbers. The supervisor should confirm.
- **X Science** prints each chapter's content as one run-on sentence, not as listed topics, so its chapters have no
  topic lines. Its "formatively assessed" chapters are included as chapters, as printed (Periodic Classification of
  Elements; Evolution); the CSV has no column for "assessed only formatively".
- **Pages** are the PDF's page numbers (page 1 is the first page of the file). A line printed across a page break
  names both pages (`4-5`).
- **Hindi titles (`title_hi`) are empty on every line.** CBSE's 2026-27 curriculum page links no Hindi version of
  these four documents (its Hindi PDFs are the Hindi language syllabi), and no NCERT Hindi document was read for this
  file. Titles were not translated: the app shows the English title until a Hindi title from an official document is
  added in a new version. Checked again on 2026-10-21; see "Hindi titles and Class X Science topics: checked again".

### Hindi titles and Class X Science topics: checked again (2026-10-21)

Both were looked for again before the founder's approval; neither exists in an official 2026-27 document, so the file
is unchanged.

| What | Where we looked (all on 2026-10-21) | What was found |
|---|---|---|
| **A Hindi version of the four documents** (for `title_hi`) | https://cbseacademic.nic.in/curriculum_2027.html, also with the site's Hindi switch (`?lang=hindi`: the same document links); https://cbseacademic.nic.in/index.html (its "Curriculum" menu); https://cbseacademic.nic.in/curriculum_2026.html (2025-26, for the pattern only) | The 2026-27 page's Hindi documents are the Hindi language syllabi (`Hindi_SecP1IX_`, `Hindi_A_SecP1_`, `Hindi_B_SecP1_`, `Hindi_Core_SecP2_`, `Hindi_Elective_SecP2_2026-27.pdf`) and five Class XI–XII subjects (`GeographyHi_`, `HistoryHindi_`, `KTPI_hi_`, `PhysicalEducationHi_`, `PoliticalScienceHi_SecP2_2026-27.pdf`). None is Mathematics or Science for Classes IX–X. The same file names with a Hindi ending, tried on the same folder (`web_material/CurriculumMain27/SecPart1/`: `MathsHi_SecP1IX_`, `MathsHi_SecP1X_`, `ScienceHi_SecP1_`, `ScienceStHi_SecP1_` and similar, `_2026-27.pdf`), do not exist (HTTP 404). |
| **Class X Science topics** | `Science_SecP1_2026-27.pdf`, pages 4–6, read again | Each chapter is printed as one paragraph after its name ("Chemical Reactions and Equations: Chemical reactions, Chemical equation, …"), not as bullets or numbered items. Splitting a paragraph into topics would be our wording, not CBSE's, so the chapters keep no topic lines. |

The proof sheets for the founder's approval (CBSE's course structure page beside each version's lines) are in
[`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md).

### Gaps (not filled; never guessed)

| What | What was tried | What was found |
|---|---|---|
| **Classes VI, VII and VIII, Mathematics and Science** | https://cbseacademic.nic.in/curriculum_2027.html (the 2026-27 curriculum page), https://cbseacademic.nic.in/ (home page links), https://cbseacademic.nic.in/curriculum_archive.html, and the 2026-27 Secondary introduction https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Curriculum_SecP1_2026-27.pdf; a web search for a CBSE 2026-27 middle-stage curriculum | CBSE publishes curriculum documents for classes IX–XII only. For classes III–VIII the 2026-27 page links only the Computational Thinking and AI framework (`CTAI_Pri_2026-27.pdf`). No CBSE 2026-27 document lists Mathematics or Science chapters for classes VI–VIII, so there are no lines for them. Not filled from NCERT book contents or an earlier year. |
| **X Science, Unit III "Natural Phenomena"** (page 5–6) | Read the unit's text | The unit prints five paragraphs (reflection, refraction, lenses, the eye, the prism) with no chapter names. The unit line is in the file; it has no chapter lines. |
| **X Science, Unit IV "Effects of Current"**, first paragraph and the boxed "Motor, Electromagnetic Induction, Electric Generator" (page 6) | Read the unit's text | No chapter name is printed for these; only "Magnetic effects of current:" is named and is the unit's one chapter line. |
| **IX Mathematics and Science "at Advanced Level"** (`MathsAd_SecP1_2026-27.pdf`, `ScienceAd_SecP1_2026-27.pdf`) | Seen on the 2026-27 page | Separate optional subjects; not in this file. |

### How the supervisor checks a line

1. Open the line's `source_url` and go to `source_page` (the PDF's own page number, counting the first page as 1).
2. Find `title_en` on that page: in the course structure table (units, and IX Mathematics chapters), as a heading
   (chapters), or in the "Key Concepts" column or numbered list under its chapter (topics). The wording should match
   apart from the joins described above.
3. Check the parent: a topic's `parent_key` is the chapter it is printed under; a chapter's is its unit.
4. Check the order: `position` counts from 1 under the same parent, in printed order.
5. A quick mechanical check used while drafting: every word of three or more letters in each `title_en` appears in
   the text of its cited page (extracted with `pdftotext -raw`); all 276 lines pass.

## ncert-2026-27-classes-1-5.csv

Classes 1 to 5, every subject the app teaches in these classes (`stageSubjects` in `src/lib/family/subjects.ts`):
`mathematics`, `english`, `hindi`, and `evs` for Classes 3–5. The lines are the contents of NCERT's current textbooks,
which CBSE schools teach from in these classes, so the board is `CBSE`. Academic year `2026-27`, every line
`in_review`, every line read on **2026-10-22** (`checked_on`). Same columns as the file above. 692 lines: 51 units,
243 chapters, 398 topics; 216 lines have a Hindi title.

**Which books are current.** NCERT's textbook page https://ncert.nic.in/textbook.php lists, in its class, subject and
book menus, exactly one book per class and subject below (and its other-language editions). The earlier books
(Math-Magic, Marigold, Raindrops, Rimjhim, Looking Around/Aas-Paas) appear only in parts of that page's code that are
switched off (commented out), not in its menus. The opening pages of each book below print "Reprint 2026-27", except
the two Hindi editions of Class 5 (गणित मेला, हमारा अद्भुत संसार), whose imprint pages are dated January 2026. First
editions, from each book's imprint page: Classes 1–2 May–June 2023, Class 3 April–June 2024, Class 4 March 2025,
Class 5 June–July 2025.

**EVS.** NCERT's subject for Classes 3–5 is "The World Around Us" (the name in its subject menu); its book is *Our
Wondrous World*. It is filed under the app's subject id `evs`.

**Sources.** Each book has an opening-pages PDF, `https://ncert.nic.in/textbook/pdf/<code>ps.pdf`, which holds the
contents, and one PDF per chapter, `<code>01.pdf`, `<code>02.pdf` and so on, in the book's order. Units and chapters cite
the contents page of the opening-pages PDF; topics cite the chapter's own PDF. Page numbers are the PDF's own (its first
page is 1), not the numbers printed on the pages.

### Class 1

| Subject | Book (NCERT code) | Contents PDF | Units | Chapters | Topics | Pages used | `title_hi` |
|---|---|---|---|---|---|---|---|
| mathematics | *Joyful Mathematics* (0124) | https://ncert.nic.in/textbook/pdf/aejm1ps.pdf | 0 | 13 | 0 | 13 | 13 of 13, from the Hindi edition *आनंदमय गणित*, https://ncert.nic.in/textbook/pdf/ahjm1ps.pdf page 13 |
| english | *Mridang* (0123) | https://ncert.nic.in/textbook/pdf/aemr1ps.pdf | 4 | 9 | 0 | 13–14 | none |
| hindi | *सारंगी* (0122) | https://ncert.nic.in/textbook/pdf/ahsr1ps.pdf | 5 | 19 | 0 | 19–21 | 24 of 24, the printed title |

### Class 2

| Subject | Book (NCERT code) | Contents PDF | Units | Chapters | Topics | Pages used | `title_hi` |
|---|---|---|---|---|---|---|---|
| mathematics | *Joyful Mathematics* (0224) | https://ncert.nic.in/textbook/pdf/bejm1ps.pdf | 0 | 11 | 0 | 13 | 11 of 11, from *आनंदमय गणित*, https://ncert.nic.in/textbook/pdf/bhjm1ps.pdf page 13 |
| english | *Mridang* (0223) | https://ncert.nic.in/textbook/pdf/bemr1ps.pdf | 5 | 13 | 0 | 13–14 | none |
| hindi | *सारंगी* (0222) | https://ncert.nic.in/textbook/pdf/bhsr1ps.pdf | 5 | 26 | 0 | 17–19 | 31 of 31, the printed title |

### Class 3

| Subject | Book (NCERT code) | Contents PDF | Units | Chapters | Topics | Pages used | `title_hi` |
|---|---|---|---|---|---|---|---|
| mathematics | *Maths Mela* (0333) | https://ncert.nic.in/textbook/pdf/cemm1ps.pdf | 0 | 14 | 48 | 15; topics from `cemm101`–`cemm114.pdf` | 14 of 62 (chapters), from *गणित मेला*, https://ncert.nic.in/textbook/pdf/chmm1ps.pdf page 15 |
| evs | *Our Wondrous World* (0335) | https://ncert.nic.in/textbook/pdf/ceev1ps.pdf | 4 | 12 | 58 | 15; topics from `ceev101`–`ceev112.pdf` | 16 of 74 (units, chapters), from *हमारा अद्भुत संसार*, https://ncert.nic.in/textbook/pdf/chev1ps.pdf page 15 |
| english | *Santoor* (0332) | https://ncert.nic.in/textbook/pdf/cesa1ps.pdf | 4 | 12 | 0 | 15 | none |
| hindi | *वीणा* (0331) | https://ncert.nic.in/textbook/pdf/chve1ps.pdf | 5 | 18 | 0 | 15–17 | 23 of 23, the printed title |

### Class 4

| Subject | Book (NCERT code) | Contents PDF | Units | Chapters | Topics | Pages used | `title_hi` |
|---|---|---|---|---|---|---|---|
| mathematics | *Maths Mela* (0433) | https://ncert.nic.in/textbook/pdf/demm1ps.pdf | 0 | 14 | 79 | 15; topics from `demm101`–`demm114.pdf` | 14 of 93 (chapters), from *गणित मेला*, https://ncert.nic.in/textbook/pdf/dhmm1ps.pdf page 15 |
| evs | *Our Wondrous World* (0435) | https://ncert.nic.in/textbook/pdf/deev1ps.pdf | 5 | 10 | 54 | 15; topics from `deev101`–`deev110.pdf` | 15 of 69 (units, chapters), from *हमारा अद्भुत संसार*, https://ncert.nic.in/textbook/pdf/dhev1ps.pdf page 15 |
| english | *Santoor* (0432) | https://ncert.nic.in/textbook/pdf/desa1ps.pdf | 4 | 12 | 0 | 15 | none |
| hindi | *वीणा* (0431) | https://ncert.nic.in/textbook/pdf/dhve1ps.pdf | 0 | 13 | 0 | 17–19 | 13 of 13, the printed title |

### Class 5

| Subject | Book (NCERT code) | Contents PDF | Units | Chapters | Topics | Pages used | `title_hi` |
|---|---|---|---|---|---|---|---|
| mathematics | *Maths Mela* (0533) | https://ncert.nic.in/textbook/pdf/eemm1ps.pdf | 0 | 15 | 92 | 15; topics from `eemm101`–`eemm115.pdf` | 15 of 107 (chapters), from *गणित मेला*, https://ncert.nic.in/textbook/pdf/ehmm1ps.pdf page 15 |
| evs | *Our Wondrous World* (0535) | https://ncert.nic.in/textbook/pdf/eeev1ps.pdf | 5 | 10 | 67 | 15; topics from `eeev101`–`eeev110.pdf` | 15 of 82 (units, chapters), from *हमारा अद्भुत संसार*, https://ncert.nic.in/textbook/pdf/ehev1ps.pdf page 15 |
| english | *Santoor* (0532) | https://ncert.nic.in/textbook/pdf/eesa1ps.pdf | 5 | 10 | 0 | 15 | none |
| hindi | *वीणा* (0531) | https://ncert.nic.in/textbook/pdf/ehve1ps.pdf | 0 | 12 | 0 | 17–19 | 12 of 12, the printed title |

### How the lines were taken

- **Units** only where the book groups its lessons under unit headings in the contents (*Mridang*, *सारंगी*,
  *Santoor*, *Our Wondrous World*, Class 3 *वीणा*). *Joyful Mathematics*, *Maths Mela* and the Class 4–5 *वीणा*
  have none. The unit line is the unit's name without its "Unit 1:", "1.", "इकाई 1:" or "इकाई एक –".
- **Chapters** are the lessons the book numbers, in the contents' order, named as the contents prints them, without
  "Chapter 1:" or the lesson number. A subtitle printed in brackets with the name is kept (*Joyful Mathematics*:
  "Finding the Furry Cat! (Pre-number Concepts)"; in Class 2 the bracket is printed on the line below and is joined).
  Line breaks are joined ("Chanda Mama Counts the Stars", "जन्मदिवस पर पेड़ लगाओ").
- **Not taken as chapters** (each proof page lists them, with their page): pieces the contents prints without a
  lesson number. In *सारंगी* and Class 3 *वीणा* they are marked * and the contents says "तारांकित पाठ केवल पढ़ने के
  लिए हैं" (starred lessons are for reading only); in Class 4–5 *वीणा* they are printed without a number among the
  numbered lessons (NCERT's chapter PDFs follow the numbered lessons and include these pieces); *Santoor*'s "Picture
  Reading" and "Self Assessment" pages; "Puzzles" (*Joyful Mathematics*) and "Learning Material Sheets" (*Maths Mela*)
  after the last chapter. Foreword and About the Book are not lessons. *Mridang* numbers none of its lessons in the
  contents, so every lesson it lists is a chapter, "Picture Reading" in Class 2 included (it is that unit's Chapter 2).
- **Keys** follow the file above: `cbse.c3.evs.u1` (unit), `cbse.c3.evs.u1.ch01` (chapter), `cbse.c3.evs.u1.ch01.t01`
  (topic); a book without units has `cbse.c4.hindi.ch01`. A chapter's number in its key is the number the book prints
  for it, so the keys match the book: *Our Wondrous World* and *सारंगी* number across units (`cbse.c3.evs.u2.ch04`),
  *Mridang* numbers within each unit on the lesson's first page (`cbse.c1.english.u2.ch01`). Topic numbers count in
  printed order. `position` counts from 1 under each parent, in printed order.
- **Topics** only where a chapter prints titled section headings: *Maths Mela* and *Our Wondrous World*, Classes 3–5.
  A topic is a heading set in the book's own section-heading style that starts a section, in printed order (top to
  bottom, page by page), with its PDF page. Each heading was found by its type style in the PDF and then checked by eye
  on the page. Not topics: the activity labels each book repeats in every chapter ("Let us Do", "Let Us Solve", "Try
  This", "Project Work", "Let us reflect" and the like), activity titles set in plain bold type, words inside a picture
  or table, text of the PDF that a picture covers, and the cut-out sheets at the end of a chapter's PDF. Each proof page
  says what its book's heading style is and what was left out. *Joyful Mathematics* prints no section headings, only
  activity labels with a picture of a child ("Think and Do", "Count and Match", "Project Work") and story titles, so
  its chapters have no topics; nor do the language books, whose lessons are a story, poem or picture page with
  activities under repeated labels. Class 3 *Maths Mela* chapters 1, 2, 4 and 12 print no heading, so they have no
  topics.
- **Wording** as printed on the page: capitals as on the page (the text layer of Class 3 *Our Wondrous World* sometimes
  differs, for example "ways to Manage waste" for the printed "Ways to Manage Waste"); curly apostrophes, dashes and
  ellipses as printed ("We the Travellers—I", "Water— A Precious Gift", "Finding Directions …"); slips kept
  ("Elephants,Tigers, and Leopards", the Class 4 *Maths Mela* contents; "Boxy Buldings"). Changed: a space printed
  before "?" is dropped ("What is it made of?"), "½" in a heading is written "1/2", and the list number of "1. Bird
  Diary" is dropped. "Different Units but Same Measure" is printed twice in Class 5 *Maths Mela* chapter 8 and is
  listed twice.
- **Devanagari** was typed from the printed page and stored in Unicode NFC. It was not copied from the PDFs' text
  layer, which garbles NCERT's Hindi (old font encodings in some headings, vowel signs out of order).

### Hindi titles

- **Hindi books** (*सारंगी*, *वीणा*) print their titles in Devanagari. `title_en` and `title_hi` both hold the printed
  title; nothing was translated or transliterated. The app shows the same title in either language.
- **Mathematics and EVS:** `title_hi` of units and chapters is the title printed in NCERT's Hindi edition of the same
  book (*आनंदमय गणित*, *गणित मेला*, *हमारा अद्भुत संसार*; contents PDFs in the tables above). Each Hindi edition was
  compared with the English one: the same number of units and chapters, in the same order, starting on the same
  pages. The Hindi titles are the Hindi edition's own, not translations of the English ones (for example Class 3 EVS
  "Living in Harmony" is "निर्भरता एक-दूसरे पर").
- **Topics** have no `title_hi`: their headings were not matched against the Hindi editions' chapters.
- **English books** have no `title_hi`: NCERT's textbook page lists no Hindi edition of *Mridang* or *Santoor*.

### Gaps (not filled; never guessed)

| What | Why |
|---|---|
| `title_hi` of the 398 topics | Matching each heading with the Hindi edition's chapter PDFs was not done. The app shows the English heading. |
| Topics of *Joyful Mathematics* and of the English and Hindi books | Their chapters print no section headings (see above). |
| Pieces not taken as chapters | Listed above and on each proof page with their pages. If the founder wants the starred and unnumbered reading pieces as chapters, they can be added in a new version. |
| Arts, Physical Education and Well-being, Urdu (on NCERT's menu for these classes) | Not subjects of the app for Classes 1–5. |

### How the supervisor checks a line

1. Open the line's `source_url` at `source_page` (or follow the line's link on its proof page in
   [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md)).
2. Units and chapters: find `title_en` on the contents page, in the same order. For a mathematics or EVS line with a
   `title_hi`, open the Hindi edition's contents page (same page number) and find `title_hi` there.
3. Topics: the heading is printed on that page of the chapter's PDF.
4. A mechanical check used while drafting: every English word of three or more letters in each `title_en` appears in
   the text of its cited page (`pdftotext -raw`); all 692 lines pass. Devanagari titles were checked by eye, because
   the PDFs' text layer garbles them.
