import type { ModuleDefinition } from '@/lib/contracts/modules';
import type { MessageKey } from './index';
import { fillWord, type Words } from './words';

// moduleOffSentence (./module-off) from picked words (C402), for a client screen that must not carry the whole
// message table: the screen's page picks `moduleOff.` and `role.`.
export function moduleOffSentenceFrom(words: Words, module: ModuleDefinition): string {
  const own = `moduleOff.${module.id}` as MessageKey;
  if (own in words) return fillWord(words, own);
  const roles = module.roles.map((r) => words[`role.${r}` as MessageKey] ?? r).join(', ');
  return fillWord(words, 'moduleOff.notBuilt', { roles });
}
