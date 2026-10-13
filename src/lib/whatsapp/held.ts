import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { messagingKey } from './credentials';

// A parent's message held while they are asked which school it is about (C190). Their words and their number are
// sealed with the server's messaging key (AES-256-GCM), bound to the message's own id, and looked up by a keyed
// digest of the number: a copy of the database shows neither. Without the key nothing is held at all.

type Env = Record<string, string | undefined>;
export type HeldWords = { phone: string; text: string };
export const HOLD_HOURS = 24;

export function phoneDigest(phone: string, env: Env = process.env): string | null {
  const k = messagingKey(env);
  return k ? createHmac('sha256', k.key).update(`held-number:${phone}`).digest('hex') : null;
}

export function sealHeld(providerMessageId: string, words: HeldWords, env: Env = process.env): { ciphertext: string; iv: string; tag: string; keyVersion: number } | null {
  const k = messagingKey(env);
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k.key, iv);
  cipher.setAAD(Buffer.from(`held:${providerMessageId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(words), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: k.version };
}

// Throws when the key is not the one it was sealed with, or the row was moved or changed.
export function openHeld(providerMessageId: string, row: { ciphertext: string; iv: string; tag: string; key_version: number }, env: Env = process.env): HeldWords {
  const k = messagingKey(env);
  if (!k || k.version !== row.key_version) throw new Error('the held message was sealed with another key');
  const decipher = createDecipheriv('aes-256-gcm', k.key, Buffer.from(row.iv, 'base64'));
  decipher.setAAD(Buffer.from(`held:${providerMessageId}`));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as HeldWords;
}

// The question's quick replies: one per school, its name cut to what WhatsApp shows on a button. With more than
// three schools there are no buttons; the question lists them by number.
export const CHOICE_PREFIX = 'school:';
export const buttonTitle = (name: string) => (name.length <= 20 ? name : `${name.slice(0, 19).trimEnd()}…`);
export function whichSchoolQuestion(schools: readonly { school_id: string; name: string }[]): { text: string; choices: { id: string; title: string }[] } {
  const lead = 'NetCyberAI: This number is on record with more than one school. Which school is your message about?';
  if (schools.length <= 3) return { text: `${lead} Tap the school, or reply with its number: ${schools.map((s, i) => `${i + 1} for ${s.name}`).join(', ')}.`, choices: schools.map((s) => ({ id: `${CHOICE_PREFIX}${s.school_id}`, title: buttonTitle(s.name) })) };
  return { text: `${lead} Reply with its number: ${schools.map((s, i) => `${i + 1} for ${s.name}`).join(', ')}.`, choices: [] };
}
// Which school an answer names: the quick reply tapped, or the school's number typed. Null: not an answer.
export function chosenSchool(schoolIds: readonly string[], answer: { text: string; choiceId?: string }): string | null {
  if (answer.choiceId?.startsWith(CHOICE_PREFIX)) {
    const id = answer.choiceId.slice(CHOICE_PREFIX.length);
    return schoolIds.includes(id) ? id : null;
  }
  const n = /^\s*([1-9]|10)\s*[.)]?\s*$/.exec(answer.text)?.[1];
  return n && Number(n) <= schoolIds.length ? schoolIds[Number(n) - 1] : null;
}
