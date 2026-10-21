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
| **Classes VI, VII and VIII, Mathematics and Science** | https://cbseacademic.nic.in/curriculum_2027.html (the 2026-27 curriculum page), https://cbseacademic.nic.in/ (home page links), https://cbseacademic.nic.in/curriculum_archive.html, and the 2026-27 Secondary introduction https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Curriculum_SecP1_2026-27.pdf; a web search for a CBSE 2026-27 middle-stage curriculum | CBSE publishes curriculum documents for classes IX–XII only. For classes III–VIII the 2026-27 page links only the Computational Thinking and AI framework (`CTAI_Pri_2026-27.pdf`). No CBSE 2026-27 document lists Mathematics or Science chapters for classes VI–VIII, so this file has no lines for them. They are in a separate file taken from NCERT's textbooks, the founder's chosen source: [`ncert-2026-27-classes-6-8-maths-science.csv`](#ncert-2026-27-classes-6-8-maths-sciencecsv) below. |
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

## ncert-2026-27-classes-6-8-maths-science.csv

Classes VI, VII and VIII, Mathematics and Science, academic year 2026-27, board `CBSE`. CBSE has published no 2026-27
curriculum document for these classes (see "Gaps" above); CBSE schools teach them from NCERT's new textbooks, which
the founder chose as the source. One line per unit, chapter and topic, worded as the NCERT book prints it. Same columns
as the CBSE file; every line is `in_review`; `checked_on` is **2026-10-22** (the PDFs were fetched on 2026-10-21, the
headings read and checked on 2026-10-22).

