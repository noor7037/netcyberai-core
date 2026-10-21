# Catalog proof sheets

For the founder: check that our syllabus list matches CBSE's own document, then approve it in Control → Content. One
page per syllabus version in [`data/catalog/cbse-2026-27-maths-science.csv`](../../../data/catalog/cbse-2026-27-maths-science.csv):

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

## Compare (one page at a time)

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
