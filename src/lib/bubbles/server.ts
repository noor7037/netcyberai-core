import { writeAuditLog } from '@/lib/audit/log';
import type { BubblePageResult, BubblePrint, BubbleQuestionView, BubbleScreen, BubbleSheetDetail, BubbleWaiting, MarkingQuestion, OptionKey, PaperSitting, RosterChild, SheetFlag } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import type { FileStorage } from '@/lib/storage/file-storage';
import { cleanWrongMarks } from '@/lib/marking/answers';
import { markingPaper, paperRoster, type Actor } from '@/lib/marking/context';
import { rollKey } from '@/lib/marking/matching';
import { pageUrl } from '@/lib/marking/review';
import { structureProblems } from '@/lib/marking/rollup';
import { questionsOf } from '@/lib/marking/setup';
import { addPages, type CheckedPage } from '@/lib/marking/upload';
import { applyRead, paperSitting, readingOf, refreshFlags, ruleMarks, wrongMarksOf } from './apply';
import { MAX_SHEET_QUESTIONS, PAGE_H, PAGE_W, layoutOfQuestions, onBubbleSheet, sheetQuestionsOf, type SheetLayout } from './layout';
import { cleanReading } from './reading';

// Bubble sheets on the server (docs/36 §1.2, C364): how the paper is sat, the wrong marks, printing the sheets (the
// database numbers them in roll order), the pages a teacher's browser read, and what the review screen shows of a read
// sheet. Everything runs in the person's own tenant transaction, so the row rules of the migration ending
// _aq_3_bubbles.sql (and every marking table's) hold here too: a teacher reaches only the papers they may mark, and
// nothing while the class is published. No model is called anywhere here, and no AI page is counted.

export type BubbleProblem =
  | 'not_found'
  | 'not_allowed'
  | 'closed'
  | 'not_sent_properly'
  | 'not_bubble' // the paper is not sat with a bubble sheet
  | 'sitting_fixed' // a script exists, or sheets are printed: how the paper is sat stays
  | 'no_choice' // no choice question with options to put on a sheet
  | 'sheet_full' // more choice questions than a sheet holds
  | 'questions' // the questions do not make up the paper yet
  | 'layout' // the sheet was read against other questions than today's: open the screen again
  | 'old_sheet' // the sheet was printed for other questions: print the child's sheet again
  | 'reading' // the reading sent is not one
  | 'upload_closed'
  | 'sheet_taken' // the child already has a bubble sheet read
  | 'state'
  | 'storage' // the file store did not answer: try again
  | 'too_many_pages'; // more pages than one upload takes
type Fail = { ok: false; reason: BubbleProblem; at?: number; field?: string };

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

async function choiceCounts(db: Sql, schoolId: string, paperId: string): Promise<Record<string, number>> {
  return ((await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [schoolId, paperId])).rows[0]?.choice_counts ?? {}) as Record<string, number>;
}

// What is on the sheet and whether it can be printed and read now.
async function sheetState(db: Sql, actor: Actor, paperId: string) {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const sitting = (await paperSitting(db, actor.schoolId, paperId)) ?? 'written';
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const onSheet = sheetQuestionsOf(questions);
  const layout = onSheet.length && onSheet.length <= MAX_SHEET_QUESTIONS ? layoutOfQuestions(questions) : null;
  const problem: BubbleScreen['problem'] = !onSheet.length
    ? 'no_choice'
    : onSheet.length > MAX_SHEET_QUESTIONS
      ? 'sheet_full'
      : structureProblems(paper.components, questions, await choiceCounts(db, actor.schoolId, paperId)).length
        ? 'questions'
        : null;
  return { paper, sitting, questions, onSheet, layout, problem, onlyChoice: questions.length > 0 && questions.every(onBubbleSheet) };
}

// ---- the paper's bubble screen -------------------------------------------------------------------------------------------

