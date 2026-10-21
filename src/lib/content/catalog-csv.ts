import { parseCsvChecked } from '@/lib/import/csv';
import { isIsoDate } from '@/lib/time/india';

// The syllabus catalog as a CSV file (M1-4, docs/family-app/10 §4.2): one line per unit, chapter and topic of a board's
// official curriculum document, exactly as the document prints it. Reading the file needs no database: the shape, each
// line on its own, and the lines against each other (keys, parents, positions). What needs the database (the board
// exists) is checked by the import (library.ts). Every problem is listed with its line, so "Check file" shows them all
// at once; an import with any problem writes nothing.
//
// Titles only, never textbook text (NCERT is CC BY-NC-ND): a title is one line of at most 300 characters.

export const CATALOG_COLUMNS = [
  'board',
  'class',
  'subject',
  'academic_year',
  'level',
  'key',
  'parent_key',
  'position',
  'title_en',
  'title_hi',
  'source_url',
  'source_page',
  'checked_on',
  'status',
] as const;
export type CatalogColumn = (typeof CATALOG_COLUMNS)[number];

export const MAX_CATALOG_ROWS = 5000;
export const MAX_CATALOG_CHARS = 2_000_000;
export const MAX_TITLE_CHARS = 300;

export type CatalogLevel = 'unit' | 'chapter' | 'topic';
export const CATALOG_LEVELS: readonly CatalogLevel[] = ['unit', 'chapter', 'topic'];

export type CatalogProblemCode =
  | 'too_large'
  | 'unclosed_quote'
  | 'header'
  | 'no_rows'
  | 'too_many_rows'
  | 'value_count'
  | 'board_bad'
  | 'class_bad'
  | 'subject_bad'
  | 'year_bad'
  | 'level_bad'
  | 'key_bad'
  | 'key_duplicate'
  | 'parent_missing'
  | 'parent_not_allowed'
  | 'parent_unknown'
  | 'parent_level'
  | 'parent_syllabus'
  | 'position_bad'
  | 'position_duplicate'
  | 'title_missing'
  | 'title_too_long'
  | 'title_lines'
  | 'title_hi_too_long'
  | 'source_url_bad'
  | 'source_page_bad'
  | 'checked_on_bad'
  | 'checked_on_future'
  | 'status_bad'
  | 'board_unknown';
// `line`: the line of the file (the header is line 1). `value`: what was found. `with`: the other line involved.
export type CatalogProblem = { line: number; code: CatalogProblemCode; value?: string; with?: number };

export type CatalogLine = {
  line: number;
  board: string;
  classLevel: number;
  subject: string;
  academicYear: string;
  level: CatalogLevel;
  key: string;
  parentKey: string | null;
  position: number;
  titleEn: string;
  titleHi: string | null;
  sourceUrl: string;
  sourcePage: string;
  checkedOn: string;
};

// One syllabus of the file: a board, class, subject and academic year. Each becomes one syllabus version.
export type CatalogSyllabus = {
  board: string;
  classLevel: number;
  subject: string;
  academicYear: string;
  units: CatalogLine[];
  chapters: CatalogLine[];
  topics: CatalogLine[];
};

export const syllabusId = (s: { board: string; classLevel: number; subject: string; academicYear: string }) => `${s.board}|${s.classLevel}|${s.subject}|${s.academicYear}`;

const BOARD_RE = /^[A-Z][A-Z0-9-]{1,15}$/;
const SUBJECT_RE = /^[a-z][a-z_]{1,39}$/;
const YEAR_RE = /^([0-9]{4})-([0-9]{2})$/;
const KEY_RE = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const PAGE_RE = /^[0-9]{1,4}(-[0-9]{1,4})?$/;
const PARENT_LEVEL: Record<CatalogLevel, CatalogLevel | null> = { unit: null, chapter: 'unit', topic: 'chapter' };

// 2026-27: the second part is the year after the first.
export function isAcademicYear(v: string): boolean {
  const m = YEAR_RE.exec(v);
  return !!m && (Number(m[1]) + 1) % 100 === Number(m[2]);
}

