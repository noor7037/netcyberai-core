import { en } from './messages/en';
import { t, type Lang, type MessageKey } from './index';
import type { Words } from './words';

// The server side of picked words (C401): the messages a client screen shows, in the reader's language, by exact key
// and by key prefix (for words looked up by an id at run time, such as `role.${role}`). English stands in for a
// missing Hindi message, as t() does.
export function pickWords(lang: Lang, keys: readonly MessageKey[], prefixes: readonly string[] = []): Words {
  const out: Words = {};
  for (const k of keys) out[k] = t(lang, k);
  if (prefixes.length) for (const k of Object.keys(en) as MessageKey[]) if (prefixes.some((p) => k.startsWith(p))) out[k] = t(lang, k);
  return out;
}
