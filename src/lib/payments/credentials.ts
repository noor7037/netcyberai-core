import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { writeAuditLog, writeEntitlementAudit } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';

// A school's payment-provider keys (docs/24 §3.8, C171).
//
// - Encrypted here, in the app, with AES-256-GCM. The key is in the server's
//   environment and nowhere else, so a copy of the database reveals nothing.
//   Each row records the key version it was sealed with.
// - Bound to its place: the school, provider and mode are authenticated with
//   the ciphertext, so a row copied onto another school does not open.
// - WRITE-ONLY. Nothing in this file returns a key to a caller that is not
//   the server's own payment path (`openCredentials`). A screen gets
//   `CredentialsMeta`: the last four characters of the key id, who saved it
//   and when. No key goes into a response, a log line or an audit row.
// - Test and live are separate rows, and a test key is refused as a live one.
//
// Every statement runs as the platform role: the app's own role holds no
// right on payment_credentials at all. The school id is always the caller's
// verified one, never taken from a request.

export const GATEWAYS = ['razorpay'] as const;
export type Gateway = (typeof GATEWAYS)[number];
export const MODES = ['test', 'live'] as const;
export type Mode = (typeof MODES)[number];
export type ProviderKeys = { keyId: string; keySecret: string; webhookSecret: string };
export type CredentialsMeta = { configId: string; provider: Gateway; mode: Mode; keyLast4: string; savedAt: string; savedByName: string | null; savedFrom: 'school' | 'control'; testedAt: string | null; testOk: boolean | null; testMessage: string | null };

type EncryptionKey = { key: Buffer; version: number };

// The key the server was given, if any. 32 bytes, base64. It is never created or printed by the app.
export function encryptionKey(env: Record<string, string | undefined> = process.env): EncryptionKey | null {
  return keyFromEnv(env.PAYMENT_CREDENTIALS_KEY, env.PAYMENT_CREDENTIALS_KEY_VERSION);
}

// A sealing key in the server's format: 32 bytes as base64, and a whole version from 1 (1 when unset). Shared with the
// AI providers' key (src/lib/ai/credentials.ts), which is a different variable.
export function keyFromEnv(rawKey: string | undefined, rawVersion: string | undefined): EncryptionKey | null {
  const raw = rawKey ?? '';
  const key = /^[A-Za-z0-9+/=_-]{43,44}$/.test(raw) ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  const version = Number(rawVersion ?? '1');
  return key.length === 32 && Number.isInteger(version) && version >= 1 ? { key, version } : null;
}

const place = (schoolId: string, provider: string, mode: string) => Buffer.from(`${schoolId}:${provider}:${mode}`);

export function seal(k: EncryptionKey, schoolId: string, provider: string, mode: string, keys: ProviderKeys): { ciphertext: string; iv: string; tag: string; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k.key, iv);
  cipher.setAAD(place(schoolId, provider, mode));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: k.version };
}

// Throws when the key is not the one the row was sealed with, or the row was moved or changed.
export function unseal(k: EncryptionKey, schoolId: string, provider: string, mode: string, row: { ciphertext: string; iv: string; tag: string; key_version: number }): ProviderKeys {
  if (row.key_version !== k.version) throw new Error('payment credentials were saved with another key version');
  const decipher = createDecipheriv('aes-256-gcm', k.key, Buffer.from(row.iv, 'base64'));
  decipher.setAAD(place(schoolId, provider, mode));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as ProviderKeys;
}

// The shape Razorpay gives: a key id that says which mode it is for, a key secret, and the secret set on the webhook.
export function keysProblem(provider: Gateway, mode: Mode, keys: ProviderKeys): 'key_id' | 'wrong_mode' | 'key_secret' | 'webhook_secret' | null {
  const m = /^rzp_(test|live)_[A-Za-z0-9]{8,40}$/.exec(keys.keyId);
  if (!m) return 'key_id';
  if (m[1] !== mode) return 'wrong_mode';
  if (!/^[\x21-\x7e]{12,100}$/.test(keys.keySecret)) return 'key_secret';
  if (!/^[\x21-\x7e]{8,100}$/.test(keys.webhookSecret)) return 'webhook_secret';
  return null;
}

export type SaveResult = { ok: true; meta: CredentialsMeta } | { ok: false; reason: 'no_encryption_key' | 'provider' | 'mode' | 'reason' | NonNullable<ReturnType<typeof keysProblem>> };
type Saver = { schoolId: string; userId: string; from: 'school' | 'control'; reason?: string };

