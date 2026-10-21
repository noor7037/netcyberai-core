# Catalog proof sheets

For the founder: check that our syllabus list matches the official source, then approve it in Control → Content.
Classes IX and X come from CBSE's own documents; classes VI to VIII from NCERT's textbooks (see the next section).

One page per syllabus version in [`data/catalog/cbse-2026-27-maths-science.csv`](../../../data/catalog/cbse-2026-27-maths-science.csv):

| Page | Units | Chapters | Topics | CBSE page to compare |
|---|---|---|---|---|
| [Class IX Mathematics](class9-mathematics.md) | 6 | 15 | 88 | 4 |
| [Class IX Science](class9-science.md) | 4 | 12 | 78 | 4 |
| [Class X Mathematics](class10-mathematics.md) | 7 | 15 | 34 | 3 |
| [Class X Science](class10-science.md) | 5 | 12 | 0 | 4 |

Each page gives, on the left, a link that opens CBSE's PDF at its course structure page (read from cbseacademic.nic.in
on 2026-10-21), and on the right our list: every unit, chapter and topic of that version, in order, each with a link
that opens CBSE's PDF at the page it comes from. No page of a CBSE or NCERT document is copied into this repository:
the documents are theirs and the repository is public, so each one is opened at its source.

Good to know before you start:

- **No Hindi titles.** CBSE's 2026-27 curriculum page has no Hindi version of these four documents (checked
  2026-10-21). The app shows the English titles; nothing was translated.
- **Class X Science has no topics.** That document prints each chapter as one paragraph, not as a list.
- **Two gaps in Class X Science.** Unit III and the first part of Unit IV name no chapter, so they have no chapter
  line. The catalog README explains both under "Gaps".

## Classes VI, VII and VIII (NCERT's textbooks)

CBSE has published no 2026-27 curriculum document for Mathematics and Science in classes VI to VIII; CBSE schools teach
them from NCERT's new textbooks (Ganita Prakash and Curiosity). These pages check
[`data/catalog/ncert-2026-27-classes-6-8-maths-science.csv`](../../../data/catalog/ncert-2026-27-classes-6-8-maths-science.csv)
against those books, one page per syllabus version:

| Page | Units | Chapters | Topics | NCERT contents page (PDF page) |
|---|---|---|---|---|
| [Class VI Mathematics](class6-mathematics.md) | 0 | 10 | 65 | `fegp1ps.pdf` p. 19 |
| [Class VI Science](class6-science.md) | 0 | 12 | 53 | `fecu1ps.pdf` p. 17 |
| [Class VII Mathematics](class7-mathematics.md) | 2 (Part – I, Part – II) | 15 | 65 | `gegp1ps.pdf` p. 17, `gegp2ps.pdf` p. 17 |
| [Class VII Science](class7-science.md) | 0 | 12 | 50 | `gecu1ps.pdf` p. 19 |
| [Class VIII Mathematics](class8-mathematics.md) | 2 (Part-I, Part-II) | 14 | 59 | `hegp1ps.pdf` p. 15, `hegp2ps.pdf` p. 15 |
| [Class VIII Science](class8-science.md) | 0 | 13 | 62 | `hecu1ps.pdf` p. 19 |

How these differ from the CBSE pages:

- **No picture.** NCERT prints "© NCERT not to be republished" across every page of its PDFs, and this repository is
  public, so the pages carry no copy of NCERT's pages. Each page links to the contents page in NCERT's own PDF instead
  (English and Hindi edition); the link opens it at the right page.
- **Chapters** are the contents page's chapter names. **Topics** are the numbered section headings inside each chapter
  ("1.1 …", "1.2 …"), without the number; each topic links to the page of the chapter's PDF where the section starts.
- **Hindi titles are filled in**, from NCERT's Hindi editions (गणित प्रकाश, जिज्ञासा), which match the English books
  chapter for chapter and section for section. Next to every line is a "हिं" link to the Hindi page it comes from.
- **Units** only where the book is printed in two parts (Mathematics, classes VII and VIII). The app lists chapters
  without a unit the same way (tested).

To compare one of these pages: open the contents page (link at the top), check the chapter names and their order, then
click the "p." and "हिं p." links next to a few topics in each chapter and find the same heading on that page.

