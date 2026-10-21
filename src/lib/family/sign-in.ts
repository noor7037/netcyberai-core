import { createHmac, randomInt, randomUUID } from 'crypto';
import { emailSenderFromEnv, type EmailSender } from '@/lib/email/sender';
import { t, type Lang } from '@/lib/i18n';
import { withFamilyGate } from './db';
import { familyHashKey } from './secret';

// Sign-in by a one-time email code (docs/family-app/03 §3, M1-2, C248). Families are not Supabase Auth users: the
// staff code has no per-code try limit and its expiry is one setting shared with staff sign-in, so the Family app keeps
// one code store of its own (family.sign_in_codes, C247) and sends through the platform's email sender (Resend).
//
// - The code is random (crypto.randomInt), six digits, and never stored, logged or returned: the database keeps a
//   keyed hash of it, bound to the email, so a copy of the table opens nothing.
// - 10 minutes, 5 tries, a new code ends the old one; 3 codes in 15 minutes and 10 a day per email, 20 an hour per
//   network (the database functions hold all of it).
// - The answer to "send me a code" is the same whether or not an account exists: the account is made on first sign-in.

export type CodePurpose = 'sign_in' | 'pin_reset';
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeFamilyEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '');
  return /^[0-9]{6}$/.test(code) ? code : null;
}

const keyed = (label: string, value: string) => createHmac('sha256', familyHashKey('sign-in-codes.v1')).update(`${label}\u0000${value}`).digest('hex');
export const emailKey = (email: string) => keyed('email', email);
export const codeKey = (email: string, purpose: CodePurpose, code: string) => keyed(`code:${purpose}`, `${email}\u0000${code}`);
export const networkKey = (ip: string) => keyed('ip', ip);

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// The caller's network address as the platform reports it (the first x-forwarded-for entry on Vercel).
export function clientAddress(headers: Headers): string | null {
  const first = (headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
  return first || headers.get('x-real-ip') || null;
}

export type RequestCodeResult = { status: 'sent' } | { status: 'rate_limited' } | { status: 'email_unavailable' };

// Make a code, store its hash, and email it. `run` is the database door (withFamilyGate); tests pass their own.
export async function requestCode(
  input: { email: string; purpose: CodePurpose; ip: string | null; lang: Lang },
  deps: { sender?: EmailSender | null; run?: <T>(fn: (db: Db) => Promise<T>) => Promise<T>; code?: () => string } = {}
): Promise<RequestCodeResult> {
  const sender = deps.sender === undefined ? emailSenderFromEnv() : deps.sender;
  if (!sender) return { status: 'email_unavailable' };
  const run = deps.run ?? (withFamilyGate as unknown as <T>(fn: (db: Db) => Promise<T>) => Promise<T>);
  const code = (deps.code ?? newCode)();
  const issued = await run(async (db) => {
    const { rows } = await db.query(`select family.issue_code($1, $2, $3, $4) as r`, [
      input.purpose,
      emailKey(input.email),
      codeKey(input.email, input.purpose, code),
      input.ip ? networkKey(input.ip) : null,
    ]);
    return String(rows[0]?.r);
  });
  if (issued === 'rate_limited') return { status: 'rate_limited' };
  const kind = input.purpose === 'pin_reset' ? 'pinReset' : 'signIn';
  await sender.send({
    to: [input.email],
    subject: t(input.lang, `fam.email.${kind}.subject`),
    text: t(input.lang, `fam.email.${kind}.text`, { code }),
    html: `<p>${t(input.lang, `fam.email.${kind}.text`, { code: `<strong style="font-size:20px;letter-spacing:4px">${code}</strong>` })}</p>`,
    idempotencyKey: `family-code-${randomUUID()}`,
  });
  return { status: 'sent' };
}

export type SignInResult =
  | { status: 'ok'; accountId: string; tokenVersion: number; isNew: boolean }
  | { status: 'wrong' | 'locked' | 'expired' | 'none' };

// Check a sign-in code; only a right one opens (or makes) the account for this same email.
export async function signInWithCode(email: string, code: string, run: <T>(fn: (db: Db) => Promise<T>) => Promise<T> = withFamilyGate as never): Promise<SignInResult> {
  return run(async (db) => {
    const { rows } = await db.query(`select outcome, account_id, token_version, is_new from family.sign_in($1, $2, $3)`, [email, emailKey(email), codeKey(email, 'sign_in', code)]);
    const r = rows[0] ?? {};
    if (r.outcome === 'ok') return { status: 'ok', accountId: String(r.account_id), tokenVersion: Number(r.token_version), isNew: r.is_new === true };
    const status = ['wrong', 'locked', 'expired', 'none'].includes(String(r.outcome)) ? (String(r.outcome) as 'wrong') : 'none';
    return { status };
  });
}

// Check a PIN-reset code for the signed-in account's own email, inside that account's transaction.
export async function redeemPinResetCode(db: Db, email: string, code: string): Promise<'ok' | 'wrong' | 'locked' | 'expired' | 'none'> {
  const { rows } = await db.query(`select family.redeem_code('pin_reset', $1, $2) as r`, [emailKey(email), codeKey(email, 'pin_reset', code)]);
  const r = String(rows[0]?.r);
  return (['ok', 'wrong', 'locked', 'expired'].includes(r) ? r : 'none') as 'ok';
}