export function isHttpsUrl(v: string): boolean {
  if (!/^https:\/\/[^\s]+$/.test(v) || v.length > 500) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

// `today`: the date in India, for "checked on" (a check cannot be in the future).
export function readCatalogCsv(text: string, today: string): { lines: CatalogLine[]; syllabi: CatalogSyllabus[]; problems: CatalogProblem[]; rowCount: number } {
  const none = (p: CatalogProblem, rowCount = 0) => ({ lines: [], syllabi: [], problems: [p], rowCount });
  if (text.length > MAX_CATALOG_CHARS) return none({ line: 1, code: 'too_large', value: String(MAX_CATALOG_CHARS) });
  const parsed = parseCsvChecked(text);
  if (parsed.unclosedQuote) return none({ line: 1, code: 'unclosed_quote' });
  const header = (parsed.rows[0] ?? []).map((h) => h.trim().toLowerCase());
  if (header.length !== CATALOG_COLUMNS.length || header.some((h, i) => h !== CATALOG_COLUMNS[i])) return none({ line: 1, code: 'header' });
  const body = parsed.rows
    .slice(1)
    .map((cells, i) => ({ line: i + 2, cells }))
    .filter((l) => l.cells.some((c) => c.trim() !== ''));
  if (body.length === 0) return none({ line: 1, code: 'no_rows' });
  if (body.length > MAX_CATALOG_ROWS) return none({ line: 1, code: 'too_many_rows', value: String(MAX_CATALOG_ROWS) }, body.length);

  const problems: CatalogProblem[] = [];
  const lines: CatalogLine[] = [];
  const keyLine = new Map<string, number>();

  // Each line on its own.
  for (const { line, cells } of body) {
    if (cells.length !== CATALOG_COLUMNS.length) {
      problems.push({ line, code: 'value_count', value: String(cells.length) });
      continue;
    }
    const cell = (c: CatalogColumn) => (cells[CATALOG_COLUMNS.indexOf(c)] ?? '').trim();
    const before = problems.length;
    const add = (code: CatalogProblemCode, value?: string, withLine?: number) =>
      problems.push({ line, code, ...(value === undefined ? {} : { value: value.slice(0, 80) }), ...(withLine === undefined ? {} : { with: withLine }) });

    const board = cell('board');
    if (!BOARD_RE.test(board)) add('board_bad', board);
    const rawClass = cell('class');
    const classLevel = /^[0-9]{1,2}$/.test(rawClass) ? Number(rawClass) : NaN;
    if (!(classLevel >= 1 && classLevel <= 12)) add('class_bad', rawClass);
    const subject = cell('subject');
    if (!SUBJECT_RE.test(subject)) add('subject_bad', subject);
    const academicYear = cell('academic_year');
    if (!isAcademicYear(academicYear)) add('year_bad', academicYear);
    const level = cell('level') as CatalogLevel;
    if (!CATALOG_LEVELS.includes(level)) add('level_bad', cell('level'));
    const key = cell('key');
    if (!KEY_RE.test(key)) add('key_bad', key);
    else if (keyLine.has(key)) add('key_duplicate', key, keyLine.get(key));
    else keyLine.set(key, line);
    const parentKey = cell('parent_key') || null;
    if (level === 'unit' && parentKey) add('parent_not_allowed', parentKey);
    if (level === 'topic' && !parentKey) add('parent_missing');
    if (parentKey && !KEY_RE.test(parentKey)) add('key_bad', parentKey);
    const rawPosition = cell('position');
    const position = /^[0-9]{1,4}$/.test(rawPosition) ? Number(rawPosition) : NaN;
    if (!(position >= 1)) add('position_bad', rawPosition);
    const titleEn = cell('title_en');
    const titleHi = cell('title_hi') || null;
    if (!titleEn) add('title_missing');
    else if (titleEn.length > MAX_TITLE_CHARS) add('title_too_long', String(titleEn.length));
    if (/[\n\t]/.test(titleEn) || (titleHi && /[\n\t]/.test(titleHi))) add('title_lines');
    if (titleHi && titleHi.length > MAX_TITLE_CHARS) add('title_hi_too_long', String(titleHi.length));
    const sourceUrl = cell('source_url');
    if (!isHttpsUrl(sourceUrl)) add('source_url_bad', sourceUrl);
    const sourcePage = cell('source_page');
    if (!PAGE_RE.test(sourcePage)) add('source_page_bad', sourcePage);
    const checkedOn = cell('checked_on');
    if (!isIsoDate(checkedOn) || new Date(`${checkedOn}T00:00:00Z`).toISOString().slice(0, 10) !== checkedOn) add('checked_on_bad', checkedOn);
    else if (checkedOn > today) add('checked_on_future', checkedOn);
    const status = cell('status');
    if (status !== 'in_review') add('status_bad', status);

    if (problems.length === before) {
      lines.push({ line, board, classLevel, subject, academicYear, level, key, parentKey, position, titleEn, titleHi, sourceUrl, sourcePage, checkedOn });
    }
  }

  // The lines against each other: a parent is a line of the file, one level up, in the same syllabus; no two lines
  // under the same parent share a position.
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const siblingAt = new Map<string, number>();
  const placed: CatalogLine[] = [];
  for (const l of lines) {
    const before = problems.length;
    if (l.parentKey) {
      const parent = byKey.get(l.parentKey);
      const parentLine = keyLine.get(l.parentKey);
      if (!parent && parentLine === undefined) problems.push({ line: l.line, code: 'parent_unknown', value: l.parentKey });
      else if (parent && parent.level !== PARENT_LEVEL[l.level]) problems.push({ line: l.line, code: 'parent_level', value: l.parentKey, with: parent.line });
      else if (parent && syllabusId(parent) !== syllabusId(l)) problems.push({ line: l.line, code: 'parent_syllabus', value: l.parentKey, with: parent.line });
    }
    const slot = `${syllabusId(l)}|${l.level}|${l.parentKey ?? ''}|${l.position}`;
    const other = siblingAt.get(slot);
    if (other !== undefined) problems.push({ line: l.line, code: 'position_duplicate', value: String(l.position), with: other });
    else siblingAt.set(slot, l.line);
    if (problems.length === before) placed.push(l);
  }
  problems.sort((a, b) => a.line - b.line);
  if (problems.length > 0) return { lines: [], syllabi: [], problems, rowCount: body.length };

  const syllabi = new Map<string, CatalogSyllabus>();
  for (const l of placed) {
    const id = syllabusId(l);
    let s = syllabi.get(id);
    if (!s) {
      s = { board: l.board, classLevel: l.classLevel, subject: l.subject, academicYear: l.academicYear, units: [], chapters: [], topics: [] };
      syllabi.set(id, s);
    }
    (l.level === 'unit' ? s.units : l.level === 'chapter' ? s.chapters : s.topics).push(l);
  }
  return { lines: placed, syllabi: [...syllabi.values()], problems: [], rowCount: body.length };
}
