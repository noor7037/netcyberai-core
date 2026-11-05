// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { ownBestLine } from '@/components/family/SchoolProgress';
import { classRecognition } from '@/lib/exams/class-recognition';
import { hpcBlocks, hpcCards, hpcPdf, hpcScreen, publishHpc, saveHpcEntries } from '@/lib/exams/hpc';
import { ownRecognition } from '@/lib/exams/own-progress';
import { publishClass } from '@/lib/exams/publish';
import { reportCards } from '@/lib/exams/report-card';
import { blocksText, reportCardBlocks } from '@/lib/exams/report-card-text';
import { t } from '@/lib/i18n';

// W21-M4: Personal Best and Most Improved (each child against their own earlier published exams only, with the guard: a
// first exam gives no line) on the report card in both languages, on the class result for the teacher in roll order, and
// in the Family app's one warm line; and the Holistic Progress Card: its data for a child from the tables, the words the
// school writes, the PDF (English and Hindi pages, the Devanagari font, a readable text layer), publishing by the office
// only, and the family's read of their own child's card and line. Every name and number is made up.

const u = (n: number) => `f2140000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, T_CLASS, T_OTHER] = [u(11), u(12), u(13)];
const C6A = u(21);
const [MATHS, ENGLISH] = [u(31), u(32)];
const [X1, X2] = [u(41), u(42)];
const [P1M, P1E, P2M, P2E] = [u(51), u(52), u(53), u(54)];
const [S1, S2, S3] = [u(61), u(62), u(63)];
const SESSION = u(71);
const [G1, G2] = [u(81), u(82)];
const ACCOUNT = 'f2140000-0000-4000-8000-0000000000a1';
const CHILD = 'f2140000-0000-4000-8000-0000000000c1';
const LINK = 'f2140000-0000-4000-8000-0000000000d1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tClass: Who = { role: 'teacher', user: T_CLASS };
const tOther: Who = { role: 'teacher', user: T_OTHER };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const STORED = new Map<string, Uint8Array>();
const storage = { put: async (key: string, bytes: Uint8Array) => void STORED.set(key, bytes), remove: async (key: string) => void STORED.delete(key), get: async (key: string) => STORED.get(key) ?? null };
const pdfText = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
  let all = '';
  for (let i = 1; i <= doc.numPages; i++) all += (await (await doc.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join('') + '\n';
  return { pages: doc.numPages, text: all };
};

const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 0, to: 49, grade: 'C', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [{ key: 'written', kind: 'theory', name: 'Written', share: 100, passMark: null, parts: [] }],
  terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: true },
  coScholastic: { areas: ['Art Education'], grades: [{ grade: 'A', meaning: 'Outstanding' }, { grade: 'B', meaning: null }] },
};
const paper = (id: string, exam: string, subject: string, ago: number) =>
  `('${id}', '${A}', '${exam}', '${C6A}', '${subject}', current_date - ${ago}, '{}', '[{"key":"written","name":"Written","max":50,"share":null}]', '${PRINCIPAL}')`;
const mark = (exam: string, subject: string, p: string, s: string, score: number) => `('${A}', '${exam}', '${subject}', '${p}', 'written', '${s}', 'score', ${score}, 0, '${PRINCIPAL}')`;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${T_CLASS}', '${A}', 'k@a.invalid', 'teacher', 'Kiran Classteacher', true), ('${T_OTHER}', '${A}', 'o@a.invalid', 'teacher', 'Omar Other', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', current_date - 200, current_date + 100, true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id, session_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${T_CLASS}', '${SESSION}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S2}', '${A}', 'A-2', 'Bela Madeup', '${C6A}', '2', 'active'), ('${S1}', '${A}', 'A-1', 'Aarav Madeup', '${C6A}', '1', 'active'), ('${S3}', '${A}', 'A-3', 'चिराग Madeup', '${C6A}', '3', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${G1}', '${A}', 'Rajesh Madeup', '9800000001', 'Father'), ('${G2}', '${A}', 'Sunita Madeup', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G1}', '${S1}'), ('${A}', '${G2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'exams', true, 'plan') on conflict (school_id, module_id) do update set enabled = true;
    insert into school_subscriptions (school_id, plan_id) values ('${A}', 'compass');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, session_id, created_by) values ('${X1}', '${A}', 'Half Yearly', 'Term 1', '${SESSION}', '${PRINCIPAL}'), ('${X2}', '${A}', 'Annual', 'Term 2', '${SESSION}', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by) values
      ${paper(P1M, X1, MATHS, 60)}, ${paper(P1E, X1, ENGLISH, 59)}, ${paper(P2M, X2, MATHS, 10)}, ${paper(P2E, X2, ENGLISH, 9)};
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ${mark(X1, MATHS, P1M, S1, 30)}, ${mark(X1, ENGLISH, P1E, S1, 40)}, ${mark(X1, MATHS, P1M, S2, 20)}, ${mark(X1, ENGLISH, P1E, S2, 25)},
      ${mark(X2, MATHS, P2M, S1, 45)}, ${mark(X2, ENGLISH, P2E, S1, 41)}, ${mark(X2, MATHS, P2M, S2, 18)}, ${mark(X2, ENGLISH, P2E, S2, 24)},
      ${mark(X2, MATHS, P2M, S3, 35)}, ${mark(X2, ENGLISH, P2E, S3, 30)};
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ('${A}', '${X1}', '${MATHS}', '${P1M}', 'written', '${S3}', 'absent', null, 0, '${PRINCIPAL}'), ('${A}', '${X1}', '${ENGLISH}', '${P1E}', 'written', '${S3}', 'absent', null, 0, '${PRINCIPAL}');
    update exam_papers set entered_at = now(), entered_by = '${PRINCIPAL}';
    insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values
      ('${A}', '${X1}', '${C6A}', '${S1}', 'Art Education', 'B', '${PRINCIPAL}'), ('${A}', '${X2}', '${C6A}', '${S1}', 'Art Education', 'A', '${PRINCIPAL}');
    insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by) values ('${A}', '${X2}', '${C6A}', '${S1}', 'Steady and careful work.', '${T_CLASS}');
    insert into attendance (school_id, student_id, class_id, date, status) values
      ('${A}', '${S1}', '${C6A}', current_date - 30, 'present'), ('${A}', '${S1}', '${C6A}', current_date - 29, 'late'),
      ('${A}', '${S1}', '${C6A}', current_date - 28, 'absent'), ('${A}', '${S1}', '${C6A}', current_date - 27, 'present');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values ('${LINK}', '${ACCOUNT}', '${A}', '${G1}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values ('${CHILD}', '${LINK}', '${ACCOUNT}', '${S1}');
  `);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the guard: a child is compared only with their own earlier results, and a first exam gives no line', () => {
  it('no earlier exam, or one the child sat nothing of, is "first"; a rise past the floor is a Personal Best', () => {
    expect(ownRecognition([{ subjectId: 'm', percent: 90 }], [])).toEqual({ first: true });
    expect(ownRecognition([{ subjectId: 'm', percent: 90 }], [{ examId: 'x', subjects: [{ subjectId: 'm', percent: null }] }])).toEqual({ first: true });
    const r = ownRecognition([{ subjectId: 'm', percent: 90 }, { subjectId: 'e', percent: 82 }], [{ examId: 'x', subjects: [{ subjectId: 'm', percent: 60 }, { subjectId: 'e', percent: 80 }] }]);
    expect(r).toMatchObject({ first: false, personalBest: [{ subjectId: 'm', now: 90, best: 60 }], mostImproved: { subjectId: 'm', before: 60, now: 90 } });
    // Below the noise floor: no Personal Best; a fall is no Most Improved.
    expect(ownRecognition([{ subjectId: 'e', percent: 82 }], [{ examId: 'x', subjects: [{ subjectId: 'e', percent: 80 }] }])).toMatchObject({ personalBest: [] });
    expect(ownRecognition([{ subjectId: 'e', percent: 70 }], [{ examId: 'x', subjects: [{ subjectId: 'e', percent: 80 }] }])).toMatchObject({ personalBest: [], mostImproved: null });
  });
});