export async function bubbleScreen(db: Sql, actor: Actor, paperId: string): Promise<BubbleScreen | null> {
  const st = await sheetState(db, actor, paperId);
  if (!st) return null;
  const roster = await paperRoster(db, actor.schoolId, st.paper);
  const sheets = (
    await db.query(`select sheet_no, student_id, replaced_at, printed_at from bubble_sheets where school_id = $1 and paper_id = $2 order by sheet_no`, [actor.schoolId, paperId])
  ).rows;
  const live = sheets.filter((s) => s.replaced_at === null);
  const reads = (
    await db.query(
      `select r.read_id, r.page_id, r.sheet_no, r.roll_no, r.student_id, r.unclear, r.multiple, r.read_at, g.picture_gone_at
         from bubble_reads r join marking_pages g on g.school_id = r.school_id and g.page_id = r.page_id
        where r.school_id = $1 and r.paper_id = $2 and r.state = 'live' order by r.read_at, r.read_id`,
      [actor.schoolId, paperId]
    )
  ).rows;
  const withRead = new Set(reads.filter((r) => r.student_id).map((r) => r.student_id as string));
  const byNo = new Map(live.map((s) => [Number(s.sheet_no), s.student_id as string | null]));
  // On a paper of only choice questions a sheet of no child is a script of no one, settled on its review screen; on a
  // mixed paper it waits here.
  const waiting: BubbleWaiting[] = st.onlyChoice
    ? []
    : reads
        .filter((r) => !r.student_id)
        .map((r) => {
          const offered = offeredFor(r.sheet_no === null ? null : Number(r.sheet_no), r.roll_no, byNo, roster);
          return {
            readId: r.read_id,
            pageId: r.page_id,
            url: r.picture_gone_at === null ? pageUrl(r.page_id) : null,
            sheetNo: r.sheet_no === null ? null : Number(r.sheet_no),
            rollNo: r.roll_no ?? null,
            offered,
            why: offered.some((id) => withRead.has(id)) ? 'two_scripts' : 'identity',
            readAt: iso(r.read_at) as string,
          };
        });
  return {
    paperId,
    sitting: st.sitting,
    mayChange: st.paper.mayMark && !st.paper.published,
    questions: st.onSheet.map((q) => ({ label: q.label, options: q.options.length })),
    layoutKey: st.layout?.key ?? null,
    onlyChoice: st.onlyChoice,
    problem: st.problem,
    wrongMarks: await wrongMarksOf(db, actor.schoolId, paperId),
    printed: {
      candidates: live.filter((s) => s.student_id).length,
      blanks: live.filter((s) => !s.student_id).length,
      replaced: sheets.length - live.length,
      lastAt: iso(sheets.reduce<unknown>((a, s) => (a === null || s.printed_at > (a as Date) ? s.printed_at : a), null)),
    },
    sheets: live.map((s) => ({ sheetNo: Number(s.sheet_no), studentId: s.student_id ?? null })),
    reads: {
      total: reads.length,
      matched: reads.filter((r) => r.student_id).length,
      flagged: reads.filter((r) => (r.unclear ?? []).length || (r.multiple ?? []).length).length,
    },
    waiting,
    candidates: roster,
  };
}

// The children a sheet that names no one may be: the child its printed number was for, and a child with the roll
// number shaded.
function offeredFor(sheetNo: number | null, roll: string | null, byNo: ReadonlyMap<number, string | null>, roster: readonly RosterChild[]): string[] {
  const out = new Set<string>();
  const printed = sheetNo === null ? null : byNo.get(sheetNo) ?? null;
  if (printed && roster.some((c) => c.studentId === printed)) out.add(printed);
  const key = rollKey(roll);
  if (key) for (const c of roster) if (rollKey(c.rollNo) === key) out.add(c.studentId);
  return [...out].slice(0, 3);
}

// ---- how the paper is sat, and the wrong marks ------------------------------------------------------------------------------

async function mayChangePaper(db: Sql, actor: Actor, paperId: string): Promise<{ ok: true } | Fail> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  return { ok: true };
}

