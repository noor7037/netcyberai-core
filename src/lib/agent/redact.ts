// What the model may see of a school's data (C546). Contact details, dates of birth, identity numbers and money
// accounts never reach it. Students reach it as tokens ("[S3]"), never by name; the person's screen shows the names
// again (restoreNames). Staff and class names stay: they are what the principal asks about.

const DROP = /(phone|mobile|whatsapp|email|address|pincode|dob|birth|aadha?ar|\bpan\b|bank|account_no|accountNumber|ifsc|upi|password|token|secret|otp|photo|signature|evidence|file_?url|storage)/i;
const STUDENT_NAME = /^(student_?name|studentName|child_?name|childName|first_?name|firstName|last_?name|lastName|full_?name|fullName|guardian_?name|guardianName|parent_?name|parentName|father|mother)$/;
const STUDENT_ROW = /^(student_?id|studentId|enquiry_?id|enquiryId|parent_?id|parentId|guardian_?id)$/;
const MAX_ITEMS = 40;
const MAX_TEXT = 400;

export type NameBook = { byName: Map<string, string>; byToken: Map<string, string> };
export const newNameBook = (): NameBook => ({ byName: new Map(), byToken: new Map() });

function tokenFor(book: NameBook, name: string): string {
  const known = book.byName.get(name);
  if (known) return known;
  const token = `[S${book.byName.size + 1}]`;
  book.byName.set(name, token);
  book.byToken.set(token, name);
  return token;
}

export function redact(value: unknown, book: NameBook, depth = 0): unknown {
  if (depth > 8) return '…';
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, book, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `… and ${value.length - MAX_ITEMS} more`] : items;
  }
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const personRow = Object.keys(obj).some((k) => STUDENT_ROW.test(k));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DROP.test(k)) continue;
    if (typeof v === 'string' && v.trim() && (STUDENT_NAME.test(k) || (personRow && (k === 'name' || k === 'display_name')))) {
      out[k] = tokenFor(book, v.trim());
      continue;
    }
    out[k] = redact(v, book, depth + 1);
  }
  return out;
}

// The agent's words, with each token turned back into the name it stands for, for the person's own screen only.
export function restoreNames(text: string, book: NameBook): string {
  return text.replace(/\[S\d+\]/g, (t) => book.byToken.get(t) ?? t);
}

// The person's own words may name a student; the model gets the token instead where the name is one already seen.
export function hideKnownNames(text: string, book: NameBook): string {
  let out = text;
  for (const [name, token] of [...book.byName.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (name.length >= 3) out = out.split(name).join(token);
  }
  return out;
}

export const bookToJson = (book: NameBook): [string, string][] => [...book.byToken.entries()];
export function bookFromJson(pairs: unknown): NameBook {
  const book = newNameBook();
  if (Array.isArray(pairs)) for (const p of pairs) if (Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string') {
    book.byToken.set(p[0], p[1]);
    book.byName.set(p[1], p[0]);
  }
  return book;
}
