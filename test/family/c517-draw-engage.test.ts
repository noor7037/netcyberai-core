import { describe, expect, it } from 'vitest';
import { canAdvance, engageMode, guidedSteps, readSoundOn, SFX, writeSoundOn } from '@/lib/family/draw-engage';
import { DRAW_TEMPLATES, toStudioTemplate } from '@/lib/family/draw-templates';
import { DRAW_STUDIO_KEYS } from '@/lib/family/draw-words';
import { t } from '@/lib/i18n';
import { STICKERS, STICKER_GROUPS } from '@/lib/family/sketch-stickers';

// The phone's storage, in memory (the runner has no browser).
const store = new Map<string, string>();
globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage;

const words = { colourIt: 'Now colour the {word}.', finish: 'All done!' };

describe('engagement mode (C517)', () => {
  it('is for LKG to Class 4 only', () => {
    for (const c of [-1, 0, 1, 2, 3, 4]) expect(engageMode(c)).toBe(true);
    for (const c of [5, 6, 10, 12]) expect(engageMode(c)).toBe(false);
  });
  it('builds steps from the task and at most five labels, ending with the finish', () => {
    const s = guidedSteps({ task: 'Colour the plant.', labels: ['Root', 'Stem', 'Leaf', 'Flower', 'Fruit', 'Seed'] }, words);
    expect(s.map((x) => x.text)).toEqual(['Colour the plant.', 'Now colour the Root.', 'Now colour the Stem.', 'Now colour the Leaf.', 'Now colour the Flower.', 'Now colour the Fruit.', 'All done!']);
    expect(guidedSteps({ task: 'x', labels: [], steps: [{ text: 'a' }, { text: 'b', at: { x: 1, y: 2 } }] }, words)).toEqual([{ text: 'a' }, { text: 'b', at: { x: 1, y: 2 } }, { text: 'All done!' }]);
  });
  it('never skips ahead: the next step opens only after drawing, and the last has none', () => {
    expect(canAdvance(0, 3, false)).toBe(false);
    expect(canAdvance(0, 3, true)).toBe(true);
    expect(canAdvance(2, 3, true)).toBe(false);
  });
  it('keeps the sound choice on the phone, on by default', () => {
    localStorage.removeItem('ncf.draw.sound');
    expect(readSoundOn()).toBe(true);
    writeSoundOn(false);
    expect(readSoundOn()).toBe(false);
    writeSoundOn(true);
    expect(readSoundOn()).toBe(true);
  });
  it('has short, soft sounds for tap, stroke, step and success', () => {
    for (const notes of Object.values(SFX)) for (const [hz, , len] of notes) {
      expect(hz).toBeGreaterThan(200);
      expect(len).toBeLessThanOrEqual(0.3);
    }
  });
  it('passes steps and context to the studio in the child’s language', () => {
    const e = { ...DRAW_TEMPLATES[0], steps: [{ en: 'Draw your face', hi: 'अपना चेहरा बनाओ' }], context: { en: 'My family', hi: 'मेरा परिवार' } };
    const s = toStudioTemplate(e, 'hi', '<svg/>', 'english', 1);
    expect(s.steps).toEqual([{ text: 'अपना चेहरा बनाओ' }]);
    expect(s.context).toBe('मेरा परिवार');
  });
  it('has every guide word in English and Hindi', () => {
    for (const k of DRAW_STUDIO_KEYS.filter((k) => k.startsWith('fam.draw.g.'))) {
      expect(t('en', k)).not.toBe(k);
      expect(t('hi', k)).not.toBe(k);
    }
  });
});

describe('the sticker groups (C517)', () => {
  it('has about a hundred stickers in ten groups, each sticker in exactly one, each group named in both languages', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(100);
    expect(STICKER_GROUPS.length).toBe(10);
    const grouped = STICKER_GROUPS.flatMap((g) => g.stickers);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(STICKERS.map((s) => s.id).sort());
    for (const g of STICKER_GROUPS) {
      expect(g.stickers.length).toBeGreaterThanOrEqual(8);
      for (const lang of ['en', 'hi'] as const) expect(t(lang, `fam.sketch.group.${g.id}` as never)).not.toBe(`fam.sketch.group.${g.id}`);
    }
  });
});
