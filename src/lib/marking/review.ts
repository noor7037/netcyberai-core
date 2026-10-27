import { writeAuditLog } from '@/lib/audit/log';
import { ERROR_TYPES, MAX_MARKING_ATTEMPTS, PAGE_STATES, type ErrorType, type MarkingException, type MarkingOverview, type MarkingPaper, type MarkingQuestion, type PageState, type PicturesUntil, type QuestionResult, type RosterChild, type SheetChangeInput, type SheetDetail, type SheetFlag, type SheetRow, type SheetState } from '@/lib/contracts/marking';
import { saveMarks, type SaveProblem } from '@/lib/exams/marks';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { aiMarkingState, markingPaper, markingSettings, paperRoster, type Actor } from './context';
import { markedParts, partTotals, countedQuestions, round1, structureProblems } from './rollup';
import { questionsOf } from './setup';

// The teacher's side of AI marking (C347): what a paper's marking has come to, one script beside its pages, the
// teacher's changes, choosing the child, and approval. Approval rolls the script's question marks up into the
// paper's marks through saveMarks (P6's one path: its checks, its freeze once published, its audit row), in the
// teacher's own name. A flagged script is approved only on its own; "approve every script with no flag" takes the
// rest. Everything runs in the caller's own tenant transaction.

// Where the screens fetch a page picture: the app's own route, which reads the page's row under the viewer's own row
// rules every time and streams the picture (no storage link leaves the server).
export const pageUrl = (pageId: string) => `/api/app/marking/pages/${pageId}`;

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

type MarkRow = { question_id: string; attempted: boolean | null; ai_marks: unknown; marks: unknown };

// Each question's final mark: the teacher's when they changed it, else the AI's.
function finals(rows: readonly MarkRow[]): Map<string, number | null> {
  return new Map(rows.map((r) => [r.question_id, r.marks !== null && r.marks !== undefined ? Number(r.marks) : r.ai_marks !== null && r.ai_marks !== undefined ? Number(r.ai_marks) : null]));
}

function totalOf(paper: MarkingPaper, questions: readonly MarkingQuestion[], marks: Map<string, number | null>, counts: Record<string, number>): { total: number; max: number } {
  const parts = markedParts(paper.components, questions);
  const t = partTotals(parts, questions, marks, counts);
  return { total: round1(t.reduce((s, p) => s + p.score, 0)), max: round1(t.reduce((s, p) => s + p.max, 0)) };
}

async function choiceCountsOf(db: Sql, schoolId: string, paperId: string): Promise<Record<string, number>> {
  return ((await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paperId])).rows[0]?.choice_counts ?? {}) as Record<string, number>;
}

// ---- the paper's overview ----------------------------------------------------------------------------------------------

// When the paper's pictures go, as the sweep works it out (the database's marking_picture_deadline, C230-AH).
async function picturesUntil(db: Sql, paperId: string): Promise<PicturesUntil | null> {
  const r = (await db.query(`select (until at time zone 'Asia/Kolkata')::date::text as until, basis, kept from public.marking_pictures_until($1)`, [paperId])).rows[0] as
    | { until: string | null; basis: PicturesUntil['basis']; kept: boolean }
    | undefined;
  return r ? { until: r.until ?? null, basis: r.basis, kept: r.kept === true } : null;
}

