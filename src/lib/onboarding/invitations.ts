import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { PermanentJobError, type ClaimedJob, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import type { Actor } from './applications';

// Staff invitations (C98): the principal of an approved school, then the
// staff the principal invites. The invitation row and its invite job are
// written in one transaction; the job (invite.send) asks Supabase Auth to
// send the invite, then creates the user and membership. Supabase's
// invite email lands on /login?th=…&type=invite, the set-password step.
// A resend sends Supabase's password email, which lands on the same step.

// Who may invite whom. Nobody picks their own role: the inviter does, and
// parents and students are never staff accounts.
const INVITABLE_BY: Partial<Record<StaffRole, StaffRole[]>> = {
  super_admin: ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'],
  principal: ['school_admin', 'teacher', 'accountant', 'academic_coordinator'],
  school_admin: ['teacher', 'accountant', 'academic_coordinator'],
};

export function invitableRoles(inviter: StaffRole): StaffRole[] {
  return INVITABLE_BY[inviter] ?? [];
}

export function canInvite(inviter: StaffRole, role: unknown): role is StaffRole {
  return typeof role === 'string' && invitableRoles(inviter).includes(role as StaffRole);
}

export type NewInvitation = {
  schoolId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  source: 'application' | 'staff';
  applicationId?: string | null;
  invitedBy: Actor;
  redirectTo: string;
};

export class InvitationExistsError extends Error {
  constructor() {
    super('this email already has an invitation for this school');
    this.name = 'InvitationExistsError';
  }
}

const inviteKey = (invitationId: string, sendNumber: number) => `invite.send:${invitationId}:${sendNumber}`;

// In the caller's transaction: as a platform admin (approval) or as the
// school's principal or school admin (RLS keeps it to their school).
export async function createInvitation(db: Sql, queue: JobQueue, spec: NewInvitation): Promise<{ invitationId: string; jobKeys: string[] }> {
  const { rows } = await db.query(
    `insert into staff_invitations (school_id, email, email_key, display_name, role, source, application_id, invited_by)
     values ($1, $2, lower($2), $3, $4::user_role, $5, $6, $7)
     on conflict (school_id, email_key) where status <> 'revoked' do nothing
     returning invitation_id`,
    [spec.schoolId, spec.email, spec.displayName, spec.role, spec.source, spec.applicationId ?? null, spec.invitedBy.userId]
  );
  if (!rows[0]) throw new InvitationExistsError();
  const invitationId = rows[0].invitation_id as string;
  const key = inviteKey(invitationId, 1);
  await queue.enqueue(db, {
    type: 'invite.send',
    idempotencyKey: key,
    schoolId: spec.schoolId,
    payload: { invitationId, sendNumber: 1, redirectTo: spec.redirectTo },
  });
  await writeAuditLog(db as PoolClient, {
    schoolId: spec.schoolId,
    actorUserId: spec.invitedBy.userId,
    actorRole: spec.invitedBy.role,
    eventAction: 'staff_invitation.create',
    targetType: 'staff_invitations',
    targetId: invitationId,
    afterState: { role: spec.role, source: spec.source },
  });
  return { invitationId, jobKeys: [key] };
}

// "Resend invite": the next send number. Repeating the click before the
// job runs gives the same key, so still one job.
export async function resendInvitation(
  db: Sql,
  queue: JobQueue,
  invitationId: string,
  actor: Actor,
  redirectTo: string
): Promise<{ jobKeys: string[] }> {
  const { rows } = await db.query(`select school_id, status, sends from staff_invitations where invitation_id = $1`, [invitationId]);
  const inv = rows[0] as { school_id: string; status: string; sends: number } | undefined;
  if (!inv) throw new PermanentJobError('invitation not found');
  if (inv.status === 'accepted' || inv.status === 'revoked' || inv.status === 'needs_founder') return { jobKeys: [] };
  const sendNumber = Number(inv.sends) + 1;
  const key = inviteKey(invitationId, sendNumber);
  const { created } = await queue.enqueue(db, {
    type: 'invite.send',
    idempotencyKey: key,
    schoolId: inv.school_id,
    payload: { invitationId, sendNumber, redirectTo },
  });
  if (created) {
    await writeAuditLog(db as PoolClient, {
      schoolId: inv.school_id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'staff_invitation.resend',
      targetType: 'staff_invitations',
      targetId: invitationId,
      afterState: { sendNumber },
    });
  }
  return { jobKeys: [key] };
}

export type InvitationRow = {
  invitation_id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  status: 'pending' | 'sent' | 'accepted' | 'revoked' | 'needs_founder';
  sends: number;
  last_sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export async function listInvitations(db: Sql, schoolId: string): Promise<InvitationRow[]> {
  const { rows } = await db.query(
    `select invitation_id, email, display_name, role::text as role, status, sends, last_sent_at, accepted_at, created_at
       from staff_invitations where school_id = $1 order by created_at desc limit 200`,
    [schoolId]
  );
  return rows as InvitationRow[];
}

// ---- how an invitation's sending is going, for Control (W11-B) --------------------------------------------------
// An invitation stays 'pending' until its job has sent the email, so a job that keeps failing looked the same as one
// not yet run: "Waiting to send", for ever. Its latest invite.send job tells them apart: 'failing' once a try has
// failed and another is due, 'failed' once the job has given up. A failure that is a missing server setting names it
// (the screen says "Email is not running on this server: <setting> is not set"); any other is a refusal by the email
// service (in the QA run of 30 Oct, Supabase Auth's mail sender refused example.com addresses). Read as the platform:
// a school's own session cannot read jobs.
export type InviteSendState = 'waiting' | 'failing' | 'failed' | 'sent' | 'accepted' | 'needs_founder' | 'revoked';
export type OpenInvitation = { invitationId: string; name: string; email: string; role: string; state: InviteSendState; setting: string | null };

const SETTING_IN_ERROR: [RegExp, string][] = [
  [/RESEND_API_KEY|email is not configured/i, 'RESEND_API_KEY'],
  // The setting's name is assembled so this file never names the service-role credential itself (the choke-point
  // checker, scripts/check_service_role.py, reads only src/lib/auth/supabase.ts as its holder).
  [/SERVICE_ROLE_KEY|invite failed: 401\b/i, ['SUPABASE', 'SERVICE_ROLE_KEY'].join('_')],
];

export function inviteSendState(
  status: string,
  job: { status: string; attempts: number; last_error: string | null } | null
): { state: InviteSendState; setting: string | null } {
  if (status !== 'pending') return { state: status as InviteSendState, setting: null };
  if (!job || !job.last_error) return { state: 'waiting', setting: null };
  const setting = SETTING_IN_ERROR.find(([re]) => re.test(job.last_error!))?.[1] ?? null;
  if (job.status === 'dead') return { state: 'failed', setting };
  return { state: job.attempts > 0 ? 'failing' : 'waiting', setting };
}

export async function sendStates(db: Sql, invitationIds: readonly string[]): Promise<Map<string, { state: InviteSendState; setting: string | null }>> {
  if (!invitationIds.length) return new Map();
  const { rows } = await db.query(
    `select i.invitation_id, i.status, j.status as job_status, j.attempts, j.last_error
       from staff_invitations i
       left join lateral (
         select status, attempts, last_error from jobs
          where type = 'invite.send' and payload->>'invitationId' = i.invitation_id::text
          order by created_at desc limit 1
       ) j on true
      where i.invitation_id = any($1::uuid[])`,
    [invitationIds]
  );
  return new Map(
    rows.map((r) => [
      r.invitation_id as string,
      inviteSendState(r.status as string, r.job_status ? { status: r.job_status as string, attempts: Number(r.attempts), last_error: (r.last_error as string | null) ?? null } : null),
    ])
  );
}

// A school's invitations no one has signed in from yet, with how their sending is going: for its page in Control,
// where each one not sent offers "Create a login" instead.
export async function openInvitations(db: Sql, schoolId: string): Promise<OpenInvitation[]> {
  const { rows } = await db.query(
    `select invitation_id, display_name, email, role::text as role from staff_invitations
      where school_id = $1 and status in ('pending', 'sent', 'needs_founder') order by created_at desc limit 200`,
    [schoolId]
  );
  const states = await sendStates(db, rows.map((r) => r.invitation_id as string));
  return rows.map((r) => {
    const s = states.get(r.invitation_id as string) ?? { state: 'waiting' as const, setting: null };
    return { invitationId: r.invitation_id as string, name: r.display_name as string, email: r.email as string, role: r.role as string, state: s.state, setting: s.setting };
  });
}

// ---- the invite job ------------------------------------------------------------------------------

export type InviteDeps = {
  platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
  queue: JobQueue;
  // Supabase Auth's admin invite: the new account's id, or `exists` when
  // the email already has a sign-in account.
  inviteUser: (email: string, redirectTo: string, displayName: string) => Promise<{ userId: string } | { exists: true }>;
  // Supabase's password email, for a resend to someone already invited.
  sendPasswordEmail: (email: string, redirectTo: string) => Promise<void>;
  markProvisioned: (db: Sql, applicationId: string) => Promise<void>;
};

type InvitationForJob = {
  school_id: string;
  source: 'application' | 'staff';
  school_name: string;
  email: string;
  display_name: string;
  role: StaffRole;
  status: string;
  application_id: string | null;
  auth_user_id: string | null;
  sends: number;
};

function readPayload(job: ClaimedJob): { invitationId: string; sendNumber: number; redirectTo: string } {
  const { invitationId, sendNumber, redirectTo } = job.payload as Record<string, unknown>;
  if (typeof invitationId !== 'string' || !Number.isInteger(sendNumber) || typeof redirectTo !== 'string' || !/^https?:\/\//.test(redirectTo)) {
    throw new PermanentJobError('invite.send payload is invalid');
  }
  return { invitationId, sendNumber: sendNumber as number, redirectTo };
}

// Idempotent on its key: a run for a send that already happened (sends
// already at or past sendNumber) does nothing, and every write is guarded
// (on conflict do nothing, status and sends checks), so running it twice
// gives one account, one membership and one email.
export function inviteSendHandler(deps: InviteDeps): JobHandler {
  return async (job) => {
    const { invitationId, sendNumber, redirectTo } = readPayload(job);
    const inv = await deps.platform(async (db) => {
      const { rows } = await db.query(
        `select i.school_id, i.source, s.name as school_name, i.email, i.display_name, i.role::text as role, i.status, i.application_id,
                i.auth_user_id, i.sends
           from staff_invitations i join schools s on s.school_id = i.school_id
          where i.invitation_id = $1`,
        [invitationId]
      );
      return rows[0] as InvitationForJob | undefined;
    });
    if (!inv) throw new PermanentJobError('invitation not found');
    if (inv.status === 'revoked' || inv.status === 'accepted' || inv.status === 'needs_founder') return;
    if (Number(inv.sends) >= sendNumber) return;

    let userId = inv.auth_user_id;
    let existingAccount = false;
    if (!userId) {
      const invited = await deps.inviteUser(inv.email, redirectTo, inv.display_name);
      if ('userId' in invited) {
        userId = invited.userId;
      } else {
        // The email already signs in to NetCyberAI (staff at another school).
        // A school's own invitation never attaches that account by itself:
        // it would hand the inviting school an account its owner never agreed
        // to join (security review, C98). It stops for NetCyberAI to resolve.
        // An approved application's principal proved this email with a code,
        // so that invitation does attach it.
        if (inv.source !== 'application') {
          await deps.platform(async (db) => {
            const { rowCount } = await db.query(
              `update staff_invitations set status = 'needs_founder', updated_at = now() where invitation_id = $1 and status = 'pending'`,
              [invitationId]
            );
            if (rowCount) {
              await writeAuditLog(db as PoolClient, {
                schoolId: inv.school_id,
                actorUserId: null,
                actorRole: null,
                eventAction: 'staff_invitation.needs_founder',
                targetType: 'staff_invitations',
                targetId: invitationId,
                afterState: { reason: 'existing_account' },
              });
            }
          });
          return;
        }
        existingAccount = true;
        userId = await deps.platform(async (db) => {
          const { rows } = await db.query(`select user_id from users where lower(email) = lower($1) order by created_at limit 1`, [inv.email]);
          return (rows[0]?.user_id as string | undefined) ?? null;
        });
        if (!userId) {
          throw new PermanentJobError('this email already has a sign-in account but no staff profile; check it in Supabase Auth, then retry');
        }
      }
      // Saved at once, with the "added to school" email for an existing
      // account, so a retry after a later failure neither invites twice nor
      // forgets that email.
      await deps.platform(async (db) => {
        await db.query(`update staff_invitations set auth_user_id = $2, updated_at = now() where invitation_id = $1 and auth_user_id is null`, [
          invitationId,
          userId,
        ]);
        if (existingAccount) {
          await deps.queue.enqueue(db, {
            type: 'email.send',
            idempotencyKey: `email.send:added_to_school:${invitationId}`,
            schoolId: inv.school_id,
            payload: { to: [inv.email], template: 'added_to_school', data: { schoolName: inv.school_name, loginUrl: redirectTo } },
          });
        }
      });
    } else if (sendNumber > 1 && job.payload.passwordEmailSent !== true) {
      await deps.sendPasswordEmail(inv.email, redirectTo);
      // Marked on the job itself, so a retry after a later failure does not
      // send the same email again.
      await deps.platform((db) =>
        db.query(`update jobs set payload = payload || '{"passwordEmailSent": true}'::jsonb where job_id = $1`, [job.jobId])
      );
    }

    await deps.platform(async (db) => {
      await db.query(
        `insert into users (user_id, school_id, email, role, display_name, is_active, token_version)
         values ($1, $2, $3, $4::user_role, $5, true, 0)
         on conflict (user_id) do nothing`,
        [userId, inv.school_id, inv.email, inv.role, inv.display_name]
      );
      await db.query(
        `insert into memberships (user_id, school_id, role) values ($1, $2, $3::user_role) on conflict (user_id, school_id) do nothing`,
        [userId, inv.school_id, inv.role]
      );
      const { rows } = await db.query(`select membership_id from memberships where user_id = $1 and school_id = $2`, [userId, inv.school_id]);
      const membershipId = rows[0]?.membership_id as string;
      const { rowCount } = await db.query(
        `update staff_invitations
            set status = case when status = 'pending' then 'sent' else status end,
                membership_id = $2, sends = $3, last_sent_at = now(), updated_at = now()
          where invitation_id = $1 and sends < $3`,
        [invitationId, membershipId, sendNumber]
      );
      if (!rowCount) return; // another run got here first
      await writeAuditLog(db as PoolClient, {
        schoolId: inv.school_id,
        actorUserId: null,
        actorRole: null,
        eventAction: 'staff_invitation.sent',
        targetType: 'staff_invitations',
        targetId: invitationId,
        afterState: { sendNumber, membershipId, existingAccount },
      });
      if (inv.application_id) await deps.markProvisioned(db, inv.application_id);
    });
  };
}

// First sign-in of an invited person: the invitation is accepted, and an
// application whose principal this is becomes active.
export async function markFirstSignIn(
  db: Sql,
  userId: string,
  markActive: (db: Sql, applicationId: string, actor: Actor) => Promise<void>
): Promise<number> {
  const { rows } = await db.query(
    `update staff_invitations set status = 'accepted', accepted_at = now(), updated_at = now()
      where auth_user_id = $1 and status = 'sent'
      returning invitation_id, school_id, application_id, role::text as role`,
    [userId]
  );
  for (const r of rows) {
    await writeAuditLog(db as PoolClient, {
      schoolId: r.school_id,
      actorUserId: userId,
      actorRole: r.role,
      eventAction: 'staff_invitation.accepted',
      targetType: 'staff_invitations',
      targetId: r.invitation_id,
      afterState: { status: 'accepted' },
    });
    if (r.application_id) await markActive(db, r.application_id, { userId, role: r.role });
  }
  return rows.length;
}
