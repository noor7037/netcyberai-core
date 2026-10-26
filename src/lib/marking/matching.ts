import type { MatchedBy, PageReading, PageState, RosterChild, SheetFlag, UploadMode } from '@/lib/contracts/marking';

// Which pages make one child's script, and whose it is (C347). Rules only: the AI reads what is written on a page
// (exams.read_pages); these rules decide. Nothing is guessed: a script whose child is not clear is left for the teacher.
//
//   Grouping:  "one file per child": each file is one script, unless a later page of it plainly starts another
//              child's script (a first page with a different roll or exam number, or a different name).
//              "one combined scan": a new script starts at every first page of another child; pages before the
//              first one are a script of their own, matched to no one.
//              Duplicate pages are left out; blank and unreadable pages stay in their script (so nothing is lost),
//              and an unreadable page flags it. Printed page numbers that skip one flag a missing page.
//   Matching:  the exam number (when the exam uses them), then the roll number on the paper's class roll, then the
//              name; a number whose name plainly disagrees is not trusted. Two scripts read as one child both wait.

export type GroupPage = { pageId: string; fileNo: number; pageNo: number; state: PageState; reading: PageReading | null };
export type PageGroup = { pageIds: string[]; read: { name: string | null; rollNo: string | null; seatNo: string | null } | null; flags: SheetFlag[] };
export type Match = { studentId: string | null; by: MatchedBy; candidates: string[]; flags: SheetFlag[] };

// ---- names and numbers -------------------------------------------------------------------------------------------

// A name made comparable: lower case, letters (any script) and spaces only, honorifics left out.
const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'kumari', 'km', 'shri', 'smt', 'master']);
export function nameTokens(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s.]/gu, ' ')
    .split(/[\s.]+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const x = bigrams(a);
  const y = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}
function tokenScore(t: string, others: readonly string[]): number {
  let best = 0;
  for (const o of others) {
    const s = t.length === 1 || o.length === 1 ? (t[0] === o[0] ? 0.9 : 0) : dice(t, o);
    if (s > best) best = s;
  }
  return best;
}

// How alike two names are, from 0 to 1: each word against the other's best word (an initial matches its word's first
// letter), both ways, or the whole names, whichever is higher.
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return 0;
  const avg = (p: readonly string[], q: readonly string[]) => p.reduce((s, t) => s + tokenScore(t, q), 0) / p.length;
  return Math.max(Math.min(avg(x, y), avg(y, x)), dice(x.join(''), y.join('')));
}

// A roll number as digits with no leading zeros ("Roll 07" is 7); anything else as its letters and digits.
export function rollKey(raw: string | null | undefined): string | null {
  const s = (raw ?? '').toUpperCase().replace(/^\s*(ROLL\s*(NO\.?|NUMBER)?\s*[:.-]?)/, '').replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  return /^[0-9]+$/.test(s) ? String(Number(s)) : s;
}
export const seatKey = (raw: string | null | undefined): string | null => {
  const s = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s || null;
};

export const NAME_SURE = 0.85; // a name alone matches at or above this, with no other name close
export const NAME_GAP = 0.1; // ...and the next best this much lower
export const NAME_DISAGREES = 0.5; // a number's child whose name scores below this is not trusted
export const NAME_CANDIDATE = 0.5; // a name this close is offered to the teacher

// ---- matching one script -----------------------------------------------------------------------------------------

export function matchIdentity(read: PageGroup['read'], roster: readonly RosterChild[]): Match {
  if (!read || (!read.name && !read.rollNo && !read.seatNo)) return { studentId: null, by: 'none', candidates: [], flags: ['identity'] };
  const named = (c: RosterChild) => (read.name ? nameSimilarity(read.name, c.name) : null);
  const byNumber = (child: RosterChild, by: MatchedBy): Match => {
    const sim = named(child);
    if (sim !== null && sim < NAME_DISAGREES) return { studentId: null, by: 'none', candidates: [child.studentId], flags: ['identity'] };
    // A number alone (no name read) is trusted for the match, but a person checks it: a wrong number would put the
    // marks on another child (review of #317).
    return { studentId: child.studentId, by, candidates: [], flags: sim === null ? ['check_child'] : [] };
  };
  const seat = seatKey(read.seatNo);
  if (seat) {
    const hits = roster.filter((c) => seatKey(c.seatNo) === seat);
    if (hits.length === 1) return byNumber(hits[0], 'seat');
  }
  const roll = rollKey(read.rollNo);
  if (roll) {
    const hits = roster.filter((c) => rollKey(c.rollNo) === roll);
    if (hits.length === 1) return byNumber(hits[0], 'roll');
    if (hits.length > 1 && read.name) {
      // Two children share a roll number on the roll (it happens): the name decides between them only.
      const ranked = hits.map((c) => ({ c, s: nameSimilarity(read.name, c.name) })).sort((a, b) => b.s - a.s);
      if (ranked[0].s >= NAME_SURE && ranked[0].s - (ranked[1]?.s ?? 0) >= NAME_GAP) return { studentId: ranked[0].c.studentId, by: 'roll', candidates: [], flags: [] };
      return { studentId: null, by: 'none', candidates: ranked.map((r) => r.c.studentId).slice(0, 3), flags: ['identity'] };
    }
  }
  if (read.name) {
    const ranked = roster.map((c) => ({ c, s: nameSimilarity(read.name, c.name) })).sort((a, b) => b.s - a.s);
    const [best, second] = ranked;
    if (best && best.s >= NAME_SURE && best.s - (second?.s ?? 0) >= NAME_GAP) return { studentId: best.c.studentId, by: 'name', candidates: [], flags: [] };
    return { studentId: null, by: 'none', candidates: ranked.filter((r) => r.s >= NAME_CANDIDATE).slice(0, 3).map((r) => r.c.studentId), flags: ['identity'] };
  }
  return { studentId: null, by: 'none', candidates: [], flags: ['identity'] };
}

