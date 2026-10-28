import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { SHELL_WORD_KEYS, SHELL_WORD_PREFIXES } from '@/components/app-shell/shell-words';
import { en } from '@/lib/i18n/messages/en';

// Picked words (C401): a client component on a light page reads only the words the server picked for it, never the
// whole message table. A word it asks for and nobody picked would show as nothing, so this reads each such component
// and checks every message key it names (a quoted key, a ternary's keys, or the fixed start of a key built at run
// time, `role.${role}`) is covered by what its pages pick. And none of them may import the table again.

type Cover = { keys: readonly string[]; prefixes: readonly string[] };
const SHELL: Cover = { keys: SHELL_WORD_KEYS, prefixes: SHELL_WORD_PREFIXES };
const plus = (c: Cover, prefixes: string[]): Cover => ({ keys: c.keys, prefixes: [...c.prefixes, ...prefixes] });

const PICKED: Record<string, Cover> = {
  'src/components/app-shell/AppShell.tsx': SHELL,
  'src/components/app-shell/GlobalSearch.tsx': SHELL,
  'src/components/app-shell/QuickAdd.tsx': SHELL,
  'src/components/app-shell/SyncLine.tsx': SHELL,
  'src/components/app-shell/LanguageSwitch.tsx': SHELL,
  'src/components/app-shell/FirstVisitTour.tsx': SHELL,
  'src/components/app-shell/ShowMeHow.tsx': SHELL,
  'src/components/app-ui/BannerTitle.tsx': SHELL,
  'src/components/auth/StepUp.tsx': SHELL,
  // Control → Family (its page picks `control.family.` and `fam.subject.`).
  'src/components/control/apps/PlusOpenForm.tsx': plus(SHELL, ['control.family.', 'fam.subject.']),
  'src/components/control/apps/SubjectListForm.tsx': plus(SHELL, ['control.family.', 'fam.subject.']),
  'src/components/control/apps/VoiceAllowanceForm.tsx': plus(SHELL, ['control.family.', 'fam.subject.']),
  // Control → Apps and Control → Family → People pick `control.apps.`.
  'src/components/control/apps/ChangeForm.tsx': plus(SHELL, ['control.apps.']),
};

const KEYS = new Set(Object.keys(en));
const covered = (c: Cover, key: string) => c.keys.includes(key) || c.prefixes.some((p) => key.startsWith(p));

describe('picked words cover what each light component asks for', () => {
  for (const [file, cover] of Object.entries(PICKED)) {
    it(file, () => {
      const src = readFileSync(file, 'utf8');
      // No way back to the whole table.
      expect(src).not.toMatch(/from '@\/components\/app-shell\/LangContext'|from '\.\/LangContext'/);
      expect(src).not.toMatch(/import \{[^}]*\b(t|tCount|tOr|isMessageKey)\b[^}]*\} from '@\/lib\/i18n'/);
      const quoted = [...src.matchAll(/'([a-z][A-Za-z0-9_.]+)'/g)].map((m) => m[1]).filter((k) => KEYS.has(k));
      const counted = [...src.matchAll(/tCount\('([a-z][A-Za-z0-9_.]+)'/g)].map((m) => m[1]);
      const built = [...src.matchAll(/`([a-z][A-Za-z0-9_.]*\.)\$\{/g)].map((m) => m[1]);
      const missing = [
        ...quoted.filter((k) => !covered(cover, k)),
        ...counted.filter((b) => !covered(cover, `${b}.one`) || !covered(cover, `${b}.other`)),
        ...built.filter((p) => !cover.prefixes.some((c) => p.startsWith(c))),
      ];
      expect(missing).toEqual([]);
      // Something was found to check, so the reader above still reads this file's words.
      expect(quoted.length + counted.length + built.length).toBeGreaterThan(0);
    });
  }
});
