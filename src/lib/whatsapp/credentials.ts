import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { accountProblem, type AccountProblem } from './account-shape';

// The platform's WhatsApp credentials (docs/25 slice 7e, §3 rule 8, C186).
// The payment_credentials pattern, with its own key:
//
// - Encrypted here, in the app, with AES-256-GCM. The key is the server's
//   MESSAGING_CREDENTIALS_KEY and nowhere else, so a copy of the database
//   reveals nothing. The row records the key version it was sealed with.
//   The app never creates or prints the key; without it, saving is refused.
// - Bound to its place: the phone number id is authenticated with the
//   ciphertext, so the secrets of one number do not open as another's.
// - WRITE-ONLY. A screen gets `MetaAccountMeta`: the ids, the last four
//   characters of the token, who saved it and when. Nothing here returns a
//   secret except `openMetaCredentials`, for the send-gate and the webhook.
// - Saved switched OFF. It is switched on in Control, and only after
//   "test the connection" has passed.
//
// Every statement runs as the platform role; no school role has any right
// on the table.

export type MetaSecrets = { accessToken: string; appSecret: string; verifyToken: string };
export type MetaAccount = MetaSecrets & { phoneNumberId: string; wabaId: string };
export type MetaAccountMeta = { phoneNumberId: string; wabaId: string; tokenLast4: string; enabled: boolean; savedAt: string; savedByName: string | null; testedAt: string | null; testOk: boolean | null; testMessage: string | null; keyAvailable: boolean };
type EncryptionKey = { key: Buffer; version: number };
type Env = Record<string, string | undefined>;

// The key the server was given, if any: 32 bytes, base64.
export function messagingKey(env: Env = process.env): EncryptionKey | null {
  const raw = env.MESSAGING_CREDENTIALS_KEY ?? '';
  const key = /^[A-Za-z0-9+/=_-]{43,44}$/.test(raw) ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  const version = Number(env.MESSAGING_CREDENTIALS_KEY_VERSION ?? '1');
  return key.length === 32 && Number.isInteger(version) && version >= 1 ? { key, version } : null;
}

const place = (phoneNumberId: string) => Buffer.from(`whatsapp:meta:${phoneNumberId}`);

export function sealMeta(k: EncryptionKey, phoneNumberId: string, secrets: MetaSecrets): { ciphertext: string; iv: string; tag: string; keyVersion: number } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k.key, iv);
  cipher.setAAD(place(phoneNumberId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: k.version };
}

// Throws when the key is not the one the row was sealed with, or the row was moved or changed.
export function unsealMeta(k: EncryptionKey, phoneNumberId: string, row: { ciphertext: string; iv: string; tag: string; key_version: number }): MetaSecrets {
  if (row.key_version !== k.version) throw new Error('the WhatsApp credentials were saved with another key version');
  const decipher = createDecipheriv('aes-256-gcm', k.key, Buffer.from(row.iv, 'base64'));
  decipher.setAAD(place(phoneNumberId));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as MetaSecrets;
}

// The shape of each field lives in ./account-shape, shared with the Control screen so the same rule names a
// slip while the founder types and refuses it here.
export { accountProblem, type AccountProblem } from './account-shape';