// Written (an answer book) or bubble (a bubble sheet for the choice questions, the book for the rest). Online is the
// online test's to set. Fixed once a script exists (aq_1_shared) or a bubble sheet is printed (aq_3_bubbles).
export async function setSitting(db: Sql, actor: Actor, paperId: string, sitting: unknown): Promise<{ ok: true } | Fail> {
  if (sitting !== 'written' && sitting !== 'bubble') return { ok: false, reason: 'not_sent_properly' };
  const may = await mayChangePaper(db, actor, paperId);
  if (!may.ok) return may;
  const was = await paperSitting(db, actor.schoolId, paperId);
  if (was === sitting) return { ok: true };
  if (was === 'online') return { ok: false, reason: 'sitting_fixed' };
  await db.query('savepoint bubble_sitting');
  try {
    await db.query(`update exam_papers set sitting = $3 where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId, sitting as PaperSitting]);
    await db.query('release savepoint bubble_sitting');
  } catch (err) {
    await db.query('rollback to savepoint bubble_sitting');
    if ((err as { code?: string }).code === '23514') return { ok: false, reason: 'sitting_fixed' };
    throw err;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.sitting_set', targetType: 'exam_papers', targetId: paperId, beforeState: { sitting: was }, afterState: { sitting } });
  return { ok: true };
}

// The marks taken off for a wrong choice answer (0 to 10, one decimal), then every read sheet of the paper marked again
// by them (an approved script that changes waits to be approved again).
export async function setWrongMarks(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<{ ok: true; remarked: number } | Fail> {
  const wrongMarks = cleanWrongMarks(raw);
  if (wrongMarks === null || raw === null) return { ok: false, reason: 'not_sent_properly' };
  const may = await mayChangePaper(db, actor, paperId);
  if (!may.ok) return may;
  const before = await wrongMarksOf(db, actor.schoolId, paperId);
  await db.query(
    `insert into marking_setups (school_id, paper_id, wrong_marks, updated_by) values ($1, $2, $3, $4)
     on conflict (school_id, paper_id) do update set wrong_marks = excluded.wrong_marks, updated_by = excluded.updated_by, updated_at = now()`,
    [actor.schoolId, paperId, wrongMarks, actor.userId]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.wrong_marks_set', targetType: 'exam_papers', targetId: paperId, beforeState: { wrong_marks: before }, afterState: { wrong_marks: wrongMarks } });
  return { ok: true, remarked: before === wrongMarks ? 0 : await markReadsAgain(db, actor, paperId) };
}

// Every live read of the paper put on its script again by today's key and wrong marks: on a paper of only choice
// questions its own script; on a mixed paper its child's answer-book script, once there is one. Approved scripts that
// change wait to be approved again ('changed'). Answers how many scripts were marked.
export async function markReadsAgain(db: Sql, actor: Actor, paperId: string): Promise<number> {
  const may = await mayChangePaper(db, actor, paperId);
  if (!may.ok) return 0;
  const reads = (await db.query(`select read_id, student_id, sheet_id from bubble_reads where school_id = $1 and paper_id = $2 and state = 'live'`, [actor.schoolId, paperId])).rows;
  let n = 0;
  for (const r of reads) {
    const sheetId = (r.sheet_id as string | null) ?? (r.student_id ? await liveScriptOf(db, actor.schoolId, paperId, r.student_id as string) : null);
    if (!sheetId) continue;
    const state = (await db.query(`select state from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0]?.state;
    if (!state || state === 'set_aside') continue;
    const done = await applyRead(db, actor.schoolId, paperId, r.read_id as string, sheetId);
    await refreshFlags(db, actor.schoolId, sheetId, { changed: done.changed });
    n++;
  }
  return n;
}

async function liveScriptOf(db: Sql, schoolId: string, paperId: string, studentId: string): Promise<string | null> {
  return (
    (await db.query(`select sheet_id from marking_sheets where school_id = $1 and paper_id = $2 and student_id = $3 and state <> 'set_aside' and source = 'scan'`, [schoolId, paperId, studentId])).rows[0]
      ?.sheet_id ?? null
  );
}

// ---- printing ----------------------------------------------------------------------------------------------------------------

