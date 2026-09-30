import { beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import type { EmailMessage } from '@/lib/email/sender';

// C98 end to end, through the real routes, job queue, runner and handlers,
// on real Postgres (PGlite, B2 migration verbatim). Only the outside world
// is replaced: the email service (records messages and, like Resend,
// returns the first result for a repeated idempotency key) and Supabase
// Auth's admin invite and password email.
//   submit → confirm email → approve (twice, and twice at once) → invite
//   job → principal's first sign-in → principal invites a teacher.

const h = vi.hoisted(() => ({
  db: null as unknown as import('../db/pglite-harness').TestDb,
  deliveries: [] as EmailMessage[],
  seenKeys: new Set<string>(),
  authUsers: new Map<string, string>(),
  inviteCalls: [] as string[],
  passwordEmails: [] as string[],
}));

vi.mock('@/lib/auth/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/db')>()),
  withPlatformService: (fn: (db: unknown) => Promise<unknown>) => h.db.platform(fn as never),
  withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => h.db.tenant(claims, fn as never),
}));
vi.mock('@/lib/email/sender', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/sender')>()),
  emailSenderFromEnv: () => ({
    async send(m: EmailMessage) {
      if (!h.seenKeys.has(m.idempotencyKey)) {
        h.seenKeys.add(m.idempotencyKey);
        h.deliveries.push(m);
      }
      return { providerId: `msg-${m.idempotencyKey}` };
    },
  }),
}));
vi.mock('@/lib/auth/admin-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/admin-actions')>()),
  inviteUserToSchool: async (email: string) => {
    h.inviteCalls.push(email);
    if (h.authUsers.has(email)) return { exists: true };
    const id = randomUUID();
    h.authUsers.set(email, id);
    return { userId: id };
  },
}));
vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  requestEmailCode: async (email: string) => {
    h.passwordEmails.push(email);
  },
}));

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { POST as submitRoute } from '@/app/api/public/school-applications/route';
import { POST as verifyRoute } from '@/app/api/public/school-applications/verify/route';
import { POST as decideRoute } from '@/app/api/control/applications/[applicationId]/route';
import { GET as listInvitesRoute, POST as inviteRoute } from '@/app/api/app/staff/invitations/route';
import { POST as resendInviteRoute } from '@/app/api/app/staff/invitations/[invitationId]/resend/route';
import { recordSignIn } from '@/lib/onboarding/first-sign-in';
import { createInvitation, inviteSendHandler, resendInvitation } from '@/lib/onboarding/invitations';
import { markProvisioned } from '@/lib/onboarding/applications';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { inviteUserToSchool } from '@/lib/auth/admin-actions';
import type { ClaimedJob } from '@/lib/jobs/types';

const FOUNDER_ID = randomUUID();
const APPLICANT = {
  schoolName: 'St. Mary’s Convent School',
  city: 'Palwal',
  stateCode: 'IN-HR',
  board: 'CBSE',
  approxStudents: '850',
  principalName: 'Priya Sharma',
  email: 'priya.principal@school.test',
  mobile: '98765 43210',
};