## Compare a CBSE page (one page at a time)

1. Open a page above.
2. **Units:** open CBSE's page from the left; the names and the order on the right match its course structure table.
3. **Chapters:** Class IX Mathematics names them on that same page. For the other three, click the page link next to a
   chapter: CBSE's PDF opens at that page, and the chapter name is printed there.
4. **Topics:** click the page link next to a few topics in each chapter and find the same words on that page. (Every
   line already passed a word check against its page when the file was made; see the catalog README.)
5. Note anything that does not match: the line on the right and what CBSE's page says instead.

## Approve in Control → Content

The build lead loads the file first. Each version then appears under **Syllabus versions** as "Waiting for review".

1. Open the version (for example CBSE, Class 9, Mathematics, 2026-27) and click **Preview**: it shows what a family
   will see. It should match the right-hand list of its proof page.
2. **It matches:** click **Approve**. The version goes to staff preview: only NetCyberAI staff see it. A version loaded
   from the repository may be approved by any NetCyberAI account; one you imported yourself needs another account.
3. When you are ready for families to have it, click **Release to everyone**.
4. **It does not match:** click **Reject**, write what is wrong under "Why it is rejected", and click **Reject with
   this note**. The build lead corrects the file and loads a new version, with a new proof page.

If a released version turns out wrong, **Roll back** gives everyone the version before it again (when there is one).

## Classes IX and X: Social Science, English and Hindi

One page per syllabus version in
[`data/catalog/cbse-2026-27-classes-9-10-languages-social-science.csv`](../../../data/catalog/cbse-2026-27-classes-9-10-languages-social-science.csv)
(read from CBSE's documents on 2026-10-22):

| Page | Units | Chapters | Topics | CBSE pages to open |
|---|---|---|---|---|
| [Class IX Social Science](class9-social-science.md) | 2 | 16 | 74 | 8–14 |
| [Class X Social Science](class10-social-science.md) | 4 | 22 | 10 | 1–3 |
| [Class IX English](class9-english.md) | 1 | 7 | 3 | 13 |
| [Class X English (Language and Literature)](class10-english.md) | 3 | 33 | 3 | 2, 4 |
| [Class IX Hindi](class9-hindi.md) | 1 | 4 | 3 | 3–5 |
| [Class X Hindi (Course A)](class10-hindi.md) | 1 | 4 | 1 | 9–10 |

These pages have **no picture** of CBSE's page: the documents are CBSE's copyright, so no copy of them is kept in the
repository. Open CBSE's page from the links at the top of each proof page and keep it beside our list; every line of
our list also links to its own page. Compare and approve exactly as above.

Good to know before you start:

- **Grammar only for Class IX English, Class IX Hindi and Class X Hindi.** CBSE's documents for these name the
  textbook (or not even that) but do not list its chapters, so there are no lesson lines; they were not taken from the
  books themselves. Class X English lists its NCERT lessons and poems, and they are in.
- **Hindi titles are in Hindi.** CBSE prints the Hindi documents in Devanagari; each title is copied as printed into
  both the English and the Hindi column. Please compare these with the page by eye: they could not be checked
  automatically. English and Social Science have no Hindi titles (no Hindi version of those documents exists).
- **Three choices to confirm**, explained on each page and in the catalog README: Class X English is the "Language and
  Literature" course, not "English Communicative"; Class X Hindi is Course A, not Course B; Class IX Hindi is the R1
  (first language) scheme, not R2.

## Classes XI and XII: Physics, Chemistry, Biology, Mathematics

One page per syllabus version in
[`data/catalog/cbse-2026-27-classes-11-12-science-maths.csv`](../../../data/catalog/cbse-2026-27-classes-11-12-science-maths.csv),
read from cbseacademic.nic.in on 2026-10-22. Each subject has one CBSE document for both classes; the page to compare is
that class's course structure. Compare and approve exactly as above.

| Page | Units | Chapters | Topics | CBSE page to compare |
|---|---|---|---|---|
| [Class XI Physics](class11-physics.md) | 10 | 14 | 0 | 2 |
| [Class XII Physics](class12-physics.md) | 9 | 14 | 0 | 12 |
| [Class XI Chemistry](class11-chemistry.md) | 11 | 0 | 0 | 2 |
| [Class XII Chemistry](class12-chemistry.md) | 14 | 0 | 0 | 8 |
| [Class XI Biology](class11-biology.md) | 5 | 20 | 0 | 3 |
| [Class XII Biology](class12-biology.md) | 5 | 14 | 0 | 9 |
| [Class XI Mathematics](class11-mathematics.md) | 5 | 15 | 0 | 2 |
| [Class XII Mathematics](class12-mathematics.md) | 6 | 13 | 0 | 7 |

Good to know before you start:

- **No topics.** All four documents print each chapter's content as running text, not as a list.
- **Chemistry has units only.** Its document names units, not chapters.
- **Nine lines are assessed only formatively.** CBSE lists some topics after the units, outside the course structure
  table (two Chemistry XI units, four Chemistry XII units, the last chapter of Biology XI Unit V and of Biology XII
  Unit X, and the last chapter of Mathematics XI Unit II). Each is marked on its page. The catalog README lists them
  and how to leave them out.
- **No Hindi titles.** CBSE's 2026-27 curriculum page has no Hindi version of these four documents (checked
  2026-10-22). Nothing was translated.

