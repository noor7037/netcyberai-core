import { parseCsv, rowsToRecords } from '@/lib/import/csv';
import { SCHOOL_FIELDS, missingRequired, type CertDef, type CertDoc, type CertField, type CertRows, type CertTable, type CertValues } from './definitions';
import { formatDate, parseIsoDate } from './words';

// Many certificates at once from a CSV (the studio's "Make many at once").
// Pure logic only: reading the file into one certificate per row, checking
// each row with the same required-field rules as the single form, and
// numbering the batch in sequence. The studio draws the pages; nothing
// here touches the browser or the network, and nothing is stored.

export const BULK_MAX_BYTES = 1_000_000;
// Rows in one batch: a computer has the memory for a whole year group, a
// phone for a class at a time.
export const BULK_LIMIT = { desktop: 200, phone: 50 } as const;

// The school's details and the signatory come from the studio's own steps
// for the whole batch, never from the file.
export const SCHOOL_IDS = new Set([...SCHOOL_FIELDS.map((f) => f.id), 'signName', 'signTitle']);

// Fields that are usually the same for every certificate in a batch. When
// the file has no column for one of them, the value typed in step 3 is
// used for every row (and the studio lists which). A column that is in
// the file always wins, even when a cell is blank, so a blank award on a
// participation certificate is never filled from someone else's.
export const BATCH_FIELDS = new Set([
  'issueDate',
  'year',
  'examName',
  'className',
  'section',
  'grades',
  'passPercent',
  'teacherName',
  'purpose',
  'status',
  'event',
  'award',
  'level',
  'eventDate',
  'organizer',
  'kind',
  'recipientRole',
  'workingDays',
  'sign2Name',
  'sign2Title',
  'cashier',
]);
// Tables that may come from step 3 for the whole batch (the same fee heads
// for a class). Marks never do: each student's marks must be in the file.
export const BATCH_TABLES = new Set(['heads']);

export interface Issued {
  no: string;
  type: string;
  name: string;
  admissionNo: string;
  date: string;
}

export const REGISTER_HEADER = ['Certificate', 'Number', 'Name', 'Admission No.', 'Date'];

export function registerRows(list: Issued[]): string[][] {
  return [REGISTER_HEADER, ...list.map((i) => [i.type, i.no, i.name, i.admissionNo, i.date])];
}

export function issuedFrom(doc: CertDoc): Issued {
  const v = (id: string) => (doc.values[id] ?? '').trim();
  return { no: v(doc.def.numberField), type: doc.def.docTitle, name: v(doc.def.personField), admissionNo: v('admissionNo'), date: v('issueDate') || v('paymentDate') };
}

// "SPS/TC/2026/041" -> "SPS/TC/2026/042", keeping leading zeros.
export function nextNumber(no: string): string {
  const m = no.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return no;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return `${m[1]}${n}${m[3]}`;
}

export function numberSeries(first: string, count: number): string[] {
  const out: string[] = [];
  let no = first.trim();
  for (let i = 0; i < count; i++) {
    out.push(no);
    no = nextNumber(no);
  }
  return out;
}

// Whether a type's number field is a certificate number the batch issues
// in sequence. The report card's is the student's roll number instead.
export function numbersInSequence(def: CertDef): boolean {
  return def.numberField !== 'rollNo';
}

export function selectDefaults(def: CertDef): CertValues {
  const out: CertValues = {};
  for (const f of def.fields) if (f.kind === 'select' && f.options?.length) out[f.id] = f.options[0];
  return out;
}

