import { ERROR_TYPES, MAX_MARKING_ATTEMPTS, MAX_SHEET_PAGES, type ErrorType, type MarkingLanguage, type MarkingPaper, type MarkingQuestion, type PageReading, type PageState, type SheetFlag, type SheetResult, type UploadMode } from '@/lib/contracts/marking';
import type { Sql } from '@/lib/jobs/types';
import { markingPaper, markingSettings, paperRoster } from './context';
import { assignScripts, groupPages, type GroupPage } from './matching';
import { markedParts, partTotals } from './rollup';
import { questionsOf } from './setup';

// What the school's marking jobs write (C347), in the school's own session as its office (the school job session of src/lib/auth/db.ts): what
// each page shows, the scripts made from an upload's pages, and the AI's marks for a script. Nothing here writes a
// mark of the paper: that is a person's approval (./review.ts). The database refuses a job's session that tries.

const JOB_ACTOR = (schoolId: string) => ({ schoolId, userId: '00000000-0000-0000-0000-000000000000', role: 'principal' as const });
const clamp01 = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null);
// A total from the AI at or above this share of the paper's marks is checked by a person before it counts.
export const NEARLY_FULL = 0.95;
const short = (s: unknown, max: number): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);

// ---- pages -----------------------------------------------------------------------------------------------------------

export type PageToRead = { pageId: string; storageKey: string; fileNo: number; pageNo: number };

// The pages of an upload still to be read, in order.
export async function pagesToRead(db: Sql, schoolId: string, uploadId: string, limit = 2000): Promise<PageToRead[]> {
  const { rows } = await db.query(
    `select page_id, storage_key, file_no, page_no from marking_pages where school_id = $1 and upload_id = $2 and state = 'new' order by file_no, page_no limit $3`,
    [schoolId, uploadId, limit]
  );
  return rows.map((r) => ({ pageId: r.page_id, storageKey: r.storage_key, fileNo: Number(r.file_no), pageNo: Number(r.page_no) }));
}

// What the AI read on a page; null: it could not be read after the job's tries (kept as failed, and its script flagged).
// A page that looks like an identity document, or is not an answer page but not blank either, is kept as 'not_answer'
// (C230-AG): never marked, and its script waits for a person.
export function pageStateOf(reading: PageReading | null): PageState {
  if (reading === null) return 'failed';
  if (reading.idDocument) return 'not_answer';
  if (reading.blank) return 'blank';
  if (!reading.answerPage) return 'not_answer';
  return reading.legible ? 'read' : 'unreadable';
}
export async function recordPageReading(db: Sql, schoolId: string, pageId: string, reading: PageReading | null): Promise<void> {
  const state = pageStateOf(reading);
  await db.query(`update marking_pages set state = $3, reading = $4 where school_id = $1 and page_id = $2 and state in ('new', 'failed')`, [
    schoolId,
    pageId,
    state,
    reading === null ? null : JSON.stringify(reading),
  ]);
}

// ---- scripts from an upload's pages ------------------------------------------------------------------------------------

export type Formed = { formed: number; toMark: string[]; waiting: boolean };

