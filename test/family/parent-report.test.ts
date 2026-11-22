import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { TUTOR_PARENT_REPORT_JOB as REGISTRY_JOB } from '@/lib/ai/agents/jobs';
import { renderEmail } from '@/lib/email/templates';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { indiaDate } from '@/lib/time/india';
import {
  TUTOR_PARENT_REPORT_JOB,
  addDays,
  buildCounts,
  checkedSentences,
  enqueueWeeklyReports,
  mondayOf,
  rulesSentences,
  withWeeklyReports,
  writeWeeklyReports,
  type ReportBody,
  type ReportDeps,
} from '@/lib/family/parent-report';

// W16-B3 (the proposal's M9): the weekly parent report, the class summary to the school and the teacher's list of recent
// doubts, on the real migrations.
//   1. A fixture week's counts are right: sessions, questions, chapters, quizzes, weak chapters, minutes of voice, and the
//      school's attendance days for a child matched with consent.
//   2. One family's report never reads another's rows.
//   3. No child's words reach the report's body or the prompt; no child's name reaches the prompt.
//   4. With no provider for family.parent_report the rules-only report is written; a model's answer with a number the
//      counts do not hold is not kept.
//   5. The report is on the notifications feed; an email job goes to the account's address, none when notices are off.
//   6. The class summary is a draft notice that waits for the principal; nothing is delivered and nothing is drafted twice.
//   7. The teacher's doubts are subject, chapter, topic and a count for their own classes only; a class they do not teach
//      gives nothing; a family whose consent is withdrawn is not counted.
// Every name and word is made up.

