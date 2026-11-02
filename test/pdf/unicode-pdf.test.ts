// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { textPdf, type TextBlock } from '@/lib/pdf/text-pdf';
import { needsUnicode, unicodePdf } from '@/lib/pdf/unicode-pdf';

const english: TextBlock[][] = [[{ kind: 'title', text: 'School (A)' }, { kind: 'line', text: 'Student: Aarav Madeup' }, { kind: 'table', columns: ['Subject', 'Total'], rows: [['Maths', '45 / 50']], numeric: [false, true], totalRow: false }]];
const hindi: TextBlock[][] = [
  [
    { kind: 'title', text: 'रिपोर्ट कार्ड' },
    { kind: 'line', text: 'छात्र: श्रेया क्षत्रिय', strong: true },
    { kind: 'table', columns: ['विषय', 'कुल'], rows: [['गणित', '45 / 50'], ['English', '40 / 50']], numeric: [false, true], totalRow: false },
    { kind: 'note', text: 'टिप्पणी: बहुत अच्छा प्रयास, ' + 'आगे बढ़ते रहें '.repeat(30) },
  ],
  [{ kind: 'line', text: 'Second card' }],
];
const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('needsUnicode', () => {
  it('is false for an English card, the rupee sign and Latin-1 letters, true for Devanagari', () => {
    expect(needsUnicode(english)).toBe(false);
    expect(needsUnicode([[{ kind: 'line', text: 'Fee ₹1,200 – José “ok” ? 100%' }]])).toBe(false);
    expect(needsUnicode(hindi)).toBe(true);
    expect(needsUnicode([[{ kind: 'table', columns: ['A'], rows: [['गणित']], numeric: [false], totalRow: false }]])).toBe(true);
    expect(needsUnicode([[{ kind: 'note', text: 'x' }], [{ kind: 'heading', text: 'कक्षा' }]])).toBe(true);
  });
});

describe('unicodePdf', () => {
  it('writes a PDF with the Noto face embedded, where the small writer can only print “?”', async () => {
    const bytes = await unicodePdf(hindi, { title: 'परीक्षा' });
    const text = latin1(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('NotoSansDevanagari-Regular');
    expect(text).toContain('NotoSansDevanagari-Bold');
    expect(text).toMatch(/\/Count 2\b/); // one page a card
    // The same blocks in the small writer lose every Devanagari letter.
    const small = latin1(textPdf(hindi));
    expect(small).toMatch(/\(\?{5,}/);
    expect(small).not.toContain('NotoSansDevanagari');
  });

  it('places the Devanagari through the font: the text layer of the page reads back as Hindi', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const bytes = await unicodePdf([[{ kind: 'line', text: 'श्रेया क्षत्रिय' }]]);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
    const content = await (await doc.getPage(1)).getTextContent();
    const read = content.items.map((i) => ('str' in i ? i.str : '')).join('');
    expect(read).toContain('श्रेया');
    expect(read).not.toContain('?');
  });

  it('draws a Latin-only card too (one face for every run)', async () => {
    const bytes = await unicodePdf(english);
    expect(latin1(bytes)).toMatch(/\/Count 1\b/);
  });
});
