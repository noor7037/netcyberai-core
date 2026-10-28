import type { MessageKey } from './index';

// Words picked on the server for a client screen (C401). The client gets only the messages it shows, never the whole
// message table: the table is about 380 kB of JavaScript, and a client component that imports `t` from '@/lib/i18n'
// sends all of it to every page that shows that component. Only types come from './index', so nothing of the table
// is bundled here. scripts/check_family_budget.py measures the result.

export type Words = Partial<Record<MessageKey, string>>;

// `{name}` in a picked message, replaced by params.name, as t() does.
export function fillWord(words: Words, key: MessageKey, params?: Record<string, string | number>): string {
  const text = words[key] ?? '';
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole));
}

// "1 result" / "3 results", as tCount() does: `.one` and `.other`.
export function countWord(words: Words, base: string, count: number, params: Record<string, string | number> = {}): string {
  const key = `${base}.${count === 1 ? 'one' : 'other'}` as MessageKey;
  return key in words ? fillWord(words, key, { count, ...params }) : String(count);
}
