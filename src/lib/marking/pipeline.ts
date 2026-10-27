import { activePromptVersion, prepareText, type AiRefusal, type ChatImage, type PreparedText } from '@/lib/ai/platform';
import { markPrompt } from '@/lib/ai/prompts/exams.mark';
import { readPagesPrompt } from '@/lib/ai/prompts/exams.read_pages';
import { MAX_MARKING_ATTEMPTS, MAX_SHEET_PAGES } from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { PermanentJobError, type ClaimedJob, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import type { DirectUploadStorage } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';
import { aiMarkingState, markingPaper } from './context';
import { parseMarking, parseReading } from './parse';
import { PAGES_PER_READ, queueGrouping, queueMarking } from './queue';
import { formSheets, recordPageReading, recordSheetFailure, recordSheetResult, takeSheetForMarking, type SheetToMark } from './store';

// The school's marking jobs (C347, docs/35 §1 steps 3 and 4), each in the school's own session as its office sees it,
// with no person (the 'marking.pipeline' school job of src/lib/auth/db.ts), so the row rules hold as for the office and
// the database refuses any write of a mark from here. Wired in src/lib/jobs/handlers.ts, which passes the session in.
//
//   marking.read   reads a run of a closed upload's pages: each page's details (whose script it starts, its printed
//                  number, blank or not readable). The pictures are fetched with no database connection held, the
//                  request is prepared in one short transaction (the AI platform's checks: the task switched on, a
//                  provider cleared for children), sent with none held, and kept in the next. With AI marking off the
//                  pages are left as they are and the job dies with the reason, for the founder's Retry once it is on.
//                  A page with no reading after the job's last try is kept as failed (its script is flagged). When no
//                  page of the upload is left to read, the scripts are made (marking.group).
//   marking.group  makes the upload's scripts and matches them to the class (formSheets), then queues each one.
//   marking.mark   marks one script: taken in one transaction, sent with no connection held, kept in the next. A
//                  script that cannot be marked fails on its own, with a word for the teacher ('ai_off', 'no_answer',
//                  'bad_answer', 'pages_missing', 'too_long'), and the class goes on. Taken again it changes nothing.
//
// Nothing in a request names a child, a roster or the school: the paper and the page pictures only. Each job ends within
// the job runner's long-job bound (src/lib/jobs/runner.ts, LONG_JOB_MAX_MS): the AI chain by its profile (90 s and
// 200 s), the pictures within PICTURES_MS, and three short transactions.

export const MARKING_SESSION = 'marking.pipeline' as const;
// The session a marking job runs in: production opens a real one (the school job session of src/lib/auth/db.ts,
// passed in by src/lib/jobs/handlers.ts); a test passes the same statements on its own database.
export type AsMarkingSchool = <T>(schoolId: string, job: typeof MARKING_SESSION, fn: (db: Sql) => Promise<T>) => Promise<T>;
export type MarkingJobDeps = {
  asSchool: AsMarkingSchool;
  queue: JobQueue;
  storage: Pick<DirectUploadStorage, 'get'>;
  // The AI platform's first step; a test passes a stand-in that answers as a model would.
  prepare?: typeof prepareText;
};

// All a job's pictures are fetched within this, a few at a time; one not there by then counts as missing.
export const PICTURES_MS = 25_000;
const PICTURES_AT_ONCE = 8;
// A script's pictures together, at most: what a vendor takes in one request, with room for the words.
export const MARK_MAX_BYTES = 20_000_000;
const JOB_ACTOR = (schoolId: string) => ({ schoolId, userId: '00000000-0000-0000-0000-000000000000', role: 'principal' as const });
const OFF: readonly AiRefusal[] = ['not_switched_on', 'not_cleared_for_minors'];

function schoolOf(job: ClaimedJob): string {
  if (!job.schoolId || !isUuid(job.schoolId)) throw new PermanentJobError(`${job.type}: no school`);
  return job.schoolId;
}

const aiContext = (schoolId: string) => ({ accountId: schoolId, childFirstNames: [], day: indiaDate() });

// The pictures of the pages asked for, by page id; null for one the store did not give in time.
export async function readPictures(storage: Pick<DirectUploadStorage, 'get'>, pages: readonly { pageId: string; storageKey: string }[], ms = PICTURES_MS): Promise<Map<string, Uint8Array | null>> {
  const deadline = Date.now() + ms;
  const out = new Map<string, Uint8Array | null>();
  let next = 0;
  const within = (key: string, left: number) =>
    new Promise<Uint8Array | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), left);
      storage.get(key).then(
        (bytes) => {
          clearTimeout(timer);
          resolve(bytes && bytes.length ? bytes : null);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        }
      );
    });
  const worker = async () => {
    while (next < pages.length) {
      const p = pages[next++];
      const left = deadline - Date.now();
      out.set(p.pageId, left > 0 ? await within(p.storageKey, left) : null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PICTURES_AT_ONCE, pages.length) }, worker));
  return out;
}

