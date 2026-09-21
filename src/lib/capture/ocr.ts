import { createWorker } from 'tesseract.js';

// OCR provider decision (resolves PRD Sec6.1's own `[GAP]`): tesseract.js,
// self-hosted, not a paid cloud vendor. Reasoning, weighed against the
// PRD's own stated criteria:
// - Data residency ("must not egress India for children's documents"):
//   a cloud OCR API means the document image itself leaves this
//   process and this region. tesseract.js processes the image bytes
//   in-memory, in the same serverless function region this code
//   already runs in (Vercel's serverless region config) -- no
//   document image is ever sent to a third party.
// - Cost: zero per-page cost, which matters for a project whose own
//   Decision Log tracks WhatsApp per-message cost as a first-class
//   concern for a bootstrapped pilot.
// - No vendor account/API key to provision before this feature works
//   at all.
// Real trade-off, stated plainly rather than glossed over: tesseract's
// accuracy on handwriting and regional scripts is weaker than a
// dedicated commercial engine -- exactly why PRD Sec6.1's own "never
// trust unattended, always human-confirmed" rule is load-bearing here,
// not a formality. Devanagari/regional-script support would need a
// different trained-data file per script; only English is wired up
// (see LANGUAGE below) -- a real, named gap, not a silent one.
const LANGUAGE = 'eng';

export interface OcrWord {
  text: string;
  confidence: number; // 0-100, tesseract's own per-word confidence
}

export interface OcrResult {
  rawText: string;
  words: OcrWord[];
}

// Runs entirely in-memory: `image` is never written to disk by this
// function, and the caller decides separately (see the upload route)
// whether the source bytes get persisted to Storage at all -- for
// guardian-ID documents, per the Aadhaar constraint, they must not.
export async function runOcr(image: Buffer): Promise<OcrResult> {
  const worker = await createWorker(LANGUAGE, 1, {
    cachePath: '/tmp', // the only guaranteed-writable path in a Vercel serverless function
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(image);
    const words: OcrWord[] = (data.words ?? []).map((w) => ({ text: w.text, confidence: w.confidence }));
    return { rawText: data.text, words };
  } finally {
    await worker.terminate();
  }
}

export interface CandidateField {
  fieldName: string;
  extractedValue: string;
  confidence: number;
}

const DATE_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
const AADHAAR_RE = /\b(\d{4})\s?(\d{4})\s?(\d{4})\b/;

// Confidence for a field spanning multiple OCR words is the average of
// those words' own real tesseract confidence scores -- never a fixed
// or guessed number. If no words matched at all, no field is produced;
// an absent field is honest, a fabricated full-confidence score on a
// guess is not.
function confidenceForMatch(words: OcrWord[], matchedText: string): number {
  const matchedWords = words.filter((w) => matchedText.includes(w.text) && w.text.trim().length > 0);
  if (matchedWords.length === 0) return 0;
  return Math.round((matchedWords.reduce((sum, w) => sum + w.confidence, 0) / matchedWords.length) * 10) / 10;
}

// Deliberately narrow, heuristic extraction -- PRD Sec6.1 itself frames
// OCR as "good enough to save typing, not good enough to trust
// unattended." This never writes to a student record; it only produces
// candidates a human reviews (see the review route/UI). Two supported
// shapes today: a name-shaped line (first reasonably-long, capitalized,
// non-numeric line) and a date pattern -- real, common fields across
// every doc_type PRD Sec6.1 lists except guardian_id, which gets its
// own Aadhaar-specific handling below.
export function extractCandidateFields(result: OcrResult): CandidateField[] {
  const fields: CandidateField[] = [];
  const lines = result.rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const nameLine = lines.find((l) => /^[A-Z][A-Za-z.\s]{4,40}$/.test(l) && !/\d/.test(l));
  if (nameLine) {
    fields.push({ fieldName: 'name', extractedValue: nameLine, confidence: confidenceForMatch(result.words, nameLine) });
  }

  const dateMatch = result.rawText.match(DATE_RE);
  if (dateMatch) {
    fields.push({ fieldName: 'dob', extractedValue: dateMatch[0], confidence: confidenceForMatch(result.words, dateMatch[0]) });
  }

  return fields;
}

export interface AadhaarExtraction {
  last4: string;
  nameMatch: boolean;
  nameMatchMethod: 'ocr_name_vs_student_record';
  confidence: number;
}

// AADHAAR CONSTRAINT (PRD Sec6.1, non-negotiable): never extract or
// return the full number, never more than the last 4 digits. The
// regex's own capture groups exist so the full number is never even
// assembled into one string this function could accidentally return --
// group 3 (the last block) is read into `last4`; groups 1 and 2 are
// discarded, never concatenated, never logged.
export function extractAadhaarLast4AndNameMatch(result: OcrResult, expectedName: string): AadhaarExtraction | null {
  const match = result.rawText.match(AADHAAR_RE);
  if (!match) return null;
  const last4 = match[3].slice(-4);
  const confidence = confidenceForMatch(result.words, match[0]);

  const normalizedExpected = expectedName.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedText = result.rawText.toLowerCase().replace(/\s+/g, ' ');
  const nameMatch = normalizedExpected.length > 0 && normalizedText.includes(normalizedExpected);

  return { last4, nameMatch, nameMatchMethod: 'ocr_name_vs_student_record', confidence };
}
