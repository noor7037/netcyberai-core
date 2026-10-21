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