// Save (or replace) a school's keys for one provider and mode. A new save clears the last test result.
export async function saveCredentials(db: Sql, by: Saver, input: { provider: string; mode: string; keys: ProviderKeys }, env: Record<string, string | undefined> = process.env): Promise<SaveResult> {
  const provider = GATEWAYS.find((g) => g === input.provider);
  const mode = MODES.find((m) => m === input.mode);
  if (!provider) return { ok: false, reason: 'provider' };
  if (!mode) return { ok: false, reason: 'mode' };
  const reason = (by.reason ?? '').trim();
  if (by.from === 'control' && (reason.length < 1 || reason.length > 300)) return { ok: false, reason: 'reason' };
  const problem = keysProblem(provider, mode, input.keys);
  if (problem) return { ok: false, reason: problem };
  const k = encryptionKey(env);
  if (!k) return { ok: false, reason: 'no_encryption_key' };
  const sealed = seal(k, by.schoolId, provider, mode, input.keys);
  const last4 = input.keys.keyId.slice(-4);
  const saved = await db.query(
    `insert into payment_credentials (school_id, provider, mode, ciphertext, iv, tag, key_version, key_last4, saved_by, saved_from)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (school_id, provider, mode) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = excluded.key_version, key_last4 = excluded.key_last4,
       saved_by = excluded.saved_by, saved_from = excluded.saved_from, saved_at = now(), tested_at = null, test_ok = null, test_message = null
     returning config_id`,
    [by.schoolId, provider, mode, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, last4, by.userId, by.from]
  );
  // What was saved, never the keys: the provider, the mode, the last four characters of the key id.
  // From Control, the founder's reason is kept where only the founder reads it (entitlement_change_reasons, C124), never in
  // the audit row (C224); a school saving its own keys gives none.
  const configId = saved.rows[0].config_id as string;
  if (by.from === 'control') {
    await writeEntitlementAudit(db, { schoolId: by.schoolId, actorUserId: by.userId, actorRole: null, eventAction: 'payments.credentials_saved', targetType: 'payment_credentials', targetId: configId, afterState: { provider, mode, keyLast4: last4, from: by.from, reasoned: true } }, reason);
  } else {
    await writeAuditLog(db, { schoolId: by.schoolId, actorUserId: by.userId, actorRole: null, eventAction: 'payments.credentials_saved', targetType: 'payment_credentials', targetId: configId, afterState: { provider, mode, keyLast4: last4, from: by.from } });
  }
  return { ok: true, meta: (await credentialsMeta(db, by.schoolId)).find((m) => m.provider === provider && m.mode === mode) as CredentialsMeta };
}

// What a screen may know. No ciphertext, no key.
export async function credentialsMeta(db: Sql, schoolId: string): Promise<CredentialsMeta[]> {
  const { rows } = await db.query(
    `select c.config_id, c.provider, c.mode, c.key_last4, c.saved_at, c.saved_from, c.tested_at, c.test_ok, c.test_message, u.display_name
       from payment_credentials c left join users u on u.user_id = c.saved_by where c.school_id = $1 order by c.provider, c.mode`,
    [schoolId]
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({ configId: r.config_id, provider: r.provider, mode: r.mode, keyLast4: r.key_last4, savedAt: iso(r.saved_at) as string, savedByName: r.saved_from === 'control' ? null : ((r.display_name as string | null) ?? null), savedFrom: r.saved_from, testedAt: iso(r.tested_at), testOk: r.test_ok, testMessage: r.test_message }));
}

// THE SERVER'S PAYMENT PATH ONLY: the keys themselves, to call the provider or check its notice.
// Never pass the result to a response, a log or an audit row.
export async function openCredentials(db: Sql, configId: string, env: Record<string, string | undefined> = process.env): Promise<{ schoolId: string; provider: Gateway; mode: Mode; keys: ProviderKeys } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(configId)) return null;
  const row = (await db.query(`select school_id, provider, mode, ciphertext, iv, tag, key_version from payment_credentials where config_id = $1`, [configId])).rows[0];
  const k = encryptionKey(env);
  if (!row || !k) return null;
  return { schoolId: row.school_id, provider: row.provider, mode: row.mode, keys: unseal(k, row.school_id, row.provider, row.mode, row) };
}

export async function recordTest(db: Sql, configId: string, ok: boolean, message: string): Promise<void> {
  await db.query(`update payment_credentials set tested_at = now(), test_ok = $2, test_message = $3 where config_id = $1`, [configId, ok, message.slice(0, 200)]);
}

// Whether NetCyberAI has allowed this school a gateway (Control), and setting it, with a reason.
export async function gatewayAllowed(db: Sql, schoolId: string, provider: string): Promise<boolean> {
  return (await db.query(`select allowed from payment_gateway_access where school_id = $1 and provider = $2`, [schoolId, provider])).rows[0]?.allowed === true;
}
export async function setGatewayAccess(db: Sql, by: { userId: string }, schoolId: string, provider: string, allowed: boolean, reason: string): Promise<boolean> {
  const why = reason.trim();
  if (!GATEWAYS.some((g) => g === provider) || why.length < 1 || why.length > 300) return false;
  await db.query(
    `insert into payment_gateway_access (school_id, provider, allowed, reason, changed_by) values ($1, $2, $3, $4, $5)
     on conflict (school_id, provider) do update set allowed = excluded.allowed, reason = excluded.reason, changed_by = excluded.changed_by, changed_at = now()`,
    [schoolId, provider, allowed, why, by.userId]
  );
  await writeAuditLog(db, { schoolId, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'payments.gateway_access_changed', targetType: 'payment_gateway_access', targetId: provider, beforeState: undefined, afterState: { provider, allowed, reasoned: true } }); // the reason is on payment_gateway_access (C224)
  return true;
}