// The sheets to print: the database numbers every candidate without a sheet for today's questions, in roll order, and
// `blanks` blank sheets. Printing again prints the same numbers (and new blank ones).
export async function printSheets(db: Sql, actor: Actor, paperId: string, rawBlanks: unknown): Promise<{ ok: true; print: BubblePrint } | Fail> {
  const blanks = rawBlanks === undefined || rawBlanks === null ? 0 : rawBlanks;
  if (typeof blanks !== 'number' || !Number.isInteger(blanks) || blanks < 0 || blanks > 200) return { ok: false, reason: 'not_sent_properly' };
  const st = await sheetState(db, actor, paperId);
  if (!st) return { ok: false, reason: 'not_found' };
  if (st.paper.published) return { ok: false, reason: 'closed' };
  if (!st.paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (st.sitting !== 'bubble') return { ok: false, reason: 'not_bubble' };
  if (st.problem || !st.layout) return { ok: false, reason: st.problem ?? 'no_choice' };
  const issued = (await db.query(`select sheet_no, student_id from public.issue_bubble_sheets($1, $2, $3)`, [paperId, st.layout.key, blanks])).rows;
  const roster = new Map((await paperRoster(db, actor.schoolId, st.paper)).map((c) => [c.studentId, c]));
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0]?.name ?? '';
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'marking.bubble_printed',
    targetType: 'exam_papers',
    targetId: paperId,
    afterState: { sheets: issued.length, blanks, layout: st.layout.key },
  });
  return {
    ok: true,
    print: {
      school,
      examName: st.paper.examName,
      className: st.paper.className,
      subjectName: st.paper.subjectName,
      date: st.paper.date,
      layoutKey: st.layout.key,
      questions: st.onSheet.map((q) => ({ label: q.label, options: q.options.length })),
      sheets: issued.map((s) => {
        const c = s.student_id ? roster.get(s.student_id as string) : null;
        return { sheetNo: Number(s.sheet_no), child: c ? { name: c.name, rollNo: c.rollNo, seatNo: c.seatNo } : null };
      }),
    },
  };
}

// ---- pages a teacher's browser read -----------------------------------------------------------------------------------

export type BubblePage = CheckedPage & { reading: Record<string, unknown> };

