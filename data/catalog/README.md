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
