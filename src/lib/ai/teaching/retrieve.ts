// Chapter retrieval (W9-B, docs/39 §2 "Retrieval"): the passages of the library's published chapters that match a
// child's question, for the answer to quote. Postgres full text over content.chapter_contents (the generated columns
// search_en and search_hi of migration 20261030115621), no new service. Read in the caller's family transaction, so the
// table's own policy decides what a family may read (published, for everyone or from this account's own upload); a
// chapter made from a parent's upload is used only for the child it was made for.
//
// Up to three passages, each at most 700 characters: the open chapter first, then the chapters of the child's own
// syllabus (matched by title, which the family caller reads and passes in), then the rest of the subject at that class
// and board, by rank. Nothing found is a normal outcome: an empty list, never an error.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type Passage = { chapterKey: string; title: string; text: string; score: number };

export type RetrieveAsk = {
  question: string;
  // null: a typed question whose subject is not known yet; the class and board still narrow it.
  subject: string | null;
  classLevel: number;
  boardId: string;
  lang: 'en' | 'hi';
  // The chapter the child has open (the reader's doubt drawer), when there is one.
  chapterKey: string | null;
  // The chapter titles of the child's own syllabus for this subject (family.child_syllabus_items), when there are any.
  syllabusTitles?: string[];
  // The child asking: a chapter made from a parent's upload is for its own child only.
  childId?: string | null;
};

export const PASSAGE_MAX = 700;
export const PASSAGES_MAX = 3;
const QUESTION_MAX = 500;

// ts_headline's fragments around the matched words, joined; no markers (the text goes into a prompt, never a page).
const HEADLINE = 'MaxFragments=3, MaxWords=35, MinWords=12, FragmentDelimiter=" … ", StartSel="", StopSel=""';

export async function retrievePassages(db: Db, a: RetrieveAsk): Promise<Passage[]> {
  const question = a.question.trim().slice(0, QUESTION_MAX);
  if (question.length < 2) return [];
  const titles = (a.syllabusTitles ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 200);
  const { rows } = await db.query(
    `with q as (select websearch_to_tsquery('english', $1) as en, websearch_to_tsquery('simple', $1) as hi)
     select c.chapter_key, c.title_en, c.title_hi,
            greatest(ts_rank(c.search_en, q.en), ts_rank(c.search_hi, q.hi)) as score,
            (c.chapter_key = $7) as open,
            (lower(c.title_en) = any($8::text[]) or lower(c.title_hi) = any($8::text[])) as mine,
            case when $6 = 'hi' and c.search_hi @@ q.hi
                 then ts_headline('simple', content.chapter_text(c.blocks -> 'hi'), q.hi, '${HEADLINE}')
                 else ts_headline('english', content.chapter_text(c.blocks -> 'en'), q.en, '${HEADLINE}') end as passage
       from content.chapter_contents c, q
      where c.status = 'published'
        and (c.child_id is null or c.child_id = $9)
        and (c.search_en @@ q.en or c.search_hi @@ q.hi)
        and (c.chapter_key = $7
             or (($2::text is null or c.subject = $2)
                 and (c.class_level is null or c.class_level = $3)
                 and (c.board_id is null or c.board_id = $4)))
      order by open desc, mine desc, score desc, c.chapter_key
      limit $5`,
    [question, a.subject, a.classLevel, a.boardId, PASSAGES_MAX, a.lang, a.chapterKey ?? '', titles, a.childId ?? null]
  );
  return rows
    .map((r) => ({
      chapterKey: String(r.chapter_key),
      title: String(a.lang === 'hi' && r.title_hi ? r.title_hi : r.title_en),
      text: clip(String(r.passage ?? '')),
      score: Number(r.score) || 0,
    }))
    .filter((p) => p.text.length > 0);
}

// At most PASSAGE_MAX characters, cut at a word where it can be.
function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= PASSAGE_MAX) return t;
  const cut = t.slice(0, PASSAGE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > PASSAGE_MAX / 2 ? cut.slice(0, space) : cut}…`;
}