// A bubble upload's pages with what was read on each: every reading checked against the paper's sheet before anything is
// kept, then the pictures kept as every page is (./upload.ts: a JPEG checked, the school's folder, the paper's days),
// then each new page's read recorded and its child resolved: the printed sheet number's child, else the roll number
// shaded on a blank sheet (to check), else no one. A page sent again answers as it did; a picture already on the paper
// is a duplicate and is not read twice.
export async function addBubblePages(db: Sql, actor: Actor, storage: Pick<FileStorage, 'put' | 'remove'>, uploadId: string, pages: readonly BubblePage[]): Promise<{ ok: true; pages: BubblePageResult[] } | Fail> {
  if (!isUuid(uploadId)) return { ok: false, reason: 'not_found' };
  const up = (await db.query(`select paper_id, kind, closed_at from marking_uploads where school_id = $1 and upload_id = $2`, [actor.schoolId, uploadId])).rows[0];
  if (!up || up.kind !== 'bubble') return { ok: false, reason: 'not_found' };
  const st = await sheetState(db, actor, up.paper_id as string);
  if (!st) return { ok: false, reason: 'not_found' };
  if (st.paper.published) return { ok: false, reason: 'closed' };
  if (!st.paper.mayMark) return { ok: false, reason: 'not_allowed' };
  if (up.closed_at) return { ok: false, reason: 'upload_closed' };
  if (st.sitting !== 'bubble') return { ok: false, reason: 'not_bubble' };
  if (!st.layout) return { ok: false, reason: st.problem ?? 'no_choice' };
  const layout = st.layout;
  const printed = new Map(
    (await db.query(`select sheet_no, student_id, layout, replaced_at from bubble_sheets where school_id = $1 and paper_id = $2`, [actor.schoolId, st.paper.paperId])).rows.map((s) => [Number(s.sheet_no), s])
  );
  const readings = [];
  for (let at = 0; at < pages.length; at++) {
    const r = cleanReading(pages[at].reading, layout);
    if (!r.ok) return { ok: false, reason: r.field === 'layout' ? 'layout' : 'reading', at, field: r.field };
    // A sheet printed for other questions is never read against these.
    const sheet = r.reading.sheetNo === null ? null : printed.get(r.reading.sheetNo);
    if (sheet && (sheet.replaced_at !== null || sheet.layout !== layout.key)) return { ok: false, reason: 'old_sheet', at };
    readings.push(r.reading);
  }
  const kept = await addPages(db, actor, storage, uploadId, pages, { bubble: true });
  if (!kept.ok) {
    const map: Partial<Record<typeof kept.reason, BubbleProblem>> = { upload_closed: 'upload_closed', closed: 'closed', not_allowed: 'not_allowed', storage: 'storage', too_many: 'too_many_pages' };
    return { ok: false, reason: map[kept.reason] ?? 'not_found' };
  }
  const roster = await paperRoster(db, actor.schoolId, st.paper);
  const byId = new Map(roster.map((c) => [c.studentId, c]));
  const results: BubblePageResult[] = [];
  let recorded = 0;
  for (let i = 0; i < kept.pages.length; i++) {
    const page = kept.pages[i];
    const reading = readings[i];
    const base = { fileNo: page.fileNo, pageNo: page.pageNo, pageId: page.pageId, sheetNo: reading.sheetNo };
    if (page.duplicate) {
      results.push({ ...base, outcome: 'duplicate', child: null, flagged: false });
      continue;
    }
    const already = (await db.query(`select read_id from bubble_reads where school_id = $1 and page_id = $2`, [actor.schoolId, page.pageId])).rows[0];
    if (already) {
      results.push(await pageResult(db, actor, base, already.read_id as string, byId, st.onlyChoice));
      continue;
    }
    // Whose sheet: its printed number (the child it was printed for, still a candidate), else the roll number shaded on a
    // blank sheet, matched to exactly one candidate (a person checks it), else no one.
    const sheet = reading.sheetNo === null ? null : printed.get(reading.sheetNo);
    let child: string | null = null;
    let by: 'bubble' | 'roll' | 'none' = 'none';
    if (sheet?.student_id && byId.has(sheet.student_id)) (child = sheet.student_id as string), (by = 'bubble');
    else if ((!sheet || !sheet.student_id) && reading.roll && !reading.rollUnclear) {
      const hits = roster.filter((c) => rollKey(c.rollNo) === rollKey(reading.roll));
      if (hits.length === 1) (child = hits[0].studentId), (by = 'roll');
    }
    // Two sheets of one child: the second waits for a person.
    const flags: SheetFlag[] = [];
    let offered: string[] = [];
    if (child) {
      const twice =
        (await db.query(`select 1 from bubble_reads where school_id = $1 and paper_id = $2 and student_id = $3 and state = 'live'`, [actor.schoolId, st.paper.paperId, child])).rows.length > 0 ||
        (st.onlyChoice && (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 and student_id = $3 and state <> 'set_aside'`, [actor.schoolId, st.paper.paperId, child])).rows.length > 0);
      if (twice) {
        offered = [child];
        child = null;
        by = 'none';
        flags.push('two_scripts');
      } else if (by === 'roll') flags.push('check_child');
    } else flags.push('identity');
    const readId = (
      await db.query(
        `insert into bubble_reads (school_id, paper_id, page_id, layout, sheet_no, roll_no, student_id, matched_by, answers, unclear, multiple, confidence, read_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning read_id`,
        [actor.schoolId, st.paper.paperId, page.pageId, layout.key, reading.sheetNo, reading.roll, child, by, JSON.stringify(reading.answers), reading.unclear, reading.multiple, reading.confidence, actor.userId]
      )
    ).rows[0].read_id as string;
    await db.query(`update marking_pages set state = 'read' where school_id = $1 and page_id = $2 and state = 'new'`, [actor.schoolId, page.pageId]);
    recorded++;
    if (st.onlyChoice) {
      // The sheet is the child's script (or one of no one, for the teacher to settle on its review screen).
      const sheetId = (
        await db.query(
          `insert into marking_sheets (school_id, paper_id, upload_id, source, student_id, matched_by, match_note, state, flags, marked_at, ai_confidence)
           values ($1, $2, $3, 'bubble', $4, $5, $6, 'marked', $7, now(), $8) returning sheet_id`,
          [
            actor.schoolId,
            st.paper.paperId,
            uploadId,
            child,
            child ? by : 'none',
            JSON.stringify({ read: { name: null, rollNo: reading.roll, seatNo: null }, candidates: offered.length ? offered : offeredFor(reading.sheetNo, reading.roll, new Map([...printed].map(([n, s]) => [n, s.student_id])), roster) }),
            flags,
            reading.confidence,
          ]
        )
      ).rows[0].sheet_id as string;
      await db.query(`update marking_pages set sheet_id = $3, sheet_position = 1 where school_id = $1 and page_id = $2`, [actor.schoolId, page.pageId, sheetId]);
      await applyRead(db, actor.schoolId, st.paper.paperId, readId, sheetId);
      await refreshFlags(db, actor.schoolId, sheetId);
    } else if (child) {
      const script = await liveScriptOf(db, actor.schoolId, st.paper.paperId, child);
      if (script) {
        const state = (await db.query(`select state from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, script])).rows[0]?.state;
        const done = await applyRead(db, actor.schoolId, st.paper.paperId, readId, script);
        // A script still with the AI keeps its flags for the marking job to set; any other is set now.
        if (state !== 'waiting' && state !== 'marking') await refreshFlags(db, actor.schoolId, script, { changed: done.changed });
      }
    }
    results.push(await pageResult(db, actor, base, readId, byId, st.onlyChoice));
  }
  if (recorded) {
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'marking.bubble_read',
      targetType: 'marking_uploads',
      targetId: uploadId,
      afterState: { paper_id: st.paper.paperId, sheets: recorded },
    });
  }
  return { ok: true, pages: results };
}

