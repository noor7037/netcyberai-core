import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W20-E (H5): a parent whose Family app is linked to the school books a parent-teacher meeting time, as the guardian
// the connect code was made for. On the real schema through the real pool. Every name is made up.

const A = 'e2000000-0000-4000-8000-00000000000a';
const B = 'e2000000-0000-4000-8000-00000000000b';
const id = (n: number) => `e2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [PRINCIPAL, TARA, TINA, SAM, PRINCIPAL_B, TEACHER_B] = [id(101), id(102), id(103), id(104), id(105), id(106)];
const [C6A, C6B, CB] = [id(201), id(202), id(203)];
const [S1, S2, S3, S4, SB] = [id(301), id(302), id(303), id(304), id(305)];
const [P1, P2, P3, P4, PB] = [id(401), id(402), id(403), id(404), id(405)];
const [ACC1, ACC2, ACC3, ACC4, ACCB, ACC0] = [id(501), id(502), id(503), id(504), id(505), id(506)];
const [CH1, CH2, CH3, CH4, CHB] = [id(601), id(602), id(603), id(604), id(605)];
const [L1, L2, L3, L4, LB] = [id(701), id(702), id(703), id(704), id(705)];
const MATHS = id(801);
const claims = (accountId: string) => ({ accountId, tokenVersion: 0 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const day = (plus: number) => new Date(Date.now() + 5.5 * 3600_000 + plus * 86400_000).toISOString().slice(0, 10);
const HELD_ON = day(3);
let PTM = '';
let PTM_B = '';
let loser: [string, string, string] = ['', '', ''];
const slotOf = async (teacher: string, time: string, ptm = PTM) => (await q(`select slot_id from ptm_slots where ptm_id = $1 and teacher_id = $2 and starts_at = $3::time`, [ptm, teacher, time]))[0].slot_id as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asRole = (school: string, role: string, user: string, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const notify = (email: string) => ({ email, lang: 'en' as const });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w20-e-ptm-tests-0123456789ab';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TARA}', '${A}', 'tara@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${TINA}', '${A}', 'tina@a.invalid', 'teacher', 'Tina Teacher', true), ('${SAM}', '${A}', 'sam@a.invalid', 'teacher', 'Sam Maths', true),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Bina Principal', true), ('${TEACHER_B}', '${B}', 't@b.invalid', 'teacher', 'Bala Teacher', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values
      ('${C6A}', '${A}', '6-A', '6', 'A', '${TARA}'), ('${C6B}', '${A}', '6-B', '6', 'B', '${TINA}'), ('${CB}', '${B}', '6-A', '6', 'A', '${TEACHER_B}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ('${A}', '${C6A}', 1, 2, '${MATHS}', '${SAM}');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6B}', 'active'),
      ('${S3}', '${A}', 'A-3', 'Chirag Das', '${C6A}', 'active'), ('${S4}', '${A}', 'A-4', 'Diya Paul', '${C6A}', 'active'),
      ('${SB}', '${B}', 'B-1', 'Esha Bose', '${CB}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'),
      ('${P3}', '${A}', 'Meena Das', '9800000003', 'Mother'), ('${P4}', '${A}', 'Arun Paul', '9800000004', 'Father'),
      ('${PB}', '${B}', 'Ravi Bose', '9800000009', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values
      ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P3}', '${S3}'), ('${A}', '${P4}', '${S4}'), ('${B}', '${PB}', '${SB}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'),
      ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S4}', 'core_records', true, 'school_attested', 'v1'),
      ('${B}', '${SB}', 'core_records', true, 'school_attested', 'v1');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'ptm', true, 'plan'), ('${B}', 'ptm', true, 'plan')
      on conflict (school_id, module_id) do update set enabled = true;
    insert into family.accounts (account_id, email) values ('${ACC1}', 'one@example.org'), ('${ACC2}', 'two@example.org'), ('${ACC3}', 'three@example.org'),
      ('${ACC4}', 'four@example.org'), ('${ACCB}', 'bee@example.org'), ('${ACC0}', 'zero@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CH1}', '${ACC1}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH2}', '${ACC2}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${CH3}', '${ACC3}', 'Chirag', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH4}', '${ACC4}', 'Diya', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${CHB}', '${ACCB}', 'Esha', 6, 'CBSE', 'en', 'en', 'IN-DL');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values
      ('${L1}', '${ACC1}', '${A}', '${P1}'), ('${L2}', '${ACC2}', '${A}', '${P2}'), ('${L3}', '${ACC3}', '${A}', '${P3}'), ('${L4}', '${ACC4}', '${A}', '${P4}'), ('${LB}', '${ACCB}', '${B}', '${PB}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values
      ('${CH1}', '${L1}', '${ACC1}', '${S1}'), ('${CH2}', '${L2}', '${ACC2}', '${S2}'), ('${CH3}', '${L3}', '${ACC3}', '${S3}'), ('${CH4}', '${L4}', '${ACC4}', '${S4}'), ('${CHB}', '${LB}', '${ACCB}', '${SB}');
  `);
  const { createPtm } = await import('@/lib/ptm/ptm');
  const make = (school: string, principal: string, classIds: string[]) =>
    asRole(school, 'principal', principal, (c) => createPtm(c, { schoolId: school, userId: principal, role: 'principal' }, { title: 'Term 1 meeting', heldOn: HELD_ON, startsAt: '10:00', endsAt: '10:30', slotMinutes: 10, classIds, withSubjectTeachers: true }));
  const a = await make(A, PRINCIPAL, [C6A, C6B]);
  const b = await make(B, PRINCIPAL_B, [CB]);
  if (!a.ok || !b.ok) throw new Error('meeting not made');
  PTM = a.ptmId;
  PTM_B = b.ptmId;
  // Invited (the WhatsApp invitation itself is test/ptm's subject).
  await q(`update ptm_events set status = 'invited', invited_by = created_by, invited_at = now()`);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('W20-E: a parent books a meeting time in the Family app', () => {
  it('a linked parent sees only their own child’s class meeting, with the teachers they may meet', async () => {
    const { familyPtmFor } = await import('@/lib/school-link');
    const [m] = await familyPtmFor(claims(ACC1), L1, S1);
    expect(m).toMatchObject({ ptmId: PTM, heldOn: HELD_ON, startsAt: '10:00', endsAt: '10:30' });
    expect(m.teachers.map((t) => [t.teacher, t.classTeacher])).toEqual([['Tara Teacher', true], ['Sam Maths', false]]);
    expect(m.teachers[0].slots.map((s) => [s.time, s.free])).toEqual([['10:00', true], ['10:10', true], ['10:20', true]]);
    // 6-B's guardian meets 6-B's class teacher only; another family's child is nothing to this guardian.
    expect((await familyPtmFor(claims(ACC2), L2, S2))[0].teachers.map((t) => t.teacher)).toEqual(['Tina Teacher']);
    expect(await familyPtmFor(claims(ACC1), L1, S2)).toEqual([]);
    // As the guardian, no slot of a teacher they may not meet is readable at all.
    expect((await asRole(A, 'parent', P1, (c) => c.query(`select distinct teacher_id from ptm_slots`))).rows.map((r: { teacher_id: string }) => r.teacher_id).sort()).toEqual([TARA, SAM].sort());
  });

  it('a draft meeting shows nothing; the route needs parent mode and the account’s own link', async () => {
    const { signFamilySession, signParentMode } = await import('@/lib/family/session');
    const s = { accountId: ACC1, tokenVersion: 0, sessionId: 's1' };
    const cookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
    const { GET } = await import('@/app/api/family/school/ptm/route');
    const get = async (link: string, student: string, c = cookie) => {
      const res = await GET(new NextRequest(`http://localhost/api/family/school/ptm?linkId=${link}&studentId=${student}`, { headers: { cookie: c } }));
      return { status: res.status, body: await res.json() };
    };
    const ok = await get(L1, S1);
    expect(ok.status).toBe(200);
    expect(ok.body.meetings).toHaveLength(1);
    expect((await get(L2, S2)).status).toBe(404); // another account's link
    expect((await get(L1, S1, cookie.replace(/; ncf_parent=[^;]+/, ''))).status).toBe(403);
  });

  it('booking takes the slot: the others see it taken (never by whom), the parent gets the confirmation and the reminder is set', async () => {
    const { bookFamilySlot, familyPtmFor } = await import('@/lib/school-link');
    const r = await bookFamilySlot(claims(ACC1), L1, { studentId: S1, slotId: await slotOf(TARA, '10:00') }, notify('one@example.org'));
    expect(r).toMatchObject({ ok: true, heldOn: HELD_ON, time: '10:00', teacher: 'Tara Teacher' });
    const mine = (await familyPtmFor(claims(ACC1), L1, S1))[0].teachers[0];
    expect(mine.booking).toMatchObject({ time: '10:00', via: 'app' });
    const theirs = (await familyPtmFor(claims(ACC3), L3, S3))[0].teachers[0];
    expect(theirs.booking).toBeNull();
    expect(theirs.slots.find((s) => s.time === '10:00')?.free).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain(P1);
    expect((await asRole(A, 'parent', P3, (c) => c.query(`select * from ptm_bookings`))).rows).toEqual([]);
    const jobs = await q(`select type, payload from jobs where type in ('email.send', 'ptm.remind_app') order by type`);
    expect(jobs.map((j: { type: string; payload: { template?: string; to: unknown } }) => [j.type, j.payload.template ?? null, j.payload.to])).toEqual([
      ['email.send', 'ptm_family', ['one@example.org']],
      ['ptm.remind_app', null, 'one@example.org'],
    ]);
  });

  it('two parents racing for the same time: one gets it, the other is refused', async () => {
    const { bookFamilySlot } = await import('@/lib/school-link');
    const slot = await slotOf(TARA, '10:10');
    const [x, y] = await Promise.all([
      bookFamilySlot(claims(ACC3), L3, { studentId: S3, slotId: slot }, notify('three@example.org')),
      bookFamilySlot(claims(ACC4), L4, { studentId: S4, slotId: slot }, notify('four@example.org')),
    ]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, reason: 'taken' });
    loser = x.ok ? [ACC4, L4, S4] : [ACC3, L3, S3];
    expect(await q(`select count(*)::int as n from ptm_bookings where slot_id = $1`, [slot])).toEqual([{ n: 1 }]);
  });

  it('a parent cannot book twice with one teacher, nor a teacher, slot or meeting not theirs', async () => {
    const { bookFamilySlot } = await import('@/lib/school-link');
    expect(await bookFamilySlot(claims(ACC1), L1, { studentId: S1, slotId: await slotOf(TARA, '10:20') }, notify('one@example.org'))).toEqual({ ok: false, reason: 'already_booked' });
    expect(await bookFamilySlot(claims(ACC1), L1, { studentId: S1, slotId: await slotOf(TINA, '10:20') }, notify('one@example.org'))).toEqual({ ok: false, reason: 'not_found' });
    expect(await bookFamilySlot(claims(ACC1), L1, { studentId: S1, slotId: await slotOf(TEACHER_B, '10:20', PTM_B) }, notify('one@example.org'))).toEqual({ ok: false, reason: 'not_found' });
    // A subject teacher of the meeting is bookable as well.
    expect(await bookFamilySlot(claims(ACC1), L1, { studentId: S1, slotId: await slotOf(SAM, '10:20') }, notify('one@example.org'))).toMatchObject({ ok: true, teacher: 'Sam Maths' });
  });

  it('RLS: a parent writes only their own app booking with a teacher they may meet; never updates; another school is out', async () => {
    const slot = await slotOf(TINA, '10:00');
    const insert = (school: string, parent: string, teacher = TINA, s = slot) =>
      asRole(school, 'parent', parent, (c) => c.query(`insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via) values ($1, $2, $3, $4, $5, 'app')`, [A, PTM, s, teacher, parent]));
    await expect(insert(A, P1)).rejects.toThrow(); // Tina is not Aarav's teacher
    await expect(insert(A, P3, TINA)).rejects.toThrow();
    await expect(insert(B, PB)).rejects.toThrow(); // another school's guardian, in their own school's context
    await expect(insert(A, PB)).rejects.toThrow(); // and pretending to be in this one
    await expect(asRole(A, 'parent', P2, (c) => c.query(`insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via) values ($1, $2, $3, $4, $5, 'app')`, [A, PTM, slot, TINA, P1]))).rejects.toThrow(); // for someone else
    const moved = await asRole(A, 'parent', P1, (c) => c.query(`update ptm_bookings set slot_id = $1 where parent_id = $2`, [slot, P1]));
    expect(moved.affectedRows ?? moved.rowCount ?? 0).toBe(0);
    // The school B family sees B's meeting only, and nothing of A's.
    const { familyPtmFor } = await import('@/lib/school-link');
    expect((await familyPtmFor(claims(ACCB), LB, SB)).map((m) => m.ptmId)).toEqual([PTM_B]);
    expect(await familyPtmFor(claims(ACCB), LB, S1)).toEqual([]);
  });

  it('an unlinked family sees nothing and cannot book', async () => {
    const { schoolPtmFor, bookSchoolPtm } = await import('@/lib/family/school');
    expect(await schoolPtmFor(claims(ACC0), L1, S1)).toBeNull();
    expect(await bookSchoolPtm(claims(ACC0), L1, { studentId: S1, slotId: await slotOf(TARA, '10:20') }, notify('zero@example.org'))).toEqual({ ok: false, reason: 'not_found' });
  });

  it('the teacher sees who booked from the app beside the other bookings', async () => {
    const { ptmDetail } = await import('@/lib/ptm/ptm');
    const d: Awaited<ReturnType<typeof ptmDetail>> = await asRole(A, 'teacher', TARA, (c) => ptmDetail(c, { schoolId: A, userId: TARA, role: 'teacher' }, PTM, day(0)));
    const tara = d?.teachers.find((t) => t.teacher_id === TARA);
    expect(tara?.slots.find((s) => s.time === '10:00')?.booking).toMatchObject({ guardian: 'Rajesh Kumar', children: 'Aarav Kumar', via: 'app' });
  });

  it('the reminder reaches the feed the day before, and the email job sends it while the booking stands', async () => {
    const { familyPtmFeed } = await import('@/lib/school-link');
    const early = await familyPtmFeed(claims(ACC1), L1, [S1], day(0));
    expect(early.map((b) => [b.teacher, b.time, b.remind])).toEqual([['Tara Teacher', '10:00', false], ['Sam Maths', '10:20', false]]);
    const dayBefore = await familyPtmFeed(claims(ACC1), L1, [S1], day(2));
    expect(dayBefore.every((b) => b.remind)).toBe(true);
    // The Family app's notifications list carries it for the matched child (readNotifications' school part; the harness
    // database serves one connection at a time, so the family's own transaction is not held open around it here).
    const { withFamilyContext } = await import('@/lib/auth/db');
    const { activeLinks, schoolPtmFeedFor } = await import('@/lib/family/school');
    const { buildNotifications } = await import('@/lib/family/notifications');
    const links = (await withFamilyContext(claims(ACC1), (c) => activeLinks(c, ACC1))).map((l) => ({ ...l, children: l.children.filter((c) => c.childId === CH1) }));
    const items = buildNotifications({ news: null, tonight: [], requests: [], ptm: await schoolPtmFeedFor(claims(ACC1), links, []) });
    expect(items.filter((i) => i.kind === 'ptm').map((i) => (i.kind === 'ptm' ? i.teacher : ''))).toEqual(['Tara Teacher', 'Sam Maths']);
    expect(await schoolPtmFeedFor(claims(ACC1), links, ['notices'])).toEqual([]);
    // The day-before email job: for the app booking that still stands.
    const { ptmAppRemindHandler } = await import('@/lib/ptm/ptm');
    const { withPlatformService } = await import('@/lib/auth/db');
    const sent: unknown[] = [];
    const handler = ptmAppRemindHandler({ platform: withPlatformService, queue: { enqueue: async (_db, spec) => sent.push(spec) } });
    const [job] = await q(`select payload from jobs where type = 'ptm.remind_app' order by created_at limit 1`);
    await handler({ jobId: 'j', type: 'ptm.remind_app', payload: job.payload, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' } as never);
    expect(sent).toMatchObject([{ type: 'email.send', payload: { to: ['one@example.org'], template: 'ptm_family', data: { kind: 'reminder', teacher: 'Tara Teacher', time: '10:00' } } }]);
    const { renderEmail } = await import('@/lib/email/templates');
    expect(renderEmail('ptm_family', (sent[0] as { payload: { data: Record<string, unknown> } }).payload.data).subject).toMatch(/^Reminder: your meeting with Tara Teacher is on .+ at 10:00/);
  });

  it('cancel frees the time, tells the teacher, and the reminder then sends nothing', async () => {
    const { cancelFamilyBooking, familyPtmFor, bookFamilySlot } = await import('@/lib/school-link');
    const mine = (await familyPtmFor(claims(ACC1), L1, S1))[0].teachers[0].booking!;
    // Another family cannot cancel it.
    expect(await cancelFamilyBooking(claims(ACC3), L3, mine.bookingId)).toEqual({ ok: false, reason: 'not_found' });
    expect(await cancelFamilyBooking(claims(ACC1), L1, mine.bookingId)).toEqual({ ok: true });
    expect((await familyPtmFor(claims(loser[0]), loser[1], loser[2]))[0].teachers[0].slots.find((s) => s.time === '10:00')?.free).toBe(true);
    const [told] = await q(`select payload from jobs where idempotency_key = $1`, [`email.send:ptm:cancelled:${mine.bookingId}`]);
    expect(told.payload).toMatchObject({ to: ['tara@a.invalid'], template: 'ptm_teacher_cancelled', data: { guardian: 'Rajesh', time: '10:00' } });
    const [audit] = await q(`select event_action, actor_role from audit_log where target_id = $1 order by audit_id desc limit 1`, [mine.bookingId]);
    expect(audit).toEqual({ event_action: 'ptm.booking_cancelled', actor_role: 'parent' });
    const { ptmAppRemindHandler } = await import('@/lib/ptm/ptm');
    const { withPlatformService } = await import('@/lib/auth/db');
    const sent: unknown[] = [];
    await ptmAppRemindHandler({ platform: withPlatformService, queue: { enqueue: async (_db, spec) => sent.push(spec) } })({ jobId: 'j', type: 'ptm.remind_app', payload: { bookingId: mine.bookingId, ptmId: PTM, to: 'one@example.org', lang: 'en' }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' } as never);
    expect(sent).toEqual([]);
    // The time is free to book again.
    expect(await bookFamilySlot(claims(loser[0]), loser[1], { studentId: loser[2], slotId: mine.slotId }, notify('x@example.org'))).toMatchObject({ ok: true, time: '10:00' });
  });
});