const A = 'b3000000-0000-4000-8000-00000000000a';
const u = (n: number) => `b3000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, T1, T2, T1_ROW, T2_ROW, SCI] = [u(11), u(12), u(13), u(14), u(15), u(16)];
const [C6A, C6B] = [u(21), u(22)];
const [ASHA, BELA, DEV, CHIRAG, GITA] = [u(31), u(32), u(33), u(34), u(35)];
const [P_ASHA, P_BELA, P_DEV, P_CHIRAG, P_GITA] = [u(41), u(42), u(43), u(44), u(45)];
const f = (c: string, n: number) => `fb300000-0000-4000-8000-0000000${c}${String(n).padStart(4, '0')}`;
const ACC = { A: f('a', 1), B: f('a', 2), C: f('a', 3), E: f('a', 4), F: f('a', 5), G: f('a', 6) };
const KID = { A: f('c', 1), B: f('c', 2), C: f('c', 3), E: f('c', 4), F: f('c', 5), G: f('c', 6) };
const CONV = { A_SCI: f('d', 1), A_MATH: f('d', 2), B: f('d', 3), C: f('d', 4), E: f('d', 5), F: f('d', 6), G: f('d', 7) };
const WATER = 'nc.showcase.water-cycle';
const FRACTIONS = 'nc.showcase.equal-fractions';
const WATER_EN = 'The water cycle: where rain comes from';
const FRACTIONS_EN = 'Equal fractions: same amount, different names';
const SECRET = 'ZEBRA-WORDS-ONLY-THE-CHILD-TYPED';

const WEEK = addDays(mondayOf(indiaDate()), -7);
const at = (day: number, hour = 10) => `${addDays(WEEK, day)}T${String(hour).padStart(2, '0')}:00:00+05:30`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Who = { role: string; user: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const principal: Who = { role: 'principal', user: PRINCIPAL };
const teacher1: Who = { role: 'teacher', user: T1 };
const teacher2: Who = { role: 'teacher', user: T2 };
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });

let deps: ReportDeps;
const reportOf = async (account: string, child: string): Promise<ReportBody | undefined> => (await q(`select body from family.parent_reports where account_id = $1 and child_id = $2 and week_start = $3::date`, [account, child, WEEK]))[0]?.body;
const emails = async () => (await q(`select idempotency_key, payload from jobs where type = 'email.send' order by idempotency_key`)) as { idempotency_key: string; payload: { to: string[]; template: string; data: Record<string, string> } }[];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-parent-report-tests-0123456789';
  const msg = (acc: string, kid: string, conv: string, day: number, chapter: string | null, block: string | null, n: number) =>
    Array.from({ length: n }, (_, i) => `('${conv}', '${acc}', '${kid}', 'child', '${SECRET} ${i}', ${chapter ? `'${chapter}'` : 'null'}, ${block ? `'${block}'` : 'null'}, '${at(day, 9 + i)}')`).join(', ');
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal'),
      ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Tara Teacher'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Tom Teacher');
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_ROW}', '${A}', '${T1}', 'Tara Teacher'), ('${T2_ROW}', '${A}', '${T2}', 'Tom Teacher');
    insert into classes (class_id, school_id, name) values ('${C6A}', '${A}', '6-A'), ('${C6B}', '${A}', '6-B');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T1_ROW}', '${SCI}', '${C6A}'), ('${A}', '${T2_ROW}', '${SCI}', '${C6B}');
    insert into students (student_id, school_id, admission_no, name, status, class_id) values
      ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C6A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C6A}'), ('${DEV}', '${A}', 'A-3', 'Dev', 'active', '${C6A}'),
      ('${CHIRAG}', '${A}', 'A-4', 'Chirag', 'active', '${C6A}'), ('${GITA}', '${A}', 'B-1', 'Gita', 'active', '${C6B}');
    insert into parents (parent_id, school_id, name, phone) values ('${P_ASHA}', '${A}', 'Guardian of Asha', '9000000001'), ('${P_BELA}', '${A}', 'Guardian of Bela', '9000000002'),
      ('${P_DEV}', '${A}', 'Guardian of Dev', '9000000003'), ('${P_CHIRAG}', '${A}', 'Guardian of Chirag', '9000000004'), ('${P_GITA}', '${A}', 'Guardian of Gita', '9000000005');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P_ASHA}', '${ASHA}'), ('${A}', '${P_BELA}', '${BELA}'), ('${A}', '${P_DEV}', '${DEV}'), ('${A}', '${P_CHIRAG}', '${CHIRAG}'), ('${A}', '${P_GITA}', '${GITA}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', s, 'core_records', true, 'school_attested', 'v1' from unnest(array['${ASHA}'::uuid, '${BELA}'::uuid, '${DEV}'::uuid, '${CHIRAG}'::uuid, '${GITA}'::uuid]) s;
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values ('${A}', '${CHIRAG}', 'core_records', false, 'school_attested', 'v1', now() + interval '1 second');
    insert into attendance (school_id, student_id, class_id, date, status) values
      ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 0)}', 'present'), ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 1)}', 'present'), ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 2)}', 'absent'),
      ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 3)}', 'late'), ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 4)}', 'present'), ('${A}', '${ASHA}', '${C6A}', '${addDays(WEEK, 7)}', 'absent');

    insert into family.accounts (account_id, email, ui_language) values ('${ACC.A}', 'asha-family@example.invalid', 'en'), ('${ACC.B}', 'bela-family@example.invalid', 'hi'),
      ('${ACC.C}', 'dev-family@example.invalid', 'en'), ('${ACC.E}', 'chirag-family@example.invalid', 'en'), ('${ACC.F}', 'farah-family@example.invalid', 'en'), ('${ACC.G}', 'gita-family@example.invalid', 'en');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version)
      select a, 'study_core', true, 'parent_tap', 'v1' from unnest(array['${ACC.A}'::uuid, '${ACC.B}'::uuid, '${ACC.C}'::uuid, '${ACC.E}'::uuid, '${ACC.F}'::uuid, '${ACC.G}'::uuid]) a;
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${KID.A}', '${ACC.A}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KID.B}', '${ACC.B}', 'Bela', 6, 'CBSE', 'hi', 'hi', 'IN-HR'),
      ('${KID.C}', '${ACC.C}', 'Dev', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KID.E}', '${ACC.E}', 'Chirag', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${KID.F}', '${ACC.F}', 'Farah', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${KID.G}', '${ACC.G}', 'Gita', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (account_id, school_id, parent_id) values ('${ACC.A}', '${A}', '${P_ASHA}'), ('${ACC.B}', '${A}', '${P_BELA}'), ('${ACC.C}', '${A}', '${P_DEV}'), ('${ACC.E}', '${A}', '${P_CHIRAG}'), ('${ACC.G}', '${A}', '${P_GITA}');
    insert into family.child_links (child_id, link_id, account_id, student_id)
      select k.child_id, l.link_id, l.account_id, k.student_id from family.school_links l
        join (values ('${ACC.A}'::uuid, '${KID.A}'::uuid, '${ASHA}'::uuid), ('${ACC.B}'::uuid, '${KID.B}'::uuid, '${BELA}'::uuid), ('${ACC.C}'::uuid, '${KID.C}'::uuid, '${DEV}'::uuid),
                     ('${ACC.E}'::uuid, '${KID.E}'::uuid, '${CHIRAG}'::uuid), ('${ACC.G}'::uuid, '${KID.G}'::uuid, '${GITA}'::uuid)) k(account_id, child_id, student_id) on k.account_id = l.account_id;
    insert into family.notify_off (account_id, kind) values ('${ACC.F}', 'notices');
    insert into family.tutor_conversations (conversation_id, account_id, child_id, subject) values
      ('${CONV.A_SCI}', '${ACC.A}', '${KID.A}', 'science'), ('${CONV.A_MATH}', '${ACC.A}', '${KID.A}', 'mathematics'), ('${CONV.B}', '${ACC.B}', '${KID.B}', 'science'),
      ('${CONV.C}', '${ACC.C}', '${KID.C}', 'mathematics'), ('${CONV.E}', '${ACC.E}', '${KID.E}', 'science'), ('${CONV.F}', '${ACC.F}', '${KID.F}', 'science'), ('${CONV.G}', '${ACC.G}', '${KID.G}', 'science');
    insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, chapter_key, block_id, created_at) values
      ${msg(ACC.A, KID.A, CONV.A_SCI, 1, WATER, 'wc-intro', 3)}, ${msg(ACC.A, KID.A, CONV.A_SCI, 2, null, null, 1)}, ${msg(ACC.A, KID.A, CONV.A_MATH, 2, FRACTIONS, null, 1)},
      ${msg(ACC.B, KID.B, CONV.B, 3, WATER, 'wc-intro', 2)}, ${msg(ACC.C, KID.C, CONV.C, 4, FRACTIONS, null, 1)}, ${msg(ACC.E, KID.E, CONV.E, 1, WATER, 'wc-intro', 4)},
      ${msg(ACC.F, KID.F, CONV.F, 5, null, null, 1)}, ${msg(ACC.G, KID.G, CONV.G, 2, WATER, null, 1)};
    -- Outside the week: never counted.
    insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, created_at) values ('${CONV.A_SCI}', '${ACC.A}', '${KID.A}', 'child', 'before', '${at(-1)}');
    insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, created_at) values ('${CONV.A_SCI}', '${ACC.A}', '${KID.A}', 'tutor', '[]'::jsonb, '${at(1, 11)}');
    insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, mcq_total, mcq_correct, submitted_at) values
      ('${ACC.A}', '${KID.A}', '${FRACTIONS}', 'ef-intro', 5, 2, '${at(2, 18)}'), ('${ACC.A}', '${KID.A}', '${WATER}', 'wc-intro', 5, 4, '${at(3, 18)}');
    insert into family.day_counts (account_id, child_id, day, voice_seconds) values ('${ACC.A}', '${KID.A}', '${addDays(WEEK, 1)}', 120), ('${ACC.A}', '${KID.A}', '${addDays(WEEK, 2)}', 60);
  `);
  const { withPlatformService } = await import('@/lib/auth/db');
  deps = { platform: withPlatformService, queue: createPgJobQueue(withPlatformService as never) };
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the counts (pure)', () => {
  it('sessions are conversation-days, chapters are asked or quizzed, weak is a quiz under 60 or asked three times', () => {
    const c = buildCounts({
      asked: [
        { conversationId: 'c1', day: '2026-10-27', chapterKey: 'k.one', n: 3 },
        { conversationId: 'c1', day: '2026-10-28', chapterKey: null, n: 1 },
        { conversationId: 'c2', day: '2026-10-28', chapterKey: 'k.two', n: 1 },
      ],
      quizzes: [{ chapterKey: 'k.two', correct: 2, total: 5 }, { chapterKey: 'k.three', correct: 5, total: 5 }],
      voiceSeconds: 150,
      name: (k) => k.toUpperCase(),
      school: null,
    });
    expect(c).toMatchObject({ sessions: 3, questions: 5, quizAverage: 70, voiceMinutes: 3, weak: ['K.ONE', 'K.TWO'] });
    expect(c.chapters.map((x) => x.name)).toEqual(['K.ONE', 'K.TWO', 'K.THREE']);
    expect(rulesSentences(c, 'en')).toHaveLength(4);
    expect(rulesSentences(c, 'hi').join(' ')).toMatch(/[ऀ-ॿ]/);
  });

  it('a model answer is kept only with the counts’ own numbers and no child’s name', () => {
    const c = buildCounts({ asked: [{ conversationId: 'c', day: '2026-10-27', chapterKey: null, n: 4 }], quizzes: [], voiceSeconds: 0, name: (k) => k, school: null });
    const good = 'Your child had 1 study session this week. They asked 4 questions. No quiz was taken. Ask them to explain one idea at home.';
    expect(checkedSentences(good, c, ['Asha'])).toHaveLength(4);
    expect(checkedSentences(good.replace('4 questions', '9 questions'), c, ['Asha'])).toBeNull();
    expect(checkedSentences(good.replace('Your child', 'Asha'), c, ['Asha'])).toBeNull();
    expect(checkedSentences('Too short.', c, [])).toBeNull();
  });
});

