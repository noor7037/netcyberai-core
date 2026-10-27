import { OPTION_KEYS, type MarkingQuestion, type OptionKey } from '@/lib/contracts/marking';

// The bubble (OMR) sheet's layout (docs/36 §1.2, C364): where everything is on an A4 page, in millimetres from the
// top-left corner. One pure function, shared by the printer (src/components/bubbles/sheet-pdf.ts), the reader
// (./read.ts) and the review screen's picture (a read sheet is kept straightened to this page), so the three can never
// disagree. No QR code, barcode or label of any kind (CLAUDE.md): four solid corner squares, a small solid mark beside
// the top-left one that says which way up the sheet is, and bubbles.
//
//   the corners      four solid squares; the reader finds them and maps the photo onto this page
//   the header       printed words (school, exam, paper, the child's name, roll number and exam number)
//   sheet number     the sheet's own number, issued by the database, pre-shaded in five digit columns: four digits and a
//                    check digit, so a misread number names no one rather than another child
//   roll number      four digit columns the child shades on a blank sheet (pre-shaded on a named sheet)
//   answers          the paper's choice questions in columns, each with its options A to F as it has them

export const LAYOUT_VERSION = 1;
export const PAGE_W = 210;
export const PAGE_H = 297;

export type Point = { x: number; y: number };
export type Bubble = { x: number; y: number; r: number };

// The four squares' centres (top-left, top-right, bottom-right, bottom-left) and their side.
export const CORNER_SIZE = 7;
export const CORNERS: readonly [Point, Point, Point, Point] = [
  { x: 12, y: 12 },
  { x: 198, y: 12 },
  { x: 198, y: 285 },
  { x: 12, y: 285 },
];
// The mark that says which way up: a smaller solid square to the right of the top-left square.
export const ORIENT: { x: number; y: number; size: number } = { x: 21, y: 12, size: 4 };

export const BUBBLE_R = 2.1;
export const SHEET_DIGITS = 4; // sheet numbers 1 to 9999 on a paper
export const ROLL_DIGITS = 4;
export const SHEET_NO_MAX = 9999;
const DIGIT_PITCH_X = 5.6;
const DIGIT_PITCH_Y = 5.8;
const DIGIT_TOP = 36;
export const SHEET_GRID_X = 124.5; // the first column's centre
export const ROLL_GRID_X = 160.5;

// The answer grid: four columns of up to 25 rows; a question has its options' bubbles in one row.
export const MAX_SHEET_QUESTIONS = 100;
export const ANSWER_COLUMNS = 4;
const ROWS_MIN = 10;
const ROWS_MAX = 25;
const ANSWER_TOP = 108;
const ANSWER_LEFT = 12;
const COLUMN_W = 46.5;
const ROW_PITCH = 6.6;
const OPTION_PITCH = 5.4;
const FIRST_BUBBLE = 13; // from the column's left edge
export const LABEL_RIGHT = 9; // the question's number ends this far from the column's left edge

export type LayoutQuestion = { label: string; options: number };
export type SheetQuestionPlace = {
  label: string;
  keys: OptionKey[];
  bubbles: Bubble[]; // one per key, in order
  row: { x: number; y: number; w: number; h: number }; // the question's row, for the review's picture
  column: number;
};
export type SheetLayout = {
  version: number;
  key: string; // what the answer grid is made of: printed on nothing, carried by every reading and every printed sheet
  rows: number;
  sheetNo: Bubble[][]; // [column][digit]; the last column is the check digit
  roll: Bubble[][]; // [column][digit]
  questions: SheetQuestionPlace[];
};

// Which questions go on the bubble sheet: the choice questions with options (C361), in the paper's order. A paper sat
// with a bubble sheet has the rest in the answer book.
export function onBubbleSheet(q: Pick<MarkingQuestion, 'kind' | 'options'>): boolean {
  return q.kind === 'objective' && q.options.length >= 2;
}
export function sheetQuestionsOf<Q extends Pick<MarkingQuestion, 'kind' | 'options' | 'label' | 'position'>>(questions: readonly Q[]): Q[] {
  return [...questions].filter(onBubbleSheet).sort((a, b) => a.position - b.position);
}

