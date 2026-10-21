# Catalog proof sheets

For the founder: check that our syllabus list matches the official source, then approve it in Control → Content.
Classes IX and X come from CBSE's own documents; classes VI to VIII from NCERT's textbooks (see the next section).

One page per syllabus version in [`data/catalog/cbse-2026-27-maths-science.csv`](../../../data/catalog/cbse-2026-27-maths-science.csv):

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
