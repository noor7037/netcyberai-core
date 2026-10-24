import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, the Daily Pulse in the app (C336, R9; C230-AD answer 3), on the real schema through the real pool.
//   1. A linked family reads the Pulse the school sent to its matched child's class in the last 7 days, newest first,
//      and its own answers; never a message not yet sent, another class's or another school's.
//   2. With the school's consent for messages, the parent answers in the app: the same answer row and the same
//      teacher's follow-up a WhatsApp answer makes, seen by that class's teacher only. One answer per message.
//   3. Refused: a message sent more than 24 hours ago, another class's or school's, a child not the guardian's, a child
//      without the consent for messages (read only), the family role, a staff session.
//   4. A parent never writes the school's tables directly.

const A = 'd8000000-0000-4000-8000-00000000000a';
const B = 'd8000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd8000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd8000000-0000-4000-8000-0000000000a2';
const TEACHER_6B = 'd8000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'd8000000-0000-4000-8000-0000000000b1';
const P1 = 'd8000000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A), the linked family
const P2 = 'd8000000-0000-4000-8000-0000000000e2'; // guardian of S2 (6-A), who answers by WhatsApp
const S1 = 'd8000000-0000-4000-8000-0000000005a1';
const S2 = 'd8000000-0000-4000-8000-0000000005a2';
const C6A = 'd8000000-0000-4000-8000-0000000000c6';
const C6B = 'd8000000-0000-4000-8000-0000000000c7';
const CB = 'd8000000-0000-4000-8000-0000000000cb';
const SCI = 'd8000000-0000-4000-8000-0000000000d1';
const SCI_B = 'd8000000-0000-4000-8000-0000000000db';
const T_ROW = 'd8000000-0000-4000-8000-0000000000f1';
const T_ROW_6B = 'd8000000-0000-4000-8000-0000000000f2';
const M = (n: number) => `d8000000-0000-4000-8000-0000000007${n.toString().padStart(2, '0')}`;
const NOW = M(1); // 6-A, sent now
const HOUR = M(2); // 6-A, sent an hour ago
const TWO_DAYS = M(3); // 6-A, sent two days ago: shown, no longer answered
const OLD = M(4); // 6-A, sent ten days ago: not listed
const READY = M(5); // 6-A, marked ready, not sent
const DRAFT = M(6); // 6-A, a draft
const SIX_B = M(7); // 6-B, sent now
const OTHER = M(8); // school B, sent now
const LATER = M(9); // 6-A, sent now, answered once the consent is withdrawn
const ACCOUNT = 'f5000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f5000000-0000-4000-8000-0000000000b1';
const CHILD = 'f5000000-0000-4000-8000-0000000000c1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let link = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string, school = A) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asGuardian = async <T>(fn: (c: any) => Promise<T>): Promise<T> => (await import('@/lib/auth/db')).withGuardianContext(claims, link, fn);
// A refused write comes back as 0 (a row rule, a missing right, or no row it may change); any other error as its
// message, so a mistyped statement cannot pass for a refusal. Plain statements: the throwaway database's socket
// mishandles an error raised while a statement with parameters is planned.
const changes = async (sql: string): Promise<number | string> => {
  try {
    return (await asGuardian<{ rowCount: number | null }>((c) => c.query(sql))).rowCount ?? 0;
  } catch (e) {
    const m = String((e as Error).message);
    return /row-level security|permission denied/.test(m) ? 0 : m;
  }
};
const links = async (account = ACCOUNT) => {
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { activeLinks } = await import('@/lib/family/school');
  return withFamilyContext({ accountId: account, tokenVersion: 0 }, (c) => activeLinks(c, account));
};
const answer = async (pulseId: string, a: 'understood' | 'needs_help', studentId = S1) => {
  const { answerSchoolPulse } = await import('@/lib/family/school');
  return answerSchoolPulse(claims, await links(), { linkId: link, studentId, pulseId, answer: a });
};
const pulseOf = async () => {
  const { linkedSchool } = await import('@/lib/family/school');
  return (await linkedSchool(claims, link, [S1]))!.children.find((c) => c.studentId === S1)!.pulse!;
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  const pulse = (id: string, school: string, cls: string, status: string, sentAgo: string | null, words: string) =>
    `('${id}', '${school}', '${cls}', 'Topic', '${status}', '${words}', '${words} (hi)', '${words} (hinglish)', '${school === A ? PRINCIPAL : PRINCIPAL_B}', ${sentAgo === null ? 'null' : `'${school === A ? PRINCIPAL : PRINCIPAL_B}'`}, ${sentAgo === null ? 'null' : `now() - interval '${sentAgo}'`}, ${sentAgo === null ? 'current_date' : `(now() - interval '${sentAgo}')::date`})`;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${TEACHER_6B}', '${A}', 't6b@a.invalid', 'teacher', 'Tanvi Teacher', true),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Pavan Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${TEACHER_6B}', '${A}', 'teacher', true), ('${PRINCIPAL_B}', '${B}', 'principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T_ROW}', '${A}', '${TEACHER}', 'Tara Teacher'), ('${T_ROW_6B}', '${A}', '${TEACHER_6B}', 'Tanvi Teacher');
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C6B}', '${A}', '6-B', '6', 'B'), ('${CB}', '${B}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${SCI_B}', '${B}', 'Science');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T_ROW}', '${SCI}', '${C6A}'), ('${A}', '${T_ROW_6B}', '${SCI}', '${C6B}');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bina Shah', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Meera Shah', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${S1}', '${S2}']::uuid[]) s, unnest(array['core_records', 'operational_communication']) p;
    insert into pulse_messages (pulse_id, school_id, class_id, topic, status, body_en, body_hi, body_hinglish, created_by, sent_by, sent_at, sent_on) values
      ${pulse(NOW, A, C6A, 'sent', '1 minute', '6-A, Science: today the class learned “Magnets”.')},
      ${pulse(HOUR, A, C6A, 'sent', '1 hour', '6-A, Mathematics: today the class began “Fractions”.')},
      ${pulse(TWO_DAYS, A, C6A, 'sent', '2 days', 'Two days ago')},
      ${pulse(OLD, A, C6A, 'sent', '10 days', 'Ten days ago')},
      ${pulse(READY, A, C6A, 'ready', null, 'Ready, not sent')},
      ${pulse(DRAFT, A, C6A, 'draft', null, 'A draft')},
      ${pulse(SIX_B, A, C6B, 'sent', '1 minute', 'Only for 6-B')},
      ${pulse(OTHER, B, CB, 'sent', '1 minute', 'Another school')};
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER_ACCOUNT}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
  // The real path: the principal makes a code for P1, the family spends it and matches its child to S1.
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await asStaff('principal', PRINCIPAL)((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, issued.code));
  link = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, link, [S1], [{ studentId: S1, childId: CHILD }]));
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('a linked family reads the school’s Daily Pulse (C336)', () => {
  it('shows the last week’s messages sent to the child’s class, newest first, with both languages; open for 24 hours', async () => {
    const pulse = await pulseOf();
    expect(pulse.canAnswer).toBe(true);
    expect(pulse.items.map((p) => [p.pulseId, p.open, p.answer])).toEqual([
      [NOW, true, null],
      [HOUR, true, null],
      [TWO_DAYS, false, null],
    ]);
    expect(pulse.items[0].body).toEqual({ en: '6-A, Science: today the class learned “Magnets”.', hi: '6-A, Science: today the class learned “Magnets”. (hi)' });
  });

  it('as the guardian, the school’s rules let through only sent messages of the child’s class', async () => {
    const seen = await asGuardian(async (c) => (await c.query(`select pulse_id from pulse_messages order by pulse_id`)).rows.map((r: { pulse_id: string }) => r.pulse_id));
    // Ready, draft, 6-B's and the other school's stay out; ten days ago is readable but not listed.
    expect(seen).toEqual([NOW, HOUR, TWO_DAYS, OLD]);
  });

  it('an unmatched child and the family role see none of it', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    expect((await linkedSchool(claims, link, []))!.children.find((c) => c.studentId === S1)!.pulse).toBeNull();
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from pulse_messages`))).rejects.toThrow();
  });
});

describe('the parent answers in the app as by WhatsApp (C230-AD)', () => {
  it('“needs help” is counted and opens the follow-up in the teacher’s queue, for that class’s teacher only', async () => {
    expect(await answer(NOW, 'needs_help')).toBe('recorded');
    expect(await q(`select tier, parent_id, provider_message_id from pulse_response_log where pulse_id = $1`, [NOW])).toEqual([{ tier: 2, parent_id: P1, provider_message_id: `app:${NOW}:${S1}:${P1}` }]);
    const { listFollowups } = await import('@/lib/pulse/followups');
    const { listSent } = await import('@/lib/pulse/drafts');
    const open = (await asStaff('teacher', TEACHER)((c) => listFollowups(c, A))).open;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ student_id: S1, class_id: C6A, kind: 'did_not_understand', source: 'parent_reply', status: 'open' });
    expect((await asStaff('teacher', TEACHER_6B)((c) => listFollowups(c, A))).open).toEqual([]);
    const day = (await q(`select (now() - interval '1 minute')::date::text as d`))[0].d as string;
    const sent = await asStaff('teacher', TEACHER)((c) => listSent(c, A, day, day));
    expect(sent.find((d: { pulse_id: string }) => d.pulse_id === NOW)).toMatchObject({ understood: 0, needs_help: 1 });
    expect((await pulseOf()).items[0].answer).toBe('needs_help');
  });

  it('writes what a WhatsApp “2” writes: the same answer and the same follow-up', async () => {
    // Bina's guardian was sent the same message by WhatsApp and replies "2" there.
    await q(
      `insert into communication_log (school_id, channel, status, to_phone, template_name, student_id, parent_id, dedupe_key, purpose)
       values ($1, 'whatsapp', 'sent', '+919800000002', 'daily_pulse', $2, $3, $4, 'daily_pulse')`,
      [A, S2, P2, `pulse:${NOW}:${S2}:${P2}`]
    );
    const { notePulseReply } = await import('@/lib/pulse/replies');
    const reply = await db.pg.transaction(async (c: { query: (s: string) => Promise<unknown> }) => {
      await c.query('set local role nca_super');
      return notePulseReply(c as never, { schoolId: A, phone: '+919800000002', text: '2', at: new Date().toISOString(), providerMessageId: 'wamid.test-1' });
    });
    expect(reply).toEqual({ recorded: true, answer: 'needs_help', followupOpened: true });
    const rows = await q(
      `select r.student_id, r.tier, f.class_id, f.kind, f.source, f.status, f.created_by from pulse_response_log r
         join pulse_followups f on f.school_id = r.school_id and f.student_id = r.student_id where r.pulse_id = $1 order by r.student_id`,
      [NOW]
    );
    const same = ({ student_id: _s, ...rest }: Record<string, unknown>) => rest;
    expect(rows.map((r: Record<string, unknown>) => r.student_id)).toEqual([S1, S2]);
    expect(same(rows[0])).toEqual(same(rows[1]));
  });

  it('one answer per message: a second is “already” and changes nothing', async () => {
    expect(await answer(NOW, 'understood')).toBe('already');
    expect(await q(`select count(*)::int as n from pulse_response_log where pulse_id = $1 and student_id = $2`, [NOW, S1])).toEqual([{ n: 1 }]);
  });

  it('“understood” is counted and opens nothing; the open follow-up stays one', async () => {
    expect(await answer(HOUR, 'understood')).toBe('recorded');
    expect(await q(`select tier from pulse_response_log where pulse_id = $1`, [HOUR])).toEqual([{ tier: 1 }]);
    expect(await q(`select count(*)::int as n from pulse_followups where student_id = $1`, [S1])).toEqual([{ n: 1 }]);
  });

  it('refused: sent more than 24 hours ago, not sent, another class’s or school’s, a child not the guardian’s', async () => {
    const before = await q(`select count(*)::int as n from pulse_response_log`);
    expect(await answer(TWO_DAYS, 'needs_help')).toBe('closed');
    for (const id of [READY, DRAFT, SIX_B, OTHER]) expect(await answer(id, 'needs_help'), id).toBe('not_found');
    // Bina is not this family's: refused by the app (not matched) and by the database (not the guardian's child).
    expect(await answer(NOW, 'needs_help', S2)).toBe('not_found');
    expect(await asGuardian(async (c) => (await c.query(`select public.guardian_pulse_answer('${HOUR}', '${S2}', 'needs_help') as r`)).rows[0].r)).toBe('not_found');
    // Another family's account holds no link to this guardian.
    const { answerSchoolPulse } = await import('@/lib/family/school');
    expect(await answerSchoolPulse({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, await links(OTHER_ACCOUNT), { linkId: link, studentId: S1, pulseId: NOW, answer: 'understood' })).toBe('not_found');
    expect(await q(`select count(*)::int as n from pulse_response_log`)).toEqual(before);
  });

  it('only a guardian’s session may answer; the family role cannot call it; an answer is one of two', async () => {
    const said = async (fn: () => Promise<unknown>) => fn().then(() => 'ran', (e: Error) => String(e.message));
    expect(await said(() => asStaff('principal', PRINCIPAL)((c) => c.query(`select public.guardian_pulse_answer('${NOW}', '${S1}', 'understood')`)))).toMatch(/only a guardian/);
    const { withFamilyContext } = await import('@/lib/auth/db');
    expect(await said(() => withFamilyContext(claims, (c) => c.query(`select public.guardian_pulse_answer('${NOW}', '${S1}', 'understood')`)))).toMatch(/permission denied/);
    expect(await said(() => asGuardian((c) => c.query(`select public.guardian_pulse_answer('${NOW}', '${S1}', 'maybe')`)))).toMatch(/understood or needs_help/);
  });

  it('a parent never writes the school’s tables directly', async () => {
    const writes = [
      `insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier) values ('${A}', '${HOUR}', '${S1}', '${P1}', 2)`,
      `update pulse_response_log set tier = 2 where pulse_id = '${HOUR}'`,
      `delete from pulse_response_log where pulse_id = '${HOUR}'`,
      `insert into pulse_followups (school_id, student_id, class_id, kind, source) values ('${A}', '${S1}', '${C6A}', 'other', 'parent_reply')`,
      `update pulse_messages set body_en = 'changed' where pulse_id = '${NOW}'`,
      `delete from pulse_messages where pulse_id = '${NOW}'`,
      `insert into pulse_messages (school_id, class_id, topic, status, created_by) values ('${A}', '${C6A}', 'x', 'draft', '${P1}')`,
    ];
    for (const sql of writes) expect(await changes(sql), sql).toBe(0);
    expect(await q(`select tier from pulse_response_log where pulse_id = $1`, [HOUR])).toEqual([{ tier: 1 }]);
    expect(await q(`select body_en from pulse_messages where pulse_id = $1`, [NOW])).toEqual([{ body_en: '6-A, Science: today the class learned “Magnets”.' }]);
  });

  it('without the school’s consent for messages the Pulse is read only', async () => {
    await q(`insert into pulse_messages (pulse_id, school_id, class_id, topic, status, body_en, body_hi, body_hinglish, created_by, sent_by, sent_at) values ($1, $2, $3, 'Topic', 'sent', 'Later', 'Later (hi)', 'Later (hinglish)', $4, $4, now())`, [LATER, A, C6A, PRINCIPAL]);
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'operational_communication', false, 'school_attested', 'v1')`, [A, S1]);
    const pulse = await pulseOf();
    expect(pulse.canAnswer).toBe(false);
    expect(pulse.items.map((p) => p.pulseId)).toContain(LATER);
    expect(await answer(LATER, 'understood')).toBe('no_consent');
    expect(await q(`select count(*)::int as n from pulse_response_log where pulse_id = $1`, [LATER])).toEqual([{ n: 0 }]);
  });

  it('staff read the Pulse and its answers as before', async () => {
    const all = await asStaff('principal', PRINCIPAL)(async (c) => (await c.query(`select count(*)::int as n from pulse_messages`)).rows[0].n);
    expect(all).toBe(8); // every message of school A, sent or not
    const coordinator = await asStaff('academic_coordinator', PRINCIPAL)(async (c) => (await c.query(`select count(*)::int as n from pulse_messages`)).rows[0].n);
    expect(coordinator).toBe(2); // the ready one and the draft, as before
    const teacher6B = await asStaff('teacher', TEACHER_6B)(async (c) => (await c.query(`select count(*)::int as n from pulse_response_log`)).rows[0].n);
    expect(teacher6B).toBe(0);
    const principalAnswers = await asStaff('principal', PRINCIPAL)(async (c) => (await c.query(`select count(*)::int as n from pulse_response_log`)).rows[0].n);
    expect(principalAnswers).toBe(3);
  });
});