## Classes VI, VII and VIII: Social Science, English and Hindi (NCERT's textbooks)

As for Mathematics and Science, CBSE has published no 2026-27 curriculum document for these subjects in classes VI to
VIII; CBSE schools teach them from NCERT's current books: *Exploring Society: India and Beyond* (Social Science),
*Poorvi* (English) and *Malhar* (Hindi). These pages check
[`data/catalog/ncert-2026-27-classes-6-8-social-science-languages.csv`](../../../data/catalog/ncert-2026-27-classes-6-8-social-science-languages.csv)
against those books (read from ncert.nic.in on 2026-10-22), one page per syllabus version:

| Page | Units | Chapters | Topics | NCERT contents page (PDF page) |
|---|---|---|---|---|
| [Class VI Social Science](class6-social-science.md) | 0 | 14 | 52 | `fees1ps.pdf` p. 19 |
| [Class VII Social Science](class7-social-science.md) | 2 (Part 1, Part 2) | 20 | 130 | `gees1ps.pdf` p. 21, `gees2ps.pdf` p. 15 |
| [Class VIII Social Science](class8-social-science.md) | 2 (Part 1, Part 2) | 15 | 113 | `hees1ps.pdf` p. 21, `hees2ps.pdf` p. 17 |
| [Class VI English](class6-english.md) | 5 | 16 | 0 | `fepr1ps.pdf` p. 15 |
| [Class VII English](class7-english.md) | 5 | 15 | 0 | `gepr1ps.pdf` p. 13 |
| [Class VIII English](class8-english.md) | 5 | 15 | 9 | `hepr1ps.pdf` p. 15 |
| [Class VI Hindi](class6-hindi.md) | 0 | 13 | 0 | `fhml1ps.pdf` p. 19 |
| [Class VII Hindi](class7-hindi.md) | 0 | 10 | 0 | `ghml1ps.pdf` p. 17 |
| [Class VIII Hindi](class8-hindi.md) | 0 | 10 | 0 | `hhml1ps.pdf` p. 17 |

Compare and approve exactly as above. Good to know before you start:

- **No picture.** As for the other NCERT pages, each page links to NCERT's own PDF at the right page instead.
- **Social Science topics** are each chapter's main section headings (the book does not number them). The two-part books
  (classes VII and VIII) have their parts as units.
- **English** keeps Poorvi's five units; topics only where a lesson prints titled sections (two lessons in class VIII).
  **Hindi** (Malhar) has chapters only: its lessons print no section headings.
- **Hindi titles.** Social Science: from NCERT's Hindi edition (समाज का अध्ययन : भारत और उसके आगे), with a "हिं" link to the
  Hindi page; none for class VIII Part 2 (NCERT publishes no Hindi edition of it) and one class VII topic (no Hindi
  heading there). English: none (no Hindi edition). Malhar: the printed Devanagari title in both columns. Please
  compare the Hindi titles with the page by eye: the PDFs' hidden Hindi text is often damaged, so every one was typed
  from the page.