export async function markingOverview(db: Sql, actor: Actor, paperId: string): Promise<MarkingOverview | null> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const counts = await choiceCountsOf(db, actor.schoolId, paperId);
  const problems = structureProblems(paper.components, questions, counts);
  const roster = await paperRoster(db, actor.schoolId, paper);
  const byId = new Map(roster.map((c) => [c.studentId, c]));
  const uploads = (
    await db.query(
      `select u.upload_id, u.mode, u.created_at, u.closed_at, count(g.page_id)::int as pages, count(distinct g.file_no)::int as files
         from marking_uploads u left join marking_pages g on g.school_id = u.school_id and g.upload_id = u.upload_id
        where u.school_id = $1 and u.paper_id = $2 group by u.school_id, u.upload_id order by u.created_at`,
      [actor.schoolId, paperId]
    )
  ).rows.map((r) => ({ uploadId: r.upload_id as string, mode: r.mode, createdAt: iso(r.created_at) as string, closed: r.closed_at !== null, files: Number(r.files), pages: Number(r.pages) }));
  const pages = Object.fromEntries(PAGE_STATES.map((s) => [s, 0])) as Record<PageState, number>;
  for (const r of (await db.query(`select state, count(*)::int as n from marking_pages where school_id = $1 and paper_id = $2 group by state`, [actor.schoolId, paperId])).rows) pages[r.state as PageState] = Number(r.n);
  const sheetRows = (
    await db.query(
      `select s.sheet_id, s.student_id, s.matched_by, s.state, s.flags, s.failure, s.ai_confidence, s.approved_at, s.match_note -> 'read' as read,
              (select count(*)::int from marking_pages g where g.school_id = s.school_id and g.sheet_id = s.sheet_id) as pages
         from marking_sheets s where s.school_id = $1 and s.paper_id = $2 and s.state <> 'set_aside' order by s.created_at, s.sheet_id`,
      [actor.schoolId, paperId]
    )
  ).rows;
  const marks = (await db.query(`select sheet_id, question_id, attempted, ai_marks, marks from marking_marks where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows;
  const marksBySheet = new Map<string, MarkRow[]>();
  for (const m of marks) marksBySheet.set(m.sheet_id, [...(marksBySheet.get(m.sheet_id) ?? []), m as MarkRow]);
  const max = totalOf(paper, questions, new Map(), counts).max;
  const sheets: SheetRow[] = sheetRows.map((s) => {
    const rows = marksBySheet.get(s.sheet_id) ?? [];
    return {
      sheetId: s.sheet_id,
      student: s.student_id ? byId.get(s.student_id) ?? { studentId: s.student_id, name: '', rollNo: null, seatNo: null } : null,
      matchedBy: s.matched_by,
      state: s.state as SheetState,
      flags: (s.flags ?? []) as SheetFlag[],
      failure: s.failure ?? null,
      pages: Number(s.pages),
      total: rows.length ? totalOf(paper, questions, finals(rows), counts).total : null,
      max,
      confidence: num(s.ai_confidence),
      approvedAt: iso(s.approved_at),
    };
  });
  // Roll order for the matched, then the scripts matched to no one, as they came.
  const order = new Map(roster.map((c, i) => [c.studentId, i]));
  sheets.sort((a, b) => (a.student ? order.get(a.student.studentId) ?? 1e6 : 1e7) - (b.student ? order.get(b.student.studentId) ?? 1e6 : 1e7));
  const withScript = new Set(sheets.filter((s) => s.student).map((s) => s.student!.studentId));
  const withoutScript = roster.filter((c) => !withScript.has(c.studentId));
  const parts = markedParts(paper.components, questions).map((p) => p.key);
  const absent = parts.length
    ? (
        await db.query(
          `select m.student_id from marks m where m.school_id = $1 and m.paper_id = $2 and m.component = any ($3::text[]) and m.kind = 'absent'
            group by m.student_id having count(*) = $4`,
          [actor.schoolId, paperId, parts, parts.length]
        )
      ).rows.map((r) => r.student_id as string).filter((id) => withoutScript.some((c) => c.studentId === id))
    : [];
  const settings = await markingSettings(db, actor.schoolId);
  const oddPages = (
    await db.query(
      `select g.sheet_id, g.page_id, g.sheet_position, coalesce((g.reading ->> 'idDocument')::boolean, false) as id_document
         from marking_pages g where g.school_id = $1 and g.paper_id = $2 and g.state = 'not_answer' and g.sheet_id is not null order by g.sheet_position`,
      [actor.schoolId, paperId]
    )
  ).rows;
  const readOf = new Map(sheetRows.map((s) => [s.sheet_id as string, (s.read ?? null) as MarkingException['read']]));
  return {
    paper,
    ready: problems.length === 0,
    problems,
    uploads,
    pages,
    sheets,
    candidates: roster,
    withoutScript,
    absent,
    reviewBelow: settings.reviewBelow,
    pictures: uploads.length ? await picturesUntil(db, paperId) : null,
    exceptions: exceptionsOf(sheets, readOf, oddPages.map((g) => ({ sheetId: g.sheet_id as string, pageId: g.page_id as string, position: Number(g.sheet_position), idDocument: g.id_document === true }))),
    ai: await aiMarkingState(db, actor.schoolId),
  };
}

// The hub's one list of things to settle (C230-AJ), in the review list's order: a sheet that reads another child, each
// page that may not be an answer page, a page that could not be read or may be missing, and a script of no one. Only
// scripts a person can still change: an approved or set-aside script is not on it.
export function exceptionsOf(
  sheets: readonly SheetRow[],
  readOf: ReadonlyMap<string, MarkingException['read']>,
  oddPages: readonly { sheetId: string; pageId: string; position: number; idDocument: boolean }[]
): MarkingException[] {
  const out: MarkingException[] = [];
  for (const s of sheets) {
    if (s.state === 'approved' || s.state === 'set_aside') continue;
    const base = { sheetId: s.sheetId, student: s.student, read: null, page: null };
    if (s.flags.includes('mismatch')) out.push({ ...base, kind: 'mismatch', read: readOf.get(s.sheetId) ?? null });
    for (const g of oddPages.filter((p) => p.sheetId === s.sheetId)) out.push({ ...base, kind: 'not_answer_page', page: { pageId: g.pageId, position: g.position, odd: g.idDocument ? 'id_document' : 'not_answer' } });
    if (!s.student) out.push({ ...base, kind: 'no_child' });
    if (s.flags.includes('unreadable')) out.push({ ...base, kind: 'unreadable' });
    if (s.flags.includes('missing_page')) out.push({ ...base, kind: 'missing_page' });
  }
  return out;
}

// ---- one script ------------------------------------------------------------------------------------------------------

export async function sheetDetail(db: Sql, actor: Actor, sheetId: string): Promise<SheetDetail | null> {
  if (!isUuid(sheetId)) return null;
  const s = (await db.query(`select * from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0];
  if (!s) return null;
  const paper = await markingPaper(db, actor, s.paper_id);
  if (!paper) return null;
  const overview = await markingOverview(db, actor, paper.paperId);
  if (!overview) return null;
  const row = overview.sheets.find((x) => x.sheetId === sheetId) ?? null;
  const roster = await paperRoster(db, actor.schoolId, paper);
  const questions = await questionsOf(db, actor.schoolId, paper.paperId);
  const counts = await choiceCountsOf(db, actor.schoolId, paper.paperId);
  const markRows = (await db.query(`select * from marking_marks where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows;
  const byQ = new Map(markRows.map((m) => [m.question_id as string, m]));
  const final = finals(markRows as MarkRow[]);
  const counted = countedQuestions(questions, final, counts);
  const pageRows = (
    await db.query(`select page_id, sheet_position, width, height, state, reading, picture_gone_at from marking_pages where school_id = $1 and sheet_id = $2 order by sheet_position`, [actor.schoolId, sheetId])
  ).rows;
  // A deleted picture (the school's days after publication) is not shown; the marks stay.
  const pages = pageRows
    .filter((g) => g.picture_gone_at === null)
    .map((g) => ({
      pageId: g.page_id as string,
      position: Number(g.sheet_position),
      url: pageUrl(g.page_id as string),
      width: Number(g.width),
      height: Number(g.height),
      state: g.state as PageState,
      odd: g.state === 'not_answer' ? (g.reading?.idDocument === true ? ('id_document' as const) : ('not_answer' as const)) : null,
    }));
  const parts = markedParts(paper.components, questions);
  const note = (s.match_note ?? {}) as { read?: { name: string | null; rollNo: string | null; seatNo: string | null } | null; candidates?: string[] };
  const rosterById = new Map(roster.map((c) => [c.studentId, c]));
  // The next script waiting for a person, after this one in the overview's order (then from the start).
  const waiting = overview.sheets.filter((x) => x.state === 'marked' || (x.state === 'approved' && x.flags.includes('changed')));
  const at = overview.sheets.findIndex((x) => x.sheetId === sheetId);
  const next = [...overview.sheets.slice(at + 1), ...overview.sheets.slice(0, Math.max(0, at))].find((x) => waiting.includes(x) && x.sheetId !== sheetId)?.sheetId ?? null;
  return {
    paper,
    sheet: row ?? {
      sheetId,
      student: s.student_id ? rosterById.get(s.student_id) ?? null : null,
      matchedBy: s.matched_by,
      state: s.state,
      flags: s.flags ?? [],
      failure: s.failure ?? null,
      pages: pages.length,
      total: null,
      max: overview.sheets[0]?.max ?? 0,
      confidence: num(s.ai_confidence),
      approvedAt: iso(s.approved_at),
    },
    match: { read: note.read ?? null, candidates: (note.candidates ?? []).map((id) => rosterById.get(id)).filter((c): c is RosterChild => !!c) },
    roster,
    pages,
    picturesGone: pageRows.length - pages.length,
    questions: questions.map((q) => {
      const m = byQ.get(q.questionId);
      return {
        ...q,
        ai: {
          attempted: m ? (m.attempted ?? null) : null,
          marks: m ? num(m.ai_marks) : null,
          steps: (m?.ai_steps ?? []) as QuestionResult['steps'],
          note: m?.ai_note ?? null,
          reason: m?.ai_reason ?? null,
          confidence: m ? num(m.confidence) : null,
        },
        teacher: { marks: m ? num(m.marks) : null, note: m?.note ?? null, changedAt: m ? iso(m.changed_at) : null },
        errorType: (m?.error_type ?? null) as ErrorType | null,
        final: final.get(q.questionId) ?? null,
        counted: counted.has(q.questionId),
        place: m?.page_id && m.y_from !== null ? { pageId: m.page_id, yFrom: Number(m.y_from), yTo: Number(m.y_to) } : null,
      };
    }),
    totals: partTotals(parts, questions, final, counts).map((t) => ({ ...t, name: parts.find((p) => p.key === t.component)?.name ?? t.component })),
    strengths: s.strengths ?? null,
    improve: s.improve ?? null,
    practice: (s.practice ?? []) as { unitId: string | null; text: string }[],
    mayChange: paper.mayMark && !paper.published && s.state !== 'set_aside',
    next,
  };
}

// ---- the teacher's changes ------------------------------------------------------------------------------------------

export type ChangeProblem = 'not_allowed' | 'not_found' | 'closed' | 'marks' | 'words' | 'state' | 'tries';
export type ChangeResult = { ok: true } | { ok: false; reason: ChangeProblem; questionId?: string };

// Words as sent: undefined (left as they are), null or empty (cleared), or at most `max` characters; 'bad' otherwise.
function words(v: unknown, max: number): string | null | undefined | 'bad' {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || v.trim().length > max) return 'bad';
  return v.trim() || null;
}

// A changed approved script waits to be approved again ('changed'); the paper's marks stay as approved until then.
// The script is read first, so a published or another person's paper says why; it is locked only when this person may
// change it (a row the update rules refuse cannot be locked).
async function loadForChange(db: Sql, actor: Actor, sheetId: string) {
  if (!isUuid(sheetId)) return null;
  const read = async (lock: boolean) =>
    (await db.query(`select sheet_id, paper_id, state, flags from marking_sheets where school_id = $1 and sheet_id = $2${lock ? ' for update' : ''}`, [actor.schoolId, sheetId])).rows[0];
  let s = await read(false);
  if (!s) return null;
  const paper = await markingPaper(db, actor, s.paper_id);
  if (!paper) return null;
  if (paper.mayMark && !paper.published) s = (await read(true)) ?? s;
  return { s, paper };
}

export async function changeSheet(db: Sql, actor: Actor, sheetId: string, raw: unknown): Promise<ChangeResult> {
  const loaded = await loadForChange(db, actor, sheetId);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { s, paper } = loaded;
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (!['marked', 'approved'].includes(s.state)) return { ok: false, reason: 'state' };
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as SheetChangeInput;
  const questions = await questionsOf(db, actor.schoolId, paper.paperId);
  const byId = new Map(questions.map((q) => [q.questionId, q]));
  for (const c of Array.isArray(input.questions) ? input.questions : []) {
    const q = typeof c?.questionId === 'string' ? byId.get(c.questionId) : undefined;
    if (!q) return { ok: false, reason: 'marks' };
    if (c.marks !== undefined && c.marks !== null && (typeof c.marks !== 'number' || !Number.isFinite(c.marks) || c.marks < 0 || c.marks > q.maxMarks || Math.round(c.marks * 10) !== c.marks * 10)) return { ok: false, reason: 'marks', questionId: q.questionId };
    const note = words(c.note, 1000);
    if (note === 'bad') return { ok: false, reason: 'words', questionId: q.questionId };
    if (c.errorType !== undefined && c.errorType !== null && !(ERROR_TYPES as readonly string[]).includes(c.errorType)) return { ok: false, reason: 'marks', questionId: q.questionId };
    const sets: string[] = [];
    const params: unknown[] = [actor.schoolId, sheetId, q.questionId, paper.paperId];
    if (c.marks !== undefined) params.push(c.marks), sets.push(`marks = $${params.length}`);
    if (note !== undefined) params.push(note), sets.push(`note = $${params.length}`);
    if (c.errorType !== undefined) params.push(c.errorType), sets.push(`error_type = $${params.length}`);
    if (!sets.length) continue;
    // A question the AI gave nothing for still gets the teacher's mark.
    await db.query(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id) values ($1, $2, $4, $3) on conflict (school_id, sheet_id, question_id) do nothing`,
      params.slice(0, 4)
    );
    await db.query(`update marking_marks set ${sets.join(', ')} where school_id = $1 and sheet_id = $2 and question_id = $3 and paper_id = $4`, params);
  }
  const strengths = words(input.strengths, 1000);
  const improve = words(input.improve, 1000);
  if (strengths === 'bad' || improve === 'bad') return { ok: false, reason: 'words' };
  let practice: { unitId: string | null; text: string }[] | undefined;
  if (input.practice !== undefined) {
    if (!Array.isArray(input.practice) || input.practice.length > 8) return { ok: false, reason: 'words' };
    const units = new Set(paper.units.map((u) => u.unitId));
    practice = [];
    for (const p of input.practice) {
      const text = typeof p?.text === 'string' ? p.text.trim() : '';
      if (!text || text.length > 300) return { ok: false, reason: 'words' };
      practice.push({ unitId: typeof p.unitId === 'string' && units.has(p.unitId) ? p.unitId : null, text });
    }
  }
  // Whether the AI's flags still hold once the teacher has given every question a mark.
  const rows = (await db.query(`select question_id, attempted, ai_marks, marks from marking_marks where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows as MarkRow[];
  const final = finals(rows);
  const allMarked = questions.every((q) => final.get(q.questionId) !== null && final.get(q.questionId) !== undefined);
  let flags = ((s.flags ?? []) as SheetFlag[]).filter((f) => f !== 'not_all_read' || !allMarked);
  if (s.state === 'approved' && !flags.includes('changed')) flags = [...flags, 'changed'];
  await db.query(
    `update marking_sheets set flags = $3,
            strengths = case when $4::boolean then $5 else strengths end,
            improve = case when $6::boolean then $7 else improve end,
            practice = case when $8::boolean then $9::jsonb else practice end
      where school_id = $1 and sheet_id = $2`,
    [actor.schoolId, sheetId, flags, strengths !== undefined, strengths ?? null, improve !== undefined, improve ?? null, practice !== undefined, JSON.stringify(practice ?? [])]
  );
  return { ok: true };
}

// The teacher says whose script it is (or that it is no one's). One live script per child: another script already
// matched to that child is refused.
export async function chooseChild(db: Sql, actor: Actor, sheetId: string, studentId: unknown): Promise<ChangeResult | { ok: false; reason: 'taken' }> {
  const loaded = await loadForChange(db, actor, sheetId);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { s, paper } = loaded;
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (s.state === 'approved' || s.state === 'set_aside') return { ok: false, reason: 'state' };
  if (studentId !== null && (typeof studentId !== 'string' || !(await paperRoster(db, actor.schoolId, paper)).some((c) => c.studentId === studentId))) return { ok: false, reason: 'not_found' };
  if (studentId) {
    const other = (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and student_id = $3 and sheet_id <> $4 and state <> 'set_aside'`, [actor.schoolId, paper.paperId, studentId, sheetId])).rows[0];
    if (other) return { ok: false, reason: 'taken' };
  }
  // A person says whose it is: the flags about who it is go, the sheet reading another child (C230-AJ) among them.
  const flags = ((s.flags ?? []) as SheetFlag[]).filter((f) => f !== 'identity' && f !== 'two_scripts' && f !== 'check_child' && f !== 'mismatch');
  await db.query(`update marking_sheets set student_id = $3, matched_by = $4, flags = $5 where school_id = $1 and sheet_id = $2`, [
    actor.schoolId,
    sheetId,
    studentId,
    studentId ? 'teacher' : 'none',
    studentId ? flags : [...flags, 'identity'],
  ]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.child_chosen', targetType: 'marking_sheets', targetId: sheetId, afterState: { paper_id: paper.paperId, matched: studentId !== null } });
  return { ok: true };
}