async function pageResult(db: Sql, actor: Actor, base: Pick<BubblePageResult, 'fileNo' | 'pageNo' | 'pageId' | 'sheetNo'>, readId: string, byId: ReadonlyMap<string, RosterChild>, onlyChoice: boolean): Promise<BubblePageResult> {
  const r = (await db.query(`select student_id, sheet_id, unclear, multiple, matched_by from bubble_reads where school_id = $1 and read_id = $2`, [actor.schoolId, readId])).rows[0];
  const c = r?.student_id ? byId.get(r.student_id as string) : undefined;
  const flagged = !!r && ((r.unclear ?? []).length > 0 || (r.multiple ?? []).length > 0 || r.matched_by === 'roll' || !r.student_id);
  const outcome: BubblePageResult['outcome'] = onlyChoice ? 'script' : !r?.student_id ? 'waiting' : r.sheet_id ? 'filled' : 'kept';
  return { ...base, outcome, child: c ? { studentId: c.studentId, name: c.name, rollNo: c.rollNo } : null, flagged };
}

// ---- a mixed paper's read sheet and its child --------------------------------------------------------------------------------

async function loadRead(db: Sql, actor: Actor, readId: unknown) {
  if (!isUuid(readId)) return null;
  const r = (await db.query(`select read_id, paper_id, student_id, sheet_id, state from bubble_reads where school_id = $1 and read_id = $2`, [actor.schoolId, readId])).rows[0];
  if (!r) return null;
  const st = await sheetState(db, actor, r.paper_id as string);
  return st ? { r, st } : null;
}

