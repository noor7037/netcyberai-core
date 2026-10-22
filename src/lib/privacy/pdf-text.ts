import { inflateSync } from 'zlib';

// What can be read of a PDF without a PDF library (C232 part A: no new dependency), for the upload check
// (src/lib/privacy/upload-check.ts): whether it is password-protected, the words of its text layer, and the JPEG
// pictures in it (a scan saved as a PDF is usually one JPEG a page), for the OCR to read.
//
// How, plainly:
//   - every object's stream is read; one with no filter or with FlateDecode (zlib, Node's own) is decoded, one with
//     DCTDecode that is an image is a JPEG file as it stands; any other filter is left (a gap: LZW, JBIG2 and CCITT
//     scans are not read);
//   - objects kept inside object streams (PDF 1.5) are read too, so the fonts are found;
//   - text is what the content streams show (Tj, TJ, ' and "), decoded through each font's ToUnicode map when the
//     font says which (by the name the page gives it; one map in the whole file is used for every font), else as
//     single bytes; a font with neither (rare) reads as noise, and so is not checked;
//   - pages: the page tree is followed from the catalog's /Pages (/Kids in order), and each page's /Contents streams
//     are read in order, so each page's text is known; a page whose content cannot be found reads as empty;
//   - limits: at most 4 MB from one stream, 16 MB in all, 2,000 streams, 200,000 characters of text and the three
//     largest JPEGs. A file past them is read as far as the limits go.
// Pure, and it never throws: a file it cannot make sense of reads as no text and no pictures.

const STREAM_MAX = 4_000_000;
const TOTAL_MAX = 16_000_000;
const STREAMS_MAX = 2_000;
const TEXT_MAX = 200_000;
const JPEGS_MAX = 3;
const PAGES_MAX = 2_000;

// `pages`: the text of each page in the order the page tree gives (page 1 first), for a reader that must say which page
// a line was read on (Control's catalog import, M2-12). Empty when the file has no page tree that can be followed.
export type PdfRead = { encrypted: boolean; text: string; jpegs: Uint8Array[]; pages: string[] };
type CMap = { bytes: number; map: Map<number, string> };
type Stream = { num: number; dict: string; data: Uint8Array | null; jpeg: Uint8Array | null };

const filtersOf = (dict: string): string[] => {
  const m = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict);
  return m ? [...m[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((x) => x[1]) : [];
};

function decode(dict: string, raw: Uint8Array, budget: { left: number }): Uint8Array | null {
  const filters = filtersOf(dict);
  if (filters.length === 0) return raw.length <= STREAM_MAX ? raw : null;
  if (filters.length !== 1 || (filters[0] !== 'FlateDecode' && filters[0] !== 'Fl') || budget.left <= 0) return null;
  try {
    const out = inflateSync(raw, { maxOutputLength: Math.min(STREAM_MAX, budget.left) });
    budget.left -= out.length;
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  } catch {
    return null; // corrupt, or past the limit
  }
}

// The streams of the file, each with the number of the object it belongs to.
function streamsOf(bytes: Uint8Array, src: string, budget: { left: number }): { streams: Stream[]; objects: Map<number, string> } {
  const streams: Stream[] = [];
  const objects = new Map<number, string>();
  const OBJ = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = OBJ.exec(src)) && streams.length < STREAMS_MAX) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endobj = src.indexOf('endobj', bodyStart);
    const kw = src.indexOf('stream', bodyStart);
    if (kw < 0 || (endobj >= 0 && kw > endobj) || src.startsWith('endstream', kw - 3)) {
      if (endobj < 0) break;
      objects.set(num, src.slice(bodyStart, endobj));
      OBJ.lastIndex = endobj;
      continue;
    }
    const dict = src.slice(bodyStart, kw);
    let dataStart = kw + 6;
    if (src[dataStart] === '\r') dataStart += 1;
    if (src[dataStart] === '\n') dataStart += 1;
    const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    let dataEnd = length && src.startsWith('endstream', skipSpace(src, dataStart + Number(length[1]))) ? dataStart + Number(length[1]) : src.indexOf('endstream', dataStart);
    if (dataEnd < 0) break;
    const after = src.indexOf('endobj', dataEnd);
    while (dataEnd > dataStart && (src[dataEnd - 1] === '\n' || src[dataEnd - 1] === '\r') && !length) dataEnd -= 1;
    objects.set(num, dict);
    const raw = bytes.subarray(dataStart, dataEnd);
    const jpeg = /\/Subtype\s*\/Image/.test(dict) && filtersOf(dict).join() === 'DCTDecode' && raw[0] === 0xff && raw[1] === 0xd8 ? raw : null;
    streams.push({ num, dict, data: jpeg ? null : decode(dict, raw, budget), jpeg });
    if (after < 0) break;
    OBJ.lastIndex = after;
  }
  return { streams, objects };
}
const skipSpace = (s: string, i: number) => {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
};
const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1');