// A script that is not one (a wrong file, a second copy) is set aside, never deleted: its pages stay with it.
export async function setAside(db: Sql, actor: Actor, sheetId: string, aside: boolean): Promise<ChangeResult> {
  const loaded = await loadForChange(db, actor, sheetId);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { s, paper } = loaded;
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (aside && s.state === 'approved') return { ok: false, reason: 'state' };
  if (!aside && s.state !== 'set_aside') return { ok: false, reason: 'state' };
  if (aside) {
    await db.query(`update marking_sheets set state = 'set_aside' where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId]);
  } else {
    // Back as it was: marked when it has marks, else failed (so "Mark again" is offered); a child already taken is let go.
    const hasMarks = (await db.query(`select 1 from marking_marks where school_id = $1 and sheet_id = $2 limit 1`, [actor.schoolId, sheetId])).rows.length > 0;
    await db.query(
      `update marking_sheets s set state = $3,
              student_id = case when exists (select 1 from marking_sheets o where o.school_id = s.school_id and o.paper_id = s.paper_id and o.student_id = s.student_id and o.sheet_id <> s.sheet_id and o.state <> 'set_aside') then null else s.student_id end,
              matched_by = case when exists (select 1 from marking_sheets o where o.school_id = s.school_id and o.paper_id = s.paper_id and o.student_id = s.student_id and o.sheet_id <> s.sheet_id and o.state <> 'set_aside') then 'none' else s.matched_by end
        where s.school_id = $1 and s.sheet_id = $2`,
      [actor.schoolId, sheetId, hasMarks ? 'marked' : 'failed']
    );
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: aside ? 'marking.set_aside' : 'marking.restored', targetType: 'marking_sheets', targetId: sheetId, afterState: { paper_id: paper.paperId } });
  return { ok: true };
}

// The teacher asks the AI to mark a script again: their own changes to it are cleared first, and it waits for the
// marking job (the caller queues it once this transaction commits). The AI's tries at one script are counted for good
// (MAX_MARKING_ATTEMPTS): once they are used, the script is marked by hand.
export async function askToMarkAgain(db: Sql, actor: Actor, sheetId: string): Promise<ChangeResult> {
  const loaded = await loadForChange(db, actor, sheetId);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { s, paper } = loaded;
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  // A script the AI left waiting or marking for a quarter of an hour (a run that stopped) may be asked again too.
  const stale = (await db.query(`select updated_at < now() - interval '15 minutes' as stale from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0]?.stale === true;
  if (!(['marked', 'failed'].includes(s.state) || (['waiting', 'marking'].includes(s.state) && stale))) return { ok: false, reason: 'state' };
  const tries = Number((await db.query(`select attempts from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0]?.attempts ?? 0);
  if (tries >= MAX_MARKING_ATTEMPTS) return { ok: false, reason: 'tries' };
  await db.query(`update marking_marks set marks = null, note = null where school_id = $1 and sheet_id = $2 and (marks is not null or note is not null)`, [actor.schoolId, sheetId]);
  await db.query(`update marking_sheets set state = 'waiting', failure = null where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.mark_again', targetType: 'marking_sheets', targetId: sheetId, afterState: { paper_id: paper.paperId } });
  return { ok: true };
}

// ---- a page that may not be an answer page (C230-AG) -----------------------------------------------------------------------

export type SettleResult = { ok: true; sheetId: string; markAgain: boolean } | { ok: false; reason: ChangeProblem };

// The teacher settles a page the AI's reading said may not be an answer page (an identity document, a form): 'keep'
// makes it an answer page of its script (the AI did not mark it: the teacher marks its answers, or asks the AI to
// mark the script again); 'take_out' takes it out of the script for good, and the next sweep deletes its picture
// (src/lib/marking/retention.ts); it is never shown again from now on. Once no such page is left, the script's flag goes
// and it may be approved (the database refuses it before then). Who settled which page goes to the audit log.
export async function settlePage(db: Sql, actor: Actor, pageId: string, action: unknown): Promise<SettleResult> {
  if (!isUuid(pageId) || (action !== 'keep' && action !== 'take_out')) return { ok: false, reason: 'not_found' };
  const page = (await db.query(`select sheet_id, state, reading from marking_pages where school_id = $1 and page_id = $2`, [actor.schoolId, pageId])).rows[0];
  if (!page?.sheet_id) return { ok: false, reason: 'not_found' };
  const loaded = await loadForChange(db, actor, page.sheet_id as string);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { s, paper } = loaded;
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (page.state !== 'not_answer' || s.state === 'set_aside') return { ok: false, reason: 'state' };
  const sheetId = s.sheet_id as string;
  const legible = (page.reading as { legible?: unknown } | null)?.legible !== false;
  const done =
    action === 'keep'
      ? await db.query(`update marking_pages set state = $3 where school_id = $1 and page_id = $2 and state = 'not_answer'`, [actor.schoolId, pageId, legible ? 'read' : 'unreadable'])
      : await db.query(`update marking_pages set state = 'removed', sheet_id = null, sheet_position = null, reading = null where school_id = $1 and page_id = $2 and state = 'not_answer'`, [actor.schoolId, pageId]);
  // Settled a moment ago by another press: nothing changed here, so nothing is recorded.
  if (!done.rowCount) return { ok: false, reason: 'state' };
  const left = Number((await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and sheet_id = $2 and state = 'not_answer'`, [actor.schoolId, sheetId])).rows[0]?.n ?? 0);
  if (left === 0) await db.query(`update marking_sheets set flags = array_remove(flags, 'not_answer_page') where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: action === 'keep' ? 'marking.page_kept' : 'marking.page_taken_out',
    targetType: 'marking_pages',
    targetId: pageId,
    afterState: { paper_id: paper.paperId, sheet_id: sheetId },
  });
  // A page kept after its script was marked was not marked with it.
  return { ok: true, sheetId, markAgain: action === 'keep' && (s.state === 'marked' || s.state === 'failed') };
}

// ---- approval ----------------------------------------------------------------------------------------------------------

export type ApproveProblem = 'not_allowed' | 'not_found' | 'closed' | 'not_ready' | 'flagged' | 'none' | SaveProblem;
export type ApproveResult = { ok: true; approved: number; skipped: number } | { ok: false; reason: ApproveProblem; sheetId?: string };

// Approves scripts: named ones (each may carry a flag the teacher has looked at), or 'unflagged' (every marked script
// of the paper with a child and no flag). Each approved script's parts go to the paper's marks in one saveMarks.
export async function approveSheets(db: Sql, actor: Actor, paperId: string, which: readonly string[] | 'unflagged'): Promise<ApproveResult> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const counts = await choiceCountsOf(db, actor.schoolId, paperId);
  if (structureProblems(paper.components, questions, counts).length) return { ok: false, reason: 'not_ready' };
  const rows = (
    await db.query(
      `select sheet_id, student_id, state, flags from marking_sheets where school_id = $1 and paper_id = $2 and state in ('marked', 'approved') for update`,
      [actor.schoolId, paperId]
    )
  ).rows;
  // A child withdrawn from the exam since their script was matched gets no marks from it.
  const candidates = new Set((await paperRoster(db, actor.schoolId, paper)).map((c) => c.studentId));
  let chosen: typeof rows;
  if (which === 'unflagged') {
    chosen = rows.filter((r) => r.state === 'marked' && r.student_id && candidates.has(r.student_id) && ((r.flags ?? []) as string[]).length === 0);
  } else {
    if (!Array.isArray(which) || which.length === 0 || which.length > 500) return { ok: false, reason: 'none' };
    chosen = [];
    for (const id of which) {
      const r = rows.find((x) => x.sheet_id === id);
      if (!r) return { ok: false, reason: 'not_found', sheetId: id };
      if (r.state === 'approved' && !((r.flags ?? []) as string[]).includes('changed')) continue;
      // Who it is must be settled, and every question must have a mark, before a script is approved.
      if (!r.student_id || ((r.flags ?? []) as string[]).some((f) => f === 'identity' || f === 'two_scripts' || f === 'not_all_read' || f === 'not_answer_page' || f === 'mismatch')) return { ok: false, reason: 'flagged', sheetId: id };
      if (!candidates.has(r.student_id)) return { ok: false, reason: 'child', sheetId: id };
      chosen.push(r);
    }
  }
  if (!chosen.length) return { ok: true, approved: 0, skipped: rows.length };
  const parts = markedParts(paper.components, questions);
  const marks = (
    await db.query(`select sheet_id, question_id, attempted, ai_marks, marks from marking_marks where school_id = $1 and sheet_id = any ($2::uuid[])`, [actor.schoolId, chosen.map((r) => r.sheet_id)])
  ).rows;
  const entries: { studentId: string; component: string; kind: 'score'; score: number }[] = [];
  const ready: typeof rows = [];
  for (const r of chosen) {
    const final = finals(marks.filter((m) => m.sheet_id === r.sheet_id) as MarkRow[]);
    // A question with no mark (one added after marking): a named script is refused, the rest are left for a person.
    if (questions.some((q) => final.get(q.questionId) === null || final.get(q.questionId) === undefined)) {
      if (which === 'unflagged') continue;
      return { ok: false, reason: 'flagged', sheetId: r.sheet_id };
    }
    ready.push(r);
    for (const t of partTotals(parts, questions, final, counts)) entries.push({ studentId: r.student_id, component: t.component, kind: 'score', score: t.score });
  }
  chosen = ready;
  if (!chosen.length) return { ok: true, approved: 0, skipped: rows.length };
  const saved = await saveMarks(db, actor, paperId, entries);
  if (!saved.ok) return { ok: false, reason: saved.reason };
  // Approved: the flags a person has now looked at go, and the other children the match offered are dropped (a family
  // reads its own child's approved script; it never needs a classmate's id).
  await db.query(
    `update marking_sheets set state = 'approved', approved_at = now(), flags = array_remove(array_remove(flags, 'changed'), 'check_child'),
            match_note = jsonb_build_object('read', match_note -> 'read')
      where school_id = $1 and sheet_id = any ($2::uuid[])`,
    [actor.schoolId, chosen.map((r) => r.sheet_id)]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'marking.approved',
    targetType: 'exam_papers',
    targetId: paperId,
    afterState: { scripts: chosen.length, all_unflagged: which === 'unflagged' },
  });
  return { ok: true, approved: chosen.length, skipped: rows.length - chosen.length };
}

// Candidates with no script, marked absent for every part the script marks (saveMarks: absent is not zero).
export async function markAbsent(db: Sql, actor: Actor, paperId: string, studentIds: unknown): Promise<ApproveResult> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > 500 || !studentIds.every((id) => typeof id === 'string')) return { ok: false, reason: 'none' };
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const parts = markedParts(paper.components, questions);
  if (!parts.length) return { ok: false, reason: 'not_ready' };
  const live = new Set((await db.query(`select student_id from marking_sheets where school_id = $1 and paper_id = $2 and student_id is not null and state <> 'set_aside'`, [actor.schoolId, paperId])).rows.map((r) => r.student_id as string));
  const roster = new Set((await paperRoster(db, actor.schoolId, paper)).map((c) => c.studentId));
  for (const id of studentIds as string[]) if (!roster.has(id) || live.has(id)) return { ok: false, reason: 'child' };
  // A mark already typed for a part is kept: absent goes only where there is none.
  const typed = new Set(
    (await db.query(`select student_id, component from marks where school_id = $1 and paper_id = $2 and student_id = any ($3::uuid[])`, [actor.schoolId, paperId, studentIds])).rows.map((r) => `${r.student_id}|${r.component}`)
  );
  const entries = (studentIds as string[]).flatMap((studentId) => parts.filter((p) => !typed.has(`${studentId}|${p.key}`)).map((p) => ({ studentId, component: p.key, kind: 'absent', score: null })));
  if (!entries.length) return { ok: true, approved: 0, skipped: studentIds.length };
  const saved = await saveMarks(db, actor, paperId, entries);
  if (!saved.ok) return { ok: false, reason: saved.reason };
  return { ok: true, approved: studentIds.length, skipped: 0 };
}

export const isSheetState = (v: unknown): v is SheetState => typeof v === 'string' && ['waiting', 'marking', 'marked', 'failed', 'approved', 'set_aside'].includes(v);
