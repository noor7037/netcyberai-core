import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Control → Onboarding → Provision a school (W6-E, C230-AU; Decision Log C399), through the real route on the whole
// schema (the harness database), as the founder's own session and database role. Only the running of the invite jobs
// is replaced (it calls Supabase Auth): the jobs are queued for real and their keys recorded. Every name and number is
// made up.

const kicked = vi.hoisted(() => [] as string[][]);
vi.mock('@/lib/jobs/handlers', () => ({ kickJobs: async (keys: string[]) => void kicked.push(keys) }));

import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST } from '@/app/api/control/onboarding/provision/route';

const PLATFORM = 'e6000000-0000-4000-8000-000000000001';
const OTHER = 'e6000000-0000-4000-8000-000000000002';
const FOUNDER = 'e6000000-0000-4000-8000-0000000000f1';
const OTHER_PRINCIPAL = 'e6000000-0000-4000-8000-0000000000a1';
const OTHER_CLASS = 'e6000000-0000-4000-8000-0000000000c1';
const OTHER_STUDENT = 'e6000000-0000-4000-8000-0000000000d1';
const OTHER_GUARDIAN = 'e6000000-0000-4000-8000-0000000000e1';
const VERSION = 'e6000000-0000-4000-8000-0000000000b1';
const CH1 = 'e6000000-0000-4000-8000-0000000000b2';
const CH2 = 'e6000000-0000-4000-8000-0000000000b3';
const SHARED_PHONE = '9800000042'; // a guardian of the other school has it too

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let founder = '';
let principal = '';

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const post = (body: unknown, cookie = founder) =>
  POST(new NextRequest('https://www.netcyberai.test/api/control/onboarding/provision', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie } }));
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const n = async (sql: string, params: unknown[] = []) => Number((await rows(`select count(*)::int as n from ${sql}`, params))[0].n);

