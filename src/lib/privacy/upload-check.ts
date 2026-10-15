import type { OcrResult } from '@/lib/capture/ocr';
import { sniffImageType } from '@/lib/storage/file-storage';
import { hasAadhaarNumber } from './aadhaar';
import { readPdf } from './pdf-text';
import type { UploadProblem } from './upload-problems';

// NO AADHAAR CARD OR NUMBER IN A STORED FILE (C232 part A, C230-A: "the text read from an uploaded document goes
// through the Aadhaar rule, and an Aadhaar card is refused"). The ONE check every upload that keeps a document runs
// before the file is stored: a captured student document (src/lib/capture/documents.ts; the guardian ID keeps its own
// path, which reads the last four digits and a name match and never stores the image), SQAAF evidence
// (src/lib/compliance/sqaaf.ts), a homework file (src/lib/homework/homework.ts) and a support ticket's screenshot
// (src/lib/support/tickets.ts). RTE evidence points at captured documents, so it is checked there.
//
// What is read:
//   - the file's name;
//   - a photo (PNG, JPEG or WebP, by its own first bytes, never the type the browser claims): its words, by the
//     capture OCR (runOcr, tesseract, English only);
//   - a PDF: its text layer (src/lib/privacy/pdf-text.ts, no PDF library), and the OCR of up to three JPEG pictures in
//     it (a scan saved as a PDF).
// What is refused:
//   - upload_aadhaar_number: a text with a number the one rule refuses (hasAadhaarNumber, src/lib/privacy/aadhaar.ts);
//   - upload_aadhaar_card: a text that reads as an Aadhaar card: "UIDAI", "Unique Identification Authority",
//     "Aadhaar" or "आधार" together with "Government of India" / "भारत सरकार", an enrolment number, a VID or UIDAI's
//     own web address;
//   - upload_unreadable (the conservative rule, an open decision for the founder): a photo whose words the OCR could
//     not read (it failed: a photo that simply has no words is read, and passes), a PDF with a password (it cannot be
//     read at all), a picture inside a PDF the OCR could not read, and a file that is neither a photo nor a PDF.
// A PDF with no text layer and no JPEG picture (drawn only, or a scan in another format) passes on its name alone:
// that is said plainly as `read: 'name_only'` and kept in the upload's audit row.

export { UPLOAD_PROBLEMS, isUploadProblem, type UploadProblem } from './upload-problems';
export type UploadRead = 'image_text' | 'pdf_text' | 'name_only';
export type UploadCheck = { ok: true; read: UploadRead; ocr: OcrResult | null } | { ok: false; reason: UploadProblem };
export type OcrImage = (image: Buffer) => Promise<OcrResult>;

// The capture OCR, loaded only when a picture is read (tesseract is large).
const captureOcr: OcrImage = async (image) => (await import('@/lib/capture/ocr')).runOcr(image);

const MENTION = /\b(?:uidai|aadh?aa?r|adhaar)\b|unique\s+identification\s+authority|आधार/i;
const MARKER = /government\s+of\s+india|भारत\s+सरकार|\benrol?l?ment\b|\bvid\b|virtual\s+id|uidai\.gov\.in|मेरा\s+आधार/i;
export const readsAsAadhaarCard = (text: string): boolean => MENTION.test(text) && MARKER.test(text);

// What a text read from a file says, by the one rule and the card's words; null when it may be kept.
export function textProblem(text: string): UploadProblem | null {
  if (hasAadhaarNumber(text)) return 'upload_aadhaar_number';
  if (readsAsAadhaarCard(text)) return 'upload_aadhaar_card';
  return null;
}

const isPdf = (b: Uint8Array) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;

export async function checkUpload(file: { bytes: Uint8Array; name: string }, ocr: OcrImage = captureOcr): Promise<UploadCheck> {
  const named = textProblem(file.name.replace(/[_.]+/g, ' '));
  if (named) return { ok: false, reason: named };
  const buffer = Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
  if (sniffImageType(file.bytes)) {
    let read: OcrResult;
    try {
      read = await ocr(buffer);
    } catch {
      return { ok: false, reason: 'upload_unreadable' };
    }
    const problem = textProblem(read.rawText ?? '');
    return problem ? { ok: false, reason: problem } : { ok: true, read: 'image_text', ocr: read };
  }
  if (!isPdf(file.bytes)) return { ok: false, reason: 'upload_unreadable' };
  const pdf = readPdf(file.bytes);
  if (pdf.encrypted) return { ok: false, reason: 'upload_unreadable' };
  const texts = [pdf.text];
  for (const jpeg of pdf.jpegs) {
    try {
      texts.push((await ocr(Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength))).rawText ?? '');
    } catch {
      return { ok: false, reason: 'upload_unreadable' };
    }
  }
  const problem = textProblem(texts.join('\n'));
  if (problem) return { ok: false, reason: problem };
  return { ok: true, read: pdf.text.trim() || pdf.jpegs.length ? 'pdf_text' : 'name_only', ocr: null };
}