// A person says whose a mixed paper's read sheet is (a sheet whose number was not read, a blank sheet, a second sheet of
// one child), or that it is no one's ('aside'), or that a matched sheet is not its child's ('unmatch'). Its rule marks
// follow: put on the child's answer-book script, or taken off the script it was on.
export async function settleRead(db: Sql, actor: Actor, readId: unknown, action: unknown, studentId: unknown): Promise<{ ok: true } | Fail> {
  const loaded = await loadRead(db, actor, readId);
  if (!loaded) return { ok: false, reason: 'not_found' };
  const { r, st } = loaded;
  if (st.paper.published) return { ok: false, reason: 'closed' };
  if (!st.paper.mayMark) return { ok: false, reason: 'not_allowed' };
  // A paper of only choice questions: the sheet is the script, and whose it is is settled on its review screen.
  if (st.onlyChoice || r.state !== 'live') return { ok: false, reason: 'state' };
  const paperId = st.paper.paperId;
  const takeOff = async () => {
    if (!r.sheet_id) return;
    const sheetId = r.sheet_id as string;
    const sheetQ = st.questions.filter(onBubbleSheet).map((q) => q.questionId);
    await db.query(
      `update marking_marks set attempted = null, ai_marks = null, confidence = null, error_type = null where school_id = $1 and sheet_id = $2 and question_id = any($3::uuid[])`,
      [actor.schoolId, sheetId, sheetQ]
    );
    await db.query(`update bubble_reads set sheet_id = null where school_id = $1 and read_id = $2`, [actor.schoolId, r.read_id]);
    await refreshFlags(db, actor.schoolId, sheetId, { changed: true });
  };
  if (action === 'aside' || action === 'unmatch') {
    await takeOff();
    await db.query(`update bubble_reads set student_id = null, matched_by = 'none', state = $3 where school_id = $1 and read_id = $2`, [actor.schoolId, r.read_id, action === 'aside' ? 'set_aside' : 'live']);
  } else if (action === 'child') {
    if (r.student_id) return { ok: false, reason: 'state' };
    if (typeof studentId !== 'string' || !(await paperRoster(db, actor.schoolId, st.paper)).some((c) => c.studentId === studentId)) return { ok: false, reason: 'not_found' };
    const other = (await db.query(`select 1 from bubble_reads where school_id = $1 and paper_id = $2 and student_id = $3 and state = 'live'`, [actor.schoolId, paperId, studentId])).rows[0];
    if (other) return { ok: false, reason: 'sheet_taken' };
    await db.query(`update bubble_reads set student_id = $3, matched_by = 'teacher' where school_id = $1 and read_id = $2`, [actor.schoolId, r.read_id, studentId]);
    const script = await liveScriptOf(db, actor.schoolId, paperId, studentId);
    if (script) {
      const state = (await db.query(`select state from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, script])).rows[0]?.state;
      const done = await applyRead(db, actor.schoolId, paperId, r.read_id as string, script);
      if (state !== 'waiting' && state !== 'marking') await refreshFlags(db, actor.schoolId, script, { changed: done.changed });
    }
  } else return { ok: false, reason: 'not_sent_properly' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `marking.bubble_${action}`, targetType: 'bubble_reads', targetId: r.read_id as string, afterState: { paper_id: paperId } });
  return { ok: true };
}

// ---- one script's read sheet, for the review screen -------------------------------------------------------------------------

const pct = (mm: number, of: number) => Math.round((mm / of) * 10000) / 100;

function questionViews(questions: readonly MarkingQuestion[], layout: SheetLayout | null, read: { answers: Record<string, OptionKey[]>; unclear: string[]; multiple: string[]; confidence: number }, wrongMarks: number): BubbleQuestionView[] {
  const marks = new Map(ruleMarks(questions, read, wrongMarks).map((o) => [o.questionId, o]));
  return questions.filter(onBubbleSheet).map((q) => {
    const place = layout?.questions.find((p) => p.label === q.label) ?? null;
    const filled = read.answers[q.label] ?? [];
    const o = marks.get(q.questionId);
    const correct = q.correct && 'keys' in q.correct ? q.correct.keys : null;
    // Several shaded is an answer where the correct answer names several options ("choose all that apply").
    const state: BubbleQuestionView['state'] = read.unclear.includes(q.label) ? 'unclear' : read.multiple.includes(q.label) && !(correct && correct.length > 1) ? 'multiple' : filled.length ? 'answer' : 'blank';
    return {
      questionId: q.questionId,
      label: q.label,
      keys: q.options.map((x) => x.key),
      read: filled,
      state,
      correct,
      right: o && o.marks !== null && correct ? (o.attempted ? o.marks > 0 : false) : null,
      row: place ? { left: pct(place.row.x, PAGE_W), top: pct(place.row.y, PAGE_H), width: pct(place.row.w, PAGE_W), height: pct(place.row.h, PAGE_H) } : null,
      bubbles: place ? place.bubbles.map((b, i) => ({ key: place.keys[i], left: pct(b.x, PAGE_W), top: pct(b.y, PAGE_H), size: pct(b.r * 2, PAGE_W) })) : [],
    };
  });
}

// The read sheet of a script: on a paper of only choice questions, the sheet the script is; on a mixed paper, the sheet
// applied to it, else its child's sheet still waiting to be put on it (`pending`, for a person to put on).
export async function sheetBubbles(db: Sql, actor: Actor, sheetId: string): Promise<BubbleSheetDetail | null> {
  if (!isUuid(sheetId)) return null;
  const s = (await db.query(`select paper_id, student_id, source, state from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0];
  if (!s) return null;
  const st = await sheetState(db, actor, s.paper_id as string);
  if (!st) return null;
  let read = (await db.query(`select * from bubble_reads where school_id = $1 and sheet_id = $2 and state = 'live' order by read_at desc limit 1`, [actor.schoolId, sheetId])).rows[0];
  let pending = false;
  if (!read && s.source === 'scan' && s.student_id && st.sitting === 'bubble') {
    read = (await db.query(`select * from bubble_reads where school_id = $1 and paper_id = $2 and student_id = $3 and state = 'live'`, [actor.schoolId, s.paper_id, s.student_id])).rows[0];
    pending = !!read && s.state !== 'set_aside';
  }
  if (!read) return { source: s.source, view: null, pending: false };
  const page = (await db.query(`select width, height, picture_gone_at from marking_pages where school_id = $1 and page_id = $2`, [actor.schoolId, read.page_id])).rows[0];
  const same = !!st.layout && st.layout.key === read.layout;
  const reading = { ...readingOf(read), multiple: (read.multiple ?? []) as string[] };
  return {
    source: s.source,
    pending,
    view: {
      readId: read.read_id,
      pageId: read.page_id,
      url: page && page.picture_gone_at === null ? pageUrl(read.page_id) : null,
      width: Number(page?.width ?? 0),
      height: Number(page?.height ?? 0),
      sheetNo: read.sheet_no === null ? null : Number(read.sheet_no),
      rollNo: read.roll_no ?? null,
      matchedBy: read.matched_by,
      confidence: Number(read.confidence),
      sameQuestions: same,
      applied: read.sheet_id === sheetId,
      questions: questionViews(st.questions, same ? st.layout : null, reading, await wrongMarksOf(db, actor.schoolId, st.paper.paperId)),
      mayChange: st.paper.mayMark && !st.paper.published && s.state !== 'set_aside',
    },
  };
}

// Puts a mixed paper's child's read sheet on their answer-book script now (after the script's child was changed, or the
// sheet was settled before the script came in).
export async function putReadOn(db: Sql, actor: Actor, sheetId: string): Promise<{ ok: true } | Fail> {
  const detail = await sheetBubbles(db, actor, sheetId);
  if (!detail?.view) return { ok: false, reason: 'not_found' };
  if (!detail.view.mayChange) return { ok: false, reason: 'closed' };
  if (!detail.pending) return { ok: false, reason: 'state' };
  const paperId = (await db.query(`select paper_id from marking_sheets where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0]?.paper_id as string;
  const done = await applyRead(db, actor.schoolId, paperId, detail.view.readId, sheetId);
  await refreshFlags(db, actor.schoolId, sheetId, { changed: done.changed });
  return { ok: true };
}
