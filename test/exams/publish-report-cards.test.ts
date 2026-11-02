import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { schoolJobContextStatements } from '@/lib/auth/db';
import { roundPercent } from '@/lib/exams/grading';
import { publishClass, reopenClass } from '@/lib/exams/publish';
import { classReport, classReportBlocks, makeReportCardFiles, reportCardBundle, reportCardFiles, reportCardJobHandler } from '@/lib/exams/report-card-files';
import { queueReportCards, REPORT_CARD_JOB } from '@/lib/exams/report-card-queue';
import { classResult } from '@/lib/exams/results';
import { jobQueue } from '@/lib/jobs/pg-queue';
import type { ClaimedJob } from '@/lib/jobs/types';
import { textPdf, winAnsi, wrap } from '@/lib/pdf/text-pdf';

// W14-F: report cards made on publish for every child. Publishing a class queues one job a child (idempotent on the
// exam, the class, the child and the version); the job makes the child's card as a PDF and keeps it as a result_pdfs
// row of kind 'report_card' in the school's folder; the publish page reads how far it got from the jobs and the rows;
// "try again" runs the failed ones again; reopening and publishing again queues the new version and leaves the old
// cards superseded; one zip has every card; the class report's numbers are results.ts's. Every name and number is
// made up.

const u = (n: number) => `f1400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_CLASS, T_OTHER, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16)];
const C6A = u(21);
const [MATHS, ENGLISH] = [u(31), u(32)];
const X1 = u(41);
const [PM, PE] = [u(51), u(52)];
const [S1, S2, S3] = [u(61), u(62), u(63)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A };
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

// The store and the school's own job session (withSchoolJobContext's statements), on this database.
const STORED = new Map<string, Uint8Array>();
const storage = { put: async (key: string, bytes: Uint8Array) => void STORED.set(key, bytes), remove: async (key: string) => void STORED.delete(key), get: async (key: string) => STORED.get(key) ?? null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(schoolId: string, job: 'exams.report_cards', fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(schoolId, job)) await tx.query(s.sql, s.params);
    return fn(tx);
  });
const handler = reportCardJobHandler({ asSchool: asSchool as never, storage });
const jobs = async (where = '') =>
  (await owner(`select job_id, type, payload, attempts, max_attempts, school_id, idempotency_key, status from jobs where type = '${REPORT_CARD_JOB}' ${where} order by idempotency_key`)) as {
    job_id: string;
    type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
    school_id: string;
    idempotency_key: string;
    status: string;
  }[];
const claimed = (j: Awaited<ReturnType<typeof jobs>>[number]): ClaimedJob => ({ jobId: j.job_id, type: j.type, payload: j.payload, attempts: j.attempts, maxAttempts: j.max_attempts, schoolId: j.school_id, idempotencyKey: j.idempotency_key });
// Runs the pending report-card jobs (as the runner would), marking each succeeded.
const runPending = async (except: string[] = []) => {
  for (const j of await jobs(`and status = 'pending'`)) {
    if (except.includes(j.payload.studentId as string)) continue;
    await handler(claimed(j));
    await owner(`update jobs set status = 'succeeded', completed_at = now(), attempts = attempts + 1 where job_id = $1`, [j.job_id]);
  }
};
const cardRows = async () => (await owner(`select student_id, publication_id, storage_key, file_name, made_by, kind, deleted_at from result_pdfs where kind = 'report_card' order by made_at, student_id`)) as Record<string, unknown>[];
const pubOf = async (version: number) => (await owner(`select publication_id from exam_publications where exam_id = $1 and class_id = $2 and version = $3`, [X1, C6A, version]))[0].publication_id as string;

const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [{ key: 'written', kind: 'theory', name: 'Written', share: 100, passMark: null, parts: [] }],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
  coScholastic: null,
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board) values ('${A}', 'School A', 'IN-HR', 'CBSE'), ('${B}', 'School B', 'IN-DL', 'CBSE');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Asif Admin', true),
      ('${COORDINATOR}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Chitra Coordinator', true),
      ('${T_CLASS}', '${A}', 'k@a.invalid', 'teacher', 'Kiran Classteacher', true), ('${T_OTHER}', '${A}', 'o@a.invalid', 'teacher', 'Omar Other', true),
      ('${B_PRINCIPAL}', '${B}', 'p@b.invalid', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${T_CLASS}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S2}', '${A}', 'A-2', 'Bela Madeup', '${C6A}', '2', 'active'), ('${S1}', '${A}', 'A-1', 'Aarav Madeup', '${C6A}', '1', 'active'), ('${S3}', '${A}', 'A-3', 'चिराग Madeup', '${C6A}', '3', 'active');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'exams', true, 'plan') on conflict (school_id, module_id) do update set enabled = true;
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by) values ('${X1}', '${A}', 'AI Marking Retest', 'Term 1', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by) values
      ('${PM}', '${A}', '${X1}', '${C6A}', '${MATHS}', current_date - 10, '{}', '[{"key":"written","name":"Written","max":50,"share":null}]', '${PRINCIPAL}'),
      ('${PE}', '${A}', '${X1}', '${C6A}', '${ENGLISH}', current_date - 9, '{}', '[{"key":"written","name":"Written","max":50,"share":null}]', '${PRINCIPAL}');
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ('${A}', '${X1}', '${MATHS}', '${PM}', 'written', '${S1}', 'score', 45, 0, '${PRINCIPAL}'), ('${A}', '${X1}', '${ENGLISH}', '${PE}', 'written', '${S1}', 'score', 40, 0, '${PRINCIPAL}'),
      ('${A}', '${X1}', '${MATHS}', '${PM}', 'written', '${S2}', 'score', 12, 0, '${PRINCIPAL}'), ('${A}', '${X1}', '${ENGLISH}', '${PE}', 'written', '${S2}', 'score', 30, 0, '${PRINCIPAL}'),
      ('${A}', '${X1}', '${MATHS}', '${PM}', 'written', '${S3}', 'score', 25, 0, '${PRINCIPAL}'), ('${A}', '${X1}', '${ENGLISH}', '${PE}', 'written', '${S3}', 'absent', null, 0, '${PRINCIPAL}');
    update exam_papers set entered_at = now(), entered_by = '${PRINCIPAL}' where paper_id in ('${PM}', '${PE}');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the server’s text PDF (W14-F)', () => {
  it('writes a real PDF, keeps Latin letters and turns anything else into “?”', () => {
    const bytes = textPdf([[{ kind: 'title', text: 'School (A)' }, { kind: 'table', columns: ['Subject', 'Total'], rows: [['Maths', '45 / 50']], numeric: [false, true], totalRow: false }], [{ kind: 'line', text: 'Next card' }]]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('(School \\(A\\)) Tj');
    expect(winAnsi('कक्षा A')).toEqual([63, 63, 63, 63, 63, 32, 65]);
    expect(wrap('one two three four five six', 10, false, 60).length).toBeGreaterThan(1);
  });
});

describe('report cards made on publish (W14-F)', () => {
  it('publishing queues one job a child, in roll order; queuing the same version again queues nothing twice', async () => {
    const r = await as(principal, (c) => publishClass(c, actor(principal), X1, C6A, jobQueue));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jobKeys).toEqual([S1, S2, S3].map((s) => `exam.report_card:${X1}:${C6A}:${s}:v${r.version}`));
    const queued = await jobs();
    expect(queued.map((j) => [j.payload.studentId, j.school_id, j.status])).toEqual([S1, S2, S3].map((s) => [s, A, 'pending']));
    const pub = await pubOf(1);
    await as(principal, (c) => queueReportCards(c, jobQueue, A, X1, C6A, { publicationId: pub, version: 1 }));
    expect((await jobs()).length).toBe(3);
    // Nothing is made yet: the publish page says so.
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toEqual({ version: 1, total: 3, ready: 0, waiting: 3, failed: 0, missing: 0, mayMake: true });
  });

  it('a school session cannot queue the job for another school, nor a teacher at all', async () => {
    const spec = { type: REPORT_CARD_JOB, payload: {}, idempotencyKey: 'x-other', schoolId: B };
    await expect(as(principal, (c) => jobQueue.enqueue(c, spec))).rejects.toThrow();
    await expect(as(tClass, (c) => jobQueue.enqueue(c, { ...spec, schoolId: A, idempotencyKey: 'x-teacher' }))).rejects.toThrow();
  });

  it('the job makes the child’s card as a PDF and keeps it as a report-card row, in the publisher’s name, once', async () => {
    await runPending([S3]);
    const rows = await cardRows();
    expect(rows.map((r) => r.student_id)).toEqual(expect.arrayContaining([S1, S2]));
    expect(rows).toHaveLength(2);
    const pub = await pubOf(1);
    for (const r of rows) {
      expect(r).toMatchObject({ publication_id: pub, made_by: PRINCIPAL, kind: 'report_card', deleted_at: null });
      expect(String(r.storage_key).startsWith(`${A}/result-pdfs/${pub}/`)).toBe(true);
      expect(r.file_name).toMatch(/^report-card_AI-Marking-Retest_6-A_roll-[12]\.pdf$/);
    }
    const aarav = rows.find((r) => r.student_id === S1)!;
    const text = new TextDecoder().decode(STORED.get(String(aarav.storage_key)));
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('(Aarav Madeup) Tj');
    expect(text).toContain('(Mathematics) Tj');
    expect(text).not.toContain('Bela');
    // A second run of the same job finds the copy and makes nothing.
    const again = (await jobs()).find((j) => j.payload.studentId === S1)!;
    await handler(claimed(again));
    expect(await cardRows()).toHaveLength(2);
    // The send-gate never takes a report card for WhatsApp.
    const pdf = (await owner(`select pdf_id from result_pdfs where student_id = $1 and kind = 'report_card'`, [S1]))[0].pdf_id;
    expect((await owner(`select public.result_pdf_may_go($1, $2) as yes`, [A, pdf]))[0].yes).toBe(false);
    // Kept until the school's days for answer-sheet pictures (45 by default) from the publication; not due now.
    const days = (await owner(`select extract(day from public.report_card_pdf_deadline($1, $2) - x.published_at)::int as d from exam_publications x where x.publication_id = $2`, [A, pub]))[0].d;
    expect(days).toBe(45);
    expect((await owner(`select pdf_id from public.result_pdfs_due(100)`)).length).toBe(0);
  });

  it('a school session makes no report-card row in anyone else’s name, and only the office and the class teacher read them', async () => {
    const pub = await pubOf(1);
    const insert = (c: { query: (s: string, p: unknown[]) => Promise<unknown> }, by: string) =>
      c.query(
        `insert into result_pdfs (school_id, exam_id, class_id, student_id, publication_id, storage_key, file_name, sha256, bytes, made_by, kind)
         values ($1, $2, $3, $4, $5, $1 || '/result-pdfs/' || $5 || '/' || gen_random_uuid() || '.pdf', 'x.pdf', repeat('a', 64), 10, $6, 'report_card')`,
        [A, X1, C6A, S3, pub, by]
      );
    await expect(as(admin, (c) => insert(c, PRINCIPAL))).rejects.toThrow();
    await expect(as(tClass, (c) => insert(c, T_CLASS))).rejects.toThrow();
    const read = (who: Who) => as(who, async (c) => (await c.query(`select student_id from result_pdfs where kind = 'report_card'`)).rows.length);
    expect(await read(principal)).toBe(2);
    expect(await read(admin)).toBe(2);
    expect(await read(coordinator)).toBe(2);
    expect(await read(tClass)).toBe(2);
    expect(await read(tOther)).toBe(0);
    expect(await read(bPrincipal)).toBe(0);
  });

  it('a failed card says so; “try again” runs it again, and then all are ready', async () => {
    const s3 = (await jobs()).find((j) => j.payload.studentId === S3)!;
    await owner(`update jobs set status = 'dead', attempts = max_attempts, completed_at = now() where job_id = $1`, [s3.job_id]);
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toMatchObject({ total: 3, ready: 2, waiting: 0, failed: 1, missing: 0 });
    // The class teacher reads the state but does not make them; another teacher reads nothing.
    expect(await as(tClass, (c) => reportCardFiles(c, actor(tClass), X1, C6A))).toMatchObject({ ready: 2, failed: 1, mayMake: false });
    expect(await as(tOther, (c) => reportCardFiles(c, actor(tOther), X1, C6A))).toBe('not_allowed');
    expect(await as(tClass, (c) => makeReportCardFiles(c, jobQueue, actor(tClass), X1, C6A))).toEqual({ ok: false, reason: 'not_allowed' });
    // Another school's office reaches none of this school's jobs.
    expect(await as(bPrincipal, (c) => c.query(`select public.report_card_jobs_retry($1) as n`, [s3.payload.publicationId]))).toMatchObject({ rows: [{ n: 0 }] });
    expect(await as(bPrincipal, (c) => c.query(`select * from public.report_card_jobs($1)`, [s3.payload.publicationId]))).toMatchObject({ rows: [] });
    const made = await as(principal, (c) => makeReportCardFiles(c, jobQueue, actor(principal), X1, C6A));
    expect(made).toMatchObject({ ok: true, retried: 1 });
    expect((await jobs()).length).toBe(3);
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toMatchObject({ ready: 2, waiting: 1, failed: 0 });
    await runPending();
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toMatchObject({ total: 3, ready: 3, waiting: 0, failed: 0, missing: 0 });
    // W17-B5: the child with a Hindi name gets the shaped, embedded-font writer; the English cards keep Helvetica.
    const key = String((await cardRows()).find((r) => r.student_id === S3)!.storage_key);
    const hindi = Buffer.from(STORED.get(key)!).toString('latin1');
    expect(hindi.startsWith('%PDF-')).toBe(true);
    expect(hindi).toContain('NotoSansDevanagari');
    const english = Buffer.from(STORED.get(String((await cardRows()).find((r) => r.student_id === S1)!.storage_key))!).toString('latin1');
    expect(english).not.toContain('NotoSansDevanagari');
  });

  it('“Get every report card” is every kept card in roll order, for the office and the class teacher', async () => {
    const b = await as(principal, (c) => reportCardBundle(c, actor(principal), X1, C6A));
    if (typeof b === 'string') throw new Error(b);
    expect(b.name).toBe('report-card_AI-Marking-Retest_6-A.zip');
    expect(b.files.map((f) => f.name)).toEqual(['report-card_AI-Marking-Retest_6-A_roll-1.pdf', 'report-card_AI-Marking-Retest_6-A_roll-2.pdf', 'report-card_AI-Marking-Retest_6-A_roll-3.pdf']);
    expect(b.files.every((f) => STORED.has(f.key))).toBe(true);
    const t = await as(tClass, (c) => reportCardBundle(c, actor(tClass), X1, C6A));
    expect(typeof t === 'string' ? t : t.files.length).toBe(3);
    expect(await as(tOther, (c) => reportCardBundle(c, actor(tOther), X1, C6A))).toBe('not_allowed');
  });

  it('the class report’s numbers are results.ts’s: each subject’s average, highest, lowest and passes, every child’s total and grade', async () => {
    const r = await as(principal, (c) => classReport(c, actor(principal), X1, C6A));
    if (typeof r === 'string') throw new Error(r);
    const result = await as(principal, (c) => classResult(c, actor(principal), X1, C6A));
    const s = r.summary;
    expect(s.passMark).toBe(33);
    result!.papers.forEach((p, i) => {
      const each = result!.children.map((c) => c.papers[i]).filter((x) => x.percent !== null);
      expect(s.subjects[i]).toEqual({
        name: p.subjectName,
        average: roundPercent(each.reduce((a, x) => a + (x.percent as number), 0) / each.length, 0),
        highest: Math.max(...each.map((x) => x.rounded as number)),
        lowest: Math.min(...each.map((x) => x.rounded as number)),
        counted: each.length,
        passed: each.filter((x) => (x.rounded as number) >= 33).length,
      });
    });
    // Mathematics 90, 24, 50; English 80, 60 and Chirag absent (left out of the percent, as the card does).
    expect(s.subjects.map((x) => [x.name, x.average, x.highest, x.lowest, x.passed, x.counted])).toEqual([
      ['English', 70, 80, 60, 2, 2],
      ['Mathematics', 55, 90, 24, 2, 3],
    ]);
    expect(s.children).toEqual(
      result!.children.map((c) => ({ name: c.name, rollNo: c.rollNo, total: expect.anything(), percent: c.overall.rounded, grade: c.overall.grade.kind === 'grade' ? c.overall.grade.grade : null }))
    );
    expect(s.children.map((c) => [c.rollNo, c.total])).toEqual([
      ['1', { score: 85, max: 100 }],
      ['2', { score: 42, max: 100 }],
      ['3', { score: 25, max: 50 }],
    ]);
    // The whole exam: Aarav passed every subject; Bela did not pass Mathematics; Chirag was absent in English.
    expect([s.overall.passed, s.overall.counted]).toEqual([1, 3]);
    const words = classReportBlocks(s, r.school, 'hi');
    expect(words[0]).toEqual({ kind: 'title', text: 'School A' });
    expect(await as(tOther, (c) => classReport(c, actor(tOther), X1, C6A))).toBe('not_allowed');
  });

  it('reopening and publishing again queues the new version; the old cards stay, superseded, and an old job makes nothing', async () => {
    const before = await cardRows();
    expect((await as(principal, (c) => reopenClass(c, actor(principal), X1, C6A, 'A mark was wrong.'))).ok).toBe(true);
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toBe('not_published');
    const old = (await jobs()).find((j) => j.payload.studentId === S1)!;
    await handler(claimed(old));
    expect(await cardRows()).toHaveLength(before.length);
    const r = await as(principal, (c) => publishClass(c, actor(principal), X1, C6A, jobQueue));
    expect(r).toMatchObject({ ok: true, version: 2 });
    expect((await jobs()).filter((j) => j.idempotency_key.endsWith(':v2'))).toHaveLength(3);
    expect(await as(principal, (c) => reportCardFiles(c, actor(principal), X1, C6A))).toMatchObject({ version: 2, ready: 0, waiting: 3 });
    expect((await cardRows()).filter((x) => x.deleted_at === null)).toHaveLength(3);
    await runPending();
    const v2 = await pubOf(2);
    expect((await cardRows()).filter((x) => x.publication_id === v2)).toHaveLength(3);
    const b = await as(principal, (c) => reportCardBundle(c, actor(principal), X1, C6A));
    expect(typeof b === 'string' ? b : b.files.every((f) => f.key.includes(`/${v2}/`))).toBe(true);
  });
});
