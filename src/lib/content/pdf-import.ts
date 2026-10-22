import { CATALOG_COLUMNS, MAX_CATALOG_ROWS, isAcademicYear, isHttpsUrl } from './catalog-csv';
import { readPdf } from '@/lib/privacy/pdf-text';

// Control → Content: a catalog draft from a board's syllabus PDF (M2-12, C286; docs/family-app/10 §4.2, 03 §9). Pure:
// no database, no network. The route (src/app/api/control/content/pdf-import/route.ts) reads the upload, sends the
// pages to the content.syllabus_extract profile, and gives what the model returned to extractedCatalog() here, which
// keeps only what the document says:
//   - every line (unit, chapter, topic) names the page it was read on, and its title must be found on that page of the
//     PDF's own text (spaces, capitals and dash or quote shapes aside); a line whose title is not there is dropped, and
//     every line under it with it. Nothing is guessed, corrected or translated.
//   - titles are 1–120 characters, one line;
//   - keys and positions are built by the repository's catalog rule (data/catalog/README.md): unit u1, chapter ch01
//     inside its unit, topic t01 inside its chapter, numbered over the lines kept;
//   - each line carries the source URL, its page and "checked on" today.
// The result is a catalog CSV, so the draft goes through the CSV import's own checks and path (library.ts
// importCatalog): one version, in review, imported by the uploader, who can never approve it. The PDF is not kept.

export const PDF_MAX_BYTES = 10 * 1024 * 1024;
// What one call sends: a syllabus is a few dozen pages. A longer file is refused rather than cut.
export const PDF_MAX_PAGES = 80;
export const PDF_MAX_CHARS = 150_000;
export const TITLE_MAX = 120;

// The board sites a syllabus may cite (10 §4.2: the board's official document). The state boards' sites are under
// .gov.in or .nic.in.
const BOARD_HOSTS = ['cbseacademic.nic.in', 'ncert.nic.in', 'cisce.org'];
const BOARD_SUFFIXES = ['.gov.in', '.nic.in'];

export function isBoardSourceUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !isHttpsUrl(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return BOARD_HOSTS.some((h) => host === h || host === `www.${h}`) || BOARD_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

export type PdfImportMeta = { board: string; classLevel: number; subject: string; academicYear: string; sourceUrl: string };
export type PdfImportRefusal = 'source_url_bad' | 'board_bad' | 'class_bad' | 'subject_bad' | 'year_bad' | 'not_a_pdf' | 'too_big' | 'encrypted' | 'no_text' | 'too_long';

const BOARD_RE = /^[A-Z][A-Z0-9-]{1,15}$/;
const SUBJECT_RE = /^[a-z][a-z_]{1,39}$/;

// The form's fields, as the CSV rules read them.
export function checkMeta(b: { board?: unknown; classLevel?: unknown; subject?: unknown; academicYear?: unknown; sourceUrl?: unknown }): { ok: true; meta: PdfImportMeta } | { ok: false; reason: PdfImportRefusal } {
  if (!isBoardSourceUrl(b.sourceUrl)) return { ok: false, reason: 'source_url_bad' };
  if (typeof b.board !== 'string' || !BOARD_RE.test(b.board)) return { ok: false, reason: 'board_bad' };
  if (typeof b.classLevel !== 'number' || !Number.isInteger(b.classLevel) || b.classLevel < 1 || b.classLevel > 12) return { ok: false, reason: 'class_bad' };
  if (typeof b.subject !== 'string' || !SUBJECT_RE.test(b.subject)) return { ok: false, reason: 'subject_bad' };
  if (typeof b.academicYear !== 'string' || !isAcademicYear(b.academicYear)) return { ok: false, reason: 'year_bad' };
  return { ok: true, meta: { board: b.board, classLevel: b.classLevel, subject: b.subject, academicYear: b.academicYear, sourceUrl: b.sourceUrl } };
}

// The text of each page, or why the file cannot be used. No OCR here: a scan with no text layer says so.
export function pdfPages(bytes: Uint8Array): { ok: true; pages: string[] } | { ok: false; reason: PdfImportRefusal } {
  if (bytes.length > PDF_MAX_BYTES) return { ok: false, reason: 'too_big' };
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return { ok: false, reason: 'not_a_pdf' };
  const read = readPdf(bytes);
  if (read.encrypted) return { ok: false, reason: 'encrypted' };
  const pages = read.pages.map((p) => p.replace(/\s+\n/g, '\n').trim());
  if (!pages.some((p) => /[\p{L}\p{N}]{2}/u.test(p))) return { ok: false, reason: 'no_text' };
  if (pages.length > PDF_MAX_PAGES || pages.reduce((n, p) => n + p.length, 0) > PDF_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, pages };
}

// ---- what the model returned ---------------------------------------------------------------------------------------

export type DropReason = 'not_on_page' | 'title_bad' | 'page_bad' | 'parent_dropped' | 'too_many';
export type DroppedLine = { level: 'unit' | 'chapter' | 'topic'; title: string; page: number | null; reason: DropReason };
export type KeptLine = { level: 'unit' | 'chapter' | 'topic'; key: string; parentKey: string | null; position: number; title: string; page: number };
export type Extracted = { lines: KeptLine[]; dropped: DroppedLine[]; units: number; chapters: number; topics: number };

// For "is this title on that page": the same letters in the same order, whatever the spaces, capitals, and dash or
// quote shapes the PDF used.
export const squash = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, '');

const titleOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null;
};
const pageOf = (v: unknown, pages: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= pages ? v : null);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pad = (n: number) => String(n).padStart(2, '0');

export function extractedCatalog(modelText: string, pages: string[], meta: Pick<PdfImportMeta, 'board' | 'classLevel' | 'subject'>): Extracted | null {
  let parsed: unknown;
  try {
    const start = modelText.indexOf('{');
    const end = modelText.lastIndexOf('}');
    parsed = start >= 0 && end > start ? JSON.parse(modelText.slice(start, end + 1)) : null;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const root = parsed as { units?: unknown; chapters?: unknown };
  const onPage = pages.map(squash);
  const lines: KeptLine[] = [];
  const dropped: DroppedLine[] = [];
  const base = `${meta.board.toLowerCase()}.c${meta.classLevel}.${meta.subject}`;

  // One line of the model's answer: kept when its title is on its page, else dropped with everything under it.
  const take = (level: KeptLine['level'], raw: unknown): { title: string; page: number } | null => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { title?: unknown; page?: unknown };
    const title = titleOf(r.title);
    const page = pageOf(r.page, pages.length);
    const shown = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX + 20) : '';
    if (lines.length >= MAX_CATALOG_ROWS) {
      dropped.push({ level, title: shown, page, reason: 'too_many' });
      return null;
    }
    if (!title) {
      dropped.push({ level, title: shown, page, reason: 'title_bad' });
      return null;
    }
    if (page === null) {
      dropped.push({ level, title, page: null, reason: 'page_bad' });
      return null;
    }
    if (!onPage[page - 1].includes(squash(title))) {
      dropped.push({ level, title, page, reason: 'not_on_page' });
      return null;
    }
    return { title, page };
  };
  const under = (level: KeptLine['level'], raw: unknown) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { title?: unknown; page?: unknown };
    dropped.push({ level, title: typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX + 20) : '', page: pageOf(r.page, pages.length), reason: 'parent_dropped' });
  };
  const chapters = (list: unknown[], parentKey: string | null, keyBase: string) => {
    let c = 0;
    for (const raw of list) {
      const topics = listOf((raw as { topics?: unknown } | null)?.topics);
      const kept = take('chapter', raw);
      if (!kept) {
        for (const t of topics) under('topic', t);
        continue;
      }
      c += 1;
      const key = `${keyBase}.ch${pad(c)}`;
      lines.push({ level: 'chapter', key, parentKey, position: c, title: kept.title, page: kept.page });
      let n = 0;
      for (const t of topics) {
        const kt = take('topic', t);
        if (!kt) continue;
        n += 1;
        lines.push({ level: 'topic', key: `${key}.t${pad(n)}`, parentKey: key, position: n, title: kt.title, page: kt.page });
      }
    }
  };

  let u = 0;
  for (const raw of listOf(root.units)) {
    const inner = listOf((raw as { chapters?: unknown } | null)?.chapters);
    const kept = take('unit', raw);
    if (!kept) {
      for (const ch of inner) {
        under('chapter', ch);
        for (const t of listOf((ch as { topics?: unknown } | null)?.topics)) under('topic', t);
      }
      continue;
    }
    u += 1;
    const key = `${base}.u${u}`;
    lines.push({ level: 'unit', key, parentKey: null, position: u, title: kept.title, page: kept.page });
    chapters(inner, key, key);
  }
  chapters(listOf(root.chapters), null, base);

  return {
    lines,
    dropped,
    units: lines.filter((l) => l.level === 'unit').length,
    chapters: lines.filter((l) => l.level === 'chapter').length,
    topics: lines.filter((l) => l.level === 'topic').length,
  };
}

// The kept lines as a catalog CSV (data/catalog/README.md's columns), every line in review, read today.
export function catalogCsv(lines: KeptLine[], meta: PdfImportMeta, today: string): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = lines.map((l) =>
    [meta.board, meta.classLevel, meta.subject, meta.academicYear, l.level, l.key, l.parentKey ?? '', l.position, l.title, '', meta.sourceUrl, String(l.page), today, 'in_review'].map(cell).join(',')
  );
  return [CATALOG_COLUMNS.join(','), ...rows].join('\n');
}