// ---- grouping pages into scripts --------------------------------------------------------------------------------

const hasIdentity = (r: PageReading | null) => !!r && !!(r.name || r.rollNo || r.seatNo);
const identityOf = (r: PageReading | null): PageGroup['read'] => (r && hasIdentity(r) ? { name: r.name, rollNo: r.rollNo, seatNo: r.seatNo } : null);

// Whether a page plainly starts another child's script than `current`: a first page whose number differs, or (with no
// number on either) whose name is not the same child's. A first page that cannot be compared (a number on one, only a
// name on the other) starts a new script too: two scripts read as one child wait for the teacher, which is safer than
// two children's pages kept as one (review of #317).
function startsAnother(page: PageReading | null, current: PageGroup['read']): boolean {
  if (!page || !page.firstPage || !hasIdentity(page)) return false;
  if (!current) return true;
  const a = seatKey(page.seatNo) ?? rollKey(page.rollNo);
  const b = seatKey(current.seatNo) ?? rollKey(current.rollNo);
  if (a && b) return a !== b;
  if (page.name && current.name) return nameSimilarity(page.name, current.name) < NAME_SURE;
  return true;
}

function flagsOf(pages: readonly GroupPage[]): SheetFlag[] {
  const flags: SheetFlag[] = [];
  if (pages.some((p) => p.state === 'unreadable' || (p.reading && !p.reading.legible && !p.reading.blank))) flags.push('unreadable');
  const printed = pages.map((p) => p.reading?.pageNumber).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0);
  const numbers = [...new Set(printed)].sort((a, b) => a - b);
  if (numbers.length && (numbers[0] > 1 || numbers[numbers.length - 1] - numbers[0] + 1 > numbers.length)) flags.push('missing_page');
  // A printed page number twice in one script (1, 2, 1, 2): two children's pages may have been kept as one.
  if (numbers.length < printed.length) flags.push('identity');
  return flags;
}

export function groupPages(all: readonly GroupPage[], mode: UploadMode): PageGroup[] {
  const pages = [...all].filter((p) => p.state !== 'duplicate').sort((a, b) => a.fileNo - b.fileNo || a.pageNo - b.pageNo);
  const runs: GroupPage[][] = [];
  let run: GroupPage[] = [];
  let current: PageGroup['read'] = null;
  let lastFile = -1;
  for (const p of pages) {
    const newFile = p.fileNo !== lastFile;
    // A child who writes their name on every page stays one script: only a first page of ANOTHER child starts one. In
    // "one file per child", a file whose first page shows no name or number takes the first one shown later.
    const split = (mode === 'per_file' && newFile) || (run.length > 0 && (mode === 'combined' || current !== null) && startsAnother(p.reading, current));
    if (split && run.length) {
      runs.push(run);
      run = [];
      current = null;
    }
    run.push(p);
    current ??= identityOf(p.reading);
    lastFile = p.fileNo;
  }
  if (run.length) runs.push(run);
  return runs.map((r) => ({ pageIds: r.map((p) => p.pageId), read: r.map((p) => identityOf(p.reading)).find((x) => x !== null) ?? null, flags: flagsOf(r) }));
}

// Matches every new script and keeps one live script per child: two scripts read as the same child (or one read as a
// child who already has a live script of the paper) wait for the teacher, with that child offered.
export function assignScripts(groups: readonly PageGroup[], roster: readonly RosterChild[], taken: ReadonlySet<string>): Match[] {
  const matches = groups.map((g) => {
    const m = matchIdentity(g.read, roster);
    return { ...m, flags: [...new Set([...g.flags, ...m.flags])] };
  });
  const count = new Map<string, number>();
  for (const m of matches) if (m.studentId) count.set(m.studentId, (count.get(m.studentId) ?? 0) + 1);
  return matches.map((m) => {
    if (m.studentId && ((count.get(m.studentId) ?? 0) > 1 || taken.has(m.studentId))) {
      return { studentId: null, by: 'none' as MatchedBy, candidates: [m.studentId], flags: [...new Set<SheetFlag>([...m.flags, 'two_scripts'])] };
    }
    return m;
  });
}
