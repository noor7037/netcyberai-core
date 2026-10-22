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
- **Hindi titles (`title_hi`).** CBSE's 2026-27 curriculum page links no Hindi version of these four documents (its
  Hindi PDFs are the Hindi language syllabi; checked again on 2026-10-21, see "Hindi titles and Class X Science topics:
  checked again"). Since 2026-10-22, 130 of the 276 lines carry the Hindi name of the same chapter or section from
  NCERT's Hindi edition of the textbook, copied as printed; the other lines have none and the app shows the English
  title. Nothing was translated. See
  ["Hindi titles from NCERT's Hindi editions"](#hindi-titles-from-ncerts-hindi-editions-classes-ixxii) below.

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
`cbse-2026-27-maths-science.csv` above. Every line is `in_review`; every line was read on **2026-10-22**. 247 lines:
192 from CBSE's documents and 55 lesson lines from NCERT's books, for the lessons CBSE does not list (Class IX English
and Hindi, Class X Hindi; see "Lessons from NCERT's books" below, C273).

All six documents are linked from https://cbseacademic.nic.in/curriculum_2027.html ("Curriculum for the Academic Year
2026-27", Secondary Curriculum Part 1, Class IX and Class X; the link names are given below). Pages are the PDF's page
numbers (page 1 is the first page of the file); a line printed across a page break names both pages (`11-12`).

| Class | Subject | Document (link name on the curriculum page) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| IX | social_science | "Social Science" (Main Subjects), code 087: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/SocialScience_SecP1IX_2026-27.pdf | 2 | 16 | 74 | 8–14 ("Course Outline", Part 1 and Part 2: the "Theme" column gives the chapters, the "Outline/Concepts" bullets the topics) |
| X | social_science | "Social Science" (Main Subjects - Group-A1), code 087: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/SocialScience_SecP1X_2026-27.pdf | 4 | 22 | 10 | 1–2 (course structure: books, chapters, and the subtopics of Economics chapter 4), 3 (History chapter III subtopics) |
| IX | english | "English" (Languages): https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/English_LL_SecP1IX_2026-27.pdf, and NCERT's Kaveri: https://ncert.nic.in/textbook/pdf/iebe1ps.pdf | 2 | 23 | 3 | 13 (Section B, "II. Grammar"; the R2 list on page 15 is the same), 12 (the prescribed textbook, Kaveri); Kaveri's contents, page 17 |
| X | english | "English - Language and Literature" (Languages - Group-L), code 184: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/English_LL_SecP1_2026-27.pdf | 3 | 33 | 3 | 2 (Section B, "II Grammar"), 4 ("Prescribed Books": FIRST FLIGHT and FOOTPRINTS WITHOUT FEET) |
| IX | hindi | "Hindi" (Languages), its आर-1 (R1) scheme: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Hindi_SecP1IX_2026-27.pdf, and NCERT's गंगा: https://ncert.nic.in/textbook/pdf/ihga1ps.pdf | 2 | 16 | 3 | 3 (section table), 4–5 (खंड-ख, व्यावहारिक व्याकरण); गंगा's cover, page 1, and contents, page 17 |
| X | hindi | "Hindi Course-A" (Languages - Group-L), code 002: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Hindi_A_SecP1_2026-27.pdf, and NCERT's क्षितिज भाग 2 and कृतिका भाग 2: https://ncert.nic.in/textbook/pdf/jhks1ps.pdf, https://ncert.nic.in/textbook/pdf/jhkr1ps.pdf | 3 | 19 | 9 | 9–10 (section table and खंड-ख, व्यावहारिक व्याकरण), 11 (the prescribed books and the lessons not examined); क्षितिज's contents, pages 13–14, कृतिका's, page 13 |

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

### Lessons from NCERT's books (added 2026-10-22, C273)

CBSE names the textbook but not its lessons for Class IX English, Class IX Hindi and Class X Hindi Course A, so those
lessons come from the contents page of NCERT's book (listed on https://ncert.nic.in/textbook.php, read on 2026-10-22).
Each book is a unit after the grammar unit, as Class X English's books are; its lessons are the chapters, in printed
order, numbered from 1.

| Class | Book (NCERT code) | Unit's source | Chapters | Topics | Contents page |
|---|---|---|---|---|---|
| IX english | Kaveri, Textbook of English for Grade 9 (`iebe1`) | CBSE page 12, "Prescribed Textbook- Kaveri: Textbook of English for Grade 9" (the words before the colon) | 16 | 0 | `iebe1ps.pdf` p. 17 |
| IX hindi | गंगा, कक्षा 9 के लिए हिंदी की पाठ्यपुस्तक (`ihga1`, first edition March 2026) | the book's cover, `ihga1ps.pdf` page 1 (CBSE's page 5 names no book) | 12 | 0 | `ihga1ps.pdf` p. 17 |
| X hindi | क्षितिज भाग 2 (`jhks1`, reprint 2026-27) | CBSE page 11, "क्षितिज, भाग–2" | 12 | 8 | `jhks1ps.pdf` pp. 13–14 |
| X hindi | कृतिका भाग 2 (`jhkr1`, reprint 2026-27) | CBSE page 11, "कृतिका, भाग–2" | 3 | 0 | `jhkr1ps.pdf` p. 13 |

- **Kaveri** prints eight numbered units, each a prose piece and a poem (its "About the Book", page 5), with no unit
  names on the contents page; the sixteen pieces are the chapters, in printed order (prose, then its poem).
