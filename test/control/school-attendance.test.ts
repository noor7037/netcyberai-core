import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Control → a school → Attendance (W13-C), on the real migrations (PGlite). Only the connection is replaced: the
// route's own query runs on the test database as nca_super, as in production. Who is let in, that today's counts and
// class rows are this school's alone, that a day with nothing marked is "none marked" and not "none present", and that
// the correction requests waiting are counted. Made-up people only.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>; query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }; stop: () => Promise<void> } }));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  const run = (fn: (db: unknown) => Promise<unknown>) =>
    h.db.pg.transaction(async (tx) => {
      await (tx as { query: (s: string) => Promise<unknown> }).query('set local role nca_super');
      return fn(tx);
    });
  return { ...real, withTenantContext: (_c: unknown, fn: (db: unknown) => Promise<unknown>) => run(fn) };
});

// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET } from '@/app/api/control/schools/[schoolId]/attendance/route';
import { indiaDate } from '@/lib/time/india';
import { lastIsoDays } from '@/lib/control/school-attendance';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const TEACHER = randomUUID();
const A = randomUUID();
const B = randomUUID();
const EMPTY = randomUUID();
const CLASS_A5 = randomUUID();
const CLASS_A2 = randomUUID();
const CLASS_B = randomUUID();
const q = async (sql: string, params: unknown[] = []) => (await h.db.pg.query(sql, params)).rows;
const TODAY = indiaDate();
const [YESTERDAY] = lastIsoDays(TODAY, 2);

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: 'aal2', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const get = async (schoolId: string, cookie?: string) => {
  const res = await GET(new NextRequest(`https://www.netcyberai.test/api/control/schools/${schoolId}/attendance`, { headers: cookie ? { cookie } : {} }), { params: { schoolId } });
  return { status: res.status, body: await res.json() };
};
let founder = '';
let principal = '';

const student = async (school: string, klass: string, n: number) => {
  const id = randomUUID();
  await q(`insert into students (student_id, school_id, admission_no, name, class_id) values ($1, $2, $3, $4, $5)`, [id, school, `ADM-${n}-${id.slice(0, 4)}`, `Student ${n}`, klass]);
  return id;
};
const mark = (school: string, klass: string, studentId: string, date: string, status: string) =>
  q(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, $4, $5)`, [school, studentId, klass, date, status]);

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-school-attendance-tests-0123456789';
  h.db = await startHarnessDb({ port: 0 });
  await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'School A', 'IN-HR'), ($2, 'School B', 'IN-DL'), ($3, 'School Empty', 'IN-HR')`, [A, B, EMPTY]);
  await q(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal'), ($4, $3, 'teacher', 'Tara Teacher')`, [FOUNDER, PRINCIPAL, A, TEACHER]);
  await q(`insert into classes (class_id, school_id, name, section) values ($1, $2, '5', 'A'), ($3, $2, '2', 'B'), ($4, $5, '7', 'C')`, [CLASS_A5, A, CLASS_A2, CLASS_B, B]);
  const a1 = await student(A, CLASS_A5, 1);
  const a2 = await student(A, CLASS_A5, 2);
  const a3 = await student(A, CLASS_A5, 3);
  const a4 = await student(A, CLASS_A2, 4);
  const b1 = await student(B, CLASS_B, 5);
  const b2 = await student(B, CLASS_B, 6);
  await q(`alter table students disable trigger user`);
  await q(`update students set status = 'active'`);
  await q(`alter table students enable trigger user`);
  // School A today: class 5-A marked (present, absent, late); class 2-B not marked. Yesterday: only 5-A, all present.
  await mark(A, CLASS_A5, a1, TODAY, 'present');
  await mark(A, CLASS_A5, a2, TODAY, 'absent');
  await mark(A, CLASS_A5, a3, TODAY, 'late');
  await mark(A, CLASS_A5, a1, YESTERDAY, 'present');
  await mark(A, CLASS_A5, a2, YESTERDAY, 'present');
  // School B marks today must never count for A.
  await mark(B, CLASS_B, b1, TODAY, 'absent');
  await mark(B, CLASS_B, b2, TODAY, 'absent');
  // One request waiting at A (a requester must belong to the school; B has none).
  await q(`insert into attendance_correction_requests (school_id, class_id, for_date, requested_by, entries) values ($1, $2, $3, $4, '[]'::jsonb)`, [A, CLASS_A2, YESTERDAY, TEACHER]);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', A);
}, 120_000);
afterAll(async () => {
  await h.db?.stop();
});

describe('who is let in', () => {
  it('no session is 401, a principal is 403, a non-uuid id is 404', async () => {
    expect((await get(A)).status).toBe(401);
    expect((await get(A, principal)).status).toBe(403);
    expect((await get('not-a-uuid', founder)).status).toBe(404);
  });
});

describe('the super admin reads one school', () => {
  it('today’s counts and class rows are this school’s alone', async () => {
    const { status, body } = await get(A, founder);
    expect(status).toBe(200);
    expect(body).toMatchObject({ today: TODAY, classesTotal: 2, classesMarked: 1, studentsMarked: 3, present: 1, absent: 1, late: 1, everMarked: true });
    expect(body.classes).toEqual([
      { classId: CLASS_A2, name: '2', section: 'B', marked: false, present: 0, absent: 0 },
      { classId: CLASS_A5, name: '5', section: 'A', marked: true, present: 1, absent: 1 },
    ]);
    // No student is named anywhere in the answer.
    expect(JSON.stringify(body)).not.toMatch(/Student \d/);
  });

  it('the last 14 days, oldest first: a rate and the classes marked where marks exist, none where they do not', async () => {
    const { body } = await get(A, founder);
    expect(body.days).toHaveLength(14);
    expect(body.days[13]).toEqual({ date: TODAY, presentRate: 66.7, classesMarked: 1, marks: 3 });
    expect(body.days[12]).toEqual({ date: YESTERDAY, presentRate: 100, classesMarked: 1, marks: 2 });
    expect(body.days[0]).toEqual({ date: lastIsoDays(TODAY, 14)[0], presentRate: null, classesMarked: 0, marks: 0 });
  });

  it('the correction requests waiting are counted, for this school only', async () => {
    expect((await get(A, founder)).body.waitingCorrections).toBe(1);
    expect((await get(B, founder)).body.waitingCorrections).toBe(0);
  });

  it('school B sees its own marks, not A’s', async () => {
    const { body } = await get(B, founder);
    expect(body).toMatchObject({ classesTotal: 1, classesMarked: 1, studentsMarked: 2, present: 0, absent: 2, late: 0 });
  });

  it('a school where nothing was ever marked shows zero marked, not zero present', async () => {
    const { body } = await get(EMPTY, founder);
    expect(body).toMatchObject({ classesTotal: 0, classesMarked: 0, studentsMarked: 0, everMarked: false, waitingCorrections: 0, classes: [] });
    expect(body.days.every((d: { presentRate: number | null; marks: number }) => d.presentRate === null && d.marks === 0)).toBe(true);
  });

  it('a school with classes but nothing marked today has no students marked', async () => {
    await q(`delete from attendance where school_id = $1 and date = $2`, [B, TODAY]);
    const { body } = await get(B, founder);
    expect(body).toMatchObject({ classesTotal: 1, classesMarked: 0, studentsMarked: 0 });
    expect(body.classes[0]).toMatchObject({ marked: false });
  });
});
