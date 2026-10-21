import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { QuizItem } from './blocks';
import { familyHashKey } from './secret';

// A check or practice item as the phone gets it (M1-5, C251): the question and its options, and a sealed token. The
// answer, the hint and the explanations stay sealed in the token (AES-256-GCM with a key derived for this purpose
// only), so the phone cannot read the key; the server opens the token when the child asks for the hint or answers. The
// token is bound to the account and child, and lasts a day.

export type PublicItem = { id: string; question: string; options: string[]; token: string };
export type ItemSecret = { a: number; h: string; y: string; w: string[]; k: string; s: string; c: string; acct: string; kind: 'check' | 'practice'; exp: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function sealItem(item: QuizItem, ctx: { accountId: string; childId: string; topicKey: string; subject: string; kind: 'check' | 'practice' }, now = Date.now()): PublicItem {
  const secret: ItemSecret = { a: item.answer, h: item.hint, y: item.why, w: item.wrong, k: ctx.topicKey, s: ctx.subject, c: ctx.childId, acct: ctx.accountId, kind: ctx.kind, exp: now + DAY_MS };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', familyHashKey('check-items.v1'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);
  const token = [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
  return { id: item.id, question: item.question, options: item.options, token };
}

// The sealed part, when the token is whole, unexpired and this account's child's. null otherwise.
export function openItem(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now()): ItemSecret | null {
  if (typeof token !== 'string' || token.length > 6000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', familyHashKey('check-items.v1'), iv);
    decipher.setAuthTag(tag);
    const s = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as ItemSecret;
    if (s.acct !== ctx.accountId || s.c !== ctx.childId || !(s.exp > now)) return null;
    return s;
  } catch {
    return null;
  }
}