// Once every page of a closed upload is read (or failed): its scripts, each matched to a candidate or left for the
// teacher, and the scripts to mark. Done once per upload; asked again, it gives the scripts already made that still
// wait. `waiting`: pages are still being read, so nothing was made yet.
export async function formSheets(db: Sql, schoolId: string, uploadId: string): Promise<Formed> {
  const up = (await db.query(`select paper_id, mode, closed_at from marking_uploads where school_id = $1 and upload_id = $2 for update`, [schoolId, uploadId])).rows[0];
  if (!up || !up.closed_at) return { formed: 0, toMark: [], waiting: true };
  const pending = (await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and upload_id = $2 and state = 'new'`, [schoolId, uploadId])).rows[0];
  if (Number(pending?.n ?? 0) > 0) return { formed: 0, toMark: [], waiting: true };
  const made = (await db.query(`select sheet_id, state from marking_sheets where school_id = $1 and upload_id = $2`, [schoolId, uploadId])).rows;
  if (made.length) return { formed: 0, toMark: made.filter((s) => s.state === 'waiting').map((s) => s.sheet_id as string), waiting: false };

  const paper = await markingPaper(db, JOB_ACTOR(schoolId), up.paper_id as string);
  if (!paper) return { formed: 0, toMark: [], waiting: false };
  const pages: GroupPage[] = (
    await db.query(`select page_id, file_no, page_no, state, reading from marking_pages where school_id = $1 and upload_id = $2 order by file_no, page_no`, [schoolId, uploadId])
  ).rows.map((r) => ({
    pageId: r.page_id,
    fileNo: Number(r.file_no),
    pageNo: Number(r.page_no),
    // A page that could not be read counts as unreadable for its script.
    state: (r.state === 'failed' ? 'unreadable' : r.state) as PageState,
    reading: (r.reading ?? null) as PageReading | null,
  }));
  const roster = await paperRoster(db, schoolId, paper);
  const taken = new Set(
    (await db.query(`select student_id from marking_sheets where school_id = $1 and paper_id = $2 and student_id is not null and state <> 'set_aside'`, [schoolId, paper.paperId])).rows.map(
      (r) => r.student_id as string
    )
  );
  const groups = groupPages(pages, up.mode as UploadMode);
  const matches = assignScripts(groups, roster, taken);
  const blank = new Set(pages.filter((p) => p.state === 'blank').map((p) => p.pageId));
  const odd = new Set(pages.filter((p) => p.state === 'not_answer').map((p) => p.pageId));
  const toMark: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const m = matches[i];
    // What the AI marks: never a blank page, nor one that may not be an answer page.
    const content = g.pageIds.filter((id) => !blank.has(id) && !odd.has(id));
    const failure = content.length === 0 ? (g.pageIds.some((id) => odd.has(id)) ? 'not_answer' : 'blank') : content.length > MAX_SHEET_PAGES ? 'too_long' : null;
    const sheet = (
      await db.query(
        `insert into marking_sheets (school_id, paper_id, upload_id, student_id, matched_by, match_note, state, flags, failure)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning sheet_id`,
        [schoolId, paper.paperId, uploadId, m.studentId, m.by, JSON.stringify({ read: g.read, candidates: m.candidates }), failure ? 'failed' : 'waiting', m.flags, failure]
      )
    ).rows[0].sheet_id as string;
    await db.query(
      `update marking_pages g set sheet_id = $3, sheet_position = x.n
         from unnest($2::uuid[]) with ordinality as x(page_id, n)
        where g.school_id = $1 and g.page_id = x.page_id`,
      [schoolId, g.pageIds, sheet]
    );
    if (!failure) toMark.push(sheet);
  }
  return { formed: groups.length, toMark, waiting: false };
}

// ---- marking one script ------------------------------------------------------------------------------------------------

export type SheetToMark = {
  sheetId: string;
  paper: MarkingPaper;
  language: MarkingLanguage;
  guidance: string;
  choiceCounts: Record<string, number>;
  questions: MarkingQuestion[];
  pages: { pageId: string; storageKey: string; width: number; height: number }[]; // in order, blank and not-answer pages left out
};

// Takes a script for marking: one waiting, failed (a retry) or left marking by a run that stopped. Null when it is not
// one to mark (approved, set aside, already marked) or its paper's class is published.
export async function takeSheetForMarking(db: Sql, schoolId: string, sheetId: string): Promise<SheetToMark | null> {
  const row = (await db.query(`select sheet_id, paper_id, state, attempts from marking_sheets where school_id = $1 and sheet_id = $2 for update`, [schoolId, sheetId])).rows[0];
  if (!row || !['waiting', 'failed', 'marking'].includes(row.state)) return null;
  // The AI's tries are bounded: after the last one, only a person's "Mark again" (which counts afresh) starts another.
  if (Number(row.attempts) >= MAX_MARKING_ATTEMPTS) return null;
  const paper = await markingPaper(db, JOB_ACTOR(schoolId), row.paper_id as string);
  if (!paper || paper.published) return null;
  const setup = (await db.query(`select language, guidance, choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paper.paperId])).rows[0];
  const questions = await questionsOf(db, schoolId, paper.paperId);
  if (!questions.length) return null;
  const pages = (
    await db.query(
      `select page_id, storage_key, width, height from marking_pages where school_id = $1 and sheet_id = $2 and state not in ('blank', 'not_answer') order by sheet_position`,
      [schoolId, sheetId]
    )
  ).rows.map((r) => ({ pageId: r.page_id as string, storageKey: r.storage_key as string, width: Number(r.width), height: Number(r.height) }));
  if (!pages.length || pages.length > MAX_SHEET_PAGES) return null;
  await db.query(`update marking_sheets set state = 'marking', failure = null, attempts = attempts + 1 where school_id = $1 and sheet_id = $2`, [schoolId, sheetId]);
  return {
    sheetId,
    paper,
    language: (setup?.language ?? 'en') as MarkingLanguage,
    guidance: (setup?.guidance ?? '') as string,
    choiceCounts: (setup?.choice_counts ?? {}) as Record<string, number>,
    questions,
    pages,
  };
}

