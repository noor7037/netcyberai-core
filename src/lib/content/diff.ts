// The difference between two versions of the same syllabus (docs/family-app/10 §4.2, §8), matched line by line by the
// stable key, never by title: a line whose key is only in the newer version is added, only in the older one removed;
// a line in both is renamed when a title changed and moved when its parent or position changed (both can be true).

export type DiffLine = {
  level: 'unit' | 'chapter' | 'topic';
  key: string;
  parentKey: string | null;
  position: number;
  titleEn: string;
  titleHi: string | null;
};

export type SyllabusDiff = {
  added: DiffLine[];
  removed: DiffLine[];
  renamed: { key: string; level: DiffLine['level']; from: Pick<DiffLine, 'titleEn' | 'titleHi'>; to: Pick<DiffLine, 'titleEn' | 'titleHi'> }[];
  moved: { key: string; level: DiffLine['level']; from: Pick<DiffLine, 'parentKey' | 'position'>; to: Pick<DiffLine, 'parentKey' | 'position'> }[];
  unchanged: number;
};

export function diffSyllabus(older: readonly DiffLine[], newer: readonly DiffLine[]): SyllabusDiff {
  const before = new Map(older.map((l) => [l.key, l]));
  const after = new Map(newer.map((l) => [l.key, l]));
  const out: SyllabusDiff = { added: [], removed: [], renamed: [], moved: [], unchanged: 0 };
  for (const l of newer) if (!before.has(l.key)) out.added.push(l);
  for (const l of older) if (!after.has(l.key)) out.removed.push(l);
  for (const b of newer) {
    const a = before.get(b.key);
    if (!a) continue;
    const renamed = a.titleEn !== b.titleEn || (a.titleHi ?? null) !== (b.titleHi ?? null);
    const moved = (a.parentKey ?? null) !== (b.parentKey ?? null) || a.position !== b.position;
    if (renamed) out.renamed.push({ key: b.key, level: b.level, from: { titleEn: a.titleEn, titleHi: a.titleHi }, to: { titleEn: b.titleEn, titleHi: b.titleHi } });
    if (moved) out.moved.push({ key: b.key, level: b.level, from: { parentKey: a.parentKey, position: a.position }, to: { parentKey: b.parentKey, position: b.position } });
    if (!renamed && !moved) out.unchanged += 1;
  }
  return out;
}