export type SaveAccountResult = { ok: true } | { ok: false; reason: 'no_encryption_key' | AccountProblem };
// Save, or replace. Always switched off: a new account is tested before it is used.
export async function saveMetaAccount(db: Sql, by: { userId: string }, account: MetaAccount, env: Env = process.env): Promise<SaveAccountResult> {
  const key = messagingKey(env);
  if (!key) return { ok: false, reason: 'no_encryption_key' };
  const problem = accountProblem(account);
  if (problem) return { ok: false, reason: problem };
  const sealed = sealMeta(key, account.phoneNumberId, { accessToken: account.accessToken, appSecret: account.appSecret, verifyToken: account.verifyToken });
  await db.query(
    `insert into whatsapp_credentials (provider, phone_number_id, waba_id, ciphertext, iv, tag, key_version, token_last4, enabled, saved_by)
     values ('meta', $1, $2, $3, $4, $5, $6, $7, false, $8)
     on conflict (provider) do update set phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id, ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = excluded.key_version,
       token_last4 = excluded.token_last4, enabled = false, saved_by = excluded.saved_by, saved_at = now(), tested_at = null, test_ok = null, test_message = null, enabled_by = null, enabled_at = null`,
    [account.phoneNumberId, account.wabaId, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, account.accessToken.slice(-4), by.userId]
  );
  // The audit row says that it was saved, for which number, by whom. Never a secret, nor any part of one.
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'whatsapp.account_saved', targetType: 'whatsapp_credentials', targetId: 'meta', beforeState: undefined, afterState: { phoneNumberId: account.phoneNumberId, wabaId: account.wabaId, keyVersion: sealed.keyVersion, enabled: false } });
  return { ok: true };
}

export async function metaAccountMeta(db: Sql, env: Env = process.env): Promise<MetaAccountMeta | null> {
  const r = (await db.query(`select c.phone_number_id, c.waba_id, c.token_last4, c.enabled, c.saved_at, u.display_name as saved_by_name, c.tested_at, c.test_ok, c.test_message from whatsapp_credentials c left join users u on u.user_id = c.saved_by where c.provider = 'meta'`)).rows[0];
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return r ? { phoneNumberId: r.phone_number_id, wabaId: r.waba_id, tokenLast4: r.token_last4, enabled: r.enabled, savedAt: iso(r.saved_at) as string, savedByName: r.saved_by_name ?? null, testedAt: iso(r.tested_at), testOk: r.test_ok, testMessage: r.test_message, keyAvailable: messagingKey(env) !== null } : null;
}

// For the server's own send and webhook paths only. `onlyEnabled`: the send-gate uses an account only once it is
// switched on; "test the connection" and the webhook's first check read it before that.
export async function openMetaCredentials(db: Sql, onlyEnabled: boolean, env: Env = process.env): Promise<MetaAccount | null> {
  const key = messagingKey(env);
  if (!key) return null;
  const r = (await db.query(`select phone_number_id, waba_id, ciphertext, iv, tag, key_version from whatsapp_credentials where provider = 'meta' and ($1 = false or enabled)`, [onlyEnabled])).rows[0];
  if (!r) return null;
  return { phoneNumberId: r.phone_number_id, wabaId: r.waba_id, ...unsealMeta(key, r.phone_number_id, r) };
}

export async function recordMetaTest(db: Sql, ok: boolean, message: string): Promise<void> {
  // A failed test switches the account off: what cannot be reached is not sent through.
  await db.query(`update whatsapp_credentials set tested_at = now(), test_ok = $1, test_message = $2, enabled = enabled and $1 where provider = 'meta'`, [ok, message.slice(0, 200)]);
}

export type SwitchResult = { ok: true } | { ok: false; reason: 'no_account' | 'not_tested' | 'no_encryption_key' };
export async function setMetaEnabled(db: Sql, by: { userId: string }, enabled: boolean, env: Env = process.env): Promise<SwitchResult> {
  const row = (await db.query(`select test_ok, enabled from whatsapp_credentials where provider = 'meta' for update`)).rows[0];
  if (!row) return { ok: false, reason: 'no_account' };
  if (enabled && !messagingKey(env)) return { ok: false, reason: 'no_encryption_key' };
  if (enabled && row.test_ok !== true) return { ok: false, reason: 'not_tested' };
  await db.query(`update whatsapp_credentials set enabled = $1, enabled_by = $2, enabled_at = now() where provider = 'meta'`, [enabled, by.userId]);
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: enabled ? 'whatsapp.account_switched_on' : 'whatsapp.account_switched_off', targetType: 'whatsapp_credentials', targetId: 'meta', beforeState: { enabled: row.enabled }, afterState: { enabled } });
  return { ok: true };
}
