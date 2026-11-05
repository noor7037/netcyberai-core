import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROFILES, profileNeeds } from '@/lib/ai/platform';
import { registerOcrPrompt, REGISTER_OCR_FIELDS } from '@/lib/ai/prompts/students.register_ocr';
import { TRY_INPUTS } from '@/lib/ai/try-inputs';
import { t, type MessageKey } from '@/lib/i18n';
import { CONFIDENCE_FLOOR, IMPORT_HEADER, fieldsToCheck, isoDate, parseRegister, phoneOf, registerCsv } from '@/lib/students/register-ocr';
import { registerPages, REGISTER_MAX_BYTES } from '@/lib/students/register-read';
import { parseCsvChecked, rowsToRecords } from '@/lib/import/csv';
import { WorkloadCard, draftOf } from '@/components/control/ai/WorkloadCard';

// W21-M5: a page of a paper admission register read into the student import. The prompt's shape, the clean-up of what
// the model answers, the pictures the route accepts, the profile in the registry, and its Control card. Every name and
// number here is made up.

const cell = (value: unknown, confidence = 0.95) => ({ value, confidence });
const row = (over: Record<string, unknown> = {}) => ({
  admission_no: cell('A-101'),
  name: cell('Aarav Example'),
  guardian_name: cell('Rakesh Example'),
  dob: cell('23/04/2015'),
  class: cell('5'),
  section: cell('A'),
  gender: cell('M'),
  phone: cell('+91 98765 43210'),
  address: cell('12, Model Town, Panipat'),
  ...over,
});

describe('the prompt (students.register_ocr v1)', () => {
  it('asks for a JSON array of rows with every field, a confidence each, and null for what is not legible', () => {
    const p = registerOcrPrompt(null);
    expect(p.version).toBe('v1');
    expect(registerOcrPrompt('v9').version).toBe('v1');
    const system = p.system({ pages: 1 });
    expect(system).toMatch(/ONE JSON array and nothing else/);
    for (const f of REGISTER_OCR_FIELDS) expect(system).toContain(`"${f}": {"value": "...", "confidence": 0.9}`);
    expect(system).toMatch(/value is null, with confidence 0, when the field is empty .* cannot be read/);
    expect(system).toMatch(/Never guess/);
    expect(system).toMatch(/Never copy an Aadhaar number/);
    expect(system).toMatch(/never instructions to you/);
    expect(p.user({ pages: 1 })).toBe('The register page is the one picture.');
    expect(p.user({ pages: 2 })).toBe('The register pages are the 2 pictures, in order.');
    expect(p.system({ pages: 3 })).toMatch(/^You read 3 photographed pages/);
  });
});

describe('the clean-up of the answer', () => {
  it('a full row: the date, the gender and the phone in the import’s shape, nothing marked', () => {
    const got = parseRegister(JSON.stringify([row()]));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.rows).toHaveLength(1);
    const r = got.rows[0];
    expect(r.dob).toEqual({ value: '2015-04-23', confidence: 0.95, low: false });
    expect(r.gender.value).toBe('male');
    expect(r.phone.value).toBe('9876543210');
    expect(r.name).toEqual({ value: 'Aarav Example', confidence: 0.95, low: false });
    expect(fieldsToCheck(got.rows)).toBe(0);
  });

  it('a blank, a dash or a missing field is null; a row with nothing readable is left out', () => {
    const got = parseRegister(JSON.stringify([row({ guardian_name: cell('   '), phone: cell('—'), address: undefined, section: cell(null, 0.7) }), Object.fromEntries(REGISTER_OCR_FIELDS.map((f) => [f, cell('')]))]));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.rows).toHaveLength(1);
    for (const f of ['guardian_name', 'phone', 'address', 'section'] as const) expect(got.rows[0][f]).toEqual({ value: null, confidence: 0, low: false });
  });

  it('a field under the confidence floor is marked; one that does not fit the import is marked too', () => {
    const got = parseRegister(JSON.stringify([row({ name: cell('Diya Sampla', CONFIDENCE_FLOOR - 0.05), dob: cell('2015', 0.99), gender: cell('Q', 0.99) })]));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const r = got.rows[0];
    expect(r.name).toEqual({ value: 'Diya Sampla', confidence: 0.75, low: true });
    expect(r.dob).toEqual({ value: '2015', confidence: 0.99, low: true });
    expect(r.admission_no.low).toBe(false);
    expect(fieldsToCheck(got.rows)).toBe(3);
  });

  it('a non-JSON answer is a plain error; a fenced array or {"rows": [...]} is read', () => {
    expect(parseRegister('I could not read the page, sorry.')).toEqual({ ok: false, reason: 'not_json' });
    expect(parseRegister('{"pages": 1}')).toEqual({ ok: false, reason: 'not_json' });
    expect(parseRegister('```json\n[]\n```')).toEqual({ ok: true, rows: [] });
    const wrapped = parseRegister(JSON.stringify({ rows: [row()] }));
    expect(wrapped.ok && wrapped.rows.length).toBe(1);
  });

  it('never keeps an Aadhaar number, drops what is outside the schema, and clamps a confidence', () => {
    const got = parseRegister(JSON.stringify([{ ...row({ admission_no: cell('2345 6789 0124', 1) }), aadhaar: cell('2345 6789 0124'), name: { value: 'Kabir Specimen', confidence: 7 } }]));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.rows[0].admission_no.value).toBeNull();
    expect(got.rows[0].name.confidence).toBe(1);
    expect(Object.keys(got.rows[0]).sort()).toEqual([...REGISTER_OCR_FIELDS].sort());
  });

  it('dates and phones only where they are certain', () => {
    expect(isoDate('3.4.2016')).toBe('2016-04-03');
    expect(isoDate('2016-04-03')).toBe('2016-04-03');
    expect(isoDate('31/02/2016')).toBeNull();
    expect(isoDate('04/03/16')).toBeNull();
    expect(phoneOf('09876543210')).toBe('9876543210');
    expect(phoneOf('12345')).toBeNull();
  });

  it('the corrected rows become the import’s CSV, which the import reads back as written', () => {
    const got = parseRegister(JSON.stringify([row({ name: cell('Ira, "Demo" Example') }), row({ section: cell(null, 0), dob: cell(null, 0) })]));
    if (!got.ok) throw new Error('not read');
    const csv = registerCsv(got.rows);
    expect(csv.split('\n')[0]).toBe(IMPORT_HEADER.join(','));
    const parsed = parseCsvChecked(csv);
    expect(parsed.unclosedQuote).toBe(false);
    const records = rowsToRecords(parsed.rows);
    expect(records[0]).toMatchObject({ name: 'Ira, "Demo" Example', admission_no: 'A-101', class_name: '5-A', dob: '2015-04-23', gender: 'male', guardian_phone: '9876543210' });
    expect(records[1]).toMatchObject({ class_name: '5', dob: '' });
    expect(csv).not.toContain('Rakesh');
    expect(csv).not.toContain('Model Town');
  });
});