// The objects kept inside object streams: "<num> <offset> ..." then the objects themselves.
function objectsInStreams(streams: Stream[], objects: Map<number, string>) {
  for (const s of streams) {
    if (!s.data || !/\/Type\s*\/ObjStm/.test(s.dict)) continue;
    const n = Number(/\/N\s+(\d+)/.exec(s.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(s.dict)?.[1] ?? 0);
    const text = latin1(s.data);
    const head = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n && 2 * i + 1 < head.length; i++) {
      const start = first + head[2 * i + 1];
      const end = 2 * i + 3 < head.length ? first + head[2 * i + 3] : text.length;
      if (Number.isFinite(start) && start < end) objects.set(head[2 * i], text.slice(start, end));
    }
  }
}

const hexToBytes = (hex: string): number[] => {
  const h = hex.replace(/[^0-9A-Fa-f]/g, '');
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16));
  return out;
};
const utf16 = (hex: string): string => {
  const b = hexToBytes(hex);
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
};

// A ToUnicode map: the codes' width, and code -> text (bfchar and bfrange).
export function parseCMap(text: string): CMap | null {
  if (!/begincmap|beginbfchar|beginbfrange/.test(text)) return null;
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  const map = new Map<number, string>();
  let width = space ? Math.max(1, Math.ceil(space[1].length / 2)) : 0;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      width ||= Math.ceil(src.length / 2);
      map.set(parseInt(src, 16), utf16(dst));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      width ||= Math.ceil(lo.length / 2);
      const a = parseInt(lo, 16);
      const z = Math.min(parseInt(hi, 16), a + 1024);
      if (rest.startsWith('[')) {
        const list = [...rest.matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => utf16(x[1]));
        for (let c = a; c <= z && c - a < list.length; c++) map.set(c, list[c - a]);
      } else {
        const base = utf16(rest.slice(1, -1));
        if (!base) continue;
        const last = base.charCodeAt(base.length - 1);
        for (let c = a; c <= z; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - a)));
      }
    }
  }
  return map.size ? { bytes: width || 1, map } : null;
}

