import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { DEMO_CLASS, DEMO_PARENT, DEMO_SCHOOL, DEMO_STUDENT } from '@/demo-fixture/demo-school';

// W2 item 1 (C324): the demo pilot's school, built by staff through the app's own functions on a throwaway database.
// Supabase Auth's invite is replaced; made-up inboxes only.

const STAFF = 'ff000000-0000-4000-8000-0000000000f2';
const TEACHER_AUTH = 'ff000000-0000-4000-8000-0000000000f3';
const S = DEMO_SCHOOL.schoolId;
const PAYLOAD = { by: STAFF, teacherEmail: 'Teacher.Demo@Example.com', parentEmail: 'parent.demo@example.com', origin: 'https://app.example.com/anything', plan: 'standard' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const job = (type: string, payload: Record<string, unknown>, key = `${type}:t:0`) => ({ jobId: 'j', type, payload, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: key });
type Spec = { type: string; payload: Record<string, unknown>; idempotencyKey: string; runAt?: Date; maxAttempts?: number };
const queued: Spec[] = [];
const queue = { enqueue: async (_db: unknown, spec: Spec) => (queued.push(spec), { jobId: 'n', created: true }) } as never;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  await db.pg.exec(`insert into users (user_id, school_id, role, display_name) values ('${STAFF}', null, 'super_admin', 'Made-up Reviewer')`);
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const handler = async () => {
  const { demoSetupHandler } = await import('@/lib/jobs/demo-setup');
  const { withPlatformService } = await import('@/lib/auth/db');
  return demoSetupHandler({ platform: withPlatformService as never, queue });
};

describe('the demo school (C324)', () => {
  it('refuses a run that no active staff member asked for, or that returns to a plain-http site', async () => {
    const run = await handler();
    await expect(run(job('demo.setup', { ...PAYLOAD, by: TEACHER_AUTH }))).rejects.toThrow(/not active NetCyberAI staff/);
    await expect(run(job('demo.setup', { ...PAYLOAD, origin: 'http://app.example.com' }))).rejects.toThrow(/bad demo.setup payload/);
    expect(await q(`select 1 from schools where school_id = $1`, [S])).toHaveLength(0);
  });

  it('builds the school through the real steps: a test fixture in pilot, its plan, Class 6-A, an active child with a parent, the teacher invited', async () => {
    const run = await handler();
    await run(job('demo.setup', PAYLOAD));

    const [school] = await q(`select name, board::text, board_id, is_test_fixture, is_pilot, pilot_allow_outbound from schools where school_id = $1`, [S]);
    expect(school).toEqual({ name: 'NetCyberAI Demo School', board: 'CBSE', board_id: 'cbse', is_test_fixture: true, is_pilot: true, pilot_allow_outbound: false });
    expect((await q(`select plan_id from school_subscriptions where school_id = $1`, [S]))[0].plan_id).toBe('standard');
    expect(Number((await q(`select count(*) n from school_module_entitlements where school_id = $1 and enabled`, [S]))[0].n)).toBeGreaterThan(0);
    expect(await q(`select name from classes where school_id = $1`, [S])).toEqual([{ name: DEMO_CLASS.name }]);
    expect((await q(`select name from subjects where school_id = $1 order by name`, [S])).map((r: { name: string }) => r.name)).toEqual(['English', 'Hindi', 'Mathematics', 'Science', 'Social Science']);

    const [child] = await q(`select name, status::text, class_id from students where student_id = $1`, [DEMO_STUDENT.studentId]);
    expect(child).toEqual({ name: DEMO_STUDENT.name, status: 'active', class_id: DEMO_CLASS.classId });
    expect((await q(`select purpose::text from consent_ledger where student_id = $1 order by purpose`, [DEMO_STUDENT.studentId])).map((r: { purpose: string }) => r.purpose)).toEqual(['core_records', 'operational_communication']);
    const [parent] = await q(`select p.email, m.student_id from parents p join parent_student_map m on m.parent_id = p.parent_id where p.parent_id = $1`, [DEMO_PARENT.parentId]);
    expect(parent).toEqual({ email: 'parent.demo@example.com', student_id: DEMO_STUDENT.studentId });

    const [invitation] = await q(`select invitation_id, email, role::text, status from staff_invitations where school_id = $1`, [S]);
    expect(invitation).toMatchObject({ email: 'teacher.demo@example.com', role: 'teacher', status: 'pending' });
    const send = queued.find((x) => x.type === 'invite.send');
    expect(send?.payload).toEqual({ invitationId: invitation.invitation_id, sendNumber: 1, redirectTo: 'https://app.example.com/login' });
    const later = queued.find((x) => x.type === 'demo.setup');
    expect(later).toMatchObject({ payload: { ...PAYLOAD, phase: 'assign' }, idempotencyKey: 'demo.setup:t:0:assign', maxAttempts: 8 });
    expect(later!.runAt!.getTime()).toBeGreaterThan(Date.now());

    const audit = (await q(`select event_action from audit_log where school_id = $1 order by created_at`, [S])).map((r: { event_action: string }) => r.event_action);
    expect(audit).toEqual(expect.arrayContaining(['school.create', 'entitlement.plan_applied', 'staff_invitation.create', 'demo.setup']));
    // Ids only in the audit: neither inbox is written there.
    expect(JSON.stringify(await q(`select after_state from audit_log where school_id = $1`, [S]))).not.toMatch(/example\.com/);
  });

  it('changes nothing when run again', async () => {
    const counts = async () => (await q(`select (select count(*) from students where school_id = $1) s, (select count(*) from consent_ledger where school_id = $1) c, (select count(*) from staff_invitations where school_id = $1) i, (select count(*) from subjects where school_id = $1) j`, [S]))[0];
    const before = await counts();
    queued.length = 0;
    await (await handler())(job('demo.setup', PAYLOAD, 'demo.setup:t:1'));
    expect(await counts()).toEqual(before);
    expect(queued.filter((x) => x.type === 'invite.send')).toHaveLength(0);
    const [last] = await q(`select after_state from audit_log where school_id = $1 and event_action = 'demo.setup' order by created_at desc limit 1`, [S]);
    expect(last.after_state).toEqual({ phase: 'school', created: false, invited: false });
  });

  it('gives the teacher Science and Mathematics in 6-A and the class only once the invitation has made the account', async () => {
    const run = await handler();
    const assign = job('demo.setup', { ...PAYLOAD, phase: 'assign' }, 'demo.setup:t:0:assign');
    // Not sent yet: an ordinary failure, so the runner tries again later.
    const early = await run(assign).catch((err: Error) => err);
    expect(early).toBeInstanceOf(Error);
    expect((early as Error).name).not.toBe('PermanentJobError');

    const { inviteSendHandler } = await import('@/lib/onboarding/invitations');
    const { withPlatformService } = await import('@/lib/auth/db');
    const [invitation] = await q(`select invitation_id from staff_invitations where school_id = $1`, [S]);
    await inviteSendHandler({
      platform: withPlatformService as never,
      queue,
      inviteUser: async () => ({ userId: TEACHER_AUTH }),
      sendPasswordEmail: async () => {},
      markProvisioned: async () => {},
    })(job('invite.send', { invitationId: invitation.invitation_id, sendNumber: 1, redirectTo: 'https://app.example.com/login' }));

    await run(assign);
    const subjects = await q(
      `select s.name from teacher_subjects ts join teachers t on t.teacher_id = ts.teacher_id join subjects s on s.subject_id = ts.subject_id where ts.school_id = $1 and t.user_id = $2 order by s.name`,
      [S, TEACHER_AUTH]
    );
    expect(subjects.map((r: { name: string }) => r.name)).toEqual(['Mathematics', 'Science']);
    expect((await q(`select class_teacher_id from classes where class_id = $1`, [DEMO_CLASS.classId]))[0].class_teacher_id).toBe(TEACHER_AUTH);

    // Again: nothing new.
    await run(assign);
    expect(await q(`select 1 from teacher_subjects where school_id = $1`, [S])).toHaveLength(2);
  });
});
