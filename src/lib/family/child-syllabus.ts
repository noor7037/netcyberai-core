// A parent's own syllabus for a child (Decision Log C230-AB): for a standalone family whose school does not use
// NetCyberAI, or whose board and class are not in the catalog. In parent mode the parent gives the chapter and topic
// titles of one subject (read by the family.syllabus_extract profile from photos of the book's contents pages, or typed),
// checks and edits the list, and saves it. Only a saved (confirmed) syllabus reaches Study; a draft never does.
//
// Pure checks first, then the database. Every query names the session's account as well as relying on the family row
// level security (family.child_syllabi, family.child_syllabus_items): a syllabus is only ever read or written with its
// own child's account. Titles only: the photo is dropped after it is read, and nothing here keeps or logs it.

import { classSubjects } from './catalog';
import { isPrePrimary, listChildren, syllabusBoardOf, type FamilyChild } from './children';
import { consentState } from './consent';
import { isSubject, type Subject } from './subjects';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const SYLLABUS_TITLE_MAX = 200;
export const MAX_CHAPTERS = 60;
export const MAX_TOPICS = 40; // in one chapter
export const MAX_PHOTOS = 5; // read into one draft, one request each (the hosting refuses a body over 4.5 MB)

export type SyllabusSource = 'pdf' | 'photos' | 'typed';
export type SyllabusStatus = 'draft' | 'confirmed';
// A list as the parent edits it, and as the model's answer becomes a draft: titles only.
export type SyllabusChapter = { title: string; topics: { title: string }[] };
// A stored syllabus, each line with its id (the Study page links a topic to Understand by it).
export type StoredSyllabus = {
  syllabusId: string;
  childId: string;
  subject: string;
  source: SyllabusSource;
  status: SyllabusStatus;
  photos: number;
  chapters: { itemId: string; title: string; topics: { itemId: string; title: string }[] }[];
};
export type ListProblem = 'empty' | 'too_many' | 'title_bad' | 'bad_request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// One line of text, its spaces tidied, no control characters; null when empty or longer than the limit.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
export function cleanTitle(v: unknown, max = SYLLABUS_TITLE_MAX): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

// The parent's edited list, as the save route receives it: every title must be a real one (a line the parent emptied is
// refused rather than dropped, so nothing they typed disappears silently), within the limits.
export function checkChapters(raw: unknown): { ok: true; chapters: SyllabusChapter[] } | { ok: false; reason: ListProblem } {
  if (!Array.isArray(raw)) return { ok: false, reason: 'bad_request' };
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  if (raw.length > MAX_CHAPTERS) return { ok: false, reason: 'too_many' };
  const chapters: SyllabusChapter[] = [];
  for (const c of raw) {
    const r = (typeof c === 'object' && c !== null ? c : {}) as { title?: unknown; topics?: unknown };
    const topicsRaw = r.topics === undefined ? [] : r.topics;
    if (!Array.isArray(topicsRaw)) return { ok: false, reason: 'bad_request' };
    if (topicsRaw.length > MAX_TOPICS) return { ok: false, reason: 'too_many' };
    const title = cleanTitle(r.title);
    if (!title) return { ok: false, reason: 'title_bad' };
    const topics: { title: string }[] = [];
    for (const t of topicsRaw) {
      const tt = cleanTitle((t as { title?: unknown } | null)?.title);
      if (!tt) return { ok: false, reason: 'title_bad' };
      topics.push({ title: tt });
    }
    chapters.push({ title, topics });
  }
  return { ok: true, chapters };
}