const jpeg = (bytes: Uint8Array): ChatImage => ({ mediaType: 'image/jpeg', base64: Buffer.from(bytes).toString('base64') });

// ---- marking.read ------------------------------------------------------------------------------------------------------

function readPayload(job: ClaimedJob): { uploadId: string; pageIds: string[] } {
  const { uploadId, pageIds } = job.payload as { uploadId?: unknown; pageIds?: unknown };
  if (!isUuid(uploadId) || !Array.isArray(pageIds) || pageIds.length < 1 || pageIds.length > PAGES_PER_READ || !pageIds.every(isUuid)) throw new PermanentJobError('marking.read: bad payload');
  return { uploadId, pageIds: pageIds as string[] };
}

export function markingReadHandler(deps: MarkingJobDeps): JobHandler {
  const prepare = deps.prepare ?? prepareText;
  return async (job) => {
    const schoolId = schoolOf(job);
    const { uploadId, pageIds } = readPayload(job);
    const last = job.attempts >= job.maxAttempts;

    // 1. The run's pages still to read, of a closed upload whose paper may still be marked.
    const pages = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      const up = (await db.query(`select paper_id, closed_at from marking_uploads where school_id = $1 and upload_id = $2`, [schoolId, uploadId])).rows[0];
      if (!up?.closed_at) return null;
      const paper = await markingPaper(db, JOB_ACTOR(schoolId), up.paper_id as string);
      if (!paper || paper.published || !paper.mayMark) return null;
      // Only the upload's own pages: a payload naming none of them does nothing at all.
      const own = (await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and upload_id = $2 and page_id = any($3::uuid[])`, [schoolId, uploadId, pageIds])).rows[0];
      if (!Number(own?.n)) return null;
      return (
        await db.query(`select page_id, storage_key from marking_pages where school_id = $1 and upload_id = $2 and page_id = any($3::uuid[]) and state = 'new' order by file_no, page_no`, [
          schoolId,
          uploadId,
          pageIds,
        ])
      ).rows.map((r) => ({ pageId: r.page_id as string, storageKey: r.storage_key as string }));
    });
    // Gone, not closed, not this upload's pages, or its class published since: nothing to do.
    if (pages === null) return;

    // 2. The pictures, with no connection held.
    const pictures = pages.length ? await readPictures(deps.storage, pages) : new Map<string, Uint8Array | null>();
    const present = pages.filter((p) => pictures.get(p.pageId));

    // 3. The request, through the AI platform's checks, in one short transaction.
    let prepared: PreparedText | null = null;
    if (present.length) {
      const got = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
        const state = await aiMarkingState(db, schoolId);
        if (!state.on) return { ok: false as const, reason: `ai_off:${state.why}` };
        const prompt = readPagesPrompt(await activePromptVersion(db, 'exams.read_pages'));
        const ask = { pages: present.length };
        const p = await prepare(db, aiContext(schoolId), 'exams.read_pages', {
          system: prompt.system(ask),
          messages: [{ role: 'user', content: prompt.user(ask), images: present.map((x) => jpeg(pictures.get(x.pageId) as Uint8Array)) }],
          responseFormat: 'json',
          maxTokens: 2000,
        });
        return p.ok ? { ok: true as const, text: p.text } : { ok: false as const, reason: p.reason };
      });
      // AI marking is off, or no cleared provider: the pages wait, and the job says why.
      if (!got.ok && (got.reason.startsWith('ai_off') || OFF.includes(got.reason as AiRefusal))) throw new PermanentJobError(`marking.read: AI marking is off (${got.reason})`);
      if (!got.ok) throw new Error(`marking.read: the AI could not be asked (${got.reason})`);
      prepared = got.text;
    }

    // 4. The AI reads the pages, with no connection held.
    const sent = prepared ? await prepared.send() : null;
    const readings = sent?.result.ok ? parseReading(sent.result.text, present.length) : present.map(() => null);

    // 5. What was read, the metering, and the scripts once nothing is left to read.
    const left = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      await sent?.record(db);
      // One at a time per upload, so the last run to finish sees every other run's pages and queues the scripts.
      await db.query(`select 1 from marking_uploads where school_id = $1 and upload_id = $2 for update`, [schoolId, uploadId]);
      let unread = 0;
      for (const p of pages) {
        const i = present.indexOf(p);
        const reading = i >= 0 ? readings[i] : null;
        if (reading) await recordPageReading(db, schoolId, p.pageId, reading);
        else if (last) await recordPageReading(db, schoolId, p.pageId, null);
        else unread++;
      }
      const pending = Number((await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and upload_id = $2 and state = 'new'`, [schoolId, uploadId])).rows[0]?.n ?? 0);
      if (pending === 0) await queueGrouping(db, deps.queue, schoolId, uploadId);
      return unread;
    });
    // Pages not read this time are tried again (the queue waits longer each time); after the last try they are failed.
    if (left > 0) throw new Error(`marking.read: ${left} of ${pages.length} pages not read yet`);
  };
}