describe('the weekly job', () => {
  it('the same job type the registry names; ai.ops_daily queues one job an account with a session, on a Sunday only, once', async () => {
    expect(TUTOR_PARENT_REPORT_JOB).toBe(REGISTRY_JOB);
    const ran: string[] = [];
    const ops = withWeeklyReports(async (job: { payload: Record<string, unknown>; attempts: number }) => void ran.push(String(job.payload.date)), deps);
    await ops({ payload: { date: addDays(WEEK, 5) }, attempts: 1 }); // a Saturday
    expect(await q(`select 1 from jobs where type = $1`, [TUTOR_PARENT_REPORT_JOB])).toHaveLength(0);
    await ops({ payload: { date: addDays(WEEK, 6) }, attempts: 1 }); // the Sunday
    await ops({ payload: { date: addDays(WEEK, 6) }, attempts: 2 });
    expect(ran).toHaveLength(3);
    const jobs = (await q(`select idempotency_key, payload from jobs where type = $1 order by idempotency_key`, [TUTOR_PARENT_REPORT_JOB])) as { idempotency_key: string; payload: { accountId: string; week: string } }[];
    expect(jobs.map((j) => j.payload.accountId).sort()).toEqual(Object.values(ACC).sort());
    expect(jobs.every((j) => j.payload.week === WEEK && j.idempotency_key === `${TUTOR_PARENT_REPORT_JOB}:${j.payload.accountId}:${WEEK}`)).toBe(true);
    expect(await enqueueWeeklyReports(deps, WEEK)).toBe(6);
    expect(await q(`select 1 from jobs where type = $1`, [TUTOR_PARENT_REPORT_JOB])).toHaveLength(6);
  });

  it('no provider: the rules-only report from the right counts, with the school’s attendance, and none of another family’s rows', async () => {
    expect((await q(`select provider_id from control.ai_profiles where profile_id = 'family.parent_report'`))[0].provider_id).toBeNull();
    const written = await writeWeeklyReports(deps, ACC.A, WEEK);
    expect(written).toEqual([{ childId: KID.A, source: 'rules', emailed: true }]);
    const body = (await reportOf(ACC.A, KID.A))!;
    expect(body.source).toBe('rules');
    expect(body.counts).toEqual({
      sessions: 3,
      questions: 5,
      chapters: [
        { key: WATER, name: WATER_EN, asked: 3 },
        { key: FRACTIONS, name: FRACTIONS_EN, asked: 1 },
      ],
      quizzes: [
        { chapter: FRACTIONS_EN, percent: 40 },
        { chapter: WATER_EN, percent: 80 },
      ],
      quizAverage: 60,
      weak: [WATER_EN, FRACTIONS_EN],
      voiceMinutes: 3,
      school: { presentDays: 4, markedDays: 5, results: [] },
    });
    expect(body.sentences).toHaveLength(4);
    expect(body.sentences[0]).toContain('3 study sessions');
    // Bela's family (same school, same class, same chapter) is not in Asha's counts, and Bela's report is her own.
    await writeWeeklyReports(deps, ACC.B, WEEK);
    const bela = (await reportOf(ACC.B, KID.B))!;
    expect(bela.counts).toMatchObject({ sessions: 1, questions: 2, quizAverage: null, voiceMinutes: 0 });
    expect(bela.lang).toBe('hi');
    expect(bela.counts.chapters.map((c) => c.name)).toEqual(['जल चक्र: बारिश कहाँ से आती है']);
    expect(JSON.stringify(body)).not.toContain('Bela');
  });

  it('no child’s words in the body or the prompt, and no name in the prompt; a model answer is kept, an invented number is not', async () => {
    const prompts: { system: string; user: string }[] = [];
    const answer = 'Your child had 3 study sessions this week and asked 5 questions. The chapters were the water cycle and equal fractions. Two quizzes gave an average of 60%. Go over the water cycle together at home.';
    const write: ReportDeps['write'] = async (p) => {
      prompts.push(p);
      return answer.replace('Two quizzes', '2 quizzes');
    };
    expect(await writeWeeklyReports({ ...deps, write }, ACC.A, WEEK)).toEqual([{ childId: KID.A, source: 'ai', emailed: true }]);
    const body = (await reportOf(ACC.A, KID.A))!;
    expect(body.source).toBe('ai');
    expect(body.sentences).toHaveLength(4);
    for (const text of [JSON.stringify(body), ...prompts.map((p) => p.system + p.user)]) expect(text).not.toContain(SECRET);
    for (const p of prompts) expect(`${p.system}${p.user}`).not.toMatch(/Asha|Bela|Guardian/);
    expect(prompts[0].user).toContain('Study sessions: 3');
    // A number the counts do not hold: the rules-only report instead.
    await writeWeeklyReports({ ...deps, write: async () => answer.replace('5 questions', '50 questions').replace('Two quizzes', '2 quizzes') }, ACC.A, WEEK);
    expect((await reportOf(ACC.A, KID.A))!.source).toBe('rules');
    // Rewritten, never doubled.
    expect(await q(`select 1 from family.parent_reports where account_id = $1`, [ACC.A])).toHaveLength(1);
  });

  it('the feed shows "This week with" the child; the email goes to the account’s own address, never when notices are off', async () => {
    await writeWeeklyReports(deps, ACC.F, WEEK);
    const { withFamilyContext } = await import('@/lib/auth/db');
    const { readNotifications } = await import('@/lib/family/notifications');
    const feed = await withFamilyContext({ accountId: ACC.F, tokenVersion: 0 }, (c) => readNotifications(c, { accountId: ACC.F, tokenVersion: 0 }, ACC.F, { childId: KID.F }));
    expect(feed.filter((i) => i.kind === 'report')).toEqual([{ id: `report.${WEEK}`, kind: 'report', weekStart: WEEK, href: `/family/parent/progress/${KID.F}` }]);
    const mails = await emails();
    expect(mails.map((m) => m.payload.to[0]).sort()).toEqual(['asha-family@example.invalid', 'bela-family@example.invalid']);
    const asha = mails.find((m) => m.payload.to[0] === 'asha-family@example.invalid')!;
    expect(asha.idempotency_key).toBe(`email.send:${TUTOR_PARENT_REPORT_JOB}:${ACC.A}:${KID.A}:${WEEK}`);
    expect(asha.payload).toMatchObject({ template: 'family_weekly_report', data: { lang: 'en', childName: 'Asha', weekStart: WEEK } });
    const mail = renderEmail('family_weekly_report', asha.payload.data);
    expect(mail.subject).toContain('This week with Asha');
    expect(mail.text).not.toContain(SECRET);
    expect(renderEmail('family_weekly_report', { ...asha.payload.data, childName: '<b>x</b>' }).html).not.toContain('<b>x</b>');
  });

  it('another account’s job, or a week with no session, writes nothing for anyone else', async () => {
    expect(await writeWeeklyReports(deps, ACC.F, addDays(WEEK, -7))).toEqual([]);
    expect(await writeWeeklyReports(deps, ACC.F, addDays(WEEK, 1))).toEqual([]);
    const own = await q(`select account_id, child_id from family.parent_reports order by account_id`);
    expect(own.every((r: { account_id: string; child_id: string }) => Object.entries(ACC).some(([k, a]) => a === r.account_id && KID[k as keyof typeof KID] === r.child_id))).toBe(true);
  });
});

