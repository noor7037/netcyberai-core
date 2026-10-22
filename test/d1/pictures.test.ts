import fs from 'fs';
import path from 'path';
import emojiRegex from 'emoji-regex';
import { describe, expect, it } from 'vitest';
import { COURSE_EMOJI } from '@/lib/family/english/emoji';
import { pictureFile, pictureSrc } from '@/lib/family/pictures';

// D1 (C290): the bundled picture set. Every emoji the Family app or the English course shows has a picture, so no phone
// falls back to its own emoji font; every file is plain SVG (no script, handler, foreign object or outside link); the
// set holds the MIT licence it came with.

const DIR = path.join(process.cwd(), 'public/family/pictures');
const used = new Set<string>();
const scan = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) scan(p);
    else if (/\.(tsx?|json)$/.test(f)) for (const m of fs.readFileSync(p, 'utf8').matchAll(emojiRegex())) used.add(m[0]);
  }
};
['src/components/family', 'src/app/(family)', 'src/lib/family', 'data/english'].forEach((d) => scan(path.join(process.cwd(), d)));

describe('the bundled pictures', () => {
  it('names a file by its code points without FE0F', () => {
    expect(pictureFile('🍎')).toBe('1f34e');
    expect(pictureFile('🗣️')).toBe('1f5e3');
    expect(pictureFile('🇮🇳')).toBe('1f1ee-1f1f3');
    expect(pictureSrc('⭐')).toBe('/family/pictures/2b50.svg');
  });

  it('has a picture for every emoji the app and the course show, and for every allowed course picture', () => {
    const missing = [...used, ...COURSE_EMOJI].filter((e) => !fs.existsSync(path.join(DIR, `${pictureFile(e)}.svg`)));
    expect(missing).toEqual([]);
  });

  it('holds plain SVG only, and its licence', () => {
    const bad = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg')).filter((f) => {
      const s = fs.readFileSync(path.join(DIR, f), 'utf8');
      return !/^<svg[\s>]/.test(s) || /<script|\son[a-z]+\s*=|<foreignObject|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)|<!ENTITY|<!DOCTYPE/i.test(s);
    });
    expect(bad).toEqual([]);
    expect(fs.readFileSync(path.join(DIR, 'LICENSE'), 'utf8')).toMatch(/MIT License[\s\S]*Copyright \(c\) Microsoft Corporation/);
  });
});
