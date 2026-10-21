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
(read from CBSE's documents on 2026-10-22, and from NCERT's books for the lessons CBSE does not list):

| Page | Units | Chapters | Topics | Pages to open (CBSE's document; NCERT's book) |
|---|---|---|---|---|
| [Class IX Social Science](class9-social-science.md) | 2 | 16 | 74 | 8–14 |
| [Class X Social Science](class10-social-science.md) | 4 | 22 | 10 | 1–3 |
| [Class IX English](class9-english.md) | 2 | 23 | 3 | 12–13; Kaveri p. 17 |
| [Class X English (Language and Literature)](class10-english.md) | 3 | 33 | 3 | 2, 4 |
| [Class IX Hindi](class9-hindi.md) | 2 | 16 | 3 | 3–5; गंगा pp. 1, 17 |
| [Class X Hindi (Course A)](class10-hindi.md) | 3 | 19 | 9 | 9–11; क्षितिज pp. 13–14, कृतिका p. 13 |

These pages have **no picture** of CBSE's page: the documents are CBSE's copyright, so no copy of them is kept in the
repository. Open CBSE's page from the links at the top of each proof page and keep it beside our list; every line of
our list also links to its own page. Compare and approve exactly as above.

Good to know before you start:

- **Lessons from NCERT's books for Class IX English, Class IX Hindi and Class X Hindi.** CBSE's documents for these
  name the textbook (or not even that) but do not list its lessons, so the lessons come from the contents page of
  NCERT's book (Kaveri, गंगा, क्षितिज भाग 2, कृतिका भाग 2), each line linked to that page. Class X English lists its NCERT
  lessons and poems itself. Where one numbered entry of a Hindi book holds several poems, the chapter is the poet's
  name and the poems are its topics: please check that choice.
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

## NCERT books, Classes 1–5 (2026-27)

One page per syllabus version in [`data/catalog/ncert-2026-27-classes-1-5.csv`](../../../data/catalog/ncert-2026-27-classes-1-5.csv):
the contents of NCERT's current textbooks, read on 2026-10-22. These pages have **no picture**: NCERT's pages say
"© NCERT, not to be republished", so instead every line links to NCERT's own PDF, opened at the page it comes from.

