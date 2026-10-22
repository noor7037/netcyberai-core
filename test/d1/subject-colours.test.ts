import { describe, expect, it } from 'vitest';
import { colors } from '@/lib/design-tokens';
import { SUBJECT_COLOURS, subjectColour } from '@/lib/family/subject-colours';
import { SUBJECT_IDS, stageSubjects } from '@/lib/family/subjects';

// D1 (C291): one colour per subject, from the tokens only, readable everywhere it carries text, and never shared by two
// subjects a class studies together.

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const TOKEN = new Map(Object.entries(colors).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v]));

describe('subject colours', () => {
  it('every subject has one, made of tokens', () => {
    for (const s of SUBJECT_IDS) {
      const c = SUBJECT_COLOURS[s];
      expect(c, s).toBeDefined();
      expect(Object.values(colors), s).toContain(c.hex);
    }
    expect(subjectColour('not-a-subject')).toBe(SUBJECT_COLOURS.mathematics);
  });

  it("a chip's and a header's text is AA on their colours (4.5:1, or 3:1 for the large header type)", () => {
    for (const s of SUBJECT_IDS) {
      const { chip, header } = SUBJECT_COLOURS[s];
      const fg = chip.includes('text-white') ? '#FFFFFF' : colors.slate;
      const bg = TOKEN.get(chip.match(/^bg-([a-z-]+)/)![1])!;
      expect(ratio(fg, bg), `${s} chip`).toBeGreaterThanOrEqual(4.5);
      const hfg = header.includes('text-white') ? '#FFFFFF' : colors.slate;
      for (const stop of header.match(/(?:^|\s)(?:from|to)-[a-z-]+/g)!.map((x) => x.trim().replace(/^(from|to)-/, ''))) {
        expect(ratio(hfg, TOKEN.get(stop)!), `${s} header ${stop}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('subjects a class studies together never share a colour', () => {
    for (const board of ['CBSE', 'CISCE']) {
      for (let cls = 1; cls <= 12; cls++) {
        const list = stageSubjects(cls, board);
        const hexes = list.map((s) => SUBJECT_COLOURS[s].hex);
        expect(new Set(hexes).size, `${board} class ${cls}: ${list.join(', ')}`).toBe(list.length);
      }
    }
  });
});
