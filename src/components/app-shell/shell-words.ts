import { LANGS, t, type Lang, type MessageKey } from '@/lib/i18n';
import { pickWords } from '@/lib/i18n/pick';
import type { Words } from '@/lib/i18n/words';

// The shell's words, picked on the server for AppShell (C401): its menu, search, quick add, sync line, language
// switch and account parts, the first-visit tours and Show me how and the page header's About (ModulePage), and the authenticator check (StepUp), which any
// screen under the shell may open. By
// prefix, because some are looked up by an id at run time (`role.${role}`, `search.group.${kind}`, `new.${id}`).
// test/i18n/picked-words.test.ts checks that every word these components ask for is here.
export const SHELL_WORD_PREFIXES = ['shell.', 'sync.', 'search.', 'new.', 'lang.', 'role.', 'stepup.', 'tour.'] as const;
export const SHELL_WORD_KEYS: readonly MessageKey[] = ['mk.scan.signOutWaiting', 'help.showMeHow', 'page.about'];

export function shellWords(lang: Lang): { words: Words; langSaved: Record<Lang, string> } {
  return {
    words: pickWords(lang, SHELL_WORD_KEYS, SHELL_WORD_PREFIXES),
    langSaved: Object.fromEntries(LANGS.map((l) => [l, t(l, 'lang.saved')])) as Record<Lang, string>,
  };
}