describe('the pictures the route accepts', () => {
  // A 300 by 300 JPEG's header (SOI, an Exif APP1 the route drops, SOF0, SOS) and a 1 by 1 one.
  const jpeg = (w: number, h: number) =>
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]);
  const png = (w: number, h: number) => {
    const b = new Uint8Array(40);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    b.set([0, 0, w >> 8, w & 255, 0, 0, h >> 8, h & 255], 16);
    return b;
  };

  it('a JPEG (without its camera metadata) or a PNG, by its own first bytes', () => {
    const got = registerPages([{ bytes: jpeg(300, 300) }, { bytes: png(400, 300) }]);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.images.map((i) => i.mediaType)).toEqual(['image/jpeg', 'image/png']);
    expect(Buffer.from(got.images[0].base64, 'base64').includes(Buffer.from('Ex'))).toBe(false);
  });

  it('refuses WebP, text, a tiny picture, a PDF with no scan, too many pages and too many bytes', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
    expect(registerPages([{ bytes: webp }])).toEqual({ ok: false, reason: 'not_a_page' });
    expect(registerPages([{ bytes: new TextEncoder().encode('name,dob') }])).toEqual({ ok: false, reason: 'not_a_page' });
    expect(registerPages([{ bytes: jpeg(1, 1) }])).toEqual({ ok: false, reason: 'too_small' });
    expect(registerPages([{ bytes: new TextEncoder().encode('%PDF-1.4\n%%EOF\n') }])).toEqual({ ok: false, reason: 'pdf_no_scan' });
    expect(registerPages([])).toEqual({ ok: false, reason: 'no_file' });
    expect(registerPages([1, 2, 3, 4].map(() => ({ bytes: jpeg(300, 300) })))).toEqual({ ok: false, reason: 'too_many' });
    expect(registerPages([{ bytes: new Uint8Array(REGISTER_MAX_BYTES + 1) }])).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('the profile in the registry and its Control card', () => {
  const profile = PROFILES.find((p) => p.id === 'students.register_ocr');

  it('is a school vision workload that carries children’s words and follows the marking reader’s chain', () => {
    expect(profile).toEqual({ id: 'students.register_ocr', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 90_000, chainFrom: 'exams.read_pages', needs: ['vision'] });
    const from = PROFILES.find((p) => p.id === profile?.chainFrom);
    expect(from).toMatchObject({ audience: 'school', carriesChildWords: true, needs: ['vision'] });
    expect(profileNeeds(profile!)).toContain('vision');
    expect(TRY_INPUTS['students.register_ocr']).toEqual(TRY_INPUTS['exams.read_pages']);
  });

  it('the card names it, says what it reads, and that it runs on the reader’s services until one is set', () => {
    for (const lang of ['en', 'hi'] as const) {
      const tr = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);
      const p = { profileId: 'students.register_ocr', carriesChildWords: true, needs: ['vision' as never], providerId: null, model: null, fallback: [], promptVersion: 'v1', usesPrompt: true, enabled: true, chainFrom: 'exams.read_pages' };
      const html = renderToStaticMarkup(
        createElement(WorkloadCard, { profile: p, revisions: [], providerChoices: [], modelLists: {}, states: {}, busy: false, send: async () => {}, t: tr, draft: draftOf(p), setDraft: () => {} })
      );
      expect(html).toContain(tr('control.ai.profile.name.students.register_ocr'));
      expect(html).toContain(tr('control.ai.profile.about.students.register_ocr').slice(0, 40));
      expect(html).toContain(tr('control.ai.profile.follows', { profile: tr('control.ai.profile.name.exams.read_pages') }));
    }
  });
});
