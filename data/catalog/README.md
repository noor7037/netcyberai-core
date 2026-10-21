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