| Class | Subject | Units | Chapters | Topics | NCERT book (English) | Contents PDF (page) | Chapter PDFs |
|---|---|---|---|---|---|---|---|
| VI | mathematics | 0 | 10 | 65 | Ganita Prakash, Grade 6 (https://ncert.nic.in/textbook.php?fegp1=0-10) | https://ncert.nic.in/textbook/pdf/fegp1ps.pdf (19) | `fegp101`–`fegp110.pdf` |
| VI | science | 0 | 12 | 53 | Curiosity, Grade 6 (https://ncert.nic.in/textbook.php?fecu1=0-12) | https://ncert.nic.in/textbook/pdf/fecu1ps.pdf (17) | `fecu101`–`fecu112.pdf` |
| VII | mathematics | 2 | 15 | 65 | Ganita Prakash, Grade 7, Part – I (https://ncert.nic.in/textbook.php?gegp1=0-8) and Part – II (https://ncert.nic.in/textbook.php?gegp2=0-7) | https://ncert.nic.in/textbook/pdf/gegp1ps.pdf (17), https://ncert.nic.in/textbook/pdf/gegp2ps.pdf (17) | `gegp101`–`gegp108.pdf`, `gegp201`–`gegp207.pdf` |
| VII | science | 0 | 12 | 50 | Curiosity, Grade 7 (https://ncert.nic.in/textbook.php?gecu1=0-12) | https://ncert.nic.in/textbook/pdf/gecu1ps.pdf (19) | `gecu101`–`gecu112.pdf` |
| VIII | mathematics | 2 | 14 | 59 | Ganita Prakash, Grade 8, Part-I (https://ncert.nic.in/textbook.php?hegp1=0-7) and Part-II (https://ncert.nic.in/textbook.php?hegp2=0-7) | https://ncert.nic.in/textbook/pdf/hegp1ps.pdf (15), https://ncert.nic.in/textbook/pdf/hegp2ps.pdf (15) | `hegp101`–`hegp107.pdf`, `hegp201`–`hegp207.pdf` |
| VIII | science | 0 | 13 | 62 | Curiosity, Grade 8 (https://ncert.nic.in/textbook.php?hecu1=0-13) | https://ncert.nic.in/textbook/pdf/hecu1ps.pdf (19) | `hecu101`–`hecu113.pdf` |

434 lines in all (4 units, 76 chapters, 354 topics). All chapter PDFs are under https://ncert.nic.in/textbook/pdf/.
The books are the ones NCERT's textbook page (https://ncert.nic.in/textbook.php) lists for these classes and subjects
on 2026-10-21. Every English book except the two Part II books prints "Reprint 2026-27" on its pages; Ganita Prakash
Part – II (Grade 7, "First Edition, October 2025") and Part-II (Grade 8, "First Edition, December 2025") print no
reprint line, and are the Part II books NCERT lists.

### How the lines were taken from the books

- **Units** only where a book is printed in two parts: Ganita Prakash for classes VII and VIII. Each part is a unit,
  titled as its title page prints it (`Part – I`, `Part – II`; `Part-I`, `Part-II`), and cites that part's prelims PDF,
  page 1. Each part numbers its chapters from 1, and so do the keys (`cbse.c7.mathematics.u2.ch01` is Part – II,
  chapter 1). A book in one volume has no unit: its chapters have an empty `parent_key` (`cbse.c6.science.ch01`). The
  checker, the importer and the family's Study page all accept this (`test/content/catalog-csv.test.ts`,
  `test/content/library.test.ts`); no code change was needed.
- **Chapters** are the chapter names on the book's contents page, in order, citing the prelims PDF at the contents
  page. "Learning Material Sheets" and the front matter (Foreword, About the Book, notes) are not chapters.
- **Topics** are the numbered section headings inside each chapter ("1.1 What is Mathematics?"), without the number,
  in printed order, citing the chapter's PDF at the page where the heading is printed. Not taken: sub-sections
  ("2.2.1 How to group plants?"), "Figure it Out", activities, examples, boxes, end-of-chapter exercises, keywords and
  summaries, and any heading without a number. Chapters with no numbered section have no topic lines: Curiosity
  Grade 6, chapters 1 and 9; Curiosity Grade 8, chapter 1.
- **One number printed twice.** Ganita Prakash Grade 8 Part-I, chapter 2 prints "2.5" before both "Did You Ever
  Wonder?" (PDF page 15) and "A Pinch of History" (page 24). Both are topics, in printed order (`.t05`, `.t06`).
- **Wording** is the printed heading's. A heading set on two lines is joined with one space, except where the line
  ends in the hyphen or dash of a joined name ("Baudhāyana-Pythagoras", "Virahāṅka–Fibonacci"). Ligatures in the PDF's
  text ("Eﬀ ect") are written as letters ("Effect"). Typographic quotes, dashes and diacritics are kept as printed
  ("Nature’s", "Right–Triangles", "Virahāṅka"); so is a space before a question mark ("…for Life to Exist ?").
- **Capitals follow the printed page, not the PDF's text.** For nine headings the PDF's hidden text has other capitals
  than the page shows (the book's heading style sets them in title case), for example "Natural Resources: renewable
  and non-renewable" in the text, "Natural Resources: Renewable and Non-renewable" on the page. Each was read from the
  page: Ganita Prakash Grade 6, 5.3 and 5.6; Curiosity Grade 6, 5.4, 6.3, 8.3, 8.4, 8.7, 11.7 and 11.8.
- **Pages** are the cited PDF's own page numbers (its first page is 1), not the numbers printed in the book: each
  chapter has its own PDF, and `source_url#page=source_page` opens it at the right page.
- **Every heading was looked at.** A picture of every heading (and the line under it) was made from the PDF and
  compared with its line. As a mechanical check, every word of three or more letters in each `title_en` appears
  (ignoring capitals) in the text of its cited page: all 434 lines pass.

### Hindi titles (`title_hi`)

Every line has a Hindi title, from NCERT's Hindi editions of the same books; nothing was translated. The Hindi
editions match the English books chapter for chapter and, within each chapter, section for section with the same
numbers.

| Class | Subject | Hindi edition (NCERT's own title) | Contents PDF (page) | Chapter PDFs |
|---|---|---|---|---|
| VI | mathematics | गणित प्रकाश (https://ncert.nic.in/textbook.php?fhgp1=0-10) | https://ncert.nic.in/textbook/pdf/fhgp1ps.pdf (19) | `fhgp101`–`fhgp110.pdf` |
| VI | science | जिज्ञासा (https://ncert.nic.in/textbook.php?fhcu1=0-12) | https://ncert.nic.in/textbook/pdf/fhcu1ps.pdf (15) | `fhcu101`–`fhcu112.pdf` |
| VII | mathematics | गणित प्रकाश, भाग 1 and भाग 2 (https://ncert.nic.in/textbook.php?ghgp1=0-8, https://ncert.nic.in/textbook.php?ghgp2=0-7) | https://ncert.nic.in/textbook/pdf/ghgp1ps.pdf (19), https://ncert.nic.in/textbook/pdf/ghgp2ps.pdf (17) | `ghgp101`–`ghgp108.pdf`, `ghgp201`–`ghgp207.pdf` |
| VII | science | जिज्ञासा (https://ncert.nic.in/textbook.php?ghcu1=0-12) | https://ncert.nic.in/textbook/pdf/ghcu1ps.pdf (19) | `ghcu101`–`ghcu112.pdf` |
| VIII | mathematics | गणित प्रकाश, भाग-1 and भाग-II (https://ncert.nic.in/textbook.php?hhgp1=0-7, https://ncert.nic.in/textbook.php?hhgp2=0-7) | https://ncert.nic.in/textbook/pdf/hhgp1ps.pdf (19), https://ncert.nic.in/textbook/pdf/hhgp2ps.pdf (21) | `hhgp101`–`hhgp107.pdf`, `hhgp201`–`hhgp207.pdf` |
| VIII | science | जिज्ञासा (https://ncert.nic.in/textbook.php?hhcu1=0-13) | https://ncert.nic.in/textbook/pdf/hhcu1ps.pdf (19) | `hhcu101`–`hhcu113.pdf` |

How they were taken:

- The same lines as in English: the part's label from its title page, the chapter names from the contents page, and
  the numbered section headings from each chapter's PDF. The CSV keeps one source (the English PDF); the proof sheets
  link every Hindi title to its Hindi page as well.
- The PDFs' hidden Hindi text is damaged (the class VII and VIII files most): letters repeated ("क्यया" for "क्या"),
  vowel signs out of place or doubled, stray spaces inside words ("रे खा"), invisible joiners. The text was cleaned
  the same way everywhere (joiners removed, a two-part vowel sign written as one, a repeated letter or sign removed,
  the two stray spaces that recur closed: "कै से", "रे खा") and then **compared with a picture of every Hindi heading and contents line**; wherever the two differed, the title
  was typed from the printed page (all 76 chapter titles, and 24 section headings; the rest matched after cleaning).
  As a mechanical check, the consonants of each Hindi title appear in the same order in the text of its Hindi page:
  433 of 434 pass; the one exception, "जीवाश्म ईंधन", is stored in the PDF as "र्इंधन" and printed as "ईंधन".
- Kept as printed: "आकँड़ों" (Ganita Prakash Grade 6, chapter 4), "(Palendromic Patterns)" and the other English words
  in brackets, "करते है?" (Curiosity Grade 8, 11.4), and the dashes and spaces around "—" and "–". In "विलेयों,
  विलायकों और विलयनों का अद्भुत संसार" (Curiosity Grade 8, chapter 9) the halant under द is printed slightly out of
  place; it is written in its usual place.

### What is not in the file

| What | Why |
|---|---|
| Sub-sections ("2.2.1"), activities, "Figure it Out", boxes, exercises | Not numbered section headings; the catalog has three levels (unit, chapter, topic). |
| Topics for Curiosity Grade 6 chapters 1 and 9, and Grade 8 chapter 1 | These chapters print no numbered section heading. |
| A picture of each contents page in the proof sheets | NCERT prints "© NCERT not to be republished" across every page, and this repository is public. The proof sheets link to the contents page in NCERT's own PDFs instead. |
| Any NCERT text beyond titles | Titles only (`src/lib/content/catalog-csv.ts`). |

### How the supervisor checks a line

1. Open the line's `source_url` and go to `source_page` (the PDF's own page; the proof sheets link straight to it).
2. Units: the part's title page. Chapters: the contents page, in that order. Topics: the numbered heading on that page
   of the chapter's PDF, with the same words (the number itself is not in the title).
3. Check the parent (a topic's chapter; a chapter's part, or none) and the order (`position` from 1 under the same
   parent, in printed order).
4. Hindi: the proof sheet's "हिं" link opens the same page of the Hindi edition.

The proof sheets are in [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md).

## cbse-2026-27-classes-9-10-languages-social-science.csv

CBSE, academic year 2026-27, Classes IX and X: Social Science (`social_science`), English (`english`) and Hindi
(`hindi`), the app's other subjects for these classes. Same columns and the same rules as
`cbse-2026-27-maths-science.csv` above. Every line is `in_review`; every line was read on **2026-10-22**. 192 lines.

All six documents are linked from https://cbseacademic.nic.in/curriculum_2027.html ("Curriculum for the Academic Year
2026-27", Secondary Curriculum Part 1, Class IX and Class X; the link names are given below). Pages are the PDF's page
numbers (page 1 is the first page of the file); a line printed across a page break names both pages (`11-12`).

| Class | Subject | Document (link name on the curriculum page) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| IX | social_science | "Social Science" (Main Subjects), code 087: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/SocialScience_SecP1IX_2026-27.pdf | 2 | 16 | 74 | 8–14 ("Course Outline", Part 1 and Part 2: the "Theme" column gives the chapters, the "Outline/Concepts" bullets the topics) |
| X | social_science | "Social Science" (Main Subjects - Group-A1), code 087: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/SocialScience_SecP1X_2026-27.pdf | 4 | 22 | 10 | 1–2 (course structure: books, chapters, and the subtopics of Economics chapter 4), 3 (History chapter III subtopics) |
| IX | english | "English" (Languages): https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/English_LL_SecP1IX_2026-27.pdf | 1 | 7 | 3 | 13 (Section B, "II. Grammar"; the R2 list on page 15 is the same) |
| X | english | "English - Language and Literature" (Languages - Group-L), code 184: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/English_LL_SecP1_2026-27.pdf | 3 | 33 | 3 | 2 (Section B, "II Grammar"), 4 ("Prescribed Books": FIRST FLIGHT and FOOTPRINTS WITHOUT FEET) |
| IX | hindi | "Hindi" (Languages), its आर-1 (R1) scheme: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Hindi_SecP1IX_2026-27.pdf | 1 | 4 | 3 | 3 (section table), 4–5 (खंड-ख, व्यावहारिक व्याकरण) |
| X | hindi | "Hindi Course-A" (Languages - Group-L), code 002: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Hindi_A_SecP1_2026-27.pdf | 1 | 4 | 1 | 9–10 (section table and खंड-ख, व्यावहारिक व्याकरण) |

### How the lines were taken from the documents

- **The same rules as the Mathematics and Science file:** units and chapters as the document's course structure or its
  own headings print them, topics only where the document lists them under a chapter, wording as printed (line breaks
  joined, repeated spaces made one, capitals and slips kept), learning outcomes never taken as topics.
- **Class IX Social Science** has no course structure with marks yet (page 14: "Note-Course Structure will be provided
  shortly"), so its "Course Outline" (pages 8–14) is used. The units are its "Part 1" and "Part 2" (the two NCERT
  books, "Social Science-Part 1" and "Social Science-Part 2", page 14). The chapters are the "Theme" column without
  the time allocation ("(4 Hours)"); a period that is part of the theme's name is kept ("State and Society (upto 1000
  CE)"). Words split across lines by the narrow column are joined ("Understandin g" is "Understanding", "Authorit y" is
  "Authority", "BCE-" and "1200" make "BCE-1200"). The topics are the "Outline/Concepts" bullets. **To confirm:**
  "Carbon footprint" is printed under "• Floods" without a bullet (page 8); it is kept as its own topic, not joined to
  "Floods". Slips kept: "duststroms", "upto", "water- waves", "shukraniti- danda", "Meaning features" (no comma),
  "Medicine" twice in "Indian Knowledge Systems — Medicine, Mathematics and Astronomy, Medicine, Religion".
- **Class X Social Science.** The units are the four books as the course structure heads them ("History (India and the
  Contemporary World-II)" and so on); the chapters are the course structure's chapter names. Assessment notes printed
  with a chapter are not part of its name and are left out: "(To be evaluated in the Board Examination …)", "(Tobe
  assessed as part of Periodic Assessment only)", "(Only map pointing to be evaluated in the Board Examination)", "to
  be evaluated in the Board Examination"; the CSV has no column for how a chapter is assessed. The groupings inside a
  book (History's "Section" I–III, Political Science's "Unit No." I–IV) are not kept: the CSV has three levels and the
  book is the unit. Economics chapter 5 is kept as printed, "Consumer Rights (Project Work)". Topics only where the
  document lists them under a chapter: History chapter III's four "Subtopic" lines (page 3, without "Subtopic 1." and
  so on) and Economics chapter 4's six bullets (page 2, both the examined part and the interdisciplinary project part).
  **To confirm:** page 6 lists Economics chapter 4's subtopics again but without "Chinese toys in India"; the course
  structure's list (page 2) is used.
- **English, which course.** For Class IX the curriculum page links one English document (the `English_LL_` file),
  with two question paper designs, R1 and R2; its grammar list is the same in both (pages 13 and 15), so the lines
  serve both. For Class X it links two courses, "English - Language and Literature" (code 184) and "English
  Communicative" (code 101). **Language and Literature is the `english` syllabus** because Class IX's only English
  document is the same course (the same `English_LL_` file name), and because it names its textbook chapters (page 4),
  while English Communicative names only CBSE's "Interact in English" books and lists no chapters
  (https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/English_Communicative_SecP1_2026-27.pdf, page 2).
  English Communicative is not in this file.
- **English lines.** The unit "Grammar" is Section B's "II Grammar" heading; its bullets are the chapters and the
  sub-bullets under reported speech are the topics. Class IX's chapter "Reported Speech in extended texts including"
  is kept as printed, followed by its three sub-bullets as topics. Class X's units "FIRST FLIGHT" and "FOOTPRINTS
  WITHOUT FEET" are the books as page 4 prints them (capitals kept); their lessons and poems are the chapters, in
  printed order. FIRST FLIGHT prints two numbered lists, "A. Prose" (1–9) and "B. Poems" (1–10); the CSV has no level
  between a book and its lessons, so the poems follow the prose as positions 10–19.
- **Hindi, which course.** For Class X, "Hindi Course-A" (code 002) is the `hindi` syllabus; "Hindi Course-B" (code
  085, https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Hindi_B_SecP1_2026-27.pdf) is not yet in the
  catalog. For Class IX the curriculum page links one Hindi document, which has two schemes, आर-1 (R1, pages 1–5) and
  आर-2 (R2, pages 5–10), not Course A and B. **To confirm:** R1 is taken as the `hindi` syllabus, as Course A is for
  Class X; R2's grammar list is different (page 9) and is not in this file.
- **Hindi lines.** The documents print in Devanagari; each title is in both `title_en` and `title_hi` exactly as
  printed, never translated. Their text cannot be copied reliably out of these PDFs (the fonts map some letters
  wrongly), so each Hindi title was typed from the page rendered as a picture and compared letter by letter. The unit
  is खंड-ख, "व्यावहारिक व्याकरण", as the section table prints it; the chapters are its numbered items, without their
  marks and the "5 में से 4 प्रश्न" notes. Topics: Class IX "शब्द -निर्माण" lists two items, each with its own marks
  (उपसर्ग, प्रत्यय), which are its two topics. A list printed after a label and a colon is one topic, not split:
  "शब्दालंकार : अनुप्रास, यमक,श्लेष" (IX); in Class X, "अलंकार- (अर्थालंकार : उपमा, …)" is the chapter "अलंकार" with
  the bracketed list as its one topic. Spacing is as printed ("शब्द -निर्माण", "सर्वनाम,विशेषण,क्रिया").
- **Not taken from any of the language documents:** the unseen reading passages, the writing tasks (letters,
  paragraphs, notices and so on, each with a word limit and marks), the grammar test types (gap filling, editing,
  sentence reordering), the literature question formats, and internal assessment. They are exam question formats, not
  chapters or topics. **To confirm** whether writing tasks should become lines.
- **Hindi titles (`title_hi`) of English and Social Science are empty.** On 2026-10-22 the curriculum page with the
  Hindi switch (`?lang=hindi`) linked the same files as without it, and none is a Hindi version of the Class IX or X
  Social Science document; the same file names with a Hindi ending (`SocialScienceHi_SecP1IX_`,
  `SocialScienceHi_SecP1X_`, `SocialScience_Hi_SecP1IX_`, `SocialScience_Hi_SecP1X_`, `SocialScienceHindi_SecP1IX_`,
  `SocialScienceHindi_SecP1X_`, `_2026-27.pdf`) do not exist (HTTP 404). English is the English language syllabus.
  Nothing was translated.
- **Headings left from last year.** English X page 2 and Social Science X page 7 print "(2025-26)" in a heading; both
  are pages of the 2026-27 documents (their first pages say 2026-27, and the 2026-27 curriculum page links them).

### Gaps in this file (not filled; never guessed)

| What | Where we looked | What was found |
|---|---|---|
| **Class IX English textbook chapters** | `English_LL_SecP1IX_2026-27.pdf`, all 16 pages | Page 12 names the book only ("Prescribed Textbook- Kaveri: Textbook of English for Grade 9"); no chapter list. Not filled from the NCERT book. |
| **Class IX Hindi textbook chapters** | `Hindi_SecP1IX_2026-27.pdf`, all 10 pages | Pages 5 and 10 say literature is studied from the NCERT textbook issued under the 2023 curriculum framework, and name neither the book nor its chapters. |
| **Class X Hindi Course A textbook chapters** (क्षितिज भाग 2, कृतिका भाग 2) | `Hindi_A_SecP1_2026-27.pdf`, pages 9–11 | Page 11 names the two books and only the lessons from which no questions will be asked; there is no list of the lessons that are studied. Not filled from the NCERT books. |
| **Class X English workbook** (WORDS AND EXPRESSIONS – II, "Units 1 to 4 and Units 7 to 11") | `English_LL_SecP1_2026-27.pdf`, page 4 | The unit names are not printed. |
| **Class X Social Science, Disaster Management** ("Together, towards a safer India- Part III", CBSE) | `SocialScience_SecP1X_2026-27.pdf`, page 11 | Listed among the prescribed textbooks, with no chapters and no place in the course structure. |
| **Class X Social Science map work** | `SocialScience_SecP1X_2026-27.pdf`, pages 7–8 | A list of places to locate on maps, not chapters or topics. |
| **Class IX Social Science course structure (marks)** | `SocialScience_SecP1IX_2026-27.pdf`, page 14 | "Course Structure will be provided shortly"; the course outline is used instead. |
| **English Communicative (X), Hindi Course B (X), Hindi R2 (IX)** | the curriculum page and the documents | Separate courses or schemes; not in this file (see "which course" above). |

### How the supervisor checks a line

As for the Mathematics and Science file: open the line's `source_url` at `source_page`, find the title, then check
its parent and its position. The quick mechanical check (every word of three or more letters in `title_en` is on its
cited page, text extracted with `pdftotext`) passes for all 178 English and Social Science lines. The 14 Hindi lines
cannot be checked this way (see "Hindi lines"); compare them with the page by eye. The file passes the importer's
checker (`readCatalogCsv` in `src/lib/content/catalog-csv.ts`, run with the date 2026-10-22): 192 lines, no problems.
`test/content/catalog-csv.test.ts` reads only `cbse-2026-27-maths-science.csv`, so this file is not yet in that test.
The proof sheets for the founder's approval are in
[`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md).

## cbse-2026-27-classes-11-12-science-maths.csv

CBSE, academic year 2026-27, Classes XI and XII: Physics, Chemistry, Biology and Mathematics (subject ids `physics`,
`chemistry`, `biology`, `mathematics`). Same columns and rules as the file above. One line per unit and chapter, worded
as the CBSE curriculum document prints it; there are no topic lines (see "Topics"). Every line is `in_review`; every
line was read on **2026-10-22**. Load it the same way:

```
node scripts/content/catalog-sql.mjs data/catalog/cbse-2026-27-classes-11-12-science-maths.csv --ref "<the PR that committed it>" > load.sql
```

Each subject has one document for both classes, linked from https://cbseacademic.nic.in/curriculum_2027.html under
"Secondary Curriculum: Part - 2 (XI-XII)" → "Academic Electives - (Group-A)".

| Class | Subject | Document (CBSE, 2026-27) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| XI | physics | Physics (Code 042), Classes XI–XII: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf | 10 | 14 | 0 | 2 (course structure: units and chapters) |
| XII | physics | same document | 9 | 14 | 0 | 12 (course structure: units and chapters) |
| XI | chemistry | Chemistry (Code 043), Classes XI–XII: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf | 11 | 0 | 0 | 2 (course structure: units 1–9), 3 (note of formatively assessed topics: units 10–11) |
| XII | chemistry | same document | 14 | 0 | 0 | 8 (course structure: units 1–10), 9 (note of formatively assessed topics: units 11–14) |
| XI | biology | Biology (Code 044), Classes XI–XII: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf | 5 | 20 | 0 | 3 (course structure: units), 3–5 (chapter headings), 6 (note: last chapter of Unit V) |
| XII | biology | same document | 5 | 14 | 0 | 9 (course structure: units), 9–11 (chapter headings; note: last chapter of Unit X) |
| XI | mathematics | Mathematics (Code 041), Classes XI–XII: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf | 5 | 15 | 0 | 2 (course structure: units), 2–4 (numbered chapter headings), 6 (formatively assessed table: last chapter of Unit II) |
| XII | mathematics | same document | 6 | 13 | 0 | 7 (course structure: units), 7–9 (numbered chapter headings) |

155 lines in all (65 units, 90 chapters). Not used: Applied Mathematics (`Applied_Mathematics_SecP2_2026-27.pdf`) and
Biotechnology (`BioTechnology_SecP2_2026-27.pdf`), separate subjects; the "Reading Material" PDFs linked beside
Chemistry and Biology (`Chemistry_SecP2_2026-27_RM.pdf`, `Biology_SrSecXI_2026-27_RM.pdf`), which hold the textbook
text for the formatively assessed topics, not curriculum lines.

### How the lines were taken from the documents

- **Units** are the names in each class's course structure table. Where the unit heading in the text below the table
  words it differently, the table wins: Physics XI "Physical World and Measurement" (text: "…Measurements") and
  "Behaviour of Perfect Gases…" (text: "Behavior…"); Physics XII "Electromagnetic Waves" (text: "…waves");
  Chemistry XI "Chemical Thermodynamics" (text: "Thermodynamics") and "Organic Chemistry: Some basic Principles and
  Techniques" (text: "Organic Chemistry – Some Basic…"); Chemistry XII "d -and f -Block Elements", kept with its stray
  spaces (text: "d and f Block Elements"); Mathematics XII "Vectors and Three - Dimensional Geometry" (text: "Vectors
  and Three-dimensional Geometry") and "Linear Programming" (text: "Linear Programming Problem").
- **Chapters.** Physics: the course structure table names them ("Chapter–1: Units and Measurements" gives "Units and
  Measurements"); Physics XII chapter 14 is printed over two table lines and joined. Biology: the "Chapter-N:" headings
  in the unit text. Mathematics: the numbered headings under each unit ("1. Sets"). **Chemistry names no chapters**:
  each unit is followed by its content as running text, so Chemistry has unit lines only. No chapter line was made up
  from a unit name.
- **Keys and positions** count from 1 under the parent, in printed order, as in the file above. CBSE numbers Class XII
  Biology's units VI–X and numbers chapters straight through a class (Biology XI chapters 1–19, Physics XI 1–14);
  here they are `u1`–`u5` and `ch01` onwards inside each unit. The printed names are unchanged.
- **Wording** is the document's: line breaks joined, repeated spaces made one, capitals as printed ("Chemistry in
  Everyday life"), "&" kept ("Relations & Functions", "s & p Block Elements"), hyphens as printed ("Cell-The Unit of
  Life", "Plant - Growth and Development", "Biotechnology - Principles and Processes").
- **Formatively assessed lines (9; the supervisor should confirm).** Each document prints, after the units, a note of
  topics that are "included in the syllabus but will be assessed only formatively". The Class X Science lines include
  such chapters as printed, so these are included too, after the course-structure lines, at the level of the headings
  they follow, each citing the page of the note:
  - Chemistry XI, units 10–11: "s & p Block Elements", "The Gaseous State" (page 3).
  - Chemistry XII, units 11–14: "Surface Chemistry", "General Principles and Processes of Isolation of Elements",
    "Polymers", "Chemistry in Everyday life" (page 9). Each item is printed as a name, a dash, then its content; the
    name is the text before the first dash.
  - Biology XI, Unit V chapter 7: "Digestion and Absorption" (page 6); its "(Please Refer to CBSE Reading Material)"
    is left out.
  - Biology XII, Unit X chapter 4: "Environmental Issues" (page 11); its "(available as a part of CBSE Reading
    Material):" is left out.
  - Mathematics XI, Unit II chapter 6: "Principle of Mathematical Induction" (page 6), printed under "Unit-II: Algebra"
    in the formatively assessed table. The rest of that table adds content to chapters already listed (for example
    "Sets: Practical problems on Union and Intersection of two sets"), so it adds no line.

  The CSV has no column for "assessed only formatively". To keep the course structure only, delete these 9 lines (keys
  `cbse.c11.chemistry.u10`, `.u11`; `cbse.c12.chemistry.u11`–`.u14`; `cbse.c11.biology.u5.ch07`;
  `cbse.c12.biology.u5.ch04`; `cbse.c11.mathematics.u2.ch06`).
- **Topics: none.** All four documents print the content of each chapter (Chemistry: of each unit) as running text
  separated by commas, semicolons and full stops ("Biodiversity; Need for classification; three domains of life; …"),
  not as bullets or numbered items. Splitting it into topics would be our wording, not CBSE's: the same rule as Class X
  Science. If the supervisor decides that splitting at the printed separators is acceptable, topics can be added in a
  new version.
- **Not taken:** practicals, activities, projects, the question paper design, and Biology XI chapter 9's note of topics
  excluded (an exclusion, not content).
- **Pages** are the PDF's page numbers (page 1 is the first page of the file). Chemistry and Biology print the same
  numbers at the foot of each page; Physics and Mathematics print none.
- **Hindi titles (`title_hi`) are empty on every line.** Checked on 2026-10-22: the 2026-27 page (also with
  `?lang=hindi`) links no Hindi version of these four documents. Its live Hindi links for Classes XI–XII are the Hindi
  language syllabi (`Hindi_Core_SecP2_`, `Hindi_Elective_SecP2_2026-27.pdf`); the Hindi versions of Geography, History,
  Knowledge Tradition, Physical Education and Political Science are commented out in the page. The same file names
  with a Hindi ending, tried on the same folder (`web_material/CurriculumMain27/SecPart2/`: `PhysicsHi_`,
  `PhysicsHindi_`, `Physics_hi_`, the same three for Chemistry, Biology and Maths, and `MathematicsHi_`,
  `_SecP2_2026-27.pdf`), do not exist (HTTP 404). Nothing was translated.
- **Mechanical check:** every word of three or more letters in each `title_en`, and the whole title once spaces and
  dashes are made plain, appears in the text of its cited page (`pdftotext -raw` and `-layout`); all 155 lines pass.
  The importer's checker (`readCatalogCsv`) finds no problem with the file.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `class11-physics.md` to `class12-mathematics.md`.

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

## cbse-2026-27-classes-11-12-commerce-humanities-languages.csv

CBSE, academic year 2026-27, Classes XI and XII: the app's other subjects for these classes, Accountancy, Business
Studies, Economics, History, Geography, Political Science, English and Hindi (subject ids `accountancy`,
`business_studies`, `economics`, `history`, `geography`, `political_science`, `english`, `hindi`). Same columns and rules
as the files above. Every line is `in_review`; every line was read on **2026-10-22**. 703 lines (41 units, 187 chapters,
475 topics). Load it the same way:

```
node scripts/content/catalog-sql.mjs data/catalog/cbse-2026-27-classes-11-12-commerce-humanities-languages.csv --ref "<the PR that committed it>" > load.sql
```

Each subject has one document for both classes, linked from https://cbseacademic.nic.in/curriculum_2027.html under
"Secondary Curriculum: Part - 2 (XI-XII)": the six main subjects under "Academic Electives - (Group-A)", English Core and
Hindi Core under "Languages - (Group-L)" (the page has no separate languages part for Classes XI–XII). Pages are the
PDF's page numbers (page 1 is the first page of the file); a line printed across a page break names both pages (`11-12`).

| Class | Subject | Document (link name on the curriculum page) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| XI | accountancy | "Accountancy", code 055: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf | 2 | 3 | 0 | 2 (course structure) |
| XII | accountancy | same document | 3 | 5 | 0 | 9 (course structure) |
| XI | business_studies | "Business Studies", code 054: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf | 2 | 10 | 44 | 2 (course structure), 2–7 (the "Content" column) |
| XII | business_studies | same document | 2 | 12 | 51 | 9 (course structure), 9–15 (the "Content" column) |
| XI | economics | "Economics", code 030: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf | 2 | 7 | 0 | 2 (course structure) |
| XII | economics | same document | 2 | 8 | 0 | 6 (course structure) |
| XI | history | "History", code 027: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf | 5 | 12 | 3 | 3 (course structure), 4 (Theme 1's items) |
| XII | history | same document | 3 | 12 | 0 | 9–10 (course structure) |
| XI | geography | "Geography", code 029: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf | 3 | 27 | 75 | 3–4 (course structure), 5–8 (course content), 10 (note of formatively assessed topics) |
| XII | geography | same document | 3 | 24 | 132 | 11–12 (course structure), 12–16 (course content), 18–19 (note of formatively assessed topics) |
| XI | political_science | "Political Science", code 028: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf | 2 | 18 | 89 | 3 (course structure), 4–9 (course content) |
| XII | political_science | same document | 2 | 15 | 79 | 10 (course structure), 11–15 (course content) |
| XI | english | "English Core", code 301: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf | 2 | 15 | 0 | 8 ("Prescribed Books") |
| XII | english | same document | 2 | 19 | 2 | 12 ("Prescribed Books") |
| XI | hindi | "Hindi Core", हिंदी (आधार), code 302: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf | 3 | 0 | 0 | 9 (निर्धारित पाठ्यपुस्तकें) |
| XII | hindi | same document | 3 | 0 | 0 | 11 (निर्धारित पुस्तकें) |

### How the lines were taken from the documents

- **The same rules as the files above:** units and chapters as the course structure prints them, topics only where the
  document lists them under a chapter, wording as printed (line breaks joined, repeated spaces made one, capitals,
  punctuation and slips kept), numbers and labels ("Unit 1:", "Chapter 2", "a)", "Part A") left out, learning outcomes
  never taken. Where a heading in the text words a unit or chapter differently from the course structure table, the
  table wins (each case is on the subject's proof page).
- **Units and chapters.** Every one of these course structures groups its units or chapters into larger parts, so the
  part is the CSV unit and the course structure's own units, chapters or themes are the CSV chapters: Accountancy,
  Business Studies and Economics: "Part A", "Part B" (for Economics the two NCERT books); Political Science: "PART A",
  "PART B" (capitals kept, "INDIAN CONSTITUTION AT WORK"); Geography: the books the course structure names
  ("Book- Fundamentals of Physical Geography" …), whose own "Unit-I", "Unit-II" groupings are not kept (the CSV has three
  levels and the book is the unit, as for Class X Social Science); History XI: the "Section Title" column ("Reading of
  World History", "EARLY SOCIETIES" …); History XII: the three parts of "Themes in Indian History"; English and Hindi: the
  prescribed books. Part C (project or practical work) and map work are not taken.
- **Topics.** Accountancy and Economics print each unit's content as running text (Accountancy also as notes and as
  bullets that are paragraphs, several longer than the 300-character limit for a title), so they have no topics, the
  same rule as Classes XI–XII Physics. Business Studies: each box of the "Content" column is one topic, its lines
  joined. Geography: the bullets under each chapter of the course content. Political Science: the items printed at the
  first level under each chapter ("a)", "b)" …, and two first-level items without a letter). History XI: Theme 1's three
  lettered items (page 4); the other themes, and all of Class XII, list learning outcomes only. English XII: the two
  parts of "Memories of Childhood". **A list printed under a topic is not taken** (the CSV has no fourth level):
  Political Science's bullets under its lettered items, and in Geography XII the items under "Types of agriculture:"
  (2), "Commercial Agriculture" (8) and "Case Studies –" (2); the topic is the item's own text, worded as printed. Labels
  that only introduce a list ("Topics to be focused:", "Concept and types:") are not topics.
- **History XII chapters** join each theme's two printed lines, title and subtitle, with a space ("Bricks, Beads and
  Bones The Harappa Civilisation"). Slips kept as the table prints them: "Kingship, Caste and class" (the course content
  says "KINSHIP"), "The Harappa Civilisation", "BCE600", "(c.600 BCE 600 CE)" (no dash is printed).
- **Business Studies** boxes that hold more than one item are one topic each (to confirm whether to split them): Class XI
  "Global Enterprises – Feature Joint venture Public private partnership – concept", the two banking boxes of Unit 4,
  "Internal trade - meaning and types services rendered by a wholesaler and a retailer"; Class XII "Dimensions of Business
  Environment … Demonetization - concept and features", "Structure of organisation … Formal and informal organization -
  concept", "The Consumer Protection Act, 2019: Meaning of consumer …" (its printed source link, "Source:
  http://egazette.nic.in/…", is left out).
- **Political Science** first-level items are kept in printed order even where the letters are out of order or
  repeated (Class XII International Organizations e, f, h, i, j, g; Environment and Natural Resources … d, f, g, e; The
  Crisis of Democratic Order a, c, c, d, d). Two first-level items carry no letter and are topics: "Implementation of
  73rdand 74th Amendments" (a bullet) and "Contents of amendments made so far" (printed as "9."). In Class XII "Russia",
  "Balkan States" and "Central Asian States" are printed at the first level (with bullets), so they are topics. "elect
  ions" (Class XII, page 13) is printed with a space inside the word and is written "elections", as split words were
  joined for Class IX Social Science. Slips kept: "73rd and 74thamendments", "Fourth General Election1967",
  "Non-tradition notions of Security.", "Lok Sabha Elections (2004- 2019)".
- **Geography.** Notes printed with a chapter ("(To be tested through internal assessments in the form of project and
  presentation)") are left out of its name; those chapters print no bullets and have no topics. Page 11 prints
  "Book-India People and Economy" above the first Class XII table; it heads the second table and is used there. The
  course structure's spellings are kept ("Fundamental of Human Geography", "Landform and their Evolution").
- **Hindi Core** prints in Devanagari; each title is in both `title_en` and `title_hi` exactly as printed, never
  translated, typed from the page rendered as a picture and checked against the PDF's text for the punctuation
  ("आरोह, भाग-1" with a hyphen, "वितान भाग–1" with a dash; Class XII "‘अभिव्यक्ति और माध्यम’" in quotation marks).
- **Keys and positions** count from 1 under the parent, in printed order. English XII: Flamingo prints "Prose" (1–8)
  then "Poetry"; the poems follow as positions 9–13, as for Class X First Flight.

### Choices to confirm (the supervisor)

- **Formatively assessed lines (19).** Geography prints, after the course content, topics "included in the syllabus
  but … assessed only formatively". As for Classes XI–XII Science they are included, after the course-structure
  chapters of the book they are listed under, the name being the text before the first dash: Class XI "Minerals and
  Rocks" (page 10); Class XII "Population Composition" and "Human Settlements" with their six items each (page 18),
  "Migration" with its three items (page 19). To keep the course structure only, delete `cbse.c11.geography.u1.ch15`,
  `cbse.c12.geography.u1.ch09` and `.ch10` with their topics, and `cbse.c12.geography.u2.ch10` with its topics.
- **Accountancy XII "Or".** The table prints Part B twice, joined by "Or": Financial Statement Analysis or Computerized
  Accounting. Both are in; the option is the third unit (`cbse.c12.accountancy.u3`, `.u3.ch01`).
- **History XI introduction and timelines.** "Introduction of World History" and the four "Introduction Timeline …"
  rows have no theme number and no marks, but the table prints them as rows of the "Theme Title" column (the course
  content gives the timelines learning outcomes). They are chapters (`cbse.c11.history.u1.ch01`, and `.ch01` of `u2` to
  `u5`; the unit `u1`, "Reading of World History", holds only the introduction).
- **Geography practical books.** "Geography Practical Part I" (XI) and "Geography Practical II" (XII) are books with
  chapters and marks in the course structure, so they are units (`cbse.c11.geography.u3`, `cbse.c12.geography.u3`), unlike
  the experiment lists of the science practicals, which were not taken.
- **Hindi Core has units only.** The document names the three prescribed books and lists only the lessons removed from
  them (pages 9 and 11), not the lessons studied, so the books are the units and there are no chapters. The Class X
  Hindi file does not list its books as units; delete the six `hindi` lines to match it.
- **English Core and Hindi Core** are the `english` and `hindi` syllabi: they are the core courses. English Elective
  (`English_elective_SecP2_2026-27.pdf`) and Hindi Elective (`Hindi_Elective_SecP2_2026-27.pdf`) are separate courses
  and are not in this file.

### Not in this file (never guessed)

| What | Where we looked | What was found |
|---|---|---|
| **Hindi Core lessons** | `Hindi_Core_SecP2_2026-27.pdf`, all 11 pages | Pages 9 and 11 name the books (आरोह, वितान, अभिव्यक्ति और माध्यम) and the lessons removed; no list of the lessons studied. Not filled from the NCERT books. |
| **Accountancy and Economics topics** | the two documents | Content printed as running text (see "Topics"). The Accountancy sub-headings ("Introduction to Accounting", "Theory Base of Accounting" …) are not present in every unit (Class XII Unit 1 starts with bullets) and are not taken. |
| **Political Science Annexure** ("Additional Reference Material", pages 21–34) | `PoliticalScience_SecP2_2026-27.pdf` | "for classroom transaction and will not be assessed in the Board examination": reading text under "Sub-Topic" headings, not syllabus lines. |
| **Lists under a topic** | Political Science, Geography XII | Not taken: the CSV has three levels (see "Topics"). |
| **Project work, practical files, map work, question paper designs, listening and speaking, reading passages, writing tasks** | all eight documents | Assessment and exam formats, not chapters or topics. |
| **Grammar** | English Core page 6, Hindi Core pages 8–11 | English XI prints only question types ("Questions on Gap filling (Tenses, Clauses)", "Questions on re-ordering/transformation of sentences"); English XII and Hindi Core have no grammar section. Not taken, as for Classes IX–X. |

### Hindi titles of the other documents

`title_hi` is empty on every line that is not Hindi. Checked on 2026-10-22: the curriculum page (also with
`?lang=hindi`, the same page) links no Hindi version of Accountancy, Business Studies, Economics or English Core. It has
links to "Geography (Hindi)", "History (Hindi)" and "Political Science (Hindi)" (`GeographyHi_SecP2_2026-27.pdf`,
`HistoryHindi_SecP2_2026-27.pdf`, `PoliticalScienceHi_SecP2_2026-27.pdf`), but they are commented out in the page and
the files return HTTP 404. The same file names with a Hindi ending (`Hi`, `Hindi`, `_hi`, `_Hi`, `_Hindi`) for all six
subjects return HTTP 404 too. Nothing was translated.

### How the supervisor checks a line

As for the files above: open the line's `source_url` at `source_page`, find the title, then check its parent and its
position. **Mechanical check:** for 693 of the 697 English-language lines the whole title (spaces removed, dashes and
quotation marks made plain) is found in the text of its cited page (`pdftotext -layout` and `-raw`). The other four were
compared by eye: three titles printed across a page break (the page number at the foot interrupts them) and the Consumer
Protection Act box (its source link is left out); every word of three or more letters of all 697 titles is on the cited
pages, except "elections" (printed "elect ions", see above). The six Hindi lines were compared with the page by eye. The
importer's checker (`readCatalogCsv`, run with the date 2026-10-22) finds no problem; `test/content/catalog-csv.test.ts`
checks the counts above, the eight source documents and the Hindi-title rule.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `class11-accountancy.md` to `class12-hindi.md`.

## cisce-2026-27-isc-classes-11-12.csv

CISCE, ISC (Indian School Certificate), academic year 2026-27, Classes XI and XII: Physics, Chemistry, Biology,
Mathematics, Accountancy, Business Studies, Economics, History, Geography, Political Science, English and Hindi (subject
ids `physics`, `chemistry`, `biology`, `mathematics`, `accountancy`, `business_studies`, `economics`, `history`,
`geography`, `political_science`, `english`, `hindi`; CISCE's own name for Accountancy is "Accountancy (858)"). Board
`CISCE`. Same columns and rules as the files above. Every line is `in_review`; every line was read on **2026-10-22**.
655 lines (117 units, 316 chapters, 222 topics). Load it the same way:

```
node scripts/content/catalog-sql.mjs data/catalog/cisce-2026-27-isc-classes-11-12.csv --ref "<the PR that committed it>" > load.sql
```

### Which document applies to which class

ISC is a two-year course: Class XI and Class XII lead to one examination at the end of Class XII. In 2026-27 a Class XI
student sits the ISC examination in **2028** and a Class XII student in **2027**. CISCE's site says so in three places:
the ISC Publications page (https://cisce.org/isc-publications/) lists "Regulations and Syllabuses for the ISC Year 2028
Examinations" and "… 2027 Examinations" as separate sets; CISCE circular CISCE/CIRCULAR/2026-27/33 (20 April 2026,
https://cisce.org/wp-content/uploads/2026/08/Circular-for-Bifurcation-of-Indian-Languages.pdf) gives the documents "For
the Examination Year 2027: … (ISC) - Class XII" and "For the Academic Year 2026-27 and Examination Year 2028: … (ISC) -
Examination Year 2028 (Classes XI & XII)"; and the Regulations speak of "each year of the two-year course". So:

- **Class XI** comes from each subject's document in "Regulations and Syllabuses ISC – 2028"
  (https://cisce.org/regulations-and-syllabus-isc-2028/, dated January 2026), its Class XI part only.
- **Class XII** comes from each subject's document in "Regulations and Syllabuses ISC – 2027"
  (https://cisce.org/regulations-and-syllabus-isc-2027/, dated February 2025), its Class XII part only.
- Each document prints "CLASS XI" and "CLASS XII" separately; only the class's own part is used. The 2028 documents'
  Class XII parts (for 2027-28) and the 2027 documents' Class XI parts (for 2025-26) are not used.
- Not used: "Revised Syllabus – ISC 2026 (in selected subjects)" (https://cisce.org/regulations-and-syllabus-isc-2026-revised/),
  the Class XII syllabuses revised for the 2026 examination, which is over.
- English Literature (Class XI) and Hindi come from **Appendix I, the List of Prescribed Textbooks**, of the same sets:
  the 2028 English syllabus names only the three books for Class XI, and the Indian Languages syllabus (one document
  for all Indian languages) sends the reader to Appendix I for each language's books. The April 2026 Appendix I files
  carry CISCE's split of the Hindi texts between Class XI and Class XII (the circular above).

Pages are the PDF's page numbers (page 1 is the first page of the file); a line printed across a page break names both
pages (`9-10`). The page links in the table open at the class's course structure (or list) page.

| Class | Subject | Document (examination year) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| XI | physics | Physics (861), ISC 2028: https://cisce.org/wp-content/uploads/2026/02/ISC-2028-Physics.pdf | 10 | 10 | 0 | 4 (course structure), 5–6, 9–11 (sub-headings) |
| XII | physics | Physics (861), ISC 2027: https://cisce.org/wp-content/uploads/2026/02/ISC-2027-Physics.pdf | 9 | 12 | 0 | 15 (course structure), 16–18, 20–24 |
| XI | chemistry | Chemistry (862), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/19.-Chemistry.pdf | 9 | 4 | 0 | 4 (course structure), 9–12 |
| XII | chemistry | Chemistry (862), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/19.-ISC-Chemistry-1.pdf | 10 | 0 | 0 | 14 (course structure) |
| XI | biology | Biology (863), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/20.-Biology.pdf | 5 | 19 | 0 | 4 (course structure), 5–9 |
| XII | biology | Biology (863), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/20.-ISC-Biology.pdf | 5 | 13 | 0 | 13 (course structure), 14–18 |
| XI | mathematics | Mathematics (860), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/17.-Mathematics.pdf | 5 | 15 | 0 | 4 (course structure), 5–11 |
| XII | mathematics | Mathematics (860), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/17.-ISC-Mathematics.pdf | 7 | 9 | 0 | 11 (course structure), 12–15 |
| XI | accountancy | Accountancy (858), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/15.-Accountancy.pdf | 10 | 37 | 31 | 4 (course structure), 5–8 |
| XII | accountancy | Accountancy (858), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/15.-ISC-Accountancy.docx.pdf | 7 | 20 | 49 | 9 (course structure), 10, 13–21 |
| XI | business_studies | Business Studies (857), ISC 2028: https://cisce.org/wp-content/uploads/2026/09/Business-Studies.pdf | 5 | 20 | 14 | 4 (course structure), 5–6 |
| XII | business_studies | Business Studies (859), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/16.-ISC-Business-Studies-1.pdf | 5 | 25 | 5 | 7–10 (no course structure table) |
| XI | economics | Economics (856), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/13.-Economics-1.pdf | 3 | 18 | 0 | 4–6 (no course structure table) |
| XII | economics | Economics (856), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/13.-ISC-Economics-1.pdf | 2 | 12 | 7 | 7 (course structure), 9–10 |
| XI | history | History (851), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/8.-History.pdf | 2 | 12 | 25 | 4–7 (no course structure table) |
| XII | history | History (851), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/8.-ISC-History-2.pdf | 2 | 11 | 37 | 8–10 |
| XI | geography | Geography (853), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/10.-Geography.pdf | 2 | 6 | 26 | 4–7 |
| XII | geography | Geography (853), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/10.-ISC-Geography-1.pdf | 1 | 6 | 26 | 9–14 |
| XI | political_science | Political Science (852), ISC 2028: https://cisce.org/wp-content/uploads/2026/01/9.-Political-Science.pdf | 2 | 12 | 0 | 4–5 |
| XII | political_science | Political Science (852), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/9.-ISC-Political-Science-1.pdf | 2 | 10 | 2 | 7–8 |
| XI | english | Appendix I, List of Prescribed Textbooks, ISC 2028: https://cisce.org/wp-content/uploads/2026/04/40.-Appendix-I-List-of-Prescribed-Textbooks.pdf | 3 | 10 | 0 | 4 (English, "Syllabus to be covered in Class XI") |
| XII | english | English (801), ISC 2027: https://cisce.org/wp-content/uploads/2025/04/2.-ISC-English.pdf | 3 | 10 | 0 | 8 ("Syllabus to be covered", Class XII column) |
| XI | hindi | Appendix I, ISC 2028 (same file as English XI) | 4 | 12 | 0 | 10 (Hindi (805), "Syllabus to be covered in Class XI") |
| XII | hindi | Appendix I, ISC 2027: https://cisce.org/wp-content/uploads/2026/04/40.-ISC-Appendix-I-List-of-Prescribed-Textbooks.pdf | 4 | 13 | 0 | 5 (Hindi (805), "Syllabus to be covered in Class XII") |

### How the lines were taken from the documents

- **The same rules as the files above:** units, chapters and topics as the course structure prints them; wording as
  printed (line breaks joined, repeated spaces made one, capitals, punctuation and slips kept, a trailing colon kept as
  in "Types of agriculture:"); numbers and labels ("1.", "(i)", "(a)", "I.") left out; learning outcomes, exam
  formats, notes and explanations never taken. Where the text words a unit differently from the course structure
  table, the table wins (each case is on the subject's proof page).
- **Every ISC syllabus prints the same layout:** numbered units ("1. Kinematics"), each followed by a short syllabus
  statement and an explanation in italics; inside a unit, numbered items "(i)", lettered items "(a)" and, in some
  subjects, bullets.
- **Units.** The units of the class's course structure table (the "UNIT" column). Where the theory paper groups its
  numbered units under named parts, the parts are the units and the numbered units are the chapters, the rule of the
  CBSE commerce and humanities file: History ("INDIAN HISTORY", "WORLD HISTORY"), Political Science XI ("Political
  Theory", "Contemporary International Relations"), Political Science XII ("Constitution and Government", "Indian
  Democracy"), Geography XI (two parts) and XII (one part, "INDIA IN THE WORLD’S CONTEXT"), Economics XII (the table's
  two halves, "MICROECONOMIC THEORY" and "MACROECONOMICS", marks left out). Business Studies XII, Economics XI, History,
  Geography and Political Science print no course structure table; their units are the numbered headings (or the parts
  above them) of the theory paper.
- **Chapters, science and mathematics.** The sub-headings printed under a unit: "(i) Motion in a Straight Line", or the
  one unnumbered heading "Units and Measurements". Where the content runs on after a heading on the same line, the
  chapter is the name before the colon ("(i) Thermal Properties of Matter: Heat, …" gives "Thermal Properties of
  Matter") or before the full stop that starts the content ("Continuity, Differentiability and Differentiation"). A unit
  with no sub-heading has no chapter line, as for CBSE Chemistry: numbered items that are content ("(i) Introduction,
  concepts, types of system, …" in Chemical Thermodynamics), numbered paragraphs of explanation in italics (Physics XI
  Work, Energy and Power; Gravitation), labels inside running text ("Haloalkanes:") and bold headings inside an
  explanation ("Aryl ethers") are not chapters. An unnumbered line printed above a numbered list of sub-headings is that
  list's heading, not a chapter ("Classification of Hydrocarbons", "Matrices and Determinants").
- **Chapters, the other subjects.** For units that are the numbered units: the parts the course structure table lists
  under a unit (Accountancy XII "A. Fundamentals of Partnership"; Economics XII "(i) Demand"), otherwise the
  first-level items printed under the unit, in either type: "(i)", "(ii)" … (Accountancy XI, Business Studies,
  Economics XI, Accountancy XII units 4, 6 and 7), or "A. Liquidity Ratios:" … (Accountancy XII Ratio Analysis). For
  units that are parts: the numbered units.
- **Topics.** The first-level list printed under a chapter: lettered items "(a)" … under a numbered item; numbered items
  "(i)" … under a numbered unit (History, Geography, Economics XII); the table's "I., II., III." under Accountancy XII
  Reconstitution of Partnership. Each topic is the item's own paragraph: the explanation printed below it (in italics,
  as a new paragraph) is not taken, and **a list under a topic is not taken** (the CSV has three levels). Also not
  taken: lists after "NOTE:" or "Amendments:", and bullet lists inside an explanation after a label ("Various theories
  of the origin of State:", "The following items are to be taken when calculating net cash flows from financing
  activities:", "The following examples of DBMS in business application:").
- **Topics, science and mathematics: none.** Physics, Chemistry, Biology and Mathematics print each chapter as running
  text followed by an explanation in italics, partly as lettered paragraphs (many longer than the 300-character limit for
  a title). Splitting it would be our wording: the rule of the CBSE science file.
- **Items longer than a title (7; the supervisor should confirm).** Seven items are printed as one paragraph of more
  than 300 characters. Each line is the item's name, its words before the first colon or bracket, or the label printed
  in bold, as the CBSE file named formatively assessed chapters by the text before the first dash: Accountancy XI
  "Basic Terms" (393 characters), "GAAP" (317), "Sub-division of journal" (454) and, under it, "Cash book" (305);
  History XII "Second Wave Feminist Movement in USA (early 1960s – early 1980’s)" (407); Geography XI "Structure and
  composition of the earth’s interior" (352); Geography XII "Climate: India" (637, the bold label).
- **English.** ISC English has two papers. English Language (composition, directed writing, proposal writing, grammar,
  comprehension) prints question types, not chapters, and is not taken. Literature in English: the units are the three
  prescribed books, the chapters the short stories and poems listed for the class; the play is a unit with its acts in
  its name ("DRAMA: Macbeth - William Shakespeare (Acts I & II)"). The publisher printed in brackets after each book is
  left out of its name.
- **Hindi.** CISCE's Indian Languages syllabus is one English document for all Indian languages: a language section
  (composition, comprehension, grammar; not taken) and prescribed textbooks, listed per language in Appendix I. The units
  are the four Hindi books; the chapters are the portion of the novel ("Poorvarddh (Adhyaay 1- 10)"), the acts of the
  play ("Ank 1"), and the stories and poems listed for the class. The publisher ("– Published by: …") is left out of
  each collection's name. "Any three of the following books are to be offered": all four are in.
- **Keys and positions** count from 1 under the parent, in printed order (`cisce.c11.physics.u1`,
  `cisce.c11.physics.u1.ch01`, `….t01`). Where CISCE skips a number (Business Studies XI "(iv)" then "(vi)"), the
  positions do not.

### Choices to confirm (the supervisor)

- **Parts as units** (History, Political Science, Geography, Economics XII), as in the CBSE file; elsewhere the numbered
  units are the units. Chemistry's table prints "Physical Chemistry", "Inorganic Chemistry" and "Organic Chemistry" in
  its weightage column beside groups of units: read as mark groups, not parts, so not a level. Accountancy XII's
  Sections A, B and C are question-paper sections (a candidate answers B or C; Section A has no name): not a level, and
  both options (units 3–5 and 6–7) are in. Political Science XII's sub-heading "Organs of the Government" (over
  chapters 4–6) is not a level.
- **The seven items named by the words before their colon** (above).
- **Science and mathematics have no topics**, even where a chapter prints a short lettered list (Biology XI
  "Morphology of Flowering Plants" (a), (b)).
- **Chapters cut at a colon or full stop** in science and mathematics: Physics XI "Thermal Properties of Matter",
  "Kinetic Theory", "Oscillations", "Waves"; Physics XII "Semiconductor Electronics: Materials, Devices and Simple
  Circuits", "Semiconductor diode"; Mathematics XII "Types of relations", "Continuity, Differentiability and
  Differentiation", "Application of Integrals (Area under the curve)".
- **Notes in a heading left out:** Geography XI "(not to be tested)." after "Geography - its interdisciplinary approach
  and future prospects" (as in the CBSE file). "7. Map Work" (Geography XI and XII) is a map question with its map list
  and is not taken, as in the CBSE file.
- **Hindi has four books**, though a candidate offers three; **English XI** comes from Appendix I (page 4) because the
  2028 English syllabus names only the books.

### Not in this file (never guessed)

| What | Why |
|---|---|
| Other ISC subjects: Commerce, Computer Science, Psychology, Sociology, Environmental Science, Home Science, Legal Studies, Fashion Designing, Electricity and Electronics, Engineering Science, Geometrical & Mechanical Drawing, Geometrical & Building Drawing, Art, Music, Physical Education, Biotechnology, Mass Media and Communication, Hospitality Management, Artificial Intelligence, Robotics, Applied Mathematics, Entrepreneurship (new in the 2028 set), Elective English, Modern English, the other Indian languages, modern foreign languages, classical languages, SUPW | Not yet in: outside this slice's subject list. |
| Practical work, project work, practical files, map work, question-paper patterns, the list of scientists (Biology) | Assessment and exam formats, not chapters or topics. |
| The English Language paper and the Indian-language section | Question types (composition, comprehension, grammar), not chapters. |
| Chemistry XII chapters, Chemistry XI chapters outside Equilibrium and Hydrocarbons, and chapters of the science units with no sub-heading | Content printed as running text (see "Chapters, science and mathematics"). |
| Hindi titles (`title_hi`) | Empty on every line. Every document used is in English, and CISCE's ISC 2027 and 2028 pages link no Hindi version of any of them (checked 2026-10-22). Appendix I prints the Hindi books in Roman letters ("Saara Aakash (Novel): Rajendra Yadav"); no Devanagari title is printed. Nothing was translated or transliterated. |

### How the supervisor checks a line

As for the files above: open the line's `source_url` at `source_page`, find the title, then check its parent and its
position. The 2027 documents print two columns: read down the left column, then the right. **Mechanical check:** for
653 of the 655 lines the whole title (spaces removed, dashes and quotation marks made plain) is in the text of its cited
page (`pdftotext -layout` and `-raw`); the other two are printed across a page break (the page footer interrupts them:
Business Studies XII "Insurance Regulatory and Development Authority of India (IRDA): …", pages 9–10, and Economics XII
"Concepts and definition of NY, GNP, …", pages 9–10), and every word of them is on the cited pages. The importer's checker
(`readCatalogCsv`, run with the date 2026-10-22) finds no problem; `test/content/catalog-csv.test.ts` checks the counts
above, the source documents (all on cisce.org) and the Hindi-title rule.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `cisce-class11-physics.md` to `cisce-class12-hindi.md`.