describe('Personal Best and Most Improved on the report card and the class result', () => {
  it('the first exam: everyone is "first", the class result lists no line', async () => {
    expect((await as(principal, (c) => publishClass(c, actor(principal), X1, C6A))).ok).toBe(true);
    const r = await as(tClass, (c) => classRecognition(c, actor(tClass), X1, C6A, [S1, S2, S3]));
    expect(r?.children.every((c) => c.first)).toBe(true);
  });

  it('the second exam: the report card says it in English and Hindi; the teacher sees each child’s own line in roll order', async () => {
    expect((await as(principal, (c) => publishClass(c, actor(principal), X2, C6A))).ok).toBe(true);
    const r = await as(tClass, (c) => reportCards(c, actor(tClass), X2, C6A, S1));
    if (!r.ok) throw new Error(r.reason);
    const en = blocksText(reportCardBlocks(r.set, r.set.cards[0], 'en'));
    const hi = blocksText(reportCardBlocks(r.set, r.set.cards[0], 'hi'));
    expect(en).toContain('Personal Best: Mathematics, 90%, above their own earlier best of 60%.');
    expect(en).toContain('Most Improved: Mathematics, from 60% in Half Yearly to 90%.');
    expect(hi).toContain('पर्सनल बेस्ट: Mathematics');
    expect(hi).toContain('मोस्ट इम्प्रूव्ड: Mathematics');
    // A child whose results fell has no line; one whose first exam this is says so.
    const s2 = await as(tClass, (c) => reportCards(c, actor(tClass), X2, C6A, S2));
    if (!s2.ok) throw new Error(s2.reason);
    expect(blocksText(reportCardBlocks(s2.set, s2.set.cards[0], 'en'))).not.toMatch(/Personal Best|Most Improved/);
    const cls = await as(tClass, (c) => classRecognition(c, actor(tClass), X2, C6A, [S1, S2, S3]));
    expect(cls?.children.map((c) => [c.studentId, c.first])).toEqual([[S1, false], [S3, true]]);
    expect(cls?.children[0]).toMatchObject({ personalBest: [{ subject: 'Mathematics', now: 90, best: 60 }], mostImproved: { subject: 'Mathematics', before: 60, now: 90 } });
    // Without the plan's feature, nothing.
    await owner(`update school_subscriptions set plan_id = 'growth' where school_id = $1`, [A]);
    expect(await as(tClass, (c) => classRecognition(c, actor(tClass), X2, C6A, [S1]))).toBeNull();
    await owner(`update school_subscriptions set plan_id = 'compass' where school_id = $1`, [A]);
  });

  it('the family’s one warm line, in both languages, about the child alone', () => {
    const words = (lang: 'en' | 'hi') => ({ 'fam.w21m4.pb': t(lang, 'fam.w21m4.pb'), 'fam.w21m4.mi': t(lang, 'fam.w21m4.mi') }) as never;
    const r = { personalBest: [{ subject: 'Mathematics', now: 90 }], mostImproved: { subject: 'Mathematics', before: 60, now: 90 } };
    expect(ownBestLine(r, words('en'))).toBe('A new Personal Best in Mathematics. Well done! Most Improved: Mathematics, up from 60% to 90%.');
    expect(ownBestLine(r, words('hi'))).toContain('पर्सनल बेस्ट');
    expect(ownBestLine({ personalBest: [], mostImproved: null }, words('en'))).toBeNull();
    expect(ownBestLine(undefined, words('en'))).toBeNull();
  });
});

