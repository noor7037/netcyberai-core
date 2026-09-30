import { EmailNotConfiguredError, type EmailSender } from '@/lib/email/sender';
import { renderEmail } from '@/lib/email/templates';
import { PermanentJobError, type JobHandler, type Sql } from './types';

// email.send (C97). Payload: { to: string[] | 'founders', template, data,
// secret? }. `secret` (a one-time code) is removed from the job once it is
// finished. Idempotent on the job's key: the email service is given that
// key, and returns the first result again for a repeat (Resend keeps keys
// for 24 hours), so a job that ran twice sends one email.

export type EmailDeps = {
  sender: () => EmailSender | null;
  platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
};

// Founder notices go to ONBOARDING_NOTIFY_EMAIL (comma-separated) when set,
// otherwise to every active platform admin with an email.
async function founderAddresses(deps: EmailDeps): Promise<string[]> {
  const configured = (process.env.ONBOARDING_NOTIFY_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  return deps.platform(async (db) => {
    const { rows } = await db.query(`select email from users where role = 'super_admin' and is_active and email is not null order by created_at`);
    return rows.map((r) => r.email as string);
  });
}

export function emailSendHandler(deps: EmailDeps): JobHandler {
  return async (job) => {
    const { to, template, data, secret } = job.payload as Record<string, unknown>;
    if (typeof template !== 'string' || typeof data !== 'object' || data === null) throw new PermanentJobError('email.send payload is invalid');
    const recipients =
      to === 'founders'
        ? await founderAddresses(deps)
        : Array.isArray(to) && to.every((t) => typeof t === 'string')
          ? (to as string[])
          : null;
    if (!recipients) throw new PermanentJobError('email.send payload has no recipients');
    if (recipients.length === 0) throw new PermanentJobError('no founder email address is known');
    const rendered = renderEmail(template, data as Record<string, unknown>, (secret as Record<string, unknown> | undefined) ?? {});
    const sender = deps.sender();
    if (!sender) throw new EmailNotConfiguredError();
    await sender.send({ to: recipients, ...rendered, idempotencyKey: job.idempotencyKey });
    return { redact: ['secret'] };
  };
}