// ---- marking.group -----------------------------------------------------------------------------------------------------

export function markingGroupHandler(deps: Pick<MarkingJobDeps, 'asSchool' | 'queue'>): JobHandler {
  return async (job) => {
    const schoolId = schoolOf(job);
    const uploadId = (job.payload as { uploadId?: unknown }).uploadId;
    if (!isUuid(uploadId)) throw new PermanentJobError('marking.group: bad payload');
    const outcome = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      const up = (await db.query(`select paper_id, closed_at from marking_uploads where school_id = $1 and upload_id = $2`, [schoolId, uploadId])).rows[0];
      if (!up?.closed_at) return 'nothing';
      const paper = await markingPaper(db, JOB_ACTOR(schoolId), up.paper_id as string);
      if (!paper || paper.published || !paper.mayMark) return 'nothing';
      const formed = await formSheets(db, schoolId, uploadId);
      if (formed.waiting) return 'waiting';
      await queueMarking(db, deps.queue, schoolId, formed.toMark);
      return 'done';
    });
    // Pages still being read: try again later (the last reading run queues this job only once none is left).
    if (outcome === 'waiting') throw new Error('marking.group: pages are still being read');
  };
}

// ---- marking.mark ------------------------------------------------------------------------------------------------------

type Taken = SheetToMark & { grade: string };

// Why a script that was not taken stays unmarked, kept for the teacher when it still waits; nothing for a script that is
// already marked, approved or set aside (a job run twice).
async function notTaken(db: Sql, schoolId: string, sheetId: string): Promise<void> {
  const s = (await db.query(`select state, attempts from marking_sheets where school_id = $1 and sheet_id = $2`, [schoolId, sheetId])).rows[0];
  if (!s || !['waiting', 'marking'].includes(s.state)) return;
  // The AI's tries are used up: it gave no answer it could keep.
  if (Number(s.attempts) >= MAX_MARKING_ATTEMPTS) return recordSheetFailure(db, schoolId, sheetId, 'no_answer');
  const pages = Number((await db.query(`select count(*)::int as n from marking_pages where school_id = $1 and sheet_id = $2 and state not in ('blank', 'not_answer')`, [schoolId, sheetId])).rows[0]?.n ?? 0);
  await recordSheetFailure(db, schoolId, sheetId, pages === 0 ? 'pages_missing' : pages > MAX_SHEET_PAGES ? 'too_long' : 'not_ready');
}

