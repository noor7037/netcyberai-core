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
  added in a new version.

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
