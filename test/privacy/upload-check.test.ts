import { deflateSync } from 'zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AADHAAR_CASES } from '../fixtures/aadhaar-cases';

// C232 part A (C230-A): the text read from an uploaded document goes through the ONE Aadhaar rule, and a document that
// reads as an Aadhaar card is refused. src/lib/privacy/upload-check.ts is the one check; src/lib/privacy/pdf-text.ts
// reads a PDF without a library. The OCR is a stand-in here (tesseract is never run in a test): what it "reads" is
// set by each test. Every number is made up.

const ocr = vi.hoisted(() => ({ text: '' as string | Error, seen: [] as Buffer[] }));
vi.mock('@/lib/capture/ocr', async (original) => ({
  ...(await original<typeof import('@/lib/capture/ocr')>()),
  runOcr: async (image: Buffer) => {
    ocr.seen.push(image);
    if (ocr.text instanceof Error) throw ocr.text;
    return { rawText: ocr.text, words: ocr.text ? ocr.text.split(/\s+/).map((w) => ({ text: w, confidence: 90 })) : [] };
  },
}));
// The capture flow's database and storage: recorded, so a refusal can be shown to touch neither.
const calls = vi.hoisted(() => ({ tenant: 0, uploads: [] as string[] }));
vi.mock('@/lib/auth/db', () => ({
  withTenantContext: async (_claims: unknown, fn: (c: unknown) => Promise<unknown>) => {
    calls.tenant += 1;
    let n = 0;
    const client = {
      query: async (sql: string) => {
        n += 1;
        if (/from students/.test(sql)) return { rows: [{ student_id: 's', name: 'Dev Mehta' }] };
        if (/insert into captured_documents/.test(sql)) return { rows: [{ document_id: `d${n}`, doc_type: 'birth_certificate', storage_path: 'p', ocr_status: 'done', uploaded_at: '2026-10-15' }] };
        if (/insert into ocr_extractions/.test(sql)) return { rows: [{ extraction_id: `e${n}`, field_name: 'name', extracted_value: 'x', confidence: 90 }] };
        return { rows: [], rowCount: 1 };
      },
    };
    return fn(client);
  },
}));
vi.mock('@/lib/audit/log', () => ({ writeAuditLog: async () => undefined }));
vi.mock('@/lib/capture/storage', () => ({
  buildObjectPath: (school: string, student: string, type: string, ext: string) => `${school}/documents/${student}/${type}/x.${ext}`,
  uploadDocument: async (path: string) => void calls.uploads.push(path),
  signedDocumentUrl: async (path: string) => `signed://${path}`,
}));

import { captureDocument } from '@/lib/capture/documents';
import { readPdf, parseCMap } from '@/lib/privacy/pdf-text';
import { checkUpload, readsAsAadhaarCard, textProblem } from '@/lib/privacy/upload-check';
import { isUploadProblem, UPLOAD_PROBLEMS } from '@/lib/privacy/upload-problems';
import { ERROR_RULES } from '@/lib/errors/catalogue';