export function markingMarkHandler(deps: MarkingJobDeps): JobHandler {
  const prepare = deps.prepare ?? prepareText;
  return async (job) => {
    const schoolId = schoolOf(job);
    const sheetId = (job.payload as { sheetId?: unknown }).sheetId;
    if (!isUuid(sheetId)) throw new PermanentJobError('marking.mark: bad payload');
    const last = job.attempts >= job.maxAttempts;
    const fail = (kind: string) => deps.asSchool(schoolId, MARKING_SESSION, (db) => recordSheetFailure(db, schoolId, sheetId, kind));

    // 1. Take the script: its paper, questions and pages, in one transaction. Only a script waiting to be marked, or
    // left taken by this job's own earlier try: a failed one comes back only when the teacher asks again (it then
    // waits, with a job of its own), so an old job run again never marks it a second time.
    const taken = await deps.asSchool(schoolId, MARKING_SESSION, async (db): Promise<Taken | null> => {
      const now = (await db.query(`select state from marking_sheets where school_id = $1 and sheet_id = $2 for update`, [schoolId, sheetId])).rows[0];
      if (!now || !['waiting', 'marking'].includes(now.state)) return null;
      const t = await takeSheetForMarking(db, schoolId, sheetId);
      if (!t) {
        await notTaken(db, schoolId, sheetId);
        return null;
      }
      const grade = (await db.query(`select grade from classes where school_id = $1 and class_id = $2`, [schoolId, t.paper.classId])).rows[0]?.grade;
      return { ...t, grade: typeof grade === 'string' && grade.trim() ? grade.trim() : '' };
    });
    if (!taken) return;

    // 2. Its pictures, with no connection held.
    const pictures = await readPictures(deps.storage, taken.pages);
    const bytes = taken.pages.map((p) => pictures.get(p.pageId));
    if (bytes.some((b) => !b)) return fail('pages_missing');
    if (bytes.reduce((n, b) => n + (b as Uint8Array).length, 0) > MARK_MAX_BYTES) return fail('too_long');

    // 3. The request, through the AI platform's checks, in one short transaction.
    const units = new Map(taken.paper.units.map((u) => [u.unitId, u]));
    const got = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      const state = await aiMarkingState(db, schoolId);
      if (!state.on) {
        await recordSheetFailure(db, schoolId, sheetId, 'ai_off');
        return null;
      }
      const prompt = markPrompt(await activePromptVersion(db, 'exams.mark'));
      const ask = {
        grade: taken.grade,
        subject: taken.paper.subjectName,
        language: taken.language,
        guidance: taken.guidance,
        questions: taken.questions.map((q) => ({
          label: q.label,
          maxMarks: q.maxMarks,
          kind: q.kind,
          prompt: q.prompt,
          answerKey: q.answerKey,
          steps: q.steps,
          chapter: q.unitId ? units.get(q.unitId)?.chapter ?? null : null,
          topic: q.unitId ? units.get(q.unitId)?.topic ?? null : null,
        })),
        topics: taken.paper.units.map((u) => ({ chapter: u.chapter, topic: u.topic })),
        pages: taken.pages.length,
      };
      const p = await prepare(db, aiContext(schoolId), 'exams.mark', {
        system: prompt.system(ask),
        messages: [{ role: 'user', content: prompt.user(ask), images: bytes.map((b) => jpeg(b as Uint8Array)) }],
        responseFormat: 'json',
        maxTokens: 12000,
      });
      if (!p.ok) {
        await recordSheetFailure(db, schoolId, sheetId, OFF.includes(p.reason) ? 'ai_off' : 'no_answer');
        return null;
      }
      return { text: p.text, version: prompt.version };
    });
    if (!got) return;

    // 4. The AI marks the script, with no connection held.
    const sent = await got.text.send();

    // 5. The marks kept (checked again against the paper), or the script failed on its own.
    const again = await deps.asSchool(schoolId, MARKING_SESSION, async (db) => {
      await sent.record(db);
      if (!sent.result.ok) {
        if (!last) return true;
        await recordSheetFailure(db, schoolId, sheetId, 'no_answer');
        return false;
      }
      const result = parseMarking(
        sent.result.text,
        taken.questions,
        taken.pages.map((p) => p.pageId),
        taken.paper.units
      );
      if (!result) {
        await recordSheetFailure(db, schoolId, sheetId, 'bad_answer');
        return false;
      }
      // An answer the database still refuses fails this script only; the metering above is kept.
      await db.query('savepoint keep_marks');
      try {
        await recordSheetResult(db, schoolId, sheetId, result, { provider: sent.result.provider, model: sent.result.model, promptVersion: got.version });
        await db.query('release savepoint keep_marks');
      } catch {
        await db.query('rollback to savepoint keep_marks');
        await recordSheetFailure(db, schoolId, sheetId, 'bad_answer');
      }
      return false;
    });
    // No answer this time: tried again later (the script stays taken until then); after the last try it is failed.
    if (again) throw new Error('marking.mark: the AI gave no answer');
  };
}