describe('the Holistic Progress Card', () => {
  it('a child’s card is read from the tables: results by subject and exam, co-scholastic grades, attendance, remarks', async () => {
    const r = await as(tClass, (c) => hpcCards(c, actor(tClass), C6A, S1));
    if (!r.ok) throw new Error(r.reason);
    const card = r.cards[0];
    expect(card.session).toBe('2026-27');
    expect(card.exams.map((e) => `${e.name} ${e.term}`)).toEqual(['Half Yearly Term 1', 'Annual Term 2']);
    expect(card.scholastic).toEqual([
      { subject: 'English', cells: [{ percent: 80, grade: 'A' }, { percent: 82, grade: 'A' }] },
      { subject: 'Mathematics', cells: [{ percent: 60, grade: 'B' }, { percent: 90, grade: 'A' }] },
    ]);
    expect(card.coScholastic).toEqual([{ area: 'Art Education', grades: ['B', 'A'] }]);
    expect(card.attendance).toEqual({ present: 3, days: 4 });
    expect(card.examRemarks).toEqual([{ exam: 'Annual · Term 2', remark: 'Steady and careful work.' }]);
    const en = blocksText(hpcBlocks(card, 'en'));
    expect(en).toContain('Holistic Progress Card');
    expect(en).toContain('In school on 3 of the 4 days marked this session (75%).');
    expect(en).toContain('Not filled in yet.');
    expect(en).not.toMatch(/rank|position|average|topper/i);
    expect(blocksText(hpcBlocks(card, 'hi'))).toContain('समग्र प्रगति कार्ड');
  });

  it('the class teacher writes the words; another teacher cannot; too long is refused', async () => {
    expect(await as(tOther, (c) => saveHpcEntries(c, actor(tOther), C6A, [{ studentId: S1, teacherRemark: 'x' }]))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(tClass, (c) => saveHpcEntries(c, actor(tClass), C6A, [{ studentId: S1, healthNote: 'x'.repeat(601) }]))).toMatchObject({ ok: false, reason: 'text' });
    const saved = await as(tClass, (c) =>
      saveHpcEntries(c, actor(tClass), C6A, [{ studentId: S1, teacherRemark: 'A kind and curious learner.', healthNote: 'Plays football twice a week.', selfAssessment: 'मुझे गणित पसंद है।', parentFeedback: 'Reads every evening.' }])
    );
    expect(saved).toEqual({ ok: true, saved: 1 });
    // A field left out keeps its words; an empty one clears it.
    await as(tClass, (c) => saveHpcEntries(c, actor(tClass), C6A, [{ studentId: S1, parentFeedback: '' }]));
    const screen = await as(tClass, (c) => hpcScreen(c, actor(tClass), C6A));
    if (typeof screen === 'string') throw new Error(screen);
    expect(screen.mayPublish).toBe(false);
    expect(screen.children.map((c) => c.studentId)).toEqual([S1, S2, S3]);
    expect(screen.children[0].entry).toEqual({ teacherRemark: 'A kind and curious learner.', healthNote: 'Plays football twice a week.', selfAssessment: 'मुझे गणित पसंद है।', parentFeedback: null });
    await as(tClass, (c) => saveHpcEntries(c, actor(tClass), C6A, [{ studentId: S1, parentFeedback: 'Reads every evening.' }]));
  });

  it('the PDF: an English and a Hindi page, the Devanagari font, a text layer that reads back', async () => {
    const r = await as(principal, (c) => hpcCards(c, actor(principal), C6A, S1));
    if (!r.ok) throw new Error(r.reason);
    const bytes = await hpcPdf(r.cards[0]);
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw).toContain('NotoSansDevanagari');
    const read = await pdfText(bytes);
    expect(read.pages).toBeGreaterThanOrEqual(2);
    expect(read.text).toContain('Holistic Progress Card');
    expect(read.text).toContain('Aarav Madeup');
    expect(read.text).toContain('Plays football twice a week.');
    expect(read.text).toContain('समग्र');
  });

  it('only the office publishes; publishing again replaces each card and adds one to its version', async () => {
    expect(await as(tClass, (c) => publishHpc(c, storage, actor(tClass), C6A))).toEqual({ ok: false, reason: 'not_allowed' });
    const first = await as(principal, (c) => publishHpc(c, storage, actor(principal), C6A));
    expect(first).toMatchObject({ ok: true, published: 3, stale: [] });
    const rows = await owner(`select student_id, version, storage_key, file_name from hpc_cards order by student_id`);
    expect(rows.map((x: { version: number }) => x.version)).toEqual([1, 1, 1]);
    for (const x of rows) expect(STORED.has(x.storage_key)).toBe(true);
    expect(rows[0].storage_key.startsWith(`${A}/hpc/${SESSION}/`)).toBe(true);
    const again = await as(principal, (c) => publishHpc(c, storage, actor(principal), C6A));
    if (!again.ok) throw new Error(again.reason);
    expect(again.stale.sort()).toEqual(rows.map((x: { storage_key: string }) => x.storage_key).sort());
    expect((await owner(`select version from hpc_cards`)).map((x: { version: number }) => x.version)).toEqual([2, 2, 2]);
    // The database holds the same rules: a teacher cannot write a card's row, and the key stays in the school's folder.
    await expect(
      as(tClass, (c) => c.query(`insert into hpc_cards (school_id, session_id, class_id, student_id, storage_key, file_name, sha256, bytes, published_by) values ($1, $2, $3, $4, $5, 'x.pdf', $6, 10, $7)`, [A, SESSION, C6A, S3, `${A}/hpc/${SESSION}/z.pdf`, 'a'.repeat(64), T_CLASS]))
    ).rejects.toThrow();
  });

  it('the family reads their own child’s card and line, never another child’s', async () => {
    const { withGuardianContext } = await import('@/lib/auth/db');
    const { readSchoolHpc } = await import('@/lib/school-link/marking');
    const { readSchoolProgress, readLinkedSchool } = await import('@/lib/school-link');
    const claims = { accountId: ACCOUNT, tokenVersion: 0 };
    const own = await withGuardianContext(claims, LINK, async (c) => (await c.query(`select student_id from public.guardian_hpc_cards()`)).rows);
    expect(own.map((r: { student_id: string }) => r.student_id)).toEqual([S1]);
    const direct = await withGuardianContext(claims, LINK, async (c) => (await c.query(`select 1 from hpc_cards`)).rows.length + (await c.query(`select 1 from hpc_entries`)).rows.length);
    expect(direct).toBe(0);
    const lines = await withGuardianContext(claims, LINK, async (c) => (await c.query(`select student_id, kind, subject from public.guardian_recognition() order by kind`)).rows);
    expect(lines).toEqual([
      { student_id: S1, kind: 'most_improved', subject: 'Mathematics' },
      { student_id: S1, kind: 'personal_best', subject: 'Mathematics' },
    ]);
    const file = await readSchoolHpc(claims, LINK, S1, { childView: false }, storage);
    expect(file && Buffer.from(file.bytes).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(file?.fileName).toMatch(/^hpc_.*\.pdf$/);
    expect(await readSchoolHpc(claims, LINK, S2, { childView: false }, storage)).toBeNull();
    const progress = await readSchoolProgress(claims, LINK, S1, { childView: false });
    expect(progress?.hpc).toMatchObject({ title: null, version: 2 });
    const linked = await readLinkedSchool(claims, LINK, { matched: [S1] });
    const results = linked.children.find((c) => c.studentId === S1)?.results ?? [];
    expect(results.find((r) => r.examId === X2)?.recognition).toEqual({ personalBest: [{ subject: 'Mathematics', now: 90 }], mostImproved: { subject: 'Mathematics', before: 60, now: 90 } });
    expect(results.find((r) => r.examId === X1)?.recognition).toBeUndefined();
  });
});
