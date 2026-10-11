import { isAlwaysOn } from '@/lib/contracts/entitlements';
import type { ModuleDefinition } from '@/lib/contracts/modules';
import { isMessageKey, t, tOr, type Lang } from './index';

// What changes, and for whom, when a module is switched off (docs/19 rule
// 7, C139): one plain sentence beside every switch, in the person's
// language. A module that is built has its own sentence
// (`moduleOff.<id>`), written against what the code does when it is off
// (the menu, search, "+ New", My Day and the write guard). A module that is
// not built yet has nothing to lose but its "Soon" line in the menu, and
// says so, naming the roles that see it.
export function moduleOffSentence(lang: Lang, module: ModuleDefinition): string {
  const own = `moduleOff.${module.id}`;
  if (isMessageKey(own)) return t(lang, own);
  const roles = module.roles.map((r) => tOr(lang, `role.${r}`, r)).join(', ');
  return t(lang, 'moduleOff.notBuilt', { roles });
}

// Built modules must each have their own sentence (a test holds this).
export function needsOwnSentence(module: ModuleDefinition): boolean {
  return module.status === 'live' || module.status === 'partial' || isAlwaysOn(module.id);
}