// The model's answer for one photo, as a draft: {"chapters": [{"title", "topics": [{"title"}]}]}, chapters inside
// "units" taken in order. A line without a usable title is dropped with the topics under it; nothing is made up or
// corrected here (the parent checks every line). null when the answer is not that JSON at all.
export function draftFromReply(modelText: string): SyllabusChapter[] | null {
  let parsed: unknown;
  try {
    const start = modelText.indexOf('{');
    const end = modelText.lastIndexOf('}');
    parsed = start >= 0 && end > start ? JSON.parse(modelText.slice(start, end + 1)) : null;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const root = parsed as { units?: unknown; chapters?: unknown };
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const raw = [...list(root.units).flatMap((u) => list((u as { chapters?: unknown } | null)?.chapters)), ...list(root.chapters)];
  const chapters: SyllabusChapter[] = [];
  for (const c of raw) {
    if (chapters.length >= MAX_CHAPTERS) break;
    const title = cleanTitle((c as { title?: unknown } | null)?.title);
    if (!title) continue;
    const topics = list((c as { topics?: unknown } | null)?.topics)
      .map((t) => cleanTitle((t as { title?: unknown } | null)?.title))
      .filter((t): t is string => t !== null)
      .slice(0, MAX_TOPICS)
      .map((t) => ({ title: t }));
    chapters.push({ title, topics });
  }
  return chapters;
}

// A PDF's draft, from the lines src/lib/content/pdf-import.ts extractedCatalog() kept (each one's title found on its
// page of the PDF): units drop away, their chapters keep their order, each topic stays under its chapter.
export type CatalogLine = { level: 'unit' | 'chapter' | 'topic'; key: string; parentKey: string | null; title: string };
export function draftFromCatalogLines(lines: readonly CatalogLine[]): SyllabusChapter[] {
  const chapters: (SyllabusChapter & { key: string })[] = [];
  for (const l of lines) {
    if (l.level === 'chapter' && chapters.length < MAX_CHAPTERS) {
      const title = cleanTitle(l.title);
      if (title) chapters.push({ key: l.key, title, topics: [] });
    } else if (l.level === 'topic') {
      const ch = chapters.find((c) => c.key === l.parentKey);
      const title = cleanTitle(l.title);
      if (ch && title && ch.topics.length < MAX_TOPICS) ch.topics.push({ title });
    }
  }
  return chapters.map(({ title, topics }) => ({ title, topics }));
}

// A later photo's chapters after the earlier ones, within the limits.
export function appendChapters(a: readonly SyllabusChapter[], b: readonly SyllabusChapter[]): SyllabusChapter[] {
  return [...a, ...b].slice(0, MAX_CHAPTERS);
}

// ---- the database ---------------------------------------------------------------------------------------------------

type Row = { syllabus_id: string; child_id: string; subject: string; source: SyllabusSource; status: SyllabusStatus; photos: number };
type ItemRow = { item_id: string; syllabus_id: string; kind: 'chapter' | 'topic'; parent_item_id: string | null; position: number; title: string };

async function withItems(db: Db, accountId: string, rows: Row[]): Promise<StoredSyllabus[]> {
  if (rows.length === 0) return [];
  const items = (
    await db.query(
      `select item_id, syllabus_id, kind, parent_item_id, position, title from family.child_syllabus_items
        where account_id = $1 and syllabus_id = any($2::uuid[]) order by position, item_id`,
      [accountId, rows.map((r) => r.syllabus_id)]
    )
  ).rows as ItemRow[];
  return rows.map((r) => {
    const mine = items.filter((i) => i.syllabus_id === r.syllabus_id);
    return {
      syllabusId: r.syllabus_id,
      childId: r.child_id,
      subject: r.subject,
      source: r.source,
      status: r.status,
      photos: Number(r.photos),
      chapters: mine
        .filter((i) => i.kind === 'chapter')
        .map((c) => ({ itemId: c.item_id, title: c.title, topics: mine.filter((t) => t.parent_item_id === c.item_id).map((t) => ({ itemId: t.item_id, title: t.title })) })),
    };
  });
}

const COLUMNS = 'syllabus_id, child_id, subject, source, status, photos';

// Every syllabus of the account (drafts and saved ones), for the parent area.
export async function listSyllabi(db: Db, accountId: string): Promise<StoredSyllabus[]> {
  const { rows } = await db.query(`select ${COLUMNS} from family.child_syllabi where account_id = $1 order by created_at, syllabus_id`, [accountId]);
  return withItems(db, accountId, rows as Row[]);
}

async function one(db: Db, accountId: string, syllabusId: string): Promise<StoredSyllabus | null> {
  const { rows } = await db.query(`select ${COLUMNS} from family.child_syllabi where account_id = $1 and syllabus_id = $2`, [accountId, syllabusId]);
  return (await withItems(db, accountId, rows as Row[]))[0] ?? null;
}

// The saved syllabus of a child and subject, for Study; null when the parent has saved none.
export async function readOwnSyllabus(db: Db, accountId: string, childId: string, subject: string): Promise<StoredSyllabus | null> {
  const { rows } = await db.query(`select ${COLUMNS} from family.child_syllabi where account_id = $1 and child_id = $2 and subject = $3 and status = 'confirmed'`, [
    accountId,
    childId,
    subject,
  ]);
  return (await withItems(db, accountId, rows as Row[]))[0] ?? null;
}

// One line of a child's saved syllabus, for Understand: its title, its chapter's title for a topic, and the subject.
export type OwnSyllabusLine = { itemId: string; kind: 'chapter' | 'topic'; title: string; chapterTitle: string | null; subject: Subject };
export async function ownSyllabusLine(db: Db, accountId: string, childId: string, itemId: string): Promise<OwnSyllabusLine | null> {
  if (!isUuid(itemId)) return null;
  const { rows } = await db.query(
    `select i.item_id, i.kind, i.title, p.title as chapter_title, s.subject
       from family.child_syllabus_items i
       join family.child_syllabi s on s.syllabus_id = i.syllabus_id and s.account_id = i.account_id
       left join family.child_syllabus_items p on p.item_id = i.parent_item_id and p.account_id = i.account_id
      where i.account_id = $1 and s.child_id = $2 and i.item_id = $3 and s.status = 'confirmed'`,
    [accountId, childId, itemId]
  );
  const r = rows[0] as { item_id: string; kind: 'chapter' | 'topic'; title: string; chapter_title: string | null; subject: string } | undefined;
  if (!r || !isSubject(r.subject)) return null;
  return { itemId: r.item_id, kind: r.kind, title: r.title, chapterTitle: r.kind === 'topic' ? r.chapter_title : null, subject: r.subject };
}

async function writeItems(db: Db, accountId: string, syllabusId: string, chapters: readonly SyllabusChapter[]): Promise<void> {
  await db.query(`delete from family.child_syllabus_items where account_id = $1 and syllabus_id = $2`, [accountId, syllabusId]);
  if (chapters.length === 0) return;
  const made = (
    await db.query(
      `insert into family.child_syllabus_items (syllabus_id, account_id, kind, position, title)
       select $1, $2, 'chapter', u.pos::smallint, u.title from unnest($3::text[]) with ordinality as u(title, pos)
       returning item_id, position`,
      [syllabusId, accountId, chapters.map((c) => c.title)]
    )
  ).rows as { item_id: string; position: number }[];
  const idAt = new Map(made.map((m) => [Number(m.position), m.item_id]));
  const parents: string[] = [];
  const positions: number[] = [];
  const titles: string[] = [];
  chapters.forEach((c, i) =>
    c.topics.forEach((t, j) => {
      parents.push(idAt.get(i + 1)!);
      positions.push(j + 1);
      titles.push(t.title);
    })
  );
  if (titles.length === 0) return;
  await db.query(
    `insert into family.child_syllabus_items (syllabus_id, account_id, kind, parent_item_id, position, title)
     select $1, $2, 'topic', u.parent, u.pos::smallint, u.title from unnest($3::uuid[], $4::int[], $5::text[]) as u(parent, pos, title)`,
    [syllabusId, accountId, parents, positions, titles]
  );
}

// Whether the child is this account's (the routes check it before any AI call too).
export async function ownChild(db: Db, accountId: string, childId: string): Promise<boolean> {
  if (!isUuid(childId)) return false;
  const { rows } = await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  return rows.length > 0;
}

// The draft a photo is read into: the one named (this account's, this child's and subject's, still a draft), or none
// to start a new one. 'too_many_photos' once it holds MAX_PHOTOS.
export async function draftFor(db: Db, accountId: string, q: { childId: string; subject: string; syllabusId: string | null }): Promise<StoredSyllabus | null | 'not_found' | 'too_many_photos'> {
  if (q.syllabusId === null) return null;
  if (!isUuid(q.syllabusId)) return 'not_found';
  const s = await one(db, accountId, q.syllabusId);
  if (!s || s.status !== 'draft' || s.childId !== q.childId || s.subject !== q.subject) return 'not_found';
  return s.photos >= MAX_PHOTOS ? 'too_many_photos' : s;
}

// Keeps what one photo gave: a new draft (replacing an earlier unsaved draft of the same child and subject), or the
// named draft with these chapters after its own. The saved syllabus, if any, is untouched until the parent saves.
export async function keepDraft(
  db: Db,
  accountId: string,
  q: { childId: string; subject: string; source: SyllabusSource; syllabusId: string | null; chapters: readonly SyllabusChapter[] }
): Promise<StoredSyllabus | 'not_found' | 'too_many_photos'> {
  if (!(await ownChild(db, accountId, q.childId))) return 'not_found';
  const draft = await draftFor(db, accountId, q);
  if (draft === 'not_found' || draft === 'too_many_photos') return draft;
  let syllabusId: string;
  let chapters: SyllabusChapter[];
  if (draft) {
    syllabusId = draft.syllabusId;
    chapters = appendChapters(
      draft.chapters.map((c) => ({ title: c.title, topics: c.topics.map((t) => ({ title: t.title })) })),
      q.chapters
    );
    await db.query(`update family.child_syllabi set photos = photos + 1 where account_id = $1 and syllabus_id = $2`, [accountId, syllabusId]);
  } else {
    await db.query(`delete from family.child_syllabi where account_id = $1 and child_id = $2 and subject = $3 and status = 'draft'`, [accountId, q.childId, q.subject]);
    const { rows } = await db.query(
      `insert into family.child_syllabi (account_id, child_id, subject, source, status, photos) values ($1, $2, $3, $4, 'draft', $5) returning syllabus_id`,
      [accountId, q.childId, q.subject, q.source, q.source === 'photos' ? 1 : 0]
    );
    syllabusId = rows[0].syllabus_id as string;
    chapters = q.chapters.slice(0, MAX_CHAPTERS);
  }
  await writeItems(db, accountId, syllabusId, chapters);
  return (await one(db, accountId, syllabusId))!;
}

// The parent's Save: the edited list becomes the child's syllabus for the subject. With a syllabusId (a draft or the
// saved one being edited), that syllabus is saved; without one, a typed syllabus is made. Any other syllabus of the same
// child and subject (an older saved one, an unsaved draft) is removed, so one saved syllabus remains.
export async function confirmSyllabus(
  db: Db,
  accountId: string,
  q: { childId: string; subject: string; syllabusId: string | null; chapters: readonly SyllabusChapter[] }
): Promise<StoredSyllabus | 'not_found'> {
  if (!(await ownChild(db, accountId, q.childId))) return 'not_found';
  let syllabusId: string;
  if (q.syllabusId !== null) {
    if (!isUuid(q.syllabusId)) return 'not_found';
    const s = await one(db, accountId, q.syllabusId);
    if (!s || s.childId !== q.childId || s.subject !== q.subject) return 'not_found';
    syllabusId = s.syllabusId;
    await db.query(`delete from family.child_syllabi where account_id = $1 and child_id = $2 and subject = $3 and syllabus_id <> $4`, [accountId, q.childId, q.subject, syllabusId]);
  } else {
    await db.query(`delete from family.child_syllabi where account_id = $1 and child_id = $2 and subject = $3`, [accountId, q.childId, q.subject]);
    const { rows } = await db.query(`insert into family.child_syllabi (account_id, child_id, subject, source) values ($1, $2, $3, 'typed') returning syllabus_id`, [
      accountId,
      q.childId,
      q.subject,
    ]);
    syllabusId = rows[0].syllabus_id as string;
  }
  await writeItems(db, accountId, syllabusId, q.chapters);
  await db.query(`update family.child_syllabi set status = 'confirmed', confirmed_at = now() where account_id = $1 and syllabus_id = $2`, [accountId, syllabusId]);
  return (await one(db, accountId, syllabusId))!;
}

// What every syllabus request checks first, in the account's own transaction: the parent's study_core consent, the
// child is this account's and of Class 1 or above, the subject is one of the child's class subjects, and (for a photo
// read into a named draft) the draft can take another photo. `children` names every child, so the AI platform's
// pre-processor can remove their names from what is sent.
export type RequestProblem = 'consent_required' | 'not_found' | 'not_for_class' | 'subject_bad' | 'too_many_photos';
export const PROBLEM_STATUS: Record<RequestProblem | ListProblem, number> = {
  consent_required: 403,
  not_found: 404,
  not_for_class: 403,
  subject_bad: 400,
  too_many_photos: 409,
  empty: 400,
  too_many: 400,
  title_bad: 400,
  bad_request: 400,
};
export async function checkSyllabusRequest(
  db: Db,
  accountId: string,
  q: { childId: string; subject: string; draftId?: string | null }
): Promise<{ ok: true; child: FamilyChild; children: FamilyChild[] } | { ok: false; reason: RequestProblem }> {
  if (!(await consentState(db, accountId)).study_core) return { ok: false, reason: 'consent_required' };
  const children = await listChildren(db, accountId);
  const child = children.find((c) => c.childId === q.childId);
  if (!child) return { ok: false, reason: 'not_found' };
  if (isPrePrimary(child.classLevel)) return { ok: false, reason: 'not_for_class' };
  const subjects: readonly string[] = await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel });
  if (!subjects.includes(q.subject)) return { ok: false, reason: 'subject_bad' };
  if (q.draftId !== undefined) {
    const draft = await draftFor(db, accountId, { childId: q.childId, subject: q.subject, syllabusId: q.draftId });
    if (draft === 'not_found' || draft === 'too_many_photos') return { ok: false, reason: draft };
  }
  return { ok: true, child, children };
}

// Deletes a draft or a saved syllabus of the account (its lines go with it).
export async function deleteSyllabus(db: Db, accountId: string, syllabusId: string): Promise<boolean> {
  if (!isUuid(syllabusId)) return false;
  const res = await db.query(`delete from family.child_syllabi where account_id = $1 and syllabus_id = $2`, [accountId, syllabusId]);
  return (res.rowCount ?? 0) > 0;
}