// The font each resource name stands for: "/F1 12 0 R" inside a /Font dictionary, written in place or as its own
// object. A name given to two different fonts is left out (its text reads through the one map, if the file has one).
function fontNames(objects: Map<number, string>): Map<string, number> {
  const names = new Map<string, number | null>();
  const take = (dict: string) => {
    for (const [, name, ref] of dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const was = names.get(name);
      names.set(name, was === undefined || was === Number(ref) ? Number(ref) : null);
    }
  };
  for (const body of objects.values()) {
    for (const m of body.matchAll(/\/Font\s*(<<[^<>]*>>|(\d+)\s+\d+\s+R)/g)) {
      if (m[2]) take(objects.get(Number(m[2])) ?? '');
      else take(m[1]);
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of names) if (v !== null) out.set(k, v);
  return out;
}

// The text a content stream shows, a token at a time.
function showText(content: string, cmapFor: (font: string | null) => CMap | null, out: string[], room: { left: number }) {
  let font: string | null = null;
  let operands: (string | number | number[] | (number[] | number)[])[] = [];
  let i = 0;
  const say = (codes: number[]) => {
    const cmap = cmapFor(font);
    let s = '';
    if (cmap) {
      for (let k = 0; k + cmap.bytes <= codes.length; k += cmap.bytes) {
        let code = 0;
        for (let j = 0; j < cmap.bytes; j++) code = (code << 8) | codes[k + j];
        s += cmap.map.get(code) ?? '';
      }
    } else s = String.fromCharCode(...codes.slice(0, 4096));
    return s;
  };
  const push = (s: string) => {
    if (room.left <= 0) return;
    out.push(s.slice(0, room.left));
    room.left -= s.length;
  };
  const stack: (number[] | number)[][] = [];
  while (i < content.length && room.left > 0) {
    const ch = content[i];
    if (ch === '(') {
      // A literal string: nested brackets, and the backslash escapes.
      const codes: number[] = [];
      let depth = 1;
      i += 1;
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === '\\') {
          const n = content[i + 1];
          const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
          if (n !== undefined && n in esc) {
            codes.push(esc[n]);
            i += 2;
          } else if (n !== undefined && /[0-7]/.test(n)) {
            const oct = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4))![0];
            codes.push(parseInt(oct, 8) & 0xff);
            i += 1 + oct.length;
          } else i += 2; // a line continuation, or a backslash before anything else
          continue;
        }
        if (c === '(') depth += 1;
        if (c === ')') depth -= 1;
        if (depth > 0) codes.push(c.charCodeAt(0) & 0xff);
        i += 1;
      }
      (stack.length ? stack[stack.length - 1] : operands).push(codes as never);
      continue;
    }
    if (ch === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      if (end < 0) break;
      (stack.length ? stack[stack.length - 1] : operands).push(hexToBytes(content.slice(i + 1, end)) as never);
      i = end + 1;
      continue;
    }
    if (ch === '[') {
      stack.push([]);
      i += 1;
      continue;
    }
    if (ch === ']') {
      const arr = stack.pop();
      if (arr) (stack.length ? stack[stack.length - 1] : operands).push(arr as never);
      i += 1;
      continue;
    }
    if (ch === '%') {
      while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i += 1;
      continue;
    }
    if (ch === '/') {
      const m = /^\/[^\s/<>[\]()%]*/.exec(content.slice(i, i + 128))![0];
      operands.push(m.slice(1));
      i += m.length;
      continue;
    }
    const num = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(content.slice(i, i + 32));
    if (num) {
      (stack.length ? stack[stack.length - 1] : operands).push(Number(num[0]));
      i += num[0].length;
      continue;
    }
    const op = /^[A-Za-z'"*]+/.exec(content.slice(i, i + 16));
    if (op) {
      const o = op[0];
      i += o.length;
      if (o === 'Tf') {
        const name = operands.find((x) => typeof x === 'string');
        font = typeof name === 'string' ? name : font;
      } else if (o === 'Tj' || o === "'" || o === '"') {
        const str = [...operands].reverse().find((x) => Array.isArray(x) && x.every((v) => typeof v === 'number')) as number[] | undefined;
        if (o !== 'Tj') push('\n');
        if (str) push(say(str));
      } else if (o === 'TJ') {
        const arr = [...operands].reverse().find((x) => Array.isArray(x) && x.some((v) => Array.isArray(v))) as (number[] | number)[] | undefined;
        for (const part of arr ?? []) {
          if (typeof part === 'number') {
            if (part < -200) push(' ');
          } else push(say(part));
        }
      } else if (o === 'T*' || o === 'Tm' || o === 'ET') push('\n');
      else if (o === 'Td' || o === 'TD') {
        const ty = operands[operands.length - 1];
        push(typeof ty === 'number' && ty !== 0 ? '\n' : ' ');
      }
      operands = [];
      continue;
    }
    i += 1;
  }
}

