import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import type { MessageKey } from '@/lib/i18n';

// The checked paper as a PDF (C366): what the browser draws it from, and the rules the server holds it to. Pure, so
// the office's browser, the family's browser and the server agree (./checked-pdf.ts draws it; ./checked-pdf-store.ts
// keeps it until it is sent).

// What one child's PDF is made of: the child's own checked papers of one publication, as a family is shown them
// (src/lib/marking/family-view.ts), with the words of the page's head. `lang`: the family's language.
export type CheckedPdfInput = {
  school: string;
  child: string;
  className: string;
  rollNo: string | null;
  exam: string;
  publishedOn: string; // yyyy-mm-dd, India
  lang: 'en' | 'hi';
  papers: SchoolCheckedPaper[];
};

// How large a picture of a checked page is drawn, and how hard it is pressed. The first that gives a PDF under
// PDF_MAX_BYTES is kept; the aim is PDF_TARGET_BYTES or under for a whole publication.
export type PdfStep = { longEdge: number; quality: number };
export const PDF_STEPS: readonly PdfStep[] = [
  { longEdge: 1200, quality: 0.6 },
  { longEdge: 1000, quality: 0.5 },
  { longEdge: 850, quality: 0.42 },
];
export const PDF_TARGET_BYTES = 1_500_000;
// Under the host's limit for one request (4.5 MB), with room for the request itself.
export const PDF_MAX_BYTES = 4_000_000;
// Our copy is deleted once a message with it is sent, and at the latest this many days after it was made.
export const PDF_KEEP_DAYS = 7;

// The words of the PDF: these keys and the family's own words for a checked paper, so the PDF says what the app says.
export const CHECKED_PDF_WORD_KEYS = [
  'mk.pdf.title',
  'mk.pdf.child',
  'mk.pdf.childNoRoll',
  'mk.pdf.published',
  'mk.pdf.colQuestion',
  'mk.pdf.colMarks',
  'mk.pdf.colTopic',
  'mk.pdf.pagesFollow',
  'mk.pdf.page',
  'mk.pdf.footer',
  'fam.marks.partScore',
  'fam.marks.markOf',
  'fam.marks.noMark',
  'fam.marks.notCounted',
  'fam.marks.noPages',
  'fam.marks.strengths',
  'fam.marks.improve',
  'fam.marks.practice',
] as const satisfies readonly MessageKey[];
export type CheckedPdfWordKey = (typeof CHECKED_PDF_WORD_KEYS)[number];
export type Say = (key: CheckedPdfWordKey, params?: Record<string, string | number>) => string;

// A PDF by its own bytes: its header first, its end mark near the end. Never by a name or a type a browser claims.
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 64) return false;
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head !== '%PDF-') return false;
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 1024)));
  return tail.includes('%%EOF');
}

// The name a family's WhatsApp shows for the file: the exam, the class and the roll number, never the child's name.
// Letters, digits, dashes and underscores only (what is not, such as Hindi, is left out); "result" when nothing is left.
export function pdfFileName(exam: string, className: string, rollNo: string | null): string {
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9 _-]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30);
  const parts = [clean(exam) || 'result', clean(className), rollNo && clean(rollNo) ? `roll-${clean(rollNo)}` : ''].filter(Boolean);
  return `${parts.join('_').slice(0, 80)}.pdf`;
}
