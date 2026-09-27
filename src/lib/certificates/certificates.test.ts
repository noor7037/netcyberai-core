import { describe, expect, it } from 'vitest';
import { CERT_EXAMPLES, CERT_SCHOOL_EXAMPLE } from '@/demo-fixture/certificate-examples';
import { CERT_DEFS, missingRequired, type CertDoc } from './definitions';
import { esc, fitImage, marksheetTotals, receiptTotals, renderCertificateSvg } from './render';
import { dateInWords, formatDate, numberInWords, parseIsoDate, rupeesInWords } from './words';

const docFor = (type: string, extra: Partial<CertDoc> = {}): CertDoc => {
  const def = CERT_DEFS.find((d) => d.type === type)!;
  const ex = CERT_EXAMPLES[def.type];
  return { def, template: def.templates[0], values: { ...CERT_SCHOOL_EXAMPLE, ...ex.values }, rows: ex.rows ?? {}, images: {}, options: { stampBox: true, qr: false }, ...extra };
};

describe('words', () => {
  it('writes Indian amounts in words', () => {
    expect(numberInWords(0)).toBe('Zero');
    expect(numberInWords(115)).toBe('One Hundred Fifteen');
    expect(numberInWords(123456)).toBe('One Lakh Twenty-Three Thousand Four Hundred Fifty-Six');
    expect(numberInWords(20000000)).toBe('Two Crore');
    expect(rupeesInWords(12500.5)).toBe('Rupees Twelve Thousand Five Hundred and Fifty Paise Only');
  });
  it('writes a date of birth in words and figures', () => {
    expect(dateInWords('2012-04-23')).toBe('Twenty-Third April Two Thousand Twelve');
    expect(dateInWords('2010-01-01')).toBe('First January Two Thousand Ten');
    expect(dateInWords('2011-03-30')).toBe('Thirtieth March Two Thousand Eleven');
    expect(formatDate('2012-04-23')).toBe('23/04/2012');
  });
  it('rejects impossible dates', () => {
    expect(parseIsoDate('2023-02-29')).toBeNull();
    expect(dateInWords('2024-02-30')).toBe('');
  });
});

describe('certificates', () => {
  it('defines all seven documents with unique slugs and allowed templates', () => {
    expect(CERT_DEFS.map((d) => d.type).sort()).toEqual(['achievement', 'bonafide', 'character', 'fee-receipt', 'marksheet', 'study', 'transfer']);
    expect(new Set(CERT_DEFS.map((d) => d.slug)).size).toBe(7);
    // Transfer and character certificates stay black and white.
    for (const t of ['transfer', 'character']) expect(CERT_DEFS.find((d) => d.type === t)!.templates.every((x) => x === 'classic' || x === 'formal')).toBe(true);
  });

  for (const def of CERT_DEFS) {
    it(`${def.type}: example is complete and renders in every template`, () => {
      const base = docFor(def.type);
      expect(missingRequired(base)).toEqual([]);
      for (const template of def.templates) {
        const svg = renderCertificateSvg({ ...base, template, options: { stampBox: true, qr: true } });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox="0 0 210 297"');
        expect(svg).toContain(esc(base.values.schoolName.toUpperCase()));
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
      }
    });
  }

  it('escapes typed text so it can never become markup', () => {
    const d = docFor('bonafide');
    const svg = renderCertificateSvg({ ...d, values: { ...d.values, studentName: '<script>alert(1)</script>' } });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('only embeds data-URL images', () => {
    const d = docFor('bonafide');
    const bad = renderCertificateSvg({ ...d, images: { logo: { src: 'https://evil.example/x.png', aspect: 1 } } });
    expect(bad).not.toContain('evil.example');
    const good = renderCertificateSvg({ ...d, images: { logo: { src: 'data:image/png;base64,iVBORw0KGgo=', aspect: 1 } } });
    expect(good).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it('reports what is missing', () => {
    const d = docFor('transfer');
    expect(missingRequired({ ...d, values: { ...d.values, studentName: ' ', reason: '' } })).toEqual(['Name of the student', 'Reason for leaving']);
    const r = docFor('fee-receipt');
    expect(missingRequired({ ...r, rows: { heads: [] } })).toContain('Fee heads');
  });

  it('fits logos inside their box and lets wide logos use more width', () => {
    expect(fitImage(1, 26, 26)).toEqual({ w: 26, h: 26 });
    expect(fitImage(0.5, 26, 26)).toEqual({ w: 13, h: 26 });
    const wide = fitImage(4, 26, 26);
    expect(wide.w).toBe(52);
    expect(wide.h).toBe(13);
  });

  it('computes marksheet totals, grades and result from the configured scale', () => {
    const d = docFor('marksheet');
    const m = marksheetTotals(d);
    expect(m.subjects.length).toBeGreaterThan(3);
    expect(m.max).toBe(m.subjects.reduce((a, x) => a + x.max, 0));
    expect(['Pass', 'Needs improvement']).toContain(m.result);
    const custom = marksheetTotals({ ...d, values: { ...d.values, grades: 'Distinction:75, First:60, Second:45, Pass:33, Fail:0' } });
    expect(['Distinction', 'First', 'Second', 'Pass', 'Fail']).toContain(custom.grade);
  });

  it('computes receipt total, balance and words', () => {
    const d = docFor('fee-receipt', { rows: { heads: [{ head: 'Tuition', amount: '12000' }, { head: 'Transport', amount: '3000' }] } });
    const r = receiptTotals({ ...d, values: { ...d.values, discount: '1000', lateFee: '200', paid: '14000' } });
    expect(r.total).toBe(14200);
    expect(r.balance).toBe(200);
  });
});

describe('certificate wording', () => {
  it('never puts a space before a comma or full stop after a bold name', () => {
    const def = CERT_DEFS.find((d) => d.type === 'bonafide')!;
    const svg = renderCertificateSvg({ def, template: 'classic', values: { ...CERT_SCHOOL_EXAMPLE, ...CERT_EXAMPLES.bonafide.values }, rows: {}, images: {}, options: { stampBox: false, qr: false } });
    const text = svg.replace(/<[^>]+>/g, '');
    expect(text).toContain('Diya Nair, daughter of');
    expect(text).not.toMatch(/ [,.]/);
  });
});