const refsIn = (s: string): number[] => [...s.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
const IS_PAGE = /\/Type\s*\/Page(?![A-Za-z])/;
const IS_PAGES = /\/Type\s*\/Pages(?![A-Za-z])/;

// The page objects in reading order: from the catalog's /Pages down each /Kids list. A file whose tree cannot be
// followed gives its page objects in object order.
function pageOrder(objects: Map<number, string>): number[] {
  let root: number | null = null;
  for (const body of objects.values()) {
    if (!/\/Type\s*\/Catalog\b/.test(body)) continue;
    const m = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(body);
    if (m) root = Number(m[1]);
    break;
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const walk = (num: number, depth: number) => {
    if (seen.has(num) || depth > 32 || out.length >= PAGES_MAX) return;
    seen.add(num);
    const body = objects.get(num) ?? '';
    if (IS_PAGES.test(body)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body);
      for (const k of kids ? refsIn(kids[1]) : []) walk(k, depth + 1);
    } else if (IS_PAGE.test(body)) out.push(num);
  };
  if (root !== null) walk(root, 0);
  if (out.length > 0) return out;
  return [...objects.entries()]
    .filter(([, body]) => IS_PAGE.test(body))
    .map(([num]) => num)
    .sort((a, b) => a - b)
    .slice(0, PAGES_MAX);
}

// A page's content streams, in order: /Contents is one reference, an array of them, or a reference to such an array.
function contentsOf(page: string, objects: Map<number, string>): number[] {
  const m = /\/Contents\s*(\[[^\]]*\]|(\d+)\s+\d+\s+R)/.exec(page);
  if (!m) return [];
  if (m[2] === undefined) return refsIn(m[1]);
  const target = Number(m[2]);
  const body = (objects.get(target) ?? '').trim();
  return body.startsWith('[') ? refsIn(body) : [target];
}

export function readPdf(bytes: Uint8Array): PdfRead {
  const none: PdfRead = { encrypted: false, text: '', jpegs: [], pages: [] };
  try {
    const src = latin1(bytes);
    const encrypted = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(src);
    if (encrypted) return { ...none, encrypted: true };
    const budget = { left: TOTAL_MAX };
    const { streams, objects } = streamsOf(bytes, src, budget);
    objectsInStreams(streams, objects);
    const byNum = new Map(streams.map((s) => [s.num, s]));
    // Each font's ToUnicode map, by the font's object.
    const cmaps = new Map<number, CMap>();
    for (const [num, body] of objects) {
      const ref = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(body);
      const data = ref ? byNum.get(Number(ref[1]))?.data : null;
      const cmap = data ? parseCMap(latin1(data)) : null;
      if (cmap) cmaps.set(num, cmap);
    }
    const only = cmaps.size === 1 ? [...cmaps.values()][0] : null;
    const names = fontNames(objects);
    const cmapFor = (font: string | null) => (font !== null && names.has(font) ? cmaps.get(names.get(font)!) ?? null : only);
    const out: string[] = [];
    const room = { left: TEXT_MAX };
    for (const s of streams) {
      if (!s.data || /\/Type\s*\/(?:ObjStm|XRef|Metadata)|\/Subtype\s*\/Image/.test(s.dict)) continue;
      const content = latin1(s.data);
      if (/begincmap/.test(content) || !/\bBT\b/.test(content)) continue;
      showText(content, cmapFor, out, room);
      out.push('\n');
    }
    const jpegs = streams
      .filter((s) => s.jpeg)
      .map((s) => s.jpeg!)
      .sort((a, b) => b.length - a.length)
      .slice(0, JPEGS_MAX);
    // Each page's own text, read from its content streams in order.
    const pages: string[] = [];
    const pageRoom = { left: TEXT_MAX };
    for (const num of pageOrder(objects)) {
      const words: string[] = [];
      for (const ref of contentsOf(objects.get(num) ?? '', objects)) {
        const data = byNum.get(ref)?.data;
        if (!data) continue;
        showText(latin1(data), cmapFor, words, pageRoom);
        words.push('\n');
      }
      pages.push(words.join('').replace(/[ \t]+/g, ' ').trim());
    }
    return { encrypted: false, text: out.join('').replace(/[ \t]+/g, ' ').trim(), jpegs, pages };
  } catch {
    return none;
  }
}
