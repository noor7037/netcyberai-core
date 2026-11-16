import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageView } from '@/components/family/blocks/ImageView';
import { ShowcaseView } from '@/components/family/blocks/ShowcaseView';
import { FORBIDDEN } from './picture-labels';
import { YOUNG_THINGS } from '@/lib/family/visuals/young';

// Founder, 16 Nov 2026: a photo is just a photo. No label, badge, caption prefix or credit line says what kind of
// picture it is, in any language. The credit stays in the block's data for a Picture credits page.

const photo = { type: 'image' as const, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Cow.jpg/480px-Cow.jpg', caption: 'A cow in a field.', credit: 'Someone', licence: 'CC BY 4.0', source: 'https://commons.wikimedia.org/wiki/File:Cow.jpg' };
const w = new Proxy({}, { get: (_t, k) => String(k) }) as never;

describe('no picture labels', () => {
  it('a photograph renders with its caption only: no heading, no badge, no credit', () => {
    const html = renderToStaticMarkup(h(ImageView, { b: photo, w, tone: 'science' }));
    expect(html).toContain('A cow in a field.');
    expect(html).not.toMatch(FORBIDDEN);
    expect(html).not.toContain('Someone');
    expect(html).not.toContain('CC BY');
    expect(html).not.toContain('<h2');
  });
  it('a showcase diagram with no title has no heading', () => {
    const html = renderToStaticMarkup(h(ShowcaseView, { b: { type: 'showcase', title: '', caption: 'The cycle.', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' } as never, w, tone: 'science' }));
    expect(html).not.toMatch(FORBIDDEN);
    expect(html).not.toContain('fam.block.photo');
  });
  it('no young-child caption says the thing is real', () => {
    for (const t of YOUNG_THINGS) {
      expect(t.en).not.toMatch(FORBIDDEN);
      expect(t.hiCaption).not.toMatch(FORBIDDEN);
    }
  });
  it('the lab engine labels no photo strip as real', () => {
    const engine = readFileSync('labs/engine.js', 'utf8');
    expect(engine).not.toMatch(/aria-label="\$\{esc\(t\(\{ en: 'Real photos'/);
    expect(engine).not.toContain("hi: 'असली फ़ोटो'");
  });
});