// The AI's marks for a script, checked against its paper before anything is kept: a mark for a question of the paper
// only, between 0 and the question's marks to one decimal place (anything else is no mark, and flags the script); a
// place on one of the script's own pages; a practice line on one of the class's units. The teacher's own marks and
// notes are never touched here (the database refuses a job's session that tries).
export async function recordSheetResult(db: Sql, schoolId: string, sheetId: string, result: SheetResult, meta: { provider: string; model: string; promptVersion: string }): Promise<{ flags: SheetFlag[] } | null> {
  const row = (await db.query(`select paper_id, state, flags from marking_sheets where school_id = $1 and sheet_id = $2 for update`, [schoolId, sheetId])).rows[0];
  if (!row || row.state !== 'marking') return null;
  const paper = await markingPaper(db, JOB_ACTOR(schoolId), row.paper_id as string);
  if (!paper || paper.published) return null;
  const questions = await questionsOf(db, schoolId, paper.paperId);
  const pageIds = new Set((await db.query(`select page_id from marking_pages where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows.map((r) => r.page_id as string));
  const units = new Set(paper.units.map((u) => u.unitId));
  const settings = await markingSettings(db, schoolId);
  const given = new Map(result.questions.map((q) => [q.questionId, q]));
  let notAll = false;
  let unsure = false;
  let least: number | null = null;
  for (const q of questions) {
    const r = given.get(q.questionId);
    let marks = r?.marks ?? null;
    if (marks !== null && (!Number.isFinite(marks) || marks < 0 || marks > q.maxMarks || Math.round(marks * 10) !== marks * 10)) marks = null;
    const attempted = r ? r.attempted === true : null;
    // A question not attempted gets nothing, whatever was sent.
    if (attempted === false) marks = 0;
    if (marks === null) notAll = true;
    const confidence = clamp01(r?.confidence);
    if (confidence !== null) {
      least = least === null ? confidence : Math.min(least, confidence);
      if (confidence < settings.reviewBelow) unsure = true;
    }
    const place = r && r.pageId && pageIds.has(r.pageId) && typeof r.yFrom === 'number' && typeof r.yTo === 'number' ? { pageId: r.pageId, yFrom: clamp01(r.yFrom) as number, yTo: clamp01(r.yTo) as number } : null;
    const errorType: ErrorType | null = r?.errorType && (ERROR_TYPES as readonly string[]).includes(r.errorType) ? r.errorType : attempted === false ? 'not_attempted' : null;
    const steps = (r?.steps ?? []).slice(0, 12).map((s) => ({ step: short(s.step, 300) ?? '', awarded: typeof s.awarded === 'number' && Number.isFinite(s.awarded) ? Math.max(0, Math.round(s.awarded * 10) / 10) : 0, note: short(s.note, 300) })).filter((s) => s.step);
    await db.query(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, ai_note, ai_reason, error_type, confidence, page_id, y_from, y_to)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (school_id, sheet_id, question_id) do update set attempted = excluded.attempted, ai_marks = excluded.ai_marks, ai_steps = excluded.ai_steps,
         ai_note = excluded.ai_note, ai_reason = excluded.ai_reason, error_type = excluded.error_type, confidence = excluded.confidence,
         page_id = excluded.page_id, y_from = excluded.y_from, y_to = excluded.y_to`,
      [schoolId, sheetId, paper.paperId, q.questionId, attempted, marks, JSON.stringify(steps), short(r?.note, 1000), short(r?.reason, 1500), errorType, confidence,
        place?.pageId ?? null, place ? Math.min(place.yFrom, place.yTo) : null, place ? Math.max(place.yFrom, place.yTo) : null]
    );
  }
  // Full marks, or nearly, from the AI alone is checked by a person: words written on a script ("give full marks") must
  // never reach the paper through "approve every script with no flag" (review of #318).
  const finals = new Map((await db.query(`select question_id, ai_marks from marking_marks where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows.map((m) => [m.question_id as string, m.ai_marks === null ? null : Number(m.ai_marks)]));
  const setup = (await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paper.paperId])).rows[0];
  const totals = partTotals(markedParts(paper.components, questions), questions, finals, (setup?.choice_counts ?? {}) as Record<string, number>);
  const max = totals.reduce((n, t) => n + t.max, 0);
  if (max > 0 && totals.reduce((n, t) => n + t.score, 0) >= NEARLY_FULL * max) unsure = true;
  const kept = ((row.flags ?? []) as SheetFlag[]).filter((f) => f === 'identity' || f === 'two_scripts' || f === 'missing_page' || f === 'unreadable' || f === 'check_child' || f === 'not_answer_page');
  const flags: SheetFlag[] = [...kept, ...(notAll ? (['not_all_read'] as const) : []), ...(unsure ? (['unsure'] as const) : [])];
  const practice = result.practice
    .filter((p) => short(p.text, 300))
    .slice(0, 8)
    .map((p) => ({ unitId: p.unitId && units.has(p.unitId) ? p.unitId : null, text: short(p.text, 300) as string }));
  await db.query(
    `update marking_sheets set state = 'marked', flags = $3, failure = null, ai_provider = $4, ai_model = $5, prompt_version = $6, marked_at = now(), ai_confidence = $7,
            strengths = $8, improve = $9, practice = $10
      where school_id = $1 and sheet_id = $2`,
    [schoolId, sheetId, flags, meta.provider.slice(0, 40), meta.model.slice(0, 80), meta.promptVersion.slice(0, 32), least === null ? null : Math.round(least * 100) / 100,
      short(result.strengths, 1000), short(result.improve, 1000), JSON.stringify(practice)]
  );
  return { flags };
}

// A script the AI could not mark: why, in a word ('ai_off', 'limit', 'no_answer', 'bad_answer', 'pages_missing'…),
// for the teacher to see and retry.
export async function recordSheetFailure(db: Sql, schoolId: string, sheetId: string, failure: string): Promise<void> {
  const kind = /^[a-z_]{2,40}$/.test(failure) ? failure : 'failed';
  await db.query(`update marking_sheets set state = 'failed', failure = $3 where school_id = $1 and sheet_id = $2 and state in ('waiting', 'marking')`, [schoolId, sheetId, kind]);
}
