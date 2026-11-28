// The Reader's lines for a Tech Lab lesson, by raw block id: what the Listen buttons and Guided Teacher Mode read, from
// the same Reader blocks (techlabToBlocks → narrationScript). A line that holds the child's name, and the opening and
// summary, are read by the phone's own voice, so the name never leaves the phone (C555).

import { blockIds, narrationScript } from '@/lib/family/blocks';
import { INTRO_BLOCK, techlabToBlocks, WRAP_BLOCK } from '@/lib/family/tech/blocks';
import type { TechPersonal } from '@/lib/family/tech/personal';
import type { TechLang } from '@/lib/family/tech/text';
import type { TechLesson } from '@/lib/family/tech/types';

export type ReadLine = { blockId: string; sentence: number; text: string; phoneOnly: boolean };

export function readLines(lesson: TechLesson, lang: TechLang, personal?: TechPersonal): Map<string, ReadLine[]> {
  const blocks = techlabToBlocks(lesson, lang, personal);
  const ids = blockIds(blocks);
  const raw = new Map(ids.map((id, index) => [id, String((blocks[index] as { id?: string }).id ?? id)]));
  const name = personal?.name.trim() ?? '';
  const out = new Map<string, ReadLine[]>();
  for (const line of narrationScript(blocks)) {
    const key = raw.get(line.blockId) ?? line.blockId;
    const own = key.endsWith(INTRO_BLOCK) || key.endsWith(WRAP_BLOCK);
    const row = { ...line, phoneOnly: own || (!!name && line.text.includes(name)) };
    out.set(key, [...(out.get(key) ?? []), row]);
  }
  return out;
}