describe('the school’s side: counts only', () => {
  it('the class summary is a draft notice per class (three children or more), waiting for the principal; nothing is delivered or drafted twice', async () => {
    const { draftClassSummaries, readClassSummaries } = await import('@/lib/parent-ai/doubts');
    const sums = await as(principal, (c) => readClassSummaries(c, actor(principal), 'en', WEEK));
    // 6-A: Asha, Bela and Dev (Chirag's consent is withdrawn); 6-B has one child, so no summary.
    expect(sums).toEqual([{ classId: C6A, className: '6-A', children: 3, sessions: 5, questions: 8, quizzes: 2, quizPercent: 60, chapters: [WATER_EN, FRACTIONS_EN] }]);
    expect(await as(principal, (c) => draftClassSummaries(c, actor(principal), 'en', WEEK))).toEqual({ ok: true, drafted: 1, already: 0 });
    expect(await as(principal, (c) => draftClassSummaries(c, actor(principal), 'en', WEEK))).toEqual({ ok: true, drafted: 0, already: 1 });
    const notices = await q(`select class_id, status, body, written_by from class_notices`);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ class_id: C6A, status: 'waiting', written_by: PRINCIPAL });
    expect(notices[0].body).toContain('3 children of 6-A');
    expect(notices[0].body).not.toMatch(/Asha|Bela|Dev|Chirag|ZEBRA/);
    expect(await q(`select 1 from communication_log`)).toHaveLength(0);
    expect(await q(`select 1 from jobs where type in ('whatsapp.send') or (type = 'email.send' and payload ->> 'template' = 'school_notice')`)).toHaveLength(0);
    // A teacher may neither read nor draft them.
    expect(await as(teacher1, (c) => draftClassSummaries(c, actor(teacher1), 'en', WEEK))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(teacher1, (c) => c.query(`select * from family.class_week_summary($1::date)`, [WEEK]).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
  });

  it('the teacher’s doubts: subject, chapter, topic and a count for their own class (three linked children or more); nothing for a class they do not teach', async () => {
    const { readRecentDoubts, DOUBT_DAYS } = await import('@/lib/parent-ai/doubts');
    const mine = await as(teacher1, (c) => readRecentDoubts(c, actor(teacher1), 'en'));
    expect(mine.map((c) => c.className)).toEqual(['6-A']);
    expect(mine[0].doubts.map((d) => [d.subject, d.chapter, d.count])).toEqual([
      ['science', WATER_EN, 5],
      ['mathematics', FRACTIONS_EN, 2],
      // the last 14 days, not the report's week: the question asked the day before the week counts here, while it is
      // still within 14 days of now (on a Sunday it has just left the window)
      ['science', null, Date.parse(at(-1)) >= Date.now() - DOUBT_DAYS * 86_400_000 ? 2 : 1],
    ]);
    expect(typeof mine[0].doubts[0].topic).toBe('string');
    const raw: Record<string, unknown>[] = await as(teacher1, (c) => c.query(`select * from family.doubts_for_class($1::uuid, 14)`, [C6A]).then((r: { rows: Record<string, unknown>[] }) => r.rows));
    expect(Object.keys(raw[0]).sort()).toEqual(['chapter_key', 'doubts', 'subject', 'title_en', 'title_hi', 'topic_key']);
    expect(JSON.stringify(raw)).not.toMatch(/Asha|Bela|Dev|ZEBRA|fb30/);
    expect(await as(teacher1, (c) => c.query(`select * from family.doubts_for_class($1::uuid, 14)`, [C6B]).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // 6-B has one linked child who asked: fewer than three, so the teacher sees nothing of that one child (security review of W16).
    expect(await as(teacher2, (c) => readRecentDoubts(c, actor(teacher2), 'en'))).toEqual([]);
    expect(await as(teacher2, (c) => c.query(`select * from family.doubts_for_class($1::uuid, 14)`, [C6B]).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect((await as(principal, (c) => readRecentDoubts(c, actor(principal), 'en'))).map((c) => c.className)).toEqual(['6-A']);
    // The platform and a family cannot call it.
    await expect(db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
      await tx.query('set local role family_app');
      return tx.query(`select * from family.doubts_for_class($1::uuid, 14)`, [C6A]);
    })).rejects.toThrow(/permission denied/);
  });
});