function req(path: string, body: unknown, opts: { cookie?: string; ip?: string; method?: string } = {}): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${path}`, {
    method: opts.method ?? 'POST',
    body: opts.method === 'GET' ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': opts.ip ?? '203.0.113.7',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
  });
}

async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({
    sub,
    role: role as never,
    schoolId,
    membershipId: schoolId ? randomUUID() : null,
    tokenVersion: 0,
    aal: role === 'super_admin' ? 'aal2' : 'aal1',
    sessionId: randomUUID(),
  });
  return `${ACCESS_COOKIE}=${token}`;
}

const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
const count = async (sql: string, params: unknown[] = []) => Number((await q(sql, params))[0].n);

let applicationId = '';
let founderCookie = '';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-onboarding-flow-tests-0123456789';
  process.env.ONBOARDING_NOTIFY_EMAIL = 'founder@netcyberai.test';
  h.db = await createTestDb();
  founderCookie = await cookieFor(FOUNDER_ID, 'super_admin', null);
}, 60000);

describe('submit and confirm the email', () => {
  it('submits: one application, one audited step, one code email sent right after commit', async () => {
    const res = await submitRoute(req('/api/public/school-applications', APPLICANT));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ status: 'code_sent', maskedEmail: 'p•••l@school.test', codeSent: true });
    applicationId = body.applicationId;

    expect(h.deliveries).toHaveLength(1);
    expect(h.deliveries[0].to).toEqual([APPLICANT.email]);
    expect(h.deliveries[0].text).toMatch(/\b\d{6}\b/);
    const [job] = await q(`select status, payload from jobs where type = 'email.send'`);
    expect(job.status).toBe('succeeded');
    expect(job.payload.secret).toBeUndefined(); // the code is not kept
    expect(await count(`select count(*) n from audit_log where event_action = 'school_application.submitted'`)).toBe(1);
  });

  it('the same school and email again: the same application, no second code within a minute', async () => {
    const res = await submitRoute(req('/api/public/school-applications', { ...APPLICANT, schoolName: 'st marys convent school' }));
    const body = await res.json();
    expect(body).toMatchObject({ applicationId, codeSent: false });
    expect(await count(`select count(*) n from school_applications`)).toBe(1);
    expect(h.deliveries).toHaveLength(1);
  });

  it('a filled honeypot is refused and stores nothing', async () => {
    const res = await submitRoute(req('/api/public/school-applications', { ...APPLICANT, email: 'bot@x.test', website: 'http://spam' }));
    expect(res.status).toBe(400);
    expect(await count(`select count(*) n from school_applications`)).toBe(1);
  });

  it('a wrong code is counted; the right one confirms; confirming again changes nothing', async () => {
    const wrong = await verifyRoute(req('/api/public/school-applications/verify', { applicationId, code: '000000' }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'wrong_code', attemptsLeft: 4 });

    const code = h.deliveries[0].text.match(/\b(\d{6})\b/)![1];
    const ok = await verifyRoute(req('/api/public/school-applications/verify', { applicationId, code }));
    expect(await ok.json()).toEqual({ status: 'verified' });
    const again = await verifyRoute(req('/api/public/school-applications/verify', { applicationId, code }));
    expect(await again.json()).toEqual({ status: 'verified' });

    expect((await q(`select status from school_applications`))[0].status).toBe('email_verified');
    // The founder is told once.
    const notices = h.deliveries.filter((d) => d.to.includes('founder@netcyberai.test'));
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toContain(`/control/onboarding/applications/${applicationId}`);
  });
});

describe('approve: idempotent', () => {
  it('approving twice at once and once more gives one school, one invitation, one invite job, one account', async () => {
    const approve = () => decideRoute(req(`/api/control/applications/${applicationId}`, { action: 'approve' }, { cookie: founderCookie }), { params: { applicationId } });
    const results = await Promise.all([approve(), approve()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await approve()).status).toBe(200);

    expect(await count(`select count(*) n from schools`)).toBe(1);
    expect(await count(`select count(*) n from staff_invitations`)).toBe(1);
    expect(await count(`select count(*) n from jobs where type = 'invite.send'`)).toBe(1);
    expect(await count(`select count(*) n from users`)).toBe(1);
    expect(await count(`select count(*) n from memberships where role = 'principal'`)).toBe(1);
    expect(h.inviteCalls).toEqual([APPLICANT.email]);

    const [app] = await q(`select status, school_id, invitation_id from school_applications`);
    expect(app.status).toBe('provisioned');
    const [school] = await q(`select name, board::text, jurisdiction from schools`);
    expect(school).toEqual({ name: APPLICANT.schoolName, board: 'CBSE', jurisdiction: 'IN-HR' });
    const [inv] = await q(`select status, sends, role::text from staff_invitations`);
    expect(inv).toEqual({ status: 'sent', sends: 1, role: 'principal' });

    const steps = (await q(`select event_action from audit_log where target_id = $1 order by occurred_at`, [applicationId])).map((r) => r.event_action);
    expect(steps).toEqual([
      'school_application.submitted',
      'school_application.verify_email',
      'school_application.start_review',
      'school_application.approve',
      'school_application.provision',
    ]);
    expect(await count(`select count(*) n from audit_log where event_action = 'school.create'`)).toBe(1);
  });

  it('the invite job, run again by hand, does nothing more', async () => {
    const [job] = await q(`select job_id, type, payload, attempts, max_attempts, school_id, idempotency_key from jobs where type = 'invite.send'`);
    const handler = inviteSendHandler({
      platform: (fn) => h.db.platform(fn as never),
      queue: jobQueue,
      inviteUser: inviteUserToSchool,
      sendPasswordEmail: async () => {},
      markProvisioned,
    });
    const claimed: ClaimedJob = {
      jobId: job.job_id,
      type: job.type,
      payload: job.payload,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      schoolId: job.school_id,
      idempotencyKey: job.idempotency_key,
    };
    await handler(claimed);
    await handler(claimed);
    expect(h.inviteCalls).toHaveLength(1);
    expect(await count(`select count(*) n from memberships`)).toBe(1);
    expect((await q(`select sends from staff_invitations`))[0].sends).toBe(1);
  });

  it('"Resend invite" sends one password email, even when clicked twice before the job runs', async () => {
    const resend = () => decideRoute(req(`/api/control/applications/${applicationId}`, { action: 'resend_invite' }, { cookie: founderCookie }), { params: { applicationId } });
    await Promise.all([resend(), resend()]);
    expect(h.passwordEmails).toEqual([APPLICANT.email]);
    expect((await q(`select sends from staff_invitations`))[0].sends).toBe(2);
  });

  it('rejecting an approved school is refused', async () => {
    const res = await decideRoute(req(`/api/control/applications/${applicationId}`, { action: 'reject', reason: 'duplicate school' }, { cookie: founderCookie }), {
      params: { applicationId },
    });
    expect(res.status).toBe(409);
  });
});

describe('first sign-in, then the principal invites staff', () => {
  let schoolId = '';
  let principalId = '';

  it('the principal’s first sign-in accepts the invitation and makes the school active, once', async () => {
    principalId = h.authUsers.get(APPLICANT.email)!;
    await recordSignIn(principalId);
    await recordSignIn(principalId);
    const [app] = await q(`select status, school_id from school_applications`);
    expect(app.status).toBe('active');
    schoolId = app.school_id;
    expect((await q(`select status from staff_invitations`))[0].status).toBe('accepted');
    expect(await count(`select count(*) n from audit_log where event_action = 'staff_invitation.accepted'`)).toBe(1);
    expect(await count(`select count(*) n from audit_log where event_action = 'school_application.activate'`)).toBe(1);
  });

  it('the principal invites a teacher: the job gives them the school with the role the principal chose', async () => {
    const cookie = await cookieFor(principalId, 'principal', schoolId);
    const res = await inviteRoute(req('/api/app/staff/invitations', { email: 'Ravi.Teacher@school.test', displayName: 'Ravi Kumar', role: 'teacher' }, { cookie }));
    expect(res.status).toBe(201);
    const teacherId = h.authUsers.get('ravi.teacher@school.test')!;
    const rows = await q(`select role::text from memberships where user_id = $1 and school_id = $2`, [teacherId, schoolId]);
    expect(rows).toEqual([{ role: 'teacher' }]);

    const again = await inviteRoute(req('/api/app/staff/invitations', { email: 'ravi.teacher@school.test', displayName: 'Ravi Kumar', role: 'teacher' }, { cookie }));
    expect(again.status).toBe(409);
    for (const role of ['parent', 'student', 'super_admin', 'principal']) {
      const r = await inviteRoute(req('/api/app/staff/invitations', { email: `${role}@school.test`, displayName: 'Someone Else', role }, { cookie }));
      expect(r.status).toBe(403);
    }
    const listed = await (await listInvitesRoute(req('/api/app/staff/invitations', null, { cookie, method: 'GET' }))).json();
    expect(listed.invitations.map((i: { email: string }) => i.email).sort()).toEqual([APPLICANT.email, 'ravi.teacher@school.test']);
  });

  it('a principal inviting an email that already has an account attaches nothing and emails nobody (security review)', async () => {
    const cookie = await cookieFor(principalId, 'principal', schoolId);
    const before = h.deliveries.length;
    // ravi.teacher already has an account (from the first school's invitation above) … use a second school:
    const otherSchool = randomUUID();
    await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Attacker School', 'IN-RJ')`, [otherSchool]);
    const attacker = await cookieFor(randomUUID(), 'principal', otherSchool);
    const res = await inviteRoute(req('/api/app/staff/invitations', { email: APPLICANT.email, displayName: 'Victim', role: 'teacher' }, { cookie: attacker }));
    expect(res.status).toBe(201);
    const victimId = h.authUsers.get(APPLICANT.email)!;
    expect(await count(`select count(*) n from memberships where user_id = $1 and school_id = $2`, [victimId, otherSchool])).toBe(0);
    const [inv] = await q(`select status, auth_user_id from staff_invitations where school_id = $1`, [otherSchool]);
    expect(inv).toEqual({ status: 'needs_founder', auth_user_id: null });
    expect(h.deliveries.length).toBe(before);
    expect(await count(`select count(*) n from jobs where idempotency_key like 'email.send:added_to_school:%' and school_id = $1`, [otherSchool])).toBe(0);
    expect(await count(`select count(*) n from audit_log where event_action = 'staff_invitation.needs_founder'`)).toBe(1);
    // The victim's own school still lists nothing new, and the principal's own session is unaffected.
    expect((await inviteRoute(req('/api/app/staff/invitations', { email: APPLICANT.email, displayName: 'Victim', role: 'teacher' }, { cookie: attacker }))).status).toBe(409);
    void cookie;
  });

  it('a teacher cannot invite, and another school sees none of these invitations', async () => {
    const teacherCookie = await cookieFor(randomUUID(), 'teacher', schoolId);
    const r = await inviteRoute(req('/api/app/staff/invitations', { email: 'x@school.test', displayName: 'Xavier', role: 'teacher' }, { cookie: teacherCookie }));
    expect(r.status).toBe(403);

    const otherSchool = randomUUID();
    await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Other School', 'IN-DL')`, [otherSchool]);
    const otherCookie = await cookieFor(randomUUID(), 'principal', otherSchool);
    const listed = await (await listInvitesRoute(req('/api/app/staff/invitations', null, { cookie: otherCookie, method: 'GET' }))).json();
    expect(listed.invitations).toEqual([]);
    const [inv] = await q(`select invitation_id from staff_invitations where email_key = 'ravi.teacher@school.test'`);
    const resend = await resendInviteRoute(req(`/api/app/staff/invitations/${inv.invitation_id}/resend`, {}, { cookie: otherCookie }), {
      params: { invitationId: inv.invitation_id },
    });
    expect(resend.status).toBe(404);
  });
});

