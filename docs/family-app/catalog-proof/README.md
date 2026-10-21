# Catalog proof sheets

For the founder: check that our syllabus list matches CBSE's own document, then approve it in Control → Content. One
page per syllabus version in [`data/catalog/cbse-2026-27-maths-science.csv`](../../../data/catalog/cbse-2026-27-maths-science.csv):

| Page | Units | Chapters | Topics | CBSE page in the picture |
|---|---|---|---|---|
| [Class IX Mathematics](class9-mathematics.md) | 6 | 15 | 88 | 4 |
| [Class IX Science](class9-science.md) | 4 | 12 | 78 | 4 |
| [Class X Mathematics](class10-mathematics.md) | 7 | 15 | 34 | 3 |
| [Class X Science](class10-science.md) | 5 | 12 | 0 | 4 |

Each page shows, on the left, a picture of the course structure page of CBSE's PDF (fetched from cbseacademic.nic.in on
2026-10-21; the PDFs themselves are not kept here), and on the right our list: every unit, chapter and topic of that
version, in order, each with a link that opens CBSE's PDF at the page it comes from.

Good to know before you start:

- **No Hindi titles.** CBSE's 2026-27 curriculum page has no Hindi version of these four documents (checked
  2026-10-21). The app shows the English titles; nothing was translated.
- **Class X Science has no topics.** That document prints each chapter as one paragraph, not as a list.
- **Two gaps in Class X Science.** Unit III and the first part of Unit IV name no chapter, so they have no chapter
  line. The catalog README explains both under "Gaps".

## Compare (one page at a time)

1. Open a page above.
2. **Units:** the names and the order on the right match the table in the picture.
3. **Chapters:** Class IX Mathematics names them in the picture. For the other three, click the page link next to a
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
