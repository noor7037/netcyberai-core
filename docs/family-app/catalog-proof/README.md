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
| [Class XI Hindi (Core)](class11-hindi.md) | 3 | 0 | 0 | 9 |
| [Class XII Hindi (Core)](class12-hindi.md) | 3 | 0 | 0 | 11 |

These pages have **no picture** of CBSE's pages: the documents are CBSE's copyright, so no copy of them is kept in the
repository.

Good to know before you start:

- **Units are the big parts of each course.** Part A and Part B (Accountancy, Business Studies, Economics, Political
  Science), the books (Geography, English, Hindi) or the sections and parts (History). The chapters are what the course
  structure lists under them.
- **No topics for Accountancy and Economics.** Their documents describe each chapter in paragraphs, not as a list.
  Business Studies, Geography and Political Science list topics; History XI lists three, under its first theme.
- **Hindi has the three books only.** CBSE's Hindi Core document names the books but lists only the lessons that are
  removed, not the ones that are studied. The titles are in Hindi, as printed; please compare them with the page by eye.
- **No Hindi titles for the other subjects.** CBSE publishes no Hindi version of these documents for 2026-27 (checked
  2026-10-22). Nothing was translated.
- **Choices to confirm**, marked "Please check" on the pages and explained in the catalog README: the Accountancy XII
  option ("Or"), the History XI timelines, the Geography practical books and formatively assessed chapters, how
  Business Studies boxes and Political Science sub-points are counted, and Hindi with books only. English Core and Hindi
  Core are the courses used; English Elective and Hindi Elective are not in the catalog.