// The fields a row of the file holds: the type's own fields, less the
// school's and the number issued in sequence.
export function rowFields(def: CertDef): CertField[] {
  return def.fields.filter((f) => !SCHOOL_IDS.has(f.id) && !(numbersInSequence(def) && f.id === def.numberField));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Header row of the CSV template: each field id, then each table's columns
// numbered from 1 ("subject_1", "max_1", ...).
export function templateHeader(def: CertDef, sets: Record<string, number> = {}): string[] {
  const head = rowFields(def).map((f) => f.id);
  for (const t of def.tables ?? []) {
    const n = Math.min(t.maxRows, Math.max(1, sets[t.id] ?? 1));
    for (let i = 1; i <= n; i++) for (const c of t.columns) head.push(`${c.id}_${i}`);
  }
  return head;
}

// The template with one example row (from the demo fixture), so a school
// sees the format of every column before typing its own students. Dates
// are written day first, as the studio asks.
export function templateCsv(def: CertDef, example: { values: CertValues; rows?: CertRows }): string[][] {
  const sets = Object.fromEntries((def.tables ?? []).map((t) => [t.id, example.rows?.[t.id]?.length ?? 1]));
  const head = templateHeader(def, sets);
  const row = head.map((h) => {
    const m = h.match(/^([a-zA-Z]+)_(\d+)$/);
    const t = m && (def.tables ?? []).find((x) => x.columns.some((c) => c.id === m[1]));
    if (m && t) return example.rows?.[t.id]?.[Number(m[2]) - 1]?.[m[1]] ?? '';
    const f = def.fields.find((x) => x.id === h);
    const v = example.values[h] ?? '';
    return f?.kind === 'date' && v ? formatDate(v) : v;
  });
  return [head, row];
}

// "23/04/2012", "23-4-2012", "2012/04/23" or "2012-04-23" -> "2012-04-23".
// Spreadsheets saved in India usually write day first.
export function toIsoDate(s: string): string | null {
  const t = s.trim();
  let y: string, m: string, d: string;
  const ymd = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (ymd) [, y, m, d] = ymd;
  else if (dmy) [, d, m, y] = dmy;
  else return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return parseIsoDate(iso) ? iso : null;
}

// "12,800", "Rs. 12800" or "₹ 12800" -> "12800". Null when not a number.
export function toPlainNumber(s: string): string | null {
  const t = s.replace(/[,\s]/g, '').replace(/^(₹|rs\.?|inr)/i, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

function cleanCell(f: Pick<CertField, 'label' | 'kind' | 'options' | 'max'>, raw: string, problems: string[]): string {
  const s = raw.trim();
  if (!s) return '';
  if (f.kind === 'date') {
    const iso = toIsoDate(s);
    if (!iso) problems.push(`${f.label}: write the date as DD/MM/YYYY`);
    return iso ?? '';
  }
  if (f.kind === 'number') {
    const n = toPlainNumber(s);
    if (n === null) problems.push(`${f.label}: write a number`);
    return n ?? '';
  }
  if (f.kind === 'select') {
    const hit = (f.options ?? []).find((o) => o.toLowerCase() === s.toLowerCase());
    if (hit === undefined) problems.push(`${f.label}: use one of ${(f.options ?? []).filter(Boolean).join(', ')}`);
    return hit ?? '';
  }
  if (f.max && s.length > f.max) problems.push(`${f.label}: longer than ${f.max} characters`);
  return s;
}

export interface BulkRow {
  line: number; // the row number in the spreadsheet; the header is row 1
  person: string;
  doc: CertDoc;
  problems: string[];
}

export interface BulkBatch {
  error: string; // a problem with the whole file; nothing can be made
  batchProblems: string[]; // problems with the studio's own steps; fix those first
  rows: BulkRow[]; // every non-blank row, numbered when ready
  ready: BulkRow[]; // rows without problems, numbered in sequence
  fromForm: string[]; // field ids taken from step 3 for every row
  unknown: string[]; // header names that match no field
  total: number;
}

const emptyBatch = (error: string, unknown: string[] = [], total = 0): BulkBatch => ({ error, batchProblems: [], rows: [], ready: [], fromForm: [], unknown, total });

type TableTarget = { table: CertTable; col: CertTable['columns'][number]; n: number };

// Normalised header name -> the field or numbered table cell it fills.
// A column may be named by the field's id ("studentName") or its label
// ("Name of the student"), in any case and spacing.
function columnTargets(def: CertDef): { fields: Map<string, CertField>; cells: Map<string, TableTarget> } {
  const fields = new Map<string, CertField>();
  for (const f of rowFields(def)) {
    fields.set(norm(f.id), f);
    if (!fields.has(norm(f.label))) fields.set(norm(f.label), f);
  }
  const cells = new Map<string, TableTarget>();
  for (const t of def.tables ?? []) for (let n = 1; n <= t.maxRows; n++) for (const col of t.columns) cells.set(`${norm(col.id)}${n}`, { table: t, col, n });
  return { fields, cells };
}

// Reads the parsed CSV into one certificate per row. `base` is the
// studio's current certificate: its school details, step 3 values, images,
// options and template apply to every row. `issuedNos` are numbers already
// issued in this session, which the batch must not repeat.
export function buildBatch(table: string[][], base: CertDoc, limit: number, issuedNos: string[] = []): BulkBatch {
  const def = base.def;
  if (table.length === 0) return emptyBatch('The file is empty.');
  // trim() also removes a byte-order mark left on the first header.
  const head = table[0].map((h) => h.trim());
  // rowsToRecords keys each value by its lower-cased, underscored header.
  const records = rowsToRecords([head, ...table.slice(1)]);
  const recordKey = (h: string) => h.toLowerCase().replace(/\s+/g, '_');
  const targets = columnTargets(def);
  const fieldCol = new Map<string, string>(); // field id -> record key
  const cellCols: [string, TableTarget][] = [];
  const unknown: string[] = [];
  for (const h of head) {
    if (!h) continue;
    const f = targets.fields.get(norm(h));
    const c = targets.cells.get(norm(h));
    if (f && !fieldCol.has(f.id)) fieldCol.set(f.id, recordKey(h));
    else if (c) cellCols.push([recordKey(h), c]);
    else if (!f) unknown.push(h);
  }
  const lines = records.map((r, i) => ({ r, line: i + 2 })).filter(({ r }) => Object.values(r).some((v) => v.trim()));
  if (lines.length === 0) return emptyBatch('The file has a header row but no students under it.', unknown);
  if (lines.length > limit) return emptyBatch(`The file has ${lines.length} rows. Up to ${limit} can be made at once here. Split the file and make each part in turn.`, unknown, lines.length);
  const personField = def.fields.find((f) => f.id === def.personField) as CertField;
  if (!fieldCol.has(def.personField)) {
    return emptyBatch(`The file needs a column for ${personField.label} (${def.personField}). Download the template to see every column.`, unknown, lines.length);
  }

  const tablesInFile = new Set(cellCols.map(([, c]) => c.table.id));
  const fromForm = rowFields(def)
    .filter((f) => BATCH_FIELDS.has(f.id) && !fieldCol.has(f.id) && (base.values[f.id] ?? '').trim())
    .map((f) => f.id);
  const shared: CertValues = {};
  for (const id of SCHOOL_IDS) if (base.values[id] !== undefined) shared[id] = base.values[id];

  // Problems with the studio's own steps are listed once, not on every row.
  const batchProblems: string[] = [];
  const schoolMissing = SCHOOL_FIELDS.filter((f) => f.required && !(base.values[f.id] ?? '').trim());
  for (const f of schoolMissing) batchProblems.push(`${f.label}: type it in step 2.`);
  const sequence = numbersInSequence(def);
  const numberField = def.fields.find((f) => f.id === def.numberField);
  const first = sequence ? (base.values[def.numberField] ?? '').trim() : '';
  if (sequence && numberField?.required && !first) batchProblems.push(`${numberField.label}: type the first number of the batch.`);
  else if (sequence && first && !/\d/.test(first) && lines.length > 1) batchProblems.push(`${numberField?.label ?? 'Number'}: the first number needs digits to count up from, such as …/041.`);
  // A required batch-wide field with no column and nothing in step 3 would
  // be missing on every row: say so once instead.
  const batchMissing = rowFields(def).filter((f) => f.required && BATCH_FIELDS.has(f.id) && !fieldCol.has(f.id) && !(base.values[f.id] ?? '').trim());
  for (const f of batchMissing) batchProblems.push(`${f.label}: type it in step 3, or add a column named ${f.id} to the file.`);
  const skip = new Set([...schoolMissing.map((f) => f.label), ...batchMissing.map((f) => f.label), ...(sequence && numberField ? [numberField.label] : [])]);

  const rows: BulkRow[] = lines.map(({ r, line }) => {
    const problems: string[] = [];
    const values: CertValues = { ...shared };
    for (const f of rowFields(def)) {
      const key = fieldCol.get(f.id);
      const raw = key === undefined ? '' : (r[key] ?? '').trim();
      let v = cleanCell(f, raw, problems);
      // Not in the file at all: a batch field takes step 3's value.
      if (!v && key === undefined && BATCH_FIELDS.has(f.id)) v = (base.values[f.id] ?? '').trim();
      // A choice the single form always makes (son, daughter or ward; the
      // payment mode) is never guessed for a row. A batch-wide choice left
      // blank takes step 3's, as the single form would.
      if (!v && !raw && f.kind === 'select' && !(f.options ?? []).includes('')) {
        if (BATCH_FIELDS.has(f.id)) v = (base.values[f.id] ?? '').trim() || (f.options ?? [])[0] || '';
        else problems.push(`${f.label}: use one of ${(f.options ?? []).join(', ')}`);
      }
      values[f.id] = v;
    }
    const rows: CertRows = {};
    for (const t of def.tables ?? []) rows[t.id] = BATCH_TABLES.has(t.id) && !tablesInFile.has(t.id) ? (base.rows[t.id] ?? []).map((x) => ({ ...x })) : [];
    const cells: Record<string, Record<number, Record<string, string>>> = {};
    for (const [key, t] of cellCols) {
      const v = cleanCell({ label: `${t.col.label} ${t.n}`, kind: t.col.kind, max: 60 }, r[key] ?? '', problems);
      ((cells[t.table.id] ??= {})[t.n] ??= {})[t.col.id] = v;
    }
    for (const [tid, byN] of Object.entries(cells)) {
      const t = (def.tables ?? []).find((x) => x.id === tid) as CertTable;
      rows[tid] = Object.keys(byN)
        .map(Number)
        .sort((a, b) => a - b)
        .map((n) => Object.fromEntries(t.columns.map((c) => [c.id, byN[n][c.id] ?? ''])))
        .filter((x) => Object.values(x).some((v) => v.trim()));
    }
    const doc: CertDoc = { ...base, values, rows };
    for (const m of missingRequired(doc)) if (!skip.has(m)) problems.push(m);
    return { line, person: (values[def.personField] ?? '').trim(), doc, problems };
  });

  const ready = rows.filter((x) => x.problems.length === 0);
  if (sequence && first && batchProblems.length === 0) {
    const nos = numberSeries(first, ready.length);
    ready.forEach((x, i) => (x.doc = { ...x.doc, values: { ...x.doc.values, [def.numberField]: nos[i] } }));
    const taken = new Set(issuedNos.filter(Boolean));
    const clash = nos.find((n) => taken.has(n));
    if (clash) batchProblems.push(`Number ${clash} was already issued in this session. Change the first number.`);
  }
  return { error: '', batchProblems, rows, ready, fromForm, unknown, total: rows.length };
}

// A CSV file's text to rows, without a byte-order mark.
export function readCsv(text: string): string[][] {
  return parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}
