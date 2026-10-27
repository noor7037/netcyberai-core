import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { QuizItem } from './blocks';
import { familyHashKey } from './secret';

// A check or practice item as the phone gets it (M1-5, C251): the question and its options, and a sealed token. The
// answer, the hint and the explanations stay sealed in the token (AES-256-GCM with a key derived for this purpose
// only), so the phone cannot read the key; the server opens the token when the child asks for the hint or answers. The
// token is bound to the account and child, and lasts a day. It also carries the question and options, so an answer is
// recorded as the child saw it (M1-6).
// An offline chapter pack (M2-9, C283) seals its items for the pack's life (family.offline_pack_days) with the same
// scheme: the life is a parameter, one day unless a caller says otherwise, and the token says when it was issued. A
// caller that opens a token says the longest life it accepts (one day by default), so a pack's token is taken only
// where packs are meant to be answered.

export type PublicItem = { id: string; question: string; options: string[]; token: string };
export type ItemSecret = { a: number; h: string; y: string; w: string[]; k: string; s: string; c: string; acct: string; kind: 'check' | 'practice' | 'test'; exp: number; iat?: number; i: string; q: string; o: string[] };

export const DAY_MS = 24 * 60 * 60 * 1000;

export function sealItem(item: QuizItem, ctx: { accountId: string; childId: string; topicKey: string; subject: string; kind: 'check' | 'practice' | 'test' }, now = Date.now(), lifeMs = DAY_MS): PublicItem {
  const secret: ItemSecret = { a: item.answer, h: item.hint, y: item.why, w: item.wrong, k: ctx.topicKey, s: ctx.subject, c: ctx.childId, acct: ctx.accountId, kind: ctx.kind, exp: now + lifeMs, iat: now, i: item.id, q: item.question, o: item.options };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', familyHashKey('check-items.v1'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);
  const token = [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
  return { id: item.id, question: item.question, options: item.options, token };
}

// When a token was issued: its own word, or (a token sealed before M2-9) a day before it ends.
export const issuedAt = (s: Pick<ItemSecret, 'exp' | 'iat'>): number => (typeof s.iat === 'number' ? s.iat : s.exp - DAY_MS);

// The sealed part, when the token is whole, unexpired, this account's child's, and no longer-lived than the caller
// accepts (maxLifeMs). null otherwise.
export function openItem(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now(), maxLifeMs = DAY_MS): ItemSecret | null {
  if (typeof token !== 'string' || token.length > 6000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', familyHashKey('check-items.v1'), iv);
    decipher.setAuthTag(tag);
    const s = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as ItemSecret;
    if (s.acct !== ctx.accountId || s.c !== ctx.childId || !(s.exp > now)) return null;
    if (!(s.exp - issuedAt(s) <= maxLifeMs)) return null;
    return s;
  } catch {
    return null;
  }
}