beforeEach(() => {
  ocr.text = '';
  ocr.seen = [];
  calls.tenant = 0;
  calls.uploads = [];
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4, 0, 0, 0, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

// A PDF made by hand: each object is its dictionary, and a stream's bytes when it has one.
type Obj = { dict: string; data?: Buffer };
function pdf(objects: Obj[], trailer = ''): Uint8Array {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  objects.forEach((o, i) => {
    if (o.data) {
      parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`, 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1'));
    } else parts.push(Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} >>\nendobj\n`, 'latin1'));
  });
  parts.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
const page = (content: Obj, font: Obj = { dict: '/Type /Font /Subtype /Type1 /BaseFont /Helvetica' }) =>
  [{ dict: '/Type /Catalog /Pages 2 0 R' }, { dict: '/Type /Pages /Kids [3 0 R] /Count 1' }, { dict: '/Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R' }, content, font];
const text = (words: string, flate = false): Obj => {
  const ops = Buffer.from(`BT /F1 12 Tf 72 720 Td (${words}) Tj ET`, 'latin1');
  return flate ? { dict: '/Filter /FlateDecode', data: deflateSync(ops) } : { dict: '', data: ops };
};

describe('the one rule, on what a file says', () => {
  it('a text is refused exactly as the one Aadhaar rule refuses it (the shared list of cases)', () => {
    for (const c of AADHAAR_CASES) expect(textProblem(c.input), c.why).toBe(c.refused ? 'upload_aadhaar_number' : null);
  });

  it('a text that reads as an Aadhaar card: a mention of Aadhaar or UIDAI together with a card’s own marks', () => {
    for (const card of [
      'Government of India\nAadhaar\nDOB: 11/01/2014\nMALE',
      'भारत सरकार\nआधार - आम आदमी का अधिकार',
      'Unique Identification Authority of India\nAddress: 1 Example Road\nwww.uidai.gov.in',
      'Enrolment No.: 0000/00000/00000\nTo Dev Mehta\nYour Aadhaar No.: XXXX XXXX 0000\nVID : 0000 0000 0000 0000',
      'AADHAAR\nGOVERNMENT OF INDIA',
    ]) expect(readsAsAadhaarCard(card), card).toBe(true);
    for (const other of ['Birth certificate\nGovernment of India\nRegistrar of Births and Deaths', 'Aadhaar seeding report for the school', 'Transfer certificate\nEnrolment No. A-12', '']) expect(readsAsAadhaarCard(other), other).toBe(false);
    expect(textProblem('Government of India\nAadhaar\nXXXX XXXX 0000')).toBe('upload_aadhaar_card');
    expect(textProblem('Government of India\nAadhaar\n1234 5678 9012')).toBe('upload_aadhaar_number');
  });

  it('each refusal is a rule of the error catalogue, in English and Hindi', () => {
    for (const rule of UPLOAD_PROBLEMS) {
      expect(ERROR_RULES[rule].en(), rule).toMatch(/Aadhaar/);
      expect(ERROR_RULES[rule].hi(), rule).toMatch(/आधार/);
      expect(isUploadProblem(rule)).toBe(true);
    }
    expect(isUploadProblem('too_large')).toBe(false);
  });
});

describe('checkUpload: a photo through the OCR', () => {
  it('a photo is read: an Aadhaar number or card in it is refused, a photo without one (or without words) passes', async () => {
    ocr.text = 'Name: Dev Mehta\nAadhaar 1234 5678 9012';
    expect(await checkUpload({ bytes: PNG, name: 'scan.png' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    ocr.text = 'GOVERNMENT OF INDIA\nAadhaar\nXXXX XXXX 0000';
    expect(await checkUpload({ bytes: PNG, name: 'scan.png' })).toEqual({ ok: false, reason: 'upload_aadhaar_card' });
    ocr.text = 'Birth certificate\nName: Dev Mehta\nDate of birth: 14-04-2014';
    expect(await checkUpload({ bytes: PNG, name: 'birth.png' })).toMatchObject({ ok: true, read: 'image_text', ocr: { rawText: ocr.text } });
    ocr.text = '';
    expect(await checkUpload({ bytes: PNG, name: 'classroom.png' })).toMatchObject({ ok: true, read: 'image_text' });
    expect(ocr.seen).toHaveLength(4);
  });

  it('an OCR that fails never passes a file as checked: it is refused, to be uploaded again more clearly', async () => {
    ocr.text = new Error('tesseract could not start');
    expect(await checkUpload({ bytes: PNG, name: 'scan.png' })).toEqual({ ok: false, reason: 'upload_unreadable' });
  });

  it('the file’s own bytes decide what it is: a PDF claimed to be a photo is read as a PDF; anything else is refused', async () => {
    expect(await checkUpload({ bytes: pdf(page(text('Aadhaar 1234 5678 9012'))), name: 'photo.jpg' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    expect(await checkUpload({ bytes: new Uint8Array([0x4d, 0x5a, 1, 2, 3]), name: 'x.png' })).toEqual({ ok: false, reason: 'upload_unreadable' });
  });

  it('the file’s name is checked too, before anything is read', async () => {
    expect(await checkUpload({ bytes: PNG, name: 'aadhaar 1234 5678 9012.png' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    expect(await checkUpload({ bytes: PNG, name: 'card_1234_5678_9012.jpg' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    expect(ocr.seen).toHaveLength(0);
    expect(await checkUpload({ bytes: PNG, name: 'IMG_20261015_104530.jpg' })).toMatchObject({ ok: true });
  });
});

describe('checkUpload: a PDF, read without a PDF library', () => {
  it('its text layer, written plainly or compressed, goes through the rule', async () => {
    expect(await checkUpload({ bytes: pdf(page(text('Student list: Dev Mehta 1234 5678 9012'))), name: 'list.pdf' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    expect(await checkUpload({ bytes: pdf(page(text('Unique Identification Authority of India - Government of India', true))), name: 'letter.pdf' })).toEqual({ ok: false, reason: 'upload_aadhaar_card' });
    expect(await checkUpload({ bytes: pdf(page(text('Fire safety certificate 2026-27', true))), name: 'fire-noc.pdf' })).toEqual({ ok: true, read: 'pdf_text', ocr: null });
    expect(readPdf(pdf(page(text('Fire safety certificate 2026-27', true)))).text).toBe('Fire safety certificate 2026-27');
  });

  it('a font that writes glyph codes is read through its ToUnicode map', async () => {
    // Digits as codes 0x0010-0x0019 and the space as 0x0003, the way a subset font writes them.
    const cmap = Buffer.from('/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfchar <0003> <0020> endbfchar 1 beginbfrange <0010> <0019> <0030> endbfrange endcmap end end', 'latin1');
    const codes = '1234 5678 9012'.split('').map((ch) => (ch === ' ' ? '0003' : (0x10 + Number(ch)).toString(16).padStart(4, '0'))).join('');
    const content: Obj = { dict: '/Filter /FlateDecode', data: deflateSync(Buffer.from(`BT /F1 11 Tf <${codes}> Tj ET`, 'latin1')) };
    const font: Obj = { dict: '/Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Arial /Encoding /Identity-H /ToUnicode 6 0 R' };
    const bytes = pdf([...page(content, font), { dict: '/Filter /FlateDecode', data: deflateSync(cmap) }]);
    expect(readPdf(bytes).text).toBe('1234 5678 9012');
    expect(await checkUpload({ bytes, name: 'udise.pdf' })).toEqual({ ok: false, reason: 'upload_aadhaar_number' });
    expect(parseCMap(cmap.toString('latin1'))?.map.get(0x19)).toBe('9');
  });

  it('a scan saved as a PDF: its JPEG picture is read by the OCR', async () => {
    const scan = pdf([...page(text(''), undefined), { dict: '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', data: JPEG }]);
    ocr.text = 'Government of India Aadhaar';
    expect(await checkUpload({ bytes: scan, name: 'scan.pdf' })).toEqual({ ok: false, reason: 'upload_aadhaar_card' });
    expect(ocr.seen[0].subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    ocr.text = 'Report card 2025-26';
    expect(await checkUpload({ bytes: scan, name: 'scan.pdf' })).toMatchObject({ ok: true, read: 'pdf_text' });
    ocr.text = new Error('no worker');
    expect(await checkUpload({ bytes: scan, name: 'scan.pdf' })).toEqual({ ok: false, reason: 'upload_unreadable' });
  });

  it('a PDF with a password cannot be read, so it is refused; one with nothing to read passes on its name alone', async () => {
    expect(await checkUpload({ bytes: pdf(page(text('x')), '/Encrypt 9 0 R'), name: 'eaadhaar.pdf' })).toEqual({ ok: false, reason: 'upload_unreadable' });
    expect(await checkUpload({ bytes: new TextEncoder().encode('%PDF-1.4\n'), name: 'drawing.pdf' })).toEqual({ ok: true, read: 'name_only', ocr: null });
    // Never throws, whatever it is given.
    expect(readPdf(new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Length 999 /Filter /FlateDecode >>\nstream\nnot zlib\nendstream\nendobj\n'))).toEqual({ encrypted: false, text: '', jpegs: [], pages: [] });
  });
});

describe('the capture flow: checked before anything is stored', () => {
  const claims = { sub: 'u', schoolId: 'school', role: 'school_admin' } as never;
  it('a document that reads as an Aadhaar card is refused: no connection taken, nothing uploaded, nothing written', async () => {
    ocr.text = 'Government of India\nAadhaar\nXXXX XXXX 0000';
    expect(await captureDocument(claims, 'student', 'address_proof', Buffer.from(PNG), 'image/png', null, 'proof.png')).toEqual({ refused: 'upload_aadhaar_card' });
    expect(calls).toEqual({ tenant: 0, uploads: [] });
    ocr.text = 'Name: Dev Mehta\n1234-5678-9012';
    expect(await captureDocument(claims, 'student', 'previous_school_tc', Buffer.from(PNG), 'image/png', null, 'tc.png')).toEqual({ refused: 'upload_aadhaar_number' });
    ocr.text = new Error('no worker');
    expect(await captureDocument(claims, 'student', 'birth_certificate', Buffer.from(PNG), 'image/png', null, 'birth.png')).toEqual({ refused: 'upload_unreadable' });
    expect(calls).toEqual({ tenant: 0, uploads: [] });
  });

  it('a clean document is stored, and its candidate fields come from the check’s own reading (one OCR, not two)', async () => {
    ocr.text = 'Birth Certificate\nDev Mehta\n14-04-2014';
    const out = await captureDocument(claims, 'student', 'birth_certificate', Buffer.from(PNG), 'image/png', null, 'birth.png');
    expect(out && 'document' in out && out.document.ocr_status).toBe('done');
    expect(calls.uploads).toEqual(['school/documents/student/birth_certificate/x.png']);
    expect(ocr.seen).toHaveLength(1);
  });

  it('the guardian ID keeps its own path: read for the last four digits and a name match, never stored, not refused', async () => {
    ocr.text = 'Government of India\nAadhaar\n1234 5678 9012\nDev Mehta';
    const out = await captureDocument(claims, 'student', 'guardian_id', Buffer.from(PNG), 'image/png', null, 'id.png');
    expect(out && 'document' in out).toBe(true);
    expect(calls.uploads).toEqual([]);
  });
});