describe('abuse limits', () => {
  it('more than 5 applications an hour from one address are refused', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await submitRoute(req('/api/public/school-applications', { ...APPLICANT, schoolName: `Limit School ${i}`, email: `limit${i}@school.test` }, { ip: '198.51.100.9' }));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    // Only hashed keys are stored, never the address.
    const keys = await q(`select key_hash from intake_rate_events`);
    expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k.key_hash))).toBe(true);
    expect(JSON.stringify(keys)).not.toContain('198.51.100.9');
  });
});

describe('invite job retries after a failure part-way (code-review findings)', () => {
  // The provisioning transaction (the one that inserts the user) fails once.
  function flakyPlatform() {
    let failed = false;
    return <T>(fn: (db: never) => Promise<T>) =>
      h.db.platform(async (db) => {
        if (!failed) {
          const wrapped = {
            query: async (sql: string, params?: unknown[]) => {
              if (!failed && /^\s*insert into users/.test(sql)) {
                failed = true;
                throw new Error('connection reset');
              }
              return db.query(sql, params);
            },
          };
          return fn(wrapped as never);
        }
        return fn(db as never);
      });
  }
  const claimedFrom = async (key: string): Promise<ClaimedJob> => {
    const [j] = await q(`select job_id, type, payload, attempts, max_attempts, school_id, idempotency_key from jobs where idempotency_key = $1`, [key]);
    return { jobId: j.job_id, type: j.type, payload: j.payload, attempts: 1, maxAttempts: 8, schoolId: j.school_id, idempotencyKey: j.idempotency_key };
  };

  it('an existing account invited to another school still gets its "added to school" email, once', async () => {
    const schoolC = randomUUID();
    await q(`insert into schools (school_id, name, jurisdiction) values ($1, 'Third School', 'IN-PB')`, [schoolC]);
    const { jobKeys } = await h.db.platform((db) =>
      createInvitation(db, jobQueue, {
        schoolId: schoolC,
        email: APPLICANT.email, // already has an account (the first school's principal)
        displayName: 'Priya Sharma',
        role: 'principal',
        source: 'application', // an approved application: the email was proven by code
        invitedBy: { userId: FOUNDER_ID, role: 'super_admin' },
        redirectTo: 'https://www.netcyberai.test/login',
      })
    );
    const handler = inviteSendHandler({ platform: flakyPlatform(), queue: jobQueue, inviteUser: inviteUserToSchool, sendPasswordEmail: async () => {}, markProvisioned });
    const job = await claimedFrom(jobKeys[0]);
    await expect(handler(job)).rejects.toThrow('connection reset');
    await handler(job);
    expect(await count(`select count(*) n from jobs where idempotency_key like 'email.send:added_to_school:%'`)).toBe(1);
    expect(await count(`select count(*) n from memberships where school_id = $1`, [schoolC])).toBe(1);
  });

  it('a resend whose bookkeeping failed does not send the password email again', async () => {
    const [inv] = await q(`select invitation_id, sends from staff_invitations where email_key = 'ravi.teacher@school.test'`);
    const { jobKeys } = await h.db.platform((db) =>
      resendInvitation(db, jobQueue, inv.invitation_id, { userId: FOUNDER_ID, role: 'super_admin' }, 'https://www.netcyberai.test/login')
    );
    const sent: string[] = [];
    const handler = inviteSendHandler({
      platform: flakyPlatform(),
      queue: jobQueue,
      inviteUser: inviteUserToSchool,
      sendPasswordEmail: async (email) => {
        sent.push(email);
      },
      markProvisioned,
    });
    await expect(handler(await claimedFrom(jobKeys[0]))).rejects.toThrow('connection reset');
    await handler(await claimedFrom(jobKeys[0])); // the retry reads the job again
    expect(sent).toEqual(['ravi.teacher@school.test']);
    expect((await q(`select sends from staff_invitations where invitation_id = $1`, [inv.invitation_id]))[0].sends).toBe(Number(inv.sends) + 1);
  });
});
