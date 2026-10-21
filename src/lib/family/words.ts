import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Words } from './fill';

// The words a family screen needs, picked on the server and handed to its client parts, so the phone never downloads
// the whole message file (the first-load budget, docs/family-app/09 §4). Server only.
export type { Words } from './fill';

export function familyWords(lang: Lang, keys: readonly MessageKey[]): Words {
  return Object.fromEntries(keys.map((k) => [k, t(lang, k)]));
}