// FNV-1a, 32 bits, as eight hex digits: small, the same in the browser and on the server.
function fnv32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// The answer grid's fingerprint: the layout's version, how many questions, and each one's number and option count.
// A sheet printed under one fingerprint is read only under the same one (the questions changed: print again).
export function layoutKey(questions: readonly LayoutQuestion[]): string {
  return `v${LAYOUT_VERSION}-${questions.length}-${fnv32(questions.map((q) => `${q.label}:${q.options}`).join('|'))}`;
}
export const LAYOUT_KEY_RE = /^v[0-9]{1,3}-[0-9]{1,3}-[0-9a-f]{8}$/;

// The check digit of a sheet number's four digits: weights 3,1,3,1, so any one digit read wrong, and most two digits
// swapped, give another check digit.
export function checkDigit(digits: readonly number[]): number {
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}
// The five digits printed for a sheet number: four, then the check digit.
export function sheetDigits(sheetNo: number): number[] {
  const d = String(Math.max(0, Math.min(SHEET_NO_MAX, Math.floor(sheetNo)))).padStart(SHEET_DIGITS, '0').split('').map(Number);
  return [...d, checkDigit(d)];
}
// A sheet number from five digits read, or null when the check digit disagrees or it is 0.
export function sheetNoFrom(digits: readonly number[]): number | null {
  if (digits.length !== SHEET_DIGITS + 1 || digits.some((d) => !Number.isInteger(d) || d < 0 || d > 9)) return null;
  const four = digits.slice(0, SHEET_DIGITS);
  if (checkDigit(four) !== digits[SHEET_DIGITS]) return null;
  const n = Number(four.join(''));
  return n >= 1 ? n : null;
}
// A roll number the sheet can carry pre-shaded: digits only, at most four.
export const shadableRoll = (roll: string | null | undefined): string | null => {
  const s = (roll ?? '').trim();
  return /^[0-9]{1,4}$/.test(s) ? s.padStart(ROLL_DIGITS, '0') : null;
};

const digitColumns = (x0: number, columns: number): Bubble[][] =>
  Array.from({ length: columns }, (_, c) => Array.from({ length: 10 }, (_, d) => ({ x: x0 + c * DIGIT_PITCH_X, y: DIGIT_TOP + d * DIGIT_PITCH_Y, r: BUBBLE_R })));

// The rows a column holds for this many questions: at least ten, at most 25, the questions spread over the columns.
export const rowsFor = (n: number): number => Math.min(ROWS_MAX, Math.max(ROWS_MIN, Math.ceil(n / ANSWER_COLUMNS)));

// The whole layout for a paper's sheet questions (at most MAX_SHEET_QUESTIONS, each with 2 to 6 options).
export function sheetLayout(questions: readonly LayoutQuestion[]): SheetLayout {
  const list = questions.slice(0, MAX_SHEET_QUESTIONS);
  const rows = rowsFor(list.length);
  return {
    version: LAYOUT_VERSION,
    key: layoutKey(list),
    rows,
    sheetNo: digitColumns(SHEET_GRID_X, SHEET_DIGITS + 1),
    roll: digitColumns(ROLL_GRID_X, ROLL_DIGITS),
    questions: list.map((q, i) => {
      const column = Math.floor(i / rows);
      const x0 = ANSWER_LEFT + column * COLUMN_W;
      const y = ANSWER_TOP + (i % rows) * ROW_PITCH;
      const keys = OPTION_KEYS.slice(0, Math.min(6, Math.max(2, q.options))) as OptionKey[];
      return {
        label: q.label,
        keys,
        bubbles: keys.map((_, k) => ({ x: x0 + FIRST_BUBBLE + k * OPTION_PITCH, y, r: BUBBLE_R })),
        row: { x: x0, y: y - ROW_PITCH / 2, w: COLUMN_W, h: ROW_PITCH },
        column,
      };
    }),
  };
}

// The layout for a paper's questions as the app holds them.
export const layoutOfQuestions = (questions: readonly Pick<MarkingQuestion, 'kind' | 'options' | 'label' | 'position'>[]): SheetLayout =>
  sheetLayout(sheetQuestionsOf(questions).map((q) => ({ label: q.label, options: q.options.length })));

// Where the header's printed words go (the printer's only; the reader never looks there).
export const HEADER = {
  left: 26, // beside the orientation mark on the first line; below it from the second
  textLeft: 14,
  textRight: 114,
  school: 19,
  exam: 26,
  paper: 32,
  childBox: { y: 40, h: 30 },
  instructions: 76,
  gridTitle: 21,
  gridBoxes: { y: 26, h: 5.5 },
  footer: 277,
} as const;
export const DIGIT_LABEL_X = { sheet: SHEET_GRID_X - 4.6, roll: ROLL_GRID_X - 4.6 } as const;
