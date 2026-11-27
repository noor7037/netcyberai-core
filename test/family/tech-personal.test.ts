// C555: Tech Lab, personal to each child — the name in the lesson, the server's name-free copy, the child's own path,
// and this phone's stars kept per child.
import { afterEach, describe, expect, it } from 'vitest';
import { narrationScript } from '@/lib/family/blocks';
import { techlabToBlocks } from '@/lib/family/tech/blocks';
import { courseCatalog, lessonById } from '@/lib/family/tech/catalog';
import { readLocalProgress, rememberPass } from '@/lib/family/tech/local-progress';
import { childPath, introLines, rightLine, unitsForClass, wrapLines, type TechPersonal } from '@/lib/family/tech/personal';
import { EMPTY_PROGRESS, type TechProgress } from '@/lib/family/tech/types';

const lesson = lessonById('L2.inside-computer.06')!;
const me = (over: Partial<TechPersonal> = {}): TechPersonal => ({ name: 'Alsifa', prevTitle: null, nextTitle: null, returning: false, ...over });
const progress = (done: Record<string, number>): TechProgress => ({ ...EMPTY_PROGRESS, done: Object.fromEntries(Object.entries(done).map(([key, best]) => [key, { stars: 2, best, xp: 30 }])), badges: [], labs: [] });

describe('the lesson speaks to the child', () => {
  it('opens and closes with the child’s own name, in each language', () => {
    for (const lang of ['hinglish', 'en', 'hi'] as const) {
      expect(introLines(lesson.id, lang, me())[0]).toContain('Alsifa');
      expect(wrapLines(lesson.id, lang, me(), lesson.outcomes ?? [])[0]).toContain('Alsifa');
    }
  });

  it('links to the last lesson only when it was passed, and says revise on a second visit', () => {
    const prev = { en: 'Chips: from sand to silicon' };
    expect(introLines(lesson.id, 'en', me({ prevTitle: prev })).join(' ')).toContain('Chips: from sand to silicon');
    expect(introLines(lesson.id, 'en', me()).join(' ')).not.toContain('Last time');
    expect(introLines(lesson.id, 'en', me({ returning: true, prevTitle: prev })).join(' ')).toMatch(/revise/i);
  });

  it('names the next lesson, or the end of the unit', () => {
    expect(wrapLines(lesson.id, 'en', me({ nextTitle: { en: 'Screens' } }), []).join(' ')).toContain('"Screens"');
    expect(wrapLines(lesson.id, 'en', me(), []).join(' ')).toMatch(/last lesson of this unit/);
  });

  it('praises by name now and then, not after every answer', () => {
    expect(rightLine(lesson.id, 'en', 'Alsifa', 0)).toContain('Alsifa');
    expect(rightLine(lesson.id, 'en', 'Alsifa', 1)).toBeNull();
    expect(rightLine(lesson.id, 'en', '', 0)).toBeNull();
  });

  it('fills the lesson’s own {{name}} on the phone, at most twice a block, with an opening and a summary block', () => {
    const blocks = techlabToBlocks(lesson, 'en', me());
    expect(blocks[0]).toMatchObject({ id: `${lesson.id}.intro` });
    expect(blocks[blocks.length - 1]).toMatchObject({ id: `${lesson.id}.wrap` });
    const text = JSON.stringify(blocks);
    expect(text).not.toMatch(/\{\{\s*name\s*\}\}/);
    for (const block of blocks) expect(JSON.stringify(block).split('Alsifa').length - 1).toBeLessThanOrEqual(2);
  });

  it('gives the server voice a copy with no name, no opening and no summary', () => {
    const server = narrationScript(techlabToBlocks(lesson, 'en'));
    expect(server.length).toBeGreaterThan(0);
    for (const line of server) {
      expect(line.text).not.toMatch(/\{\{|Alsifa/);
    }
    expect(JSON.stringify(techlabToBlocks(lesson, 'en'))).not.toMatch(/\.intro|\.wrap/);
  });

  it('a different child hears their own name, from the same lesson file', () => {
    const aayat = JSON.stringify(techlabToBlocks(lesson, 'hinglish', me({ name: 'Aayat' })));
    expect(aayat).toContain('Aayat');
    expect(aayat).not.toContain('Alsifa');
  });
});

describe('the child’s own path through the course', () => {
  const catalog = courseCatalog();

  it('starts a new child at the first lesson of their own class', () => {
    const path = childPath(catalog, 7, EMPTY_PROGRESS);
    const first = unitsForClass(catalog, 7)[0];
    expect(path.next).toMatchObject({ key: first.lessons[0].key, why: 'start' });
    expect(path.done).toBe(0);
    expect(path.total).toBe(unitsForClass(catalog, 7).reduce((sum, unit) => sum + unit.lessons.length, 0));
  });

  it('carries on inside a started unit, and offers a low-scored pass for revision', () => {
    const first = unitsForClass(catalog, 7)[0];
    const path = childPath(catalog, 7, progress({ [first.lessons[0].key]: 60 }));
    expect(path.next).toMatchObject({ key: first.lessons[1].key, why: 'continue' });
    expect(path.revise.map((item) => item.key)).toEqual([first.lessons[0].key]);
  });

  it('does not suggest a revision for a strong pass, and offers a stretch when the class is done', () => {
    const rows = unitsForClass(catalog, 5).flatMap((unit) => unit.lessons);
    const path = childPath(catalog, 5, progress(Object.fromEntries(rows.map((row) => [row.key, 100]))));
    expect(path.revise).toEqual([]);
    expect(path.next).toBeNull();
    expect(path.stretch?.why).toBe('stretch');
    expect(path.done).toBe(path.total);
  });

  it('Nursery–UKG children get Level 1 units', () => {
    expect(unitsForClass(catalog, -2).length).toBeGreaterThan(0);
    expect(unitsForClass(catalog, -2).every((unit) => unit.level === 1)).toBe(true);
  });

  it('every unit has its own strand, not one strand for all', () => {
    expect(new Set(catalog.units.map((unit) => unit.strand)).size).toBeGreaterThan(8);
  });
});

describe('stars on this phone are kept per child', () => {
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => store.clear());

  it('a pass for one child never shows on a sibling’s course', () => {
    rememberPass('child-a', 'L1.computer-body.01', 3, 100, 30, 30, []);
    expect(readLocalProgress('child-a').done['L1.computer-body.01']).toBeTruthy();
    expect(readLocalProgress('child-b').done['L1.computer-body.01']).toBeUndefined();
    expect(readLocalProgress('').done).toEqual({});
  });
});
