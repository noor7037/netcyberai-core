import { PermanentJobError } from '@/lib/jobs/types';

// Transactional email from the app itself (C97): verification codes for
// school applications, and notices to the founder. Supabase Auth keeps
// sending its own emails (invites, sign-in codes, password resets) through
// its SMTP settings. Behind an interface so the provider can change; today
// it is Resend's HTTP API, the same provider Supabase's SMTP already uses
// (build plan B7), called with fetch, so no new package.

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  // The job's idempotency key: Resend returns the first result for a
  // repeated key (24 hours), so a retried job never sends twice.
  idempotencyKey: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerId: string }>;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('email is not configured: RESEND_API_KEY and EMAIL_FROM are required');
    this.name = 'EmailNotConfiguredError';
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(message: EmailMessage): Promise<{ providerId: string }> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: this.from, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok && body.id) return { providerId: body.id };
    const reason = `email service answered ${res.status}${body.name ? ` ${body.name}` : ''}`;
    // 4xx other than 408/409/429 means the request itself is wrong (bad
    // address, unverified sender): retrying cannot help.
    if (res.status >= 400 && res.status < 500 && ![408, 409, 429].includes(res.status)) throw new PermanentJobError(reason);
    throw new Error(reason);
  }
}

// null when not configured; a job that needs email then fails and retries,
// and sends once the settings exist.
export function emailSenderFromEnv(): EmailSender | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return apiKey && from ? new ResendEmailSender(apiKey, from) : null;
}