- **Chapters are the lessons' titles.** Where the contents page prints the title and the author in separate columns
  (गंगा, कृतिका), the title is the chapter and the author is not taken, as for Malhar (C269). क्षितिज numbers each
  author in bold with the works under them: an entry with one work is that work's title ("आत्मकथ्य", "नेताजी का
  चश्मा"); an entry with several works is the author's name as printed ("सूरदास", "सूर्यकांत त्रिपाठी ‘निराला’",
  "नागार्जुन"), and each work under it is a topic (सूरदास's four पद by their first lines). **To confirm.**
- **Left out:** गंगा's two unnumbered "साथ-साथ पढ़ें" (read along) pieces and "भाषा संगम", कृतिका's "लेखक-परिचय", and
  each book's आमुख, "यह पुस्तक" and "पाठ्यपुस्तकों में पाठ्य सामग्री का पुनर्संयोजन" pages.
- **Lessons CBSE does not examine.** CBSE page 11 lists seven Class X lessons from which no question is asked (देव,
  गिरिजाकुमार माथुर, ऋतुराज, महावीरप्रसाद द्विवेदी, सर्वेश्वर दयाल सक्सेना; कृतिका's "एही ठैयाँ झुलनी हेरानी हो रामा!" and
  "जार्ज पंचम की नाक"). None of them is in the 2026-27 reprints, so every lesson on the contents pages is kept.
- **Class IX Hindi** is one book for R1 and R2 (CBSE pages 1 and 5: NCERT's textbook under the 2023 framework); NCERT's
  textbook page lists गंगा as the only Class 9 Hindi book.
- **Typed from the page.** The Hindi books' hidden text is damaged (गंगा's doubles some conjuncts; क्षितिज and कृतिका
  use an old font that stores other letters), so each title was typed from the contents page rendered as a picture,
  transcribed a second time by a separate reader and compared, and its punctuation checked against the PDF's own text
  (the old font stores a hyphen for "राम-लक्ष्मण-परशुराम" and "साना-साना", and three full stops for "जोड़ि...").
  गंगा's "भारति, जय, विजयकरे!" is printed with no space before the "!" (the hidden text has one).

### Gaps in this file (not filled; never guessed)

| What | Where we looked | What was found |
|---|---|---|
| **Class X English workbook** (WORDS AND EXPRESSIONS – II, "Units 1 to 4 and Units 7 to 11") | `English_LL_SecP1_2026-27.pdf`, page 4 | The unit names are not printed. |
| **Class X Social Science, Disaster Management** ("Together, towards a safer India- Part III", CBSE) | `SocialScience_SecP1X_2026-27.pdf`, page 11 | Listed among the prescribed textbooks, with no chapters and no place in the course structure. |
| **Class X Social Science map work** | `SocialScience_SecP1X_2026-27.pdf`, pages 7–8 | A list of places to locate on maps, not chapters or topics. |
| **Class IX Social Science course structure (marks)** | `SocialScience_SecP1IX_2026-27.pdf`, page 14 | "Course Structure will be provided shortly"; the course outline is used instead. |
| **English Communicative (X), Hindi Course B (X), Hindi R2 (IX)** | the curriculum page and the documents | Separate courses or schemes; not in this file (see "which course" above). |

### How the supervisor checks a line

As for the Mathematics and Science file: open the line's `source_url` at `source_page`, find the title, then check
its parent and its position. The quick mechanical check (every word of three or more letters in `title_en` is on its
cited page, text extracted with `pdftotext`) passes for all 195 English and Social Science lines (Kaveri's 17
included). The 52 Hindi lines cannot be checked this way (see "Hindi lines" and "Typed from the page"); compare them
with the page by eye. The file passes the importer's checker (`readCatalogCsv` in `src/lib/content/catalog-csv.ts`,
run with the date 2026-10-22): 247 lines, no problems. `test/content/catalog-csv.test.ts` checks each version's
counts, which lines come from NCERT's books, and the Hindi-title rule.
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
- **Hindi titles (`title_hi`).** Since 2026-10-22, 116 of the 155 lines carry the Hindi name of the same chapter or
  unit from NCERT's Hindi edition of the textbook, copied as printed: see
  ["Hindi titles from NCERT's Hindi editions"](#hindi-titles-from-ncerts-hindi-editions-classes-ixxii) below. CBSE
  itself publishes none. Checked on 2026-10-22: the 2026-27 page (also with
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

### Hindi titles from NCERT's Hindi editions (Classes IX–XII)

Added on 2026-10-22 (F2 handover, item 4), in both CBSE files above: `cbse-2026-27-maths-science.csv` (Classes IX–X
Mathematics and Science) and `cbse-2026-27-classes-11-12-science-maths.csv` (Classes XI–XII Physics, Chemistry,
Biology, Mathematics). CBSE publishes no Hindi version of these curriculum documents, but CBSE schools teach the subjects
from NCERT's textbooks, and NCERT publishes each one in Hindi. Where a CBSE line is one chapter, unit or numbered section
of the NCERT book, its `title_hi` is that chapter's, unit's or section's name in NCERT's Hindi edition, as printed, the
precedent of C262 (Classes 6–8). Nothing was translated or transliterated. `title_en` is unchanged (CBSE's wording), and
so are every other column and every `checked_on` (the date the line was read in CBSE's document).

| Class | Subject | Hindi edition (as ncert.nic.in lists it) | Contents PDF (pages) | Headings from | Units | Chapters | Topics | Lines |
|---|---|---|---|---|---|---|---|---|
| IX | mathematics | Ganita Manjari (Hindi), गणित मंजरी भाग 1 (https://ncert.nic.in/textbook.php?ihmh1=0-8) | https://ncert.nic.in/textbook/pdf/ihmh1ps.pdf (19) | `ihmh101`–`ihmh108.pdf` | 0/6 | 8/15 | 33/88 | 41/109 |
| IX | science | Anveshan, अन्वेषण (https://ncert.nic.in/textbook.php?ihsc1=0-13) | https://ncert.nic.in/textbook/pdf/ihsc1ps.pdf (23–24) | `ihsc101`–`ihsc113.pdf` | 0/4 | 12/12 | 42/78 | 54/94 |
| X | mathematics | Ganit (https://ncert.nic.in/textbook.php?jhmh1=0-14) | https://ncert.nic.in/textbook/pdf/jhmh1ps.pdf (13–16) | `jhmh101`–`jhmh111.pdf` | 0/7 | 15/15 | 10/34 | 25/56 |
| X | science | Vigyan (https://ncert.nic.in/textbook.php?jhsc1=0-13) | https://ncert.nic.in/textbook/pdf/jhsc1ps.pdf (13) | — | 0/5 | 10/12 | — | 10/17 |
| XI | physics | Bhautiki-I, Bhautiki-II (https://ncert.nic.in/textbook.php?khph1=0-7, ?khph2=0-7) | `khph1ps.pdf` (13–14), `khph2ps.pdf` (15–17) | — | 0/10 | 14/14 | — | 14/24 |
| XII | physics | Bhautiki-I, Bhautiki-II (?lhph1=0-8, ?lhph2=0-6) | `lhph1ps.pdf` (13–15), `lhph2ps.pdf` (13–14) | — | 0/9 | 14/14 | — | 14/23 |
| XI | chemistry | Rasayan Vigyan bhag-I, bhag-II (?khch1=0-6, ?khch2=0-3) | `khch1ps.pdf` (11–12), `khch2ps.pdf` (11) | — | 9/11 | — | — | 9/11 |
| XII | chemistry | Rasayan vigyan bhag I, bhag II (?lhch1=0-5, ?lhch2=0-5) | `lhch1ps.pdf` (13–14), `lhch2ps.pdf` (11–12) | — | 10/14 | — | — | 10/14 |
| XI | biology | Jeev Vigyan (?khbo1=0-19) | `khbo1ps.pdf` (11–12) | — | 5/5 | 19/20 | — | 24/25 |
| XII | biology | Jeev Vigyan (?lhbo1=0-13) | `lhbo1ps.pdf` (11–12) | — | 5/5 | 13/14 | — | 18/19 |
| XI | mathematics | Ganit (?khmh1=0-14) | `khmh1ps.pdf` (13–15) | — | 0/5 | 14/15 | — | 14/20 |
| XII | mathematics | Ganit-I, Ganit-II (?lhmh1=0-6, ?lhmh2=0-7) | `lhmh1ps.pdf` (13–14), `lhmh2ps.pdf` (15–16) | — | 0/6 | 13/13 | — | 13/19 |

All PDFs are under https://ncert.nic.in/textbook/pdf/ and every `?…` link is on https://ncert.nic.in/textbook.php; the
books are the ones that page lists for these classes on 2026-10-22. In all: 246 of 431 lines (130 of 276 and 116 of
155). The English editions used to match the lines are the same books' English versions (`iemh1`, `iemh2`, `iesc1`,
`jemh1`, `jesc1`, `keph1`–`2`, `kech1`–`2`, `kebo1`, `kemh1`, `leph1`–`2`, `lech1`–`2`, `lebo1`, `lemh1`–`2`).

**Where each Hindi title's source is recorded.** The catalog CSV keeps one source per line (CBSE's document, as before).
Each Hindi title's own source is a line of
[`hindi-sources/cbse-2026-27-classes-9-12.csv`](hindi-sources/cbse-2026-27-classes-9-12.csv): the key, the Hindi title,
the Hindi PDF and page it is printed on, the NCERT chapter, unit or section (`ch. 3`, `Unit 5`, `§6.8.1`), NCERT's
English name for it, and the day it was read. `test/content/catalog-csv.test.ts` checks that every `title_hi` in the two
files is Devanagari and has its line there, with the same title. The proof sheets show both beside each line.

How a line was matched (one to one, by number and content):

- **Chapters.** A CBSE chapter takes the Hindi name of the one NCERT chapter it is, recorded with that chapter's number.
  Classes X–XII: CBSE names the chapters as NCERT does, apart from small differences ("Units and Measurements",
  "Relations & Functions", "Control and co-ordination in animals and plants" for NCERT's "Control and Coordination",
  "Magnetic effects of current" for "Magnetic Effects of Electric Current", "Reproduction" for "How do Organisms
  Reproduce?"). **Class IX** uses NCERT's new 2026-27 books, and CBSE names their chapters in its own words: the IX
  Science course structure gives each unit's NCERT chapter numbers (I: 2, 3, 11, 12; II: 5, 8, 9; III: 4, 6, 7, 10; IV:
  13), which fix the match; IX Mathematics gives none, so its chapters were matched by content: each CBSE chapter's key
  concepts are the sections of exactly one NCERT chapter ("Coordinate Geometry" is chapter 1, "Orienting Yourself: The
  Use of Coordinates"; "Circles" is chapter 5, "I'm Up and Down, and Round and Round"). **The supervisor should
  confirm** the Class IX matches and the Class X ones whose wording differs; each proof sheet prints NCERT's English name
  beside them.
- **Two Class X Mathematics chapter lines are NCERT sections**: "TRIGONOMETRIC IDENTITIES" is §8.4 of "Introduction to
  Trigonometry", and "HEIGHTS AND DISTANCES: …" is §9.1, the one section of "Some Applications of Trigonometry". Each
  takes that section's Hindi heading (to confirm).
- **Units** only where NCERT prints the same unit: Chemistry (NCERT's "Unit 1" … are its chapters, one per CBSE unit)
  and Biology (NCERT groups its chapters in the same units, I–V and VI–X). The Physics and Mathematics books and the
  Class IX–X books print no units, so those unit lines have none.
- **Topics** (Classes IX–X Mathematics, IX Science) only where a CBSE topic and one numbered heading of the NCERT chapter
  (a section or sub-section) name the same thing: the heading's words are in the topic or the topic's in the heading,
  and the topic covers no other heading ("Heron’s formula" is §6.8.1 "Heron’s formula"; "Isotopes" is §8.9.1). A topic
  that spans two headings ("Perimeter of a circle: Introduction to Pi and its irrationality": §6.2 and §6.3), names
  something the chapter does not head ("Tower of Hanoi puzzle"), or matches only an unnumbered heading
  ("Brahmagupta’s formula …") has none.

How the titles were read:

- **From the printed page.** NCERT's text layer is damaged in the new books (letters doubled, vowel signs out of place)
  and in a legacy 8-bit font in the older ones, so every title was typed from a picture of the printed contents line or
  heading; no picture is kept (C262, C273). Chapter and unit names are the contents page's; section names are the
  heading in the chapter's PDF.
- **Mechanical check:** every letter and vowel sign of each typed title is found in one line of the cited page's text
  layer (the legacy font converted letter by letter): 245 of 246. The one exception is §6.3 of Class IX Science,
  "घर्षण बल— प्रायः अनदेखा परंतु सदैव विद्यमान बल", whose visarga the text layer stores as a colon.
- **Kept as printed:** the spacing around dashes ("अगले पद का पूर्वानुमान— अनुक्रमों …", " — " in the other Class IX
  titles, "अर्धचालक इलेक्ट्रॉनिकी– पदार्थ, …", "जैव प्रौद्योगिकी- सिद्धांत व प्रक्रम"), "d- एवं f- ब्लॉक के तत्व",
  "तरलों के यांत्रिकी गुण", "वैद्युत" or "विद्युत" as each title prints it, and "जीव जनन कैसे करते हैं" (the Hindi contents
  prints no question mark; the English has one). Physics XI chapter 1: Part I's own contents prints "मात्रक एवं मापन"
  (used); the list of Part I printed in Part II says "मात्रक और मापन".

Not filled (never guessed):

| Lines | Why |
|---|---|
| Unit lines of Physics and Mathematics (XI–XII) and of Classes IX–X (52) | NCERT's books print no units. |
| Class IX Mathematics: "Linear Equations in Two Variables", "4-gons (Quadrilaterals)", "Surface Area and Volume", "Statistics" and their topics | Their NCERT chapters are in Ganita Manjari Part II (13 "Two Variables, One Line", 12 "Quadrilaterals", 14 "Math of Space: Surface Area and Volume", 10 "How Quantities Combine: Understanding Data"). NCERT has published no Hindi edition of Part II: textbook.php lists Part I only, and `ihmh2ps.pdf` returns HTTP 404 (2026-10-22). |
| Class IX Mathematics: "Introduction to Euclid’s Geometry: Axioms and Postulates", "Lines and Angles", "Triangles – Congruence Theorems" and their topics | No chapter of either part has these names or is these chapters one to one; the nearest, Part II chapter 9 "Propositions and their Converses", has no Hindi edition either. |
| Class X Science: "Periodic Classification of Elements", "Evolution" | Not in NCERT's 2026-27 book (chapter 8 is "Heredity" only); CBSE assesses them only formatively. |
| The nine formatively assessed lines of the XI–XII file (Chemistry units 10–11 and 11–14, "Digestion and Absorption", "Environmental Issues", "Principle of Mathematical Induction") | No chapter in NCERT's current books. |
| Topics with no matching numbered heading (25 in IX Mathematics, 36 in IX Science, 24 in X Mathematics) | See "Topics" above: CBSE's key concepts are finer or broader than the book's sections. |
| Every CISCE line (ICSE IX–X, ISC XI–XII) | CISCE's syllabuses are not NCERT's books, CISCE publishes no Hindi version, and no CISCE line names an NCERT chapter as its source, so NCERT's Hindi names are not borrowed. |

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
as the files above. Every line is `in_review`; every line was read on **2026-10-22**. 766 lines (41 units, 238 chapters,
487 topics): 703 from CBSE's documents and 63 Hindi Core lesson lines from NCERT's books (see "Hindi Core's lessons from
NCERT's books" below, C273). Load it the same way:

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
| XI | hindi | "Hindi Core", हिंदी (आधार), code 302: https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf | 3 | 27 | 2 | 9 (निर्धारित पाठ्यपुस्तकें); the lessons from NCERT's books (below) |
| XII | hindi | same document | 3 | 24 | 10 | 11 (निर्धारित पुस्तकें); the lessons from NCERT's books (below) |

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

### Hindi Core's lessons from NCERT's books (added 2026-10-22, C273)

CBSE names Hindi Core's three books (the units) and lists the lessons it removes (pages 9 and 11), not those studied,
so the lessons come from the contents page of each NCERT book (listed on https://ncert.nic.in/textbook.php, read on
2026-10-22). The same rules as the Class IX–X Hindi lessons (see that file's "Lessons from NCERT's books"): the
lesson's title is the chapter, the author is not taken; where one numbered entry holds several works, the chapter is the
author's name as printed and each work is a topic (**to confirm**); positions count from 1 in printed order.

| Class | Unit (book) | NCERT PDF | Chapters | Topics | Contents page |
|---|---|---|---|---|---|
| XI | आरोह, भाग-1 | `khar1ps.pdf` (reprint 2026-27) | 16 | 2 | pp. 13–14 |
| XI | वितान भाग–1 | `khvt1ps.pdf` (reprint 2026-27) | 4 | 0 | p. 11 |
| XI | अभिव्यक्ति और माध्यम | `kham1ps.pdf` (reprint 2025-26, one book for both classes) | 7 | 0 | pp. 11–12 |
| XII | आरोह, भाग–2 | `lhar1ps.pdf` (reprint 2026-27) | 15 | 10 | pp. 11–12 |
| XII | वितान, भाग–2 | `lhvt1ps.pdf` (reprint 2026-27) | 3 | 0 | p. 13 |
| XII | ‘अभिव्यक्ति और माध्यम’ | `kham1ps.pdf` | 6 | 0 | pp. 11–12 |

- **आरोह भाग 1** prints "गद्य खंड" (1–8) then "काव्य खंड" (1–8); the CSV has no level between a book and its lessons, so
  the poems follow as positions 9–16, as for Class X First Flight. अक्कमहादेवी's two numbered poems are the topics of
  the chapter "अक्कमहादेवी". **आरोह भाग 2** numbers its entries 1–15 straight through; five of them hold two works each
  (हरिवंश राय बच्चन, कुँवर नारायण, तुलसीदास, उमाशंकर जोशी, बाबा साहेब भीमराव आंबेडकर).
- **The lessons CBSE removes are not in the 2026-27 reprints**, so every lesson on the contents pages is kept: Class XI
  कबीर's second पद, मीरा's second पद, "पथिक", "वे आँखें", "स्पीति में बारिश", "आत्मा का ताप" (page 9); Class XII "सहर्ष
  स्वीकारा है", फ़िराक गोरखपुरी's गज़ल, "चार्ली चैप्लिन यानी हम सब", "नमक" and वितान's "डायरी के पन्ने" (page 11).
- **अभिव्यक्ति और माध्यम** is one book with sixteen numbered chapters for both classes and both courses. CBSE names the
  ones Hindi Core uses in each class's section खंड-ख: Class XI "पाठ संख्या 1, 2, 9, 10, 14, 15 तथा 16" (page 8),
  Class XII "पाठ संख्या 3, 4, 5, 11, 12 तथा 13" (page 10). They are the chapters, renumbered 1–7 and 1–6. The book
  marks the same chapters "कक्षा 11 के आधार …" and "कक्षा 12 के आधार …". **To confirm:** Class XII question 4 (page
  10) lists 3, 4, 5, 11 and 13 without 12; the section heading's list (with 12) is used.
- **Left out:** वितान भाग 1's "लेखकों के बारे में" (about the authors) and the asterisk after "आलो-आँधारि" (a footnote,
  "अँधेरे का उजाला"), the books' आमुख, "यह पुस्तक" and "पाठ्यपुस्तकों में पाठ्य सामग्री का पुनर्संयोजन" pages, and अभिव्यक्ति
  और माध्यम's परिशिष्ट.
- **Typed from the page.** These books use an old font whose hidden text stores other letters, so each title was typed
  from the contents page rendered as a picture, transcribed a second time by a separate reader and compared, and its
  punctuation checked against the stored characters: a hyphen in "विदाई-संभाषण", "आलो-आँधारि", "लक्ष्मण-मूर्च्छा",
  "जाति-प्रथा", "कथा-पटकथा" and "कोश-एक परिचय"; a dash in "विशेष लेखन–स्वरूप और प्रकार"; a space before the colon in
  "बेजोड़ : लता मंगेशकर".

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
- **Hindi Core's books are its units** and their lessons, from NCERT's books, its chapters (C273, above); the Class X
  Hindi Course A lines now follow the same shape (grammar, then one unit per book).
- **English Core and Hindi Core** are the `english` and `hindi` syllabi: they are the core courses. English Elective
  (`English_elective_SecP2_2026-27.pdf`) and Hindi Elective (`Hindi_Elective_SecP2_2026-27.pdf`) are separate courses
  and are not in this file.

### Not in this file (never guessed)

| What | Where we looked | What was found |
|---|---|---|
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
pages, except "elections" (printed "elect ions", see above). The 69 Hindi lines (6 from CBSE, 63 from NCERT's books)
were compared with the page by eye. The importer's checker (`readCatalogCsv`, run with the date 2026-10-22) finds no
problem; `test/content/catalog-csv.test.ts` checks the counts above, the eight source documents and five NCERT contents
PDFs, that NCERT gives only Hindi Core's lessons, and the Hindi-title rule.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `class11-accountancy.md` to `class12-hindi.md`.

## ncert-2026-27-classes-6-8-social-science-languages.csv

Classes VI, VII and VIII, Social Science, English and Hindi (subject ids `social_science`, `english`, `hindi`, as in
`src/lib/family/subjects.ts`), academic year 2026-27, board `CBSE`. As for Mathematics and Science (the NCERT section
above), CBSE publishes no 2026-27 curriculum document for these classes and its schools teach from NCERT's current
textbooks, so the lines come from those books. One line per unit, chapter and topic, worded as the book prints it. Same
columns; every line is `in_review`; `checked_on` is **2026-10-22** (the PDFs were fetched, the headings read and
checked on that day). Load it the same way:

```
node scripts/content/catalog-sql.mjs data/catalog/ncert-2026-27-classes-6-8-social-science-languages.csv --ref "<the PR that committed it>" > load.sql
```

**Which books.** NCERT's textbook page (https://ncert.nic.in/textbook.php) lists one book per class for each subject on
2026-10-22: *Exploring Society: India and Beyond* (Social Science; classes VII and VIII in two parts), *Poorvi*
(English) and *Malhar* (Hindi). The earlier books (Honeydew, It So Happened, Vasant, Our Pasts–III and the others)
appear on that page only inside a commented-out part of its script, so they are not offered. Every book prints
"Reprint 2026-27" on its pages except three, which are the current printings NCERT lists: Social Science Grade 6
("First Edition, June 2024", reprinted February 2025 and February 2026), Grade 8 Part 2 and the Hindi edition of
Grade 7 Part 2 (both "First Edition, June 2026").

| Class | Subject | Book (NCERT page) | Contents PDF (page) | Units | Chapters | Topics | Other pages used |
|---|---|---|---|---|---|---|---|
| VI | social_science | Exploring Society: India and Beyond, Grade 6 (https://ncert.nic.in/textbook.php?fees1=0-14) | https://ncert.nic.in/textbook/pdf/fees1ps.pdf (19) | 0 | 14 | 52 | chapter PDFs `fees101`–`fees114.pdf` |
| VII | social_science | Exploring Society: India and Beyond, Grade 7, Part 1 (https://ncert.nic.in/textbook.php?gees1=0-12) and Part 2 (https://ncert.nic.in/textbook.php?gees2=0-8) | https://ncert.nic.in/textbook/pdf/gees1ps.pdf (21), https://ncert.nic.in/textbook/pdf/gees2ps.pdf (15) | 2 | 20 | 130 | title pages `gees1ps.pdf`, `gees2ps.pdf` (1); `gees101`–`gees112.pdf`, `gees201`–`gees208.pdf` |
| VIII | social_science | Exploring Society: India and Beyond, Grade 8, Part 1 (https://ncert.nic.in/textbook.php?hees1=0-7) and Part 2 (https://ncert.nic.in/textbook.php?hees2=0-8) | https://ncert.nic.in/textbook/pdf/hees1ps.pdf (21), https://ncert.nic.in/textbook/pdf/hees2ps.pdf (17) | 2 | 15 | 113 | title pages `hees1ps.pdf`, `hees2ps.pdf` (1); `hees101`–`hees107.pdf`, `hees201`–`hees208.pdf` |
| VI | english | Poorvi, Grade 6 (https://ncert.nic.in/textbook.php?fepr1=0-5) | https://ncert.nic.in/textbook/pdf/fepr1ps.pdf (15) | 5 | 16 | 0 | none |
| VII | english | Poorvi, Grade 7 (https://ncert.nic.in/textbook.php?gepr1=0-5) | https://ncert.nic.in/textbook/pdf/gepr1ps.pdf (13) | 5 | 15 | 0 | none |
| VIII | english | Poorvi, Grade 8 (https://ncert.nic.in/textbook.php?hepr1=0-5) | https://ncert.nic.in/textbook/pdf/hepr1ps.pdf (15) | 5 | 15 | 9 | unit PDFs `hepr101.pdf` (28, 33), `hepr103.pdf` (38–41) |
| VI | hindi | मल्हार, कक्षा 6 (https://ncert.nic.in/textbook.php?fhml1=0-13) | https://ncert.nic.in/textbook/pdf/fhml1ps.pdf (19) | 0 | 13 | 0 | none |
| VII | hindi | मल्हार, कक्षा 7 (https://ncert.nic.in/textbook.php?ghml1=0-10) | https://ncert.nic.in/textbook/pdf/ghml1ps.pdf (17) | 0 | 10 | 0 | none |
| VIII | hindi | मल्हार, कक्षा 8 (https://ncert.nic.in/textbook.php?hhml1=0-10) | https://ncert.nic.in/textbook/pdf/hhml1ps.pdf (17) | 0 | 10 | 0 | none |

451 lines in all (19 units, 128 chapters, 304 topics). All PDFs are under https://ncert.nic.in/textbook/pdf/.

### How the lines were taken from the books

- **Units.** Social Science for classes VII and VIII is printed in two parts; each part is a unit, titled as its title
  page prints it ("Grade 7 | Part 1" gives `Part 1`), citing that part's prelims PDF, page 1; each part numbers its
  chapters from 1, and so do the keys (`cbse.c7.social_science.u2.ch01` is Part 2, chapter 1). Class VI is one volume:
  its chapters have an empty `parent_key` (`cbse.c6.social_science.ch01`), as in the Mathematics and Science file.
  Poorvi prints its lessons in five units on the contents page ("Unit 1: Fables and Folk Tales"): each is a unit,
  titled without "Unit 1:" (the position carries the number), citing the contents page; NCERT's PDFs are one per unit.
  Malhar has no units.
- **Chapters** are the numbered chapters on each contents page, in order, citing the prelims PDF at the contents page:
  Social Science "Chapter 1"…; Poorvi the lessons and poems under each unit (not numbered; numbered from 1 in each
  unit); Malhar the numbered lessons with the kind of text in brackets as the contents page prints it in the title
  column ("मातृभूमि (कविता)"; "बिरजू महाराज से साक्षात्कार" and "कबीर के दोहे" have none). Malhar's author column is not
  part of the title.
- **Topics, Social Science.** The book does not number its sections, so topics are each chapter's main section
  headings: the largest heading style inside the chapter (the same font, size and colour throughout a book; Grade 8 in
  small capitals), in printed order, citing the chapter's PDF at the page where the heading is printed. The style was
  found from the PDFs' fonts and every heading was looked at on the page. Not taken: sub-headings (a smaller style,
  for example "b) Indian railway network" or "The Sarasvatī River"), boxes ("Don't miss out", "Let's explore", "Think
  about it"), tables, picture essays ("The Lives of the Ancients", set in a banner), "The Big Questions", and the end
  of each chapter ("Before we move on", "Questions, activities and projects"). Headings set in the main style are
  topics even where the name is general or the section is short: "Introduction" (eight chapters), "Taking Stock"
  (Grade 7 Part 2, chapters 3 and 4), "Dr. A.P.J. Abdul Kalam" and "Exemplary Sarpanchs" (Grade 6, chapters 10 and 11),
  "Function" (Grade 8 Part 1, chapter 6).
- **Topics, English.** Only where a lesson prints titled sections: Poorvi Grade 8 "Wisdom Paves the Way" ("Scene I: The
  Road to Ujjain", "Scene II: The King’s Court") and "Spectacular Wonders" (seven numbered places, "1. The Valley of
  Flowers, Uttarakhand" to "7. The Invisible Chandipur Beach, Odisha"). As with numbered sections, the label ("Scene I",
  "1.") is not in the title; the proof sheet shows it. Every other lesson prints no titled section: some have
  unnumbered parts "I" and "II", and "Say the Right Thing" (Grade 7) has "Scene I" and "Scene II" without titles. The
  "Let us read / discuss / write …" headings are exercises, not topics.
- **Topics, Hindi: none.** Malhar's lessons print no section heading inside the text; the headings after each lesson
  ("कवि से परिचय", "मेरी समझ से", …) are exercises.
- **Wording** is the printed heading's. A heading or title set on two lines is joined with one space. Quotes, dashes
  and diacritics are kept as printed: "Unity in Diversity, or 'Many in the One'" and "India's Cultural Roots" have
  straight quotes on the Grade 6 contents page; elsewhere "India’s", "The ‘Great King of Kings’", "“The Whole World is
  Family”", "Varṇa–Jāti", "Śhungas", "Kuṣhāṇas", "Yoga—A Way of Life" (no spaces round the dash, as on Poorvi's contents
  page), "Meanwhile in the South and Northeast ..." (three full stops) and "The Beginnings …" (an ellipsis). Small
  superscripts are written plain: "Empires and Kingdoms: 6th to 10th Centuries", "Cultural Currents: 13th to 17th
  Centuries". Capitals follow the page: Grade 8 Social Science and the "Spectacular Wonders" places are set in small
  capitals, and a large capital is written as a capital, a small one as a small letter ("When does Nature become a
  Resource?", "Magnetic Hills in Leh district, Ladakh"); "The cold desert of India" is printed so.
- **Pages** are the cited PDF's own page numbers (its first page is 1), not the numbers printed in the book.
- **Every heading was looked at.** A picture of every topic heading and of every contents page was made from the PDF and
  compared with its line. As a mechanical check, every word of three or more letters in each `title_en` of Social
  Science and English (418 lines) appears (ignoring capitals) in the text of its cited page: all pass. The seven
  "Spectacular Wonders" headings carry only their large capitals in the PDF's text, so for them the check found the
  words in the text below; they were read from the page.

### Hindi titles (`title_hi`)

Nothing was translated. 300 of 451 lines have a Hindi title.

| Class | Subject | Hindi source (NCERT's own title) | Contents PDF (page) | Hindi titles |
|---|---|---|---|---|
| VI | social_science | समाज का अध्ययन : भारत और उसके आगे, कक्षा 6 (https://ncert.nic.in/textbook.php?fhes1=0-14) | https://ncert.nic.in/textbook/pdf/fhes1ps.pdf (19) | 66 of 66 |
| VII | social_science | समाज का अध्ययन : भारत और उसके आगे, भाग 1 and भाग 2 (https://ncert.nic.in/textbook.php?ghes1=0-12, https://ncert.nic.in/textbook.php?ghes2=0-8) | https://ncert.nic.in/textbook/pdf/ghes1ps.pdf (19), https://ncert.nic.in/textbook/pdf/ghes2ps.pdf (15) | 151 of 152 |
| VIII | social_science | समाज का अध्ययन : भारत और उसके आगे, भाग 1 (https://ncert.nic.in/textbook.php?hhes1=0-7); no Hindi edition of Part 2 | https://ncert.nic.in/textbook/pdf/hhes1ps.pdf (19) | 50 of 130 (Part 1 only) |
| VI–VIII | english | none: NCERT publishes Poorvi in English only | | 0 of 70 |
| VI–VIII | hindi | Malhar itself: the printed title, in both `title_en` and `title_hi` | as above | 33 of 33 |

- **Social Science** takes them from NCERT's Hindi edition of the same book, which matches the English book chapter for
  chapter and part for part (`भाग 1`, `भाग 2` from its title pages). Its chapter names are its own wording, not a
  translation of the English ones ("The Story of Indian Farming", "भारत में कृषि की यात्रा"). Each topic has the Hindi
  heading of the same section, found at the same place in the Hindi chapter PDF; the Hindi edition sets some of these
  in a smaller style (for example "कश्मीर", Grade 7 Part 2 chapter 3) and prints a few extra headings where the English
  book has a sub-heading or a box (for example "सरस्वती नदी", "अधिकारों की रक्षा क्यों आवश्यक है?"); those extra
  headings are not lines. The CSV keeps one source (the English PDF); the proof sheets link every Hindi title to its
  Hindi page as well.
- **Missing, and why.** Grade 8 Part 2 (80 lines): NCERT's textbook page lists no Hindi edition (Part 1 only:
  `hhes1`), and the matching file names (`hhes2ps.pdf`, `hhes201.pdf`…) do not exist (HTTP 404) on 2026-10-22. Grade 7
  Part 2, chapter 7, "Introduction" (1 line): the Hindi edition prints no heading there; its text begins without one.
  English (70 lines): Poorvi has no Hindi edition.
- **Typed from the page.** The Hindi PDFs' hidden text is damaged (most in the class VII and VIII books and Malhar
  Grade 7's contents page): letters repeated ("बााजाार"), vowel signs before their letter, letters missing. Every Hindi
  title was typed from a picture of the printed heading or contents line and compared with it by eye. As mechanical
  checks: 148 of the 300 Hindi titles appear letter for letter in the text of their Hindi page (all of class VI), 263
  once a letter printed twice in the text is counted once, and 291 pass the consonants-in-order check of the file
  above; the 9 that do not are Malhar Grade 7's chapters 1–4 and 6–9 (their contents page's text is the most damaged;
  the titles agree with each lesson's first page) and "हिमालय पर्वत शृंखला", stored as "…ंृख…".
- Kept as printed: "‘एक में अनेक’" with typographic quotes (the English contents page has straight ones), the spaces
  before a colon ("साम्राज्य और राज्य : छठी से 10वीं शताब्दी") and round or after a dash ("नवारंभ— नगर एवं राज्य",
  "संसदीय प्रणाली—विधायिका और कार्यपालिका", "भारत में चुनाव प्रक्रिया को समझना — एक संक्षिप्त अवलोकन"), "वृतांत" and "गज़नवी".

### What is not in the file

| What | Why |
|---|---|
| "Introduction: Why Social Science?" (Grade 6), "A Note on History’s Darker Periods" (Grade 8 Part 1), "Looking back and forward …" (Grade 8 Part 2) | Printed on the contents pages without a chapter number, between chapters; they are not chapters. |
| The Themes A–E that group the Social Science chapters | The catalog has three levels; in the two-part books the parts are the units, and the themes repeat in both parts. For one shape across the three classes, class VI's themes are not units either. |
| Malhar's "पढ़ने के लिए" (for reading) pieces, भाषा संगम, शब्दकोश, Braille page, puzzle answers; Poorvi's listening transcripts | Not numbered lessons on the contents pages. |
| Sub-headings, boxes, exercises and activities | Not main section headings; the catalog has three levels. |
| Glossaries, maps, foreword and other front matter | Not chapters. |
| Pictures of NCERT pages | NCERT prints "© NCERT not to be republished" across every page, and this repository is public. The proof sheets link to the pages in NCERT's own PDFs instead. |

### How the supervisor checks a line

1. Open the line's `source_url` at `source_page` (the proof sheets link straight to it).
2. Units: the part's title page (Social Science) or the contents page (Poorvi). Chapters: the contents page, in that
   order. Topics: the heading on that page of the chapter's (or Poorvi unit's) PDF, with the same words.
3. Check the parent and the order (`position` from 1 under the same parent, in printed order).
4. Hindi: the proof sheet's "हिं" link opens the same section in the Hindi edition (Social Science); Malhar's titles
   are on its contents page.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `class6-social-science.md` to `class8-hindi.md`.

## cisce-2026-27-icse-classes-9-10.csv

CISCE (board id `CISCE`), ICSE, academic year 2026-27, Classes IX and X, in the core subjects: Physics, Chemistry,
Biology, Mathematics, History and Civics, Geography, English and Hindi (subject ids `physics`, `chemistry`, `biology`,
`mathematics`, `history`, `geography`, `english`, `hindi`). Same columns and rules as the files above. Every line is
`in_review`; every line was read on **2026-10-22**. 431 lines (15 units, 106 chapters, 310 topics). Load it the same way:

```
node scripts/content/catalog-sql.mjs data/catalog/cisce-2026-27-icse-classes-9-10.csv --ref "<the PR that committed it>" > load.sql
```

### Which document for which class

CISCE publishes its "Regulations and Syllabuses" by **examination year**, linked from
https://cisce.org/regulations-and-syllabuses-icse-2/ (cisce.org → Examination → ICSE → Regulations & Syllabuses). ICSE
is a two-year course (Classes IX and X) that ends in the ICSE examination in Class X, and the Regulations require every
candidate to use "the Regulations and Syllabuses for the year of the Examination in which they are appearing"
(Chapter I, G). For 2026-27:

- **Class X** sits the ICSE examination in February–March 2027 (CISCE's Examination page: "ICSE 2027", February 2027 to
  March 2027). Its lines come from **"Regulations and Syllabuses - ICSE 2027"**:
  https://cisce.org/regulations-and-syllabus-icse-2027/.
- **Class IX** is registered in Class IX for the 2028 examination (Regulations 2028: "Candidates must be registered
  online in Class IX"; the Examination page: "Candidate Registration Year’2028 … August – September 2026"). Its lines
  come from **"Regulations and Syllabuses - ICSE 2028"**: https://cisce.org/regulations-and-syllabuses-icse-2028/.

Every subject document covers both classes and divides them itself: the science, mathematics and humanities documents
print a "CLASS IX" and a "CLASS X" part; English and Appendix I print "Syllabus to be covered in Class IX" and "… in
Class X" ("The Class IX Examination is to be conducted on the portion of the syllabus that is prescribed for Class IX").
From each document only its class's part is taken: Class IX from the 2028 part "CLASS IX", Class X from the 2027 part
"CLASS X". The two years' Class X parts differ (for example Physics 2027 has "Uniform circular motion", 2028 does not),
so the 2028 Class X part is not used. Hindi's prescribed texts are divided by class for 2027 and 2028 by CISCE's circular
of 20 April 2026, "Bifurcation of the Prescribed Texts for Selected Indian Languages …"
(https://cisce.org/wp-content/uploads/2026/08/Circular-for-Bifurcation-of-Indian-Languages.pdf); its Hindi lists name
the same lessons as the two appendices. Pages are the PDF's page numbers (page 1 is the first page of the file).

| Class | Subject | Document (examination year) | Units | Chapters | Topics | Pages used |
|---|---|---|---|---|---|---|
| IX | physics | Physics, Science Paper 1 (2028): https://cisce.org/wp-content/uploads/2026/01/10.-Physics.pdf | 0 | 8 | 18 | 4–7 |
| X | physics | Physics, Science Paper 1 (2027): https://cisce.org/wp-content/uploads/2025/03/10.-Physics.pdf | 0 | 6 | 21 | 9–12 |
| IX | chemistry | Chemistry, Science Paper 2 (2028): https://cisce.org/wp-content/uploads/2026/01/11.-Chemistry.pdf | 0 | 8 | 24 | 4–8 |
| X | chemistry | Chemistry, Science Paper 2 (2027): https://cisce.org/wp-content/uploads/2025/03/11.-Chemistry.pdf | 0 | 9 | 37 | 8–13 |
| IX | biology | Biology, Science Paper 3 (2028): https://cisce.org/wp-content/uploads/2026/01/12.-Biology.pdf | 0 | 7 | 17 | 4–7 |
| X | biology | Biology, Science Paper 3 (2027): https://cisce.org/wp-content/uploads/2025/03/12.-Biology.pdf | 0 | 6 | 22 | 8–11 |
| IX | mathematics | Mathematics (2028): https://cisce.org/wp-content/uploads/2026/01/9.-Mathematics.pdf | 0 | 8 | 28 | 4–7 |
| X | mathematics | Mathematics (2027): https://cisce.org/wp-content/uploads/2025/03/9.-Mathematics.pdf | 0 | 7 | 17 | 8–10 |
| IX | history | History and Civics, H.C.G. Paper 1 (2028): https://cisce.org/wp-content/uploads/2026/01/5.-History-Civics.pdf | 2 | 11 | 7 | 4–6 |
| X | history | History and Civics, H.C.G. Paper 1 (2027): https://cisce.org/wp-content/uploads/2025/03/ICSE-History-Civics.pdf | 2 | 6 | 19 | 6–7 |
| IX | geography | Geography, H.C.G. Paper 2 (2028): https://cisce.org/wp-content/uploads/2026/01/6.-Geography.pdf | 1 | 7 | 17 | 4–6 |
| X | geography | Geography, H.C.G. Paper 2 (2027): https://cisce.org/wp-content/uploads/2025/03/ICSE-Geography.pdf | 2 | 11 | 37 | 8–10 |
| IX | english | English (2028): https://cisce.org/wp-content/uploads/2026/01/2.-English.pdf | 2 | 2 | 10 | 4–6 |
| X | english | English (2027): https://cisce.org/wp-content/uploads/2025/03/2.-English.pdf | 2 | 2 | 10 | 4–5 |
| IX | hindi | Second Language, Indian Languages (2028): https://cisce.org/wp-content/uploads/2026/04/3.-Second-Languages-1.pdf (units); Appendix I, List of Prescribed Textbooks (2028): https://cisce.org/wp-content/uploads/2026/04/ICSE-2028-Appendix-I-List-of-Prescribed-Textbooks.pdf (chapters, topics) | 2 | 4 | 13 | 4–5; 10–11 |
| X | hindi | Second Language, Indian Languages (2027): https://cisce.org/wp-content/uploads/2026/04/3.-Second-Languages.pdf (units); Appendix I, List of Prescribed Books (2027): https://cisce.org/wp-content/uploads/2026/04/ICSE-2027-Appendix-I-List-of-Prescribed-Books.pdf (chapters, topics) | 2 | 4 | 13 | 4; 5 |

### How the lines were taken from the documents

- **ICSE prints no course structure table.** Each class part numbers its topics (1, 2, 3 … in a shaded bar); under each,
  CISCE prints the syllabus lines in upright type, often numbered (i), (ii) … or lettered (a), (b) …, and explains them
  in italics, often as bullets.
- **Units** only where the document groups the numbered topics: History and Civics ("SECTION A: CIVICS", "SECTION B:
  HISTORY"), Geography IX ("PRINCIPLES OF GEOGRAPHY"), Geography X ("PART – I MAP WORK", "PART - II GEOGRAPHY OF
  INDIA"), English (the two papers) and Hindi (the two sections of the paper). The label ("SECTION A:", "PART – I",
  "PAPER 1 -") and the marks are left out. Physics, Chemistry, Biology and Mathematics print no grouping, so their
  chapters have no unit, as for the NCERT chapters without a unit (keys `cisce.c9.physics.ch01`).
- **Chapters** are the numbered topics, number left out (History: the numbered topics of each section; Geography X:
  CISCE numbers them 1 to 11 across its two parts, positions start again in each unit).
- **Topics** are the first list level under a chapter: the items numbered (i) … or lettered (a) … (A–D in Chemistry X
  "Study of Compounds"), or the bullets where a chapter numbers nothing. The topic is the item's words in upright type,
  up to where CISCE's italic explanation starts; an item printed entirely in italics is taken up to its first full
  stop. **A line without a number, letter or bullet is not a topic** (CISCE prints a chapter's content as one statement
  in many chapters), and **a list printed under a topic is not taken** (the CSV has three levels). Lines without
  topics are listed under "Choices to confirm".
- **Wording** as printed: line breaks joined (a hyphen at a line end joined without a space: "(1915-1947)"), repeated
  spaces made one, capitals and slips kept ("7.Metallurgy" is "Metallurgy"; "fertilisation functions of placenta in
  the growth of the embryo Menstrual cycle"), a trailing `;` or `:` dropped. Symbols are written in plain characters:
  "A = P(1 + r/100)ⁿ" (Mathematics IX), "H₂SO₄" (Chemistry IX), "°C" for the raised 0 of Physics IX.
- **English** is one subject in two papers; the papers are the units: "ENGLISH LANGUAGE" (no chapters: Paper 1
  describes its five questions, an exam format) and "LITERATURE IN ENGLISH". Its chapters are the two prescribed texts as
  the class list prints them ("DRAMA: Julius Caesar - William Shakespeare (Acts I & II)", "TREASURE CHEST: …"), and the
  topics are the stories and then the poems of Treasure Chest (positions 1–5 and 6–10; "PROSE (Short Stories):" and
  "POETRY:" are not lines). The syllabus document is used, not Appendix I, which prints one title differently ("The
  Home-coming" for "Home-coming").
- **Hindi** is one paper in two sections; the units are "LANGUAGE" and "PRESCRIBED TEXTS" (Second Language document;
  the Language section names no topics). For the texts the document refers to Appendix I, whose Hindi class list gives
  the chapters ("Short Stories", "Poems", "Novel: Naya Raasta - Sushma Agarwal Sarg 1 to Sarg 13", "Ekanki Sanchay: …")
  and the lessons under them as topics; the instruction "(The following short stories are to be studied)" is left out.
- **Over the 300-character limit.** Two upright items are longer than a title may be, so the topic is their first part:
  Physics IX "Free electrons, Simple electric circuit … (including its relationship to charge)" (up to the first
  semicolon) and Chemistry X "Action of Ammonium Hydroxide and Sodium Hydroxide on solution of salts" (up to the colon).
- **Keys and positions** count from 1 under the parent, in printed order.

### Choices to confirm (the supervisor)

- **No units in the sciences and Mathematics.** The brief's example keys have a unit (`cisce.c9.physics.u1.ch01`), but
  these four documents print no grouping above their numbered topics; the numbered topics are the chapters, with no
  parent (`cisce.c9.physics.ch01`). Making each numbered topic a unit instead would turn the (i), (ii) statements into
  chapters.
- **Chapters without topics (17).** They print their content without a number, letter or bullet: Physics IX "Motion in
  One Dimension"; Biology IX "Diversity in Animal Kingdom"; Mathematics IX "Pure Arithmetic" ("Rational and Irrational
  Numbers", "Proofs of irrationality of √2, √3, √5"); Mathematics X "Mensuration", "Probability"; History IX, all three
  Civics chapters and History chapters 1–6; Geography IX "Hydrosphere" (three lines), "Natural Regions of the World";
  Geography X "Climate". (Six more chapters have no topics by nature: the two map-work chapters below, the two Julius
  Caesar chapters and the two Naya Raasta chapters, which are single texts.) Also not taken: the statement printed before the numbered items (for example Chemistry X
  "Chemical Bonding", Mathematics IX "Statistics"), the unnumbered headings "Compound Interest" (Mathematics IX, its (a)
  and (b) are the topics) and "Water Pollution." (Chemistry IX, page 8, a bold sub-heading after "Atmospheric
  Pollution." whose (a)–(c) are the topics), and "Foundation of the Indian National Congress" and "Second Phase of the
  Indian National Movement (1905-1916)" (History X, printed inside items (b) and (c)). Any of them can be added as a
  topic.
- **Map work.** "Map Work" (Geography IX) and "Map of India" (Geography X) are chapters, as printed, without topics:
  their content is lists of places to locate on an outline map, not taken, as for CBSE. "Interpretation of Topographical
  Maps" (Geography X) lists skills, and its (a)–(h) are topics. To leave map work out, delete
  `cisce.c9.geography.u1.ch07` and `cisce.c10.geography.u1` with its chapters and topics.
- **Language units without chapters.** English "ENGLISH LANGUAGE" and Hindi "LANGUAGE" have no chapters (exam formats
  only); delete `cisce.c9.english.u1`, `cisce.c10.english.u1`, `cisce.c9.hindi.u1` and `cisce.c10.hindi.u1` to keep the
  literature only.
- **Joined or kept whole.** Mathematics X Statistics (a) joins "Computation of:" with the first sentence of its one
  bullet; History X "Forward Bloc (objectives) and INA (name of the founder objectives and contribution of Subhas
  Chandra Bose)." and Chemistry IX Water (iii) "Drying Agents- … Dehydrating Agents- …" are kept whole although part of
  each line is in italics.
- **Hindi books.** Appendix I says "Only two of the following books are to be offered": a student studies two of
  Sahitya Sagar (the short stories and poems), Naya Raasta and Ekanki Sanchay. All three are in the list.

### Not in this file (never guessed)

| What | Where we looked | What was found |
|---|---|---|
| **The other ICSE subjects** | the 2027 and 2028 Regulations and Syllabuses pages | Not yet in: second languages other than Hindi, Modern Foreign Languages, Classical Languages, Economics, Commercial Studies, Computer Applications, Environmental Science, Economic Applications, Commercial Applications, Art, Performing Arts, Home Science, Cookery, Fashion Designing, Physical Education, Yoga, Technical Drawing Applications, Environmental Applications, Mass Media & Communication, Hospitality Management, SUPW and Community Service, Health and Physical Education (2028), the vocational subjects, and History Civics and Geography for Thailand. |
| **Practical work, internal assessment, suggested assignments, notes on SI units, symbols and question formats** | all the documents | Assessment and exam formats, not chapters or topics. |
| **Lessons from the books themselves** | — | Only what CISCE's documents print; nothing was taken from Treasure Chest, Sahitya Sagar or other textbooks. |

### Hindi titles

`title_hi` is empty on every line. CISCE prints all its syllabus documents in English, the Hindi lessons too, in Roman
letters ("Baat Athanni Ki - Sudarshan"). Checked on 2026-10-22: the 2027 and 2028 Regulations and Syllabuses pages link
no Hindi version of any document, and the text of none of the downloaded PDFs (the subject documents, the two Appendix I
lists, the Regulations and the bifurcation circular) contains Devanagari. The Hindi lessons are copied in Roman letters as printed; nothing
was transliterated or translated. NCERT's Hindi editions, used for the CBSE Mathematics and Science lines since
2026-10-22, are not used here either: CISCE's syllabuses are not NCERT's books and no line names an NCERT chapter as its
source (checked again on 2026-10-22, F2).

### How the supervisor checks a line

As for the files above: open the line's `source_url` at `source_page`, find the title, then check its parent and its
position. **Mechanical check:** for 430 of the 431 lines the whole title (spaces removed, dashes and quotation marks
made plain, sub- and superscripts read as digits) is found in the text of its cited page (`pdftotext -layout` and
`-raw`); the other one is the formula "Use of formula A = P(1 + r/100)ⁿ." (Mathematics IX, page 4), compared by eye. The
Hindi lists were compared by eye with the rendered pages. The importer's checker (`readCatalogCsv`, run with the date
2026-10-22) finds no problem; `test/content/catalog-csv.test.ts` checks the counts above, that every source is a PDF on
cisce.org of the right examination year, and the Hindi-title rule.

The app's subject list for classes 9–10 (`stageSubjects` in `src/lib/family/subjects.ts`) is CBSE's (`science`,
`social_science`); these CISCE lines use the separate subject ids named in the brief. Whether the app shows them for a
CISCE child is outside this file.

Proof sheets for the founder's approval: [`docs/family-app/catalog-proof/`](../../docs/family-app/catalog-proof/README.md),
pages `cisce-class9-physics.md` to `cisce-class10-hindi.md`.

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
| Hindi titles (`title_hi`) | Empty on every line. Every document used is in English, and CISCE's ISC 2027 and 2028 pages link no Hindi version of any of them (checked 2026-10-22). Appendix I prints the Hindi books in Roman letters ("Saara Aakash (Novel): Rajendra Yadav"); no Devanagari title is printed. Nothing was translated or transliterated. NCERT's Hindi chapter names are not borrowed: CISCE's syllabuses are not NCERT's books and no line names an NCERT chapter as its source (checked again 2026-10-22, F2). |

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