| Page | Book | Units | Chapters | Topics | NCERT contents page |
|---|---|---|---|---|---|
| [Class 1 Mathematics](class1-mathematics.md) | Joyful Mathematics | 0 | 13 | 0 | [13](https://ncert.nic.in/textbook/pdf/aejm1ps.pdf#page=13) |
| [Class 1 English](class1-english.md) | Mridang | 4 | 9 | 0 | [13](https://ncert.nic.in/textbook/pdf/aemr1ps.pdf#page=13)–[14](https://ncert.nic.in/textbook/pdf/aemr1ps.pdf#page=14) |
| [Class 1 Hindi](class1-hindi.md) | सारंगी | 5 | 19 | 0 | [19](https://ncert.nic.in/textbook/pdf/ahsr1ps.pdf#page=19)–[21](https://ncert.nic.in/textbook/pdf/ahsr1ps.pdf#page=21) |
| [Class 2 Mathematics](class2-mathematics.md) | Joyful Mathematics | 0 | 11 | 0 | [13](https://ncert.nic.in/textbook/pdf/bejm1ps.pdf#page=13) |
| [Class 2 English](class2-english.md) | Mridang | 5 | 13 | 0 | [13](https://ncert.nic.in/textbook/pdf/bemr1ps.pdf#page=13)–[14](https://ncert.nic.in/textbook/pdf/bemr1ps.pdf#page=14) |
| [Class 2 Hindi](class2-hindi.md) | सारंगी | 5 | 26 | 0 | [17](https://ncert.nic.in/textbook/pdf/bhsr1ps.pdf#page=17)–[19](https://ncert.nic.in/textbook/pdf/bhsr1ps.pdf#page=19) |
| [Class 3 Mathematics](class3-mathematics.md) | Maths Mela | 0 | 14 | 48 | [15](https://ncert.nic.in/textbook/pdf/cemm1ps.pdf#page=15) |
| [Class 3 EVS](class3-evs.md) | Our Wondrous World | 4 | 12 | 58 | [15](https://ncert.nic.in/textbook/pdf/ceev1ps.pdf#page=15) |
| [Class 3 English](class3-english.md) | Santoor | 4 | 12 | 0 | [15](https://ncert.nic.in/textbook/pdf/cesa1ps.pdf#page=15) |
| [Class 3 Hindi](class3-hindi.md) | वीणा | 5 | 18 | 0 | [15](https://ncert.nic.in/textbook/pdf/chve1ps.pdf#page=15)–[17](https://ncert.nic.in/textbook/pdf/chve1ps.pdf#page=17) |
| [Class 4 Mathematics](class4-mathematics.md) | Maths Mela | 0 | 14 | 79 | [15](https://ncert.nic.in/textbook/pdf/demm1ps.pdf#page=15) |
| [Class 4 EVS](class4-evs.md) | Our Wondrous World | 5 | 10 | 54 | [15](https://ncert.nic.in/textbook/pdf/deev1ps.pdf#page=15) |
| [Class 4 English](class4-english.md) | Santoor | 4 | 12 | 0 | [15](https://ncert.nic.in/textbook/pdf/desa1ps.pdf#page=15) |
| [Class 4 Hindi](class4-hindi.md) | वीणा | 0 | 13 | 0 | [17](https://ncert.nic.in/textbook/pdf/dhve1ps.pdf#page=17)–[19](https://ncert.nic.in/textbook/pdf/dhve1ps.pdf#page=19) |
| [Class 5 Mathematics](class5-mathematics.md) | Maths Mela | 0 | 15 | 92 | [15](https://ncert.nic.in/textbook/pdf/eemm1ps.pdf#page=15) |
| [Class 5 EVS](class5-evs.md) | Our Wondrous World | 5 | 10 | 67 | [15](https://ncert.nic.in/textbook/pdf/eeev1ps.pdf#page=15) |
| [Class 5 English](class5-english.md) | Santoor | 5 | 10 | 0 | [15](https://ncert.nic.in/textbook/pdf/eesa1ps.pdf#page=15) |
| [Class 5 Hindi](class5-hindi.md) | वीणा | 0 | 12 | 0 | [17](https://ncert.nic.in/textbook/pdf/ehve1ps.pdf#page=17)–[19](https://ncert.nic.in/textbook/pdf/ehve1ps.pdf#page=19) |

Good to know before you start:

- **EVS** is NCERT's "The World Around Us" (book: *Our Wondrous World*), filed under the app's subject EVS.
- **Hindi titles.** Hindi books show their printed Devanagari title in both languages. Mathematics and EVS units and
  chapters have the title printed in NCERT's Hindi edition of the same book; their topics, and the English books, have
  none. Nothing was translated.
- **Topics** only for Maths Mela and Our Wondrous World (Classes 3–5): the section headings printed inside each
  chapter. The other books print none.
- **Not in our list:** pieces the contents prints without a lesson number (the starred, reading-only pieces of सारंगी
  and Class 3 वीणा, the unnumbered pieces of Class 4–5 वीणा, Picture Reading and Self Assessment in Santoor, Puzzles,
  Learning Material Sheets). Each page lists its book's.

### Compare (one page at a time)

1. Open a page above, then its **Contents** link: NCERT's PDF opens at the contents page.
2. **Units and chapters:** the names and the order on our list match the contents page. For a Hindi line under a
   mathematics or EVS chapter, its link opens the Hindi edition's contents page.
3. **Topics:** click the page link next to a few topics in each chapter: the chapter's PDF opens at that page, and
   the heading is printed there.
4. Check the row **Printed but not in our list**: everything else on the contents page is on our list.
5. Note anything that does not match, then approve or reject the version as described above.

## Classes XI and XII: Accountancy, Business Studies, Economics, History, Geography, Political Science, English, Hindi

One page per syllabus version in
[`data/catalog/cbse-2026-27-classes-11-12-commerce-humanities-languages.csv`](../../../data/catalog/cbse-2026-27-classes-11-12-commerce-humanities-languages.csv),
read from cbseacademic.nic.in on 2026-10-22. Each subject has one CBSE document for both classes. Compare and approve
exactly as above; each page lists the CBSE pages to open, and every line links to its own page.

| Page | Units | Chapters | Topics | CBSE pages to compare |
|---|---|---|---|---|
| [Class XI Accountancy](class11-accountancy.md) | 2 | 3 | 0 | 2 |
| [Class XII Accountancy](class12-accountancy.md) | 3 | 5 | 0 | 9 |
| [Class XI Business Studies](class11-business-studies.md) | 2 | 10 | 44 | 2–7 |
| [Class XII Business Studies](class12-business-studies.md) | 2 | 12 | 51 | 9–15 |
| [Class XI Economics](class11-economics.md) | 2 | 7 | 0 | 2 |
| [Class XII Economics](class12-economics.md) | 2 | 8 | 0 | 6 |
| [Class XI History](class11-history.md) | 5 | 12 | 3 | 3–4 |
| [Class XII History](class12-history.md) | 3 | 12 | 0 | 9–10 |
| [Class XI Geography](class11-geography.md) | 3 | 27 | 75 | 3–8, 10 |
| [Class XII Geography](class12-geography.md) | 3 | 24 | 132 | 11–16, 18–19 |
| [Class XI Political Science](class11-political-science.md) | 2 | 18 | 89 | 3–9 |
| [Class XII Political Science](class12-political-science.md) | 2 | 15 | 79 | 10–15 |
| [Class XI English (Core)](class11-english.md) | 2 | 15 | 0 | 8 |
| [Class XII English (Core)](class12-english.md) | 2 | 19 | 2 | 12 |
| [Class XI Hindi (Core)](class11-hindi.md) | 3 | 27 | 2 | 8–9; NCERT's books (on the page) |
| [Class XII Hindi (Core)](class12-hindi.md) | 3 | 24 | 10 | 10–11; NCERT's books (on the page) |

These pages have **no picture** of CBSE's pages: the documents are CBSE's copyright, so no copy of them is kept in the
repository.

Good to know before you start:

- **Units are the big parts of each course.** Part A and Part B (Accountancy, Business Studies, Economics, Political
  Science), the books (Geography, English, Hindi) or the sections and parts (History). The chapters are what the course
  structure lists under them.
- **No topics for Accountancy and Economics.** Their documents describe each chapter in paragraphs, not as a list.
  Business Studies, Geography and Political Science list topics; History XI lists three, under its first theme.
- **Hindi's lessons come from NCERT's books.** CBSE's Hindi Core document names the three books (the units) but lists
  only the lessons it removes, so the lessons are taken from each book's contents page (none of the removed lessons is
  in the 2026-27 books); for अभिव्यक्ति और माध्यम, CBSE names the chapters each class uses. The titles are in Hindi,
  as printed; please compare them with the page by eye.
- **No Hindi titles for the other subjects.** CBSE publishes no Hindi version of these documents for 2026-27 (checked
  2026-10-22). Nothing was translated.
- **Choices to confirm**, marked "Please check" on the pages and explained in the catalog README: the Accountancy XII
  option ("Or"), the History XI timelines, the Geography practical books and formatively assessed chapters, how
  Business Studies boxes and Political Science sub-points are counted, and the Hindi entries with several works (the poet is the chapter). English Core and Hindi
  Core are the courses used; English Elective and Hindi Elective are not in the catalog.

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

## CISCE ICSE, Classes IX and X

One page per syllabus version in
[`data/catalog/cisce-2026-27-icse-classes-9-10.csv`](../../../data/catalog/cisce-2026-27-icse-classes-9-10.csv),
read from cisce.org on 2026-10-22. CISCE publishes its syllabuses by examination year: Class IX (examination in 2028)
comes from the "ICSE 2028" documents, Class X (examination in 2027) from the "ICSE 2027" documents. Each subject
document covers both classes; only its class's part is used. Compare and approve exactly as above; each page lists the
CISCE pages to open, and every line links to its own page.

| Page | Units | Chapters | Topics | CISCE pages to compare |
|---|---|---|---|---|
| [Class IX Physics](cisce-class9-physics.md) | 0 | 8 | 18 | 4–7 |
| [Class X Physics](cisce-class10-physics.md) | 0 | 6 | 21 | 9–12 |
| [Class IX Chemistry](cisce-class9-chemistry.md) | 0 | 8 | 24 | 4–8 |
| [Class X Chemistry](cisce-class10-chemistry.md) | 0 | 9 | 37 | 8–13 |
| [Class IX Biology](cisce-class9-biology.md) | 0 | 7 | 17 | 4–7 |
| [Class X Biology](cisce-class10-biology.md) | 0 | 6 | 22 | 8–11 |
| [Class IX Mathematics](cisce-class9-mathematics.md) | 0 | 8 | 28 | 4–7 |
| [Class X Mathematics](cisce-class10-mathematics.md) | 0 | 7 | 17 | 8–10 |
| [Class IX History and Civics](cisce-class9-history.md) | 2 | 11 | 7 | 4–6 |
| [Class X History and Civics](cisce-class10-history.md) | 2 | 6 | 19 | 6–7 |
| [Class IX Geography](cisce-class9-geography.md) | 1 | 7 | 17 | 4–6 |
| [Class X Geography](cisce-class10-geography.md) | 2 | 11 | 37 | 8–10 |
| [Class IX English](cisce-class9-english.md) | 2 | 2 | 10 | 4–6 |
| [Class X English](cisce-class10-english.md) | 2 | 2 | 10 | 4–5 |
| [Class IX Hindi](cisce-class9-hindi.md) | 2 | 4 | 13 | 4–5, and Appendix I 10–11 |
| [Class X Hindi](cisce-class10-hindi.md) | 2 | 4 | 13 | 4, and Appendix I 5 |

These pages have **no picture** of CISCE's pages: the documents are CISCE's copyright, so no copy of them is kept in the
repository.

Good to know before you start:

- **Chapters are CISCE's numbered topics.** Physics, Chemistry, Biology and Mathematics have no units (CISCE groups
  their topics no further). History and Civics, Geography, English and Hindi have units: the sections, parts or papers
  CISCE prints.
- **Topics are the numbered, lettered or bulleted lines** under a chapter, in the words CISCE prints upright; its
  explanation in italics is not in the list. Some chapters print their content as a statement without a number, so they
  have no topics; each page says which.
- **English and Hindi:** the language paper (or section) has no chapters, because CISCE describes only its exam
  questions. The literature lists the prescribed texts and their stories and poems.
- **Hindi titles are in Roman letters**, as CISCE prints them ("Baat Athanni Ki - Sudarshan"). No document has a Hindi
  version, so no line has a Hindi title. Nothing was translated.
- **Choices to confirm**, marked "Please check" on the pages and explained in the catalog README: no units in the
  sciences and Mathematics, the chapters without topics, map work, the language units without chapters, and how a few
  mixed lines are taken.

## CISCE ISC, Classes XI and XII

One page per syllabus version in
[`data/catalog/cisce-2026-27-isc-classes-11-12.csv`](../../../data/catalog/cisce-2026-27-isc-classes-11-12.csv),
read from cisce.org on 2026-10-22. ISC is a two-year course, so in 2026-27 Class XI follows CISCE's syllabus for the
**2028** examination and Class XII the one for the **2027** examination; each page says which document it uses and
takes only that class's part. Compare and approve exactly as above; each page lists the CISCE pages to open, and every
line links to its own page.

| Page | Units | Chapters | Topics | CISCE pages to compare |
|---|---|---|---|---|
| [Class XI Physics](cisce-class11-physics.md) | 10 | 10 | 0 | 4–6, 9–11 |
| [Class XII Physics](cisce-class12-physics.md) | 9 | 12 | 0 | 15–18, 20–24 |
| [Class XI Chemistry](cisce-class11-chemistry.md) | 9 | 4 | 0 | 4, 9–12 |
| [Class XII Chemistry](cisce-class12-chemistry.md) | 10 | 0 | 0 | 14 |
| [Class XI Biology](cisce-class11-biology.md) | 5 | 19 | 0 | 4–9 |
| [Class XII Biology](cisce-class12-biology.md) | 5 | 13 | 0 | 13–18 |
| [Class XI Mathematics](cisce-class11-mathematics.md) | 5 | 15 | 0 | 4–11 |
| [Class XII Mathematics](cisce-class12-mathematics.md) | 7 | 9 | 0 | 11–15 |
| [Class XI Accountancy](cisce-class11-accountancy.md) | 10 | 37 | 31 | 4–8 |
| [Class XII Accountancy](cisce-class12-accountancy.md) | 7 | 20 | 49 | 9–10, 13–21 |
| [Class XI Business Studies](cisce-class11-business-studies.md) | 5 | 20 | 14 | 4–6 |
| [Class XII Business Studies](cisce-class12-business-studies.md) | 5 | 25 | 5 | 7–10 |
| [Class XI Economics](cisce-class11-economics.md) | 3 | 18 | 0 | 4–6 |
| [Class XII Economics](cisce-class12-economics.md) | 2 | 12 | 7 | 7, 9–10 |
| [Class XI History](cisce-class11-history.md) | 2 | 12 | 25 | 4–7 |
| [Class XII History](cisce-class12-history.md) | 2 | 11 | 37 | 8–10 |
| [Class XI Geography](cisce-class11-geography.md) | 2 | 6 | 26 | 4–7 |
| [Class XII Geography](cisce-class12-geography.md) | 1 | 6 | 26 | 9–14 |
| [Class XI Political Science](cisce-class11-political-science.md) | 2 | 12 | 0 | 4–5 |
| [Class XII Political Science](cisce-class12-political-science.md) | 2 | 10 | 2 | 7–8 |
| [Class XI English](cisce-class11-english.md) | 3 | 10 | 0 | 4 |
| [Class XII English](cisce-class12-english.md) | 3 | 10 | 0 | 8 |
| [Class XI Hindi](cisce-class11-hindi.md) | 4 | 12 | 0 | 10 |
| [Class XII Hindi](cisce-class12-hindi.md) | 4 | 13 | 0 | 5 |

These pages have **no picture** of CISCE's pages: the documents are CISCE's copyright, so no copy of them is kept in the
repository.

Good to know before you start:

- **CISCE prints every unit as a short syllabus statement followed by an explanation in italics.** The list takes the
  headings and the numbered or lettered items; it never takes the explanation, notes, practicals, projects or map work.
- **No topics for Physics, Chemistry, Biology and Mathematics**, as for CBSE: their content is running text. Some of
  their units have no chapters either, because CISCE prints no sub-heading under them (all of Chemistry XII).
- **History, Political Science, Geography and Economics XII** have their parts (for example "INDIAN HISTORY" and "WORLD
  HISTORY") as units and the numbered headings as chapters, as in the CBSE pages.
- **English and Hindi** list the prescribed books as units and their stories, poems and portions as chapters. CISCE
  prints the Hindi titles in Roman letters ("Saara Aakash"), so they are shown that way; nothing was translated.
- **No Hindi titles.** Every CISCE document used is in English (checked 2026-10-22).
- **Choices to confirm**, marked "Please check" on the pages and explained in the catalog README: parts as units,
  seven long items named by their first words, chapters cut where the content starts, both Accountancy XII options (B
  and C), Hindi with four books though a student offers three, and science without topics.