const STUDENTS = ['name,class,section,guardian_phone,guardian_name', `Asha Verma,5,A,${SHARED_PHONE},Rakesh Verma`, 'Bilal Khan,5,B,98000 00043,', 'Chitra Rao,5,A,9800000043,'].join('\n');
const request = (over: Record<string, unknown> = {}) => ({
  schoolName: 'Sunrise Public School',
  boardId: 'cbse',
  stateCode: 'IN-KA',
  city: 'Mysuru',
  grades: ['LKG', '5', '6'],
  sections: 2,
  session: { label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' },
  principal: { name: 'Meera Iyer', email: 'Meera.Iyer@sunrise.example' },
  teachers: [
    { name: 'Ravi Kumar', email: 'ravi@sunrise.example', className: '5-A' },
    { name: 'Sana Ali', email: 'sana@sunrise.example', className: '' },
    { name: '', email: '', className: '' },
  ],
  studentsCsv: STUDENTS,
  ...over,
});
const schoolsNamed = (name: string) => n(`schools where lower(name) = lower($1)`, [name]);
const counts = async (schoolId: string) => ({
  classes: await n(`classes where school_id = $1`, [schoolId]),
  sessions: await n(`academic_sessions where school_id = $1`, [schoolId]),
  units: await n(`syllabus_units where school_id = $1`, [schoolId]),
  subjects: await n(`subjects where school_id = $1`, [schoolId]),
  invitations: await n(`staff_invitations where school_id = $1`, [schoolId]),
  jobs: await n(`jobs where school_id = $1 and type = 'invite.send'`, [schoolId]),
  students: await n(`students where school_id = $1`, [schoolId]),
  parents: await n(`parents where school_id = $1`, [schoolId]),
  links: await n(`parent_student_map where school_id = $1`, [schoolId]),
});

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-provisioning-tests-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${PLATFORM}', 'NetCyberAI', 'IN-KA'), ('${OTHER}', 'Other School', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${FOUNDER}', '${PLATFORM}', 'founder@netcyberai.example', 'super_admin', 'Founder'),
      ('${OTHER_PRINCIPAL}', '${OTHER}', 'p@other.example', 'principal', 'Other Principal');
    insert into classes (class_id, school_id, name, grade, section) values ('${OTHER_CLASS}', '${OTHER}', '5-A', '5', 'A');
    insert into students (student_id, school_id, name, class_id) values ('${OTHER_STUDENT}', '${OTHER}', 'Other Child', '${OTHER_CLASS}');
    insert into parents (parent_id, school_id, name, phone) values ('${OTHER_GUARDIAN}', '${OTHER}', 'Other Guardian', '${SHARED_PHONE}');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${OTHER}', '${OTHER_GUARDIAN}', '${OTHER_STUDENT}');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 5, 'social_science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', '${FOUNDER}', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on) values
      ('${CH1}', '${VERSION}', 'cbse.c5.sst.ch01', 1, 'Our country', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
      ('${CH2}', '${VERSION}', 'cbse.c5.sst.ch02', 2, 'Maps', 'https://cbseacademic.nic.in/', '2', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', '${CH1}', 'cbse.c5.sst.ch01.t1', 1, 'States', 'https://cbseacademic.nic.in/', '1', '2026-10-21'),
      ('${VERSION}', '${CH1}', 'cbse.c5.sst.ch01.t2', 2, 'Rivers', 'https://cbseacademic.nic.in/', '1', '2026-10-21');
  `);
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(OTHER_PRINCIPAL, 'principal', OTHER);
}, 180_000);

afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

let schoolId = '';
const otherBefore = { classes: 0, students: 0, parents: 0, links: 0, units: 0, invitations: 0 };

describe('who may provision', () => {
  it('a school role is refused, and no session is refused, before anything is read', async () => {
    expect((await post(request(), principal)).status).toBe(403);
    expect((await post(request(), '')).status).toBe(401);
    expect(await schoolsNamed('Sunrise Public School')).toBe(0);
  });
});

describe('checking first', () => {
  it('every problem of the request is listed at once', async () => {
    const res = await post(request({ schoolName: '', principal: { name: 'M', email: 'not-an-email' }, grades: [], teachers: [{ name: 'Ravi', email: 'meera.iyer@sunrise.example', className: '9-Z' }] }));
    expect(res.status).toBe(400);
    const fields = (await res.json()).problems.map((p: { field: string; code: string }) => `${p.field}:${p.code}`);
    expect(fields).toEqual(expect.arrayContaining(['school_name:required', 'grades:required', 'principal_name:required', 'principal_email:email', 'teacher:class']));
  });

  it('a dry run counts what would be made and keeps none of it', async () => {
    const res = await post(request({ dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ dryRun: true, ok: true, result: { newSchool: true, classes: { created: 6 }, students: { imported: 3 } } });
    expect(await schoolsNamed('Sunrise Public School')).toBe(0);
    expect(kicked).toHaveLength(0);
  });

  it('a students list with a bad row writes nothing at all, and names the row', async () => {
    const res = await post(request({ studentsCsv: `${STUDENTS}\nDev,14,A,98000,` }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.reason).toBe('students');
    expect(body.errors[0].row).toBe(4);
    expect(body.errors[0].errors.join(' ')).toMatch(/class must be/);
    expect(await schoolsNamed('Sunrise Public School')).toBe(0);
  });
});

describe('one provision', () => {
  it('makes the school, its board, the widest plan, the session, classes, syllabus, invitations, students and guardians', async () => {
    for (const k of Object.keys(otherBefore) as (keyof typeof otherBefore)[]) otherBefore[k] = (await counts(OTHER))[k];
    const res = await post(request());
    expect(res.status).toBe(201);
    const { result } = await res.json();
    schoolId = result.schoolId;

    const [school] = await rows(`select name, board::text, board_id, jurisdiction, address, tenant_type::text from schools where school_id = $1`, [schoolId]);
    expect(school).toMatchObject({ name: 'Sunrise Public School', board: 'CBSE', board_id: 'cbse', jurisdiction: 'IN-KA', address: 'Mysuru, Karnataka', tenant_type: 'school' });

    // The widest plan for real schools, read from the plans table, and every module it gives is on.
    const [widest] = await rows(`select plan_id, cardinality(module_ids) as n from plans where retired_at is null and not test_schools_only order by all_working_modules desc, cardinality(module_ids) desc limit 1`);
    expect(result.plan.planId).toBe(widest.plan_id);
    expect(await rows(`select plan_id from school_subscriptions where school_id = $1`, [schoolId])).toEqual([{ plan_id: widest.plan_id }]);
    expect(await n(`school_module_entitlements where school_id = $1 and enabled`, [schoolId])).toBe(result.plan.modules);
    expect(result.plan.modules).toBeGreaterThan(0);

    const c = await counts(schoolId);
    expect(c).toMatchObject({ classes: 6, sessions: 1, invitations: 3, jobs: 3, students: 3, parents: 2, links: 3 });
    expect(await rows(`select label, is_current from academic_sessions where school_id = $1`, [schoolId])).toEqual([{ label: '2026-27', is_current: true }]);
    expect((await rows(`select name from classes where school_id = $1 order by name`, [schoolId])).map((r: { name: string }) => r.name)).toEqual(['5-A', '5-B', '6-A', '6-B', 'LKG-A', 'LKG-B']);
    expect(await n(`classes where school_id = $1 and session_id is null`, [schoolId])).toBe(0);

    // The syllabus of class 5 from the catalog: one subject, chapter 1's two topics and chapter 2 as its own line, in
    // both sections; 6 and LKG have no published syllabus and are counted as such.
    expect(await rows(`select name from subjects where school_id = $1`, [schoolId])).toEqual([{ name: 'Social Science' }]);
    expect(await rows(`select c.name, u.position, u.chapter, u.topic from syllabus_units u join classes c on c.class_id = u.class_id where u.school_id = $1 and c.name = '5-A' order by u.position`, [schoolId])).toEqual([
      { name: '5-A', position: 1, chapter: 'Our country', topic: 'States' },
      { name: '5-A', position: 2, chapter: 'Our country', topic: 'Rivers' },
      { name: '5-A', position: 3, chapter: 'Maps', topic: 'Maps' },
    ]);
    expect(result.syllabus).toEqual({ classesMapped: 2, subjects: 1, units: 6, classesWithoutCatalog: 4 });

    // The principal and two teachers (the empty row is ignored), each an invitation with its invite job, run at once.
    expect(await rows(`select email, role::text, source, status from staff_invitations where school_id = $1 order by role, email`, [schoolId])).toEqual([
      { email: 'meera.iyer@sunrise.example', role: 'principal', source: 'staff', status: 'pending' },
      { email: 'ravi@sunrise.example', role: 'teacher', source: 'staff', status: 'pending' },
      { email: 'sana@sunrise.example', role: 'teacher', source: 'staff', status: 'pending' },
    ]);
    expect(kicked.at(-1)).toHaveLength(3);
    expect(result.invitations.map((i: { role: string; status: string; sendStatus: string }) => [i.role, i.status, i.sendStatus])).toEqual([
      ['principal', 'queued', 'pending'],
      ['teacher', 'queued', 'pending'],
      ['teacher', 'queued', 'pending'],
    ]);

    // Students wait for consent; one guardian a phone, linked to that phone's students (Bilal and Chitra share one).
    expect(await n(`students where school_id = $1 and status <> 'pending_consent'`, [schoolId])).toBe(0);
    expect(await rows(`select p.name, count(*)::int as children from parents p join parent_student_map m on m.parent_id = p.parent_id where p.school_id = $1 group by p.name order by p.name`, [schoolId])).toEqual([
      { name: 'Guardian of Bilal Khan', children: 2 },
      { name: 'Rakesh Verma', children: 1 },
    ]);

    // Every step audited, ids and counts only: no email or phone in any row.
    const actions = (await rows(`select event_action from audit_log where school_id = $1`, [schoolId])).map((r: { event_action: string }) => r.event_action);
    expect(actions).toEqual(expect.arrayContaining(['school.create', 'entitlement.plan_applied', 'setup.session_added', 'class.provisioned', 'syllabus.mapped_from_board', 'staff_invitation.create', 'guardian.provisioned', 'school.provisioned']));
    const audit = JSON.stringify(await rows(`select before_state, after_state from audit_log where school_id = $1`, [schoolId]));
    expect(audit).not.toMatch(/sunrise\.example|9800000043|Rakesh/);
  });

  it('nothing reaches the other school: its classes, students, guardians, links, syllabus and invitations are as they were', async () => {
    const after = await counts(OTHER);
    for (const k of Object.keys(otherBefore) as (keyof typeof otherBefore)[]) expect(after[k], k).toBe(otherBefore[k]);
    // The shared phone made a guardian of this school, not a link to the other school's guardian.
    expect(await n(`parent_student_map m join students s on s.student_id = m.student_id where m.parent_id = $1 and s.school_id <> $2`, [OTHER_GUARDIAN, OTHER])).toBe(0);
    expect(await n(`parent_student_map where school_id = $1 and parent_id = $2`, [schoolId, OTHER_GUARDIAN])).toBe(0);
  });
});

describe('again', () => {
  it('the same name is not made twice: the school is named for "add to the existing school"', async () => {
    const res = await post(request({ schoolName: '  sunrise   PUBLIC school ' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, reason: 'school_exists', schoolId, schoolName: 'Sunrise Public School' });
    expect(await schoolsNamed('Sunrise Public School')).toBe(1);
  });

  it('added to the existing school, nothing already there is made again; a new teacher and new class are', async () => {
    const before = await counts(schoolId);
    const teachers = [...(request().teachers as object[]), { name: 'Tara Das', email: 'tara@sunrise.example', className: '7-A' }];
    const res = await post(request({ existingSchoolId: schoolId, grades: ['LKG', '5', '6', '7'], teachers }));
    expect(res.status).toBe(201);
    const { result } = await res.json();
    expect(result).toMatchObject({ schoolId, newSchool: false, plan: null, session: { label: '2026-27', created: false }, classes: { created: 2, alreadyThere: 6 }, students: { imported: 3, alreadyImported: true } });
    expect(result.invitations.map((i: { status: string }) => i.status)).toEqual(['already_invited', 'already_invited', 'already_invited', 'queued']);
    const after = await counts(schoolId);
    expect(after).toEqual({ ...before, classes: 8, invitations: 4, jobs: 4 });
    expect(await schoolsNamed('Sunrise Public School')).toBe(1);
  });

  it('a school that does not exist is not found', async () => {
    expect((await post(request({ existingSchoolId: randomUUID() }))).status).toBe(404);
    expect((await post(request({ existingSchoolId: 'not-a-school' }))).status).toBe(404);
  });
});
