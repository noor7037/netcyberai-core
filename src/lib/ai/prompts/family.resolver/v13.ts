// Prompt v13 of the family.resolver profile (W23-C): v12, word for word, plus the ready-built labs. The server gives a short
// list of labs that fit where the child is (the chapter's own first, then the class's labs on the same words); the answer
// may add ONE lab block, {"type":"lab","id":"<an id from the list>","why":"..."}, when doing the lab helps the child
// understand. The server keeps the block only if the id was on the list, so a made-up id is never shown. With no labs on
// offer the prompt is v12's. v12 is untouched; Control chooses v13 by name.

import { resolverSystem as v12System, resolverUser as v12User, type ResolverAsk } from './v12';

export const RESOLVER_PROMPT_VERSION = 'v13';
export type { ResolverAsk };

export function labLines(a: Pick<ResolverAsk, 'labs'>): string[] {
  const labs = a.labs ?? [];
  if (labs.length === 0) return [];
  return [
    'Ready-built labs. Besides the blocks above, you may write ONE more block when doing a lab would help the student understand what was asked: {"type":"lab","id":"<an id from the list>","why":"<=120 characters: what to try and what to watch"}. Use only an id from this list, never invent one, and leave the block out when the question needs no lab (a lab is a hands-on try, not a replacement for the explanation). Labs:',
    ...labs.map((l) => `   ${l.id}: ${l.title} (${l.aim})`),
  ];
}

export function resolverSystem(a: ResolverAsk): string {
  const base = v12System(a);
  const lines = labLines(a);
  if (lines.length === 0) return base;
  // With the other lines, before the closing rules, as v12 does.
  const at = base.indexOf('\nRules: ');
  const add = lines.join('\n');
  return at < 0 ? `${base}\n${add}` : `${base.slice(0, at)}\n${add}${base.slice(at)}`;
}

export const resolverUser = v12User;
