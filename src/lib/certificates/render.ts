import QRCode from 'qrcode';
import { gradeFor, parseGrades } from '@/lib/free-tools/marks';
import { SCHOOL_FIELDS, type CertDoc, type CertImage, type TemplateId } from './definitions';
import { dateInWords, formatDate, rupees, rupeesInWords } from './words';

// Renders a certificate as one A4 SVG document (units: millimetres). The
// live preview shows this exact markup and the 300 DPI PDF is drawn from
// it, so the two cannot differ. Every piece of typed text is escaped.

export type Measure = (text: string, sizeMm: number, bold: boolean, serif: boolean) => number;

// A rough width model for tests and server rendering: the browser passes
// a real canvas measurement instead.
export const approxMeasure: Measure = (t, size, bold) => t.length * size * (bold ? 0.56 : 0.5);

const SERIF = "Georgia, 'Times New Roman', 'Noto Serif', 'Noto Serif Devanagari', serif";
const SANS = "Arial, Helvetica, 'Noto Sans', 'Noto Sans Devanagari', sans-serif";
export const FONTS = { SERIF, SANS };

// NetCyberAI logo colours (src/lib/design-tokens.ts) for the colour
// templates; the black-and-white templates use ink only.
const BRAND = {
  sapphire: '#002357',
  royal: '#1D4ED8',
  cyan: '#02CFF9',
  turquoise: '#14B8A6',
  leaf: '#22C55E',
  grape: '#8B3DFF',
  violet: '#4400F0',
  tangerine: '#FF7A1A',
  coral: '#FF6B57',
  sunshine: '#FFD23F',
  gold: '#F5B90A',
  goldDeep: '#92400E',
  royalDeep: '#1E3A8A',
};
const INK = '#111111';
const MUTED = '#444444';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const f2 = (n: number) => Number(n.toFixed(2));

interface TextOpts {
  bold?: boolean;
  serif?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  italic?: boolean;
  spacing?: number;
}

export interface Seg {
  text: string;
  bold?: boolean;
}

class Svg {
  parts: string[] = [];
  constructor(readonly measure: Measure) {}

  text(x: number, y: number, s: string, size: number, o: TextOpts = {}) {
    if (!s) return;
    this.parts.push(
      `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size)}" font-family="${o.serif === false ? SANS : SERIF}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''}${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}${o.spacing ? ` letter-spacing="${o.spacing}"` : ''} fill="${o.fill ?? INK}">${esc(s)}</text>`
    );
  }

  width(s: string, size: number, bold = false, serif = true) {
    return this.measure(s, size, bold, serif);
  }

  // Shrinks a single line until it fits the width (school names).
  fit(s: string, size: number, maxWidth: number, bold: boolean, serif: boolean, min = size * 0.6): number {
    let z = size;
    while (z > min && this.width(s, z, bold, serif) > maxWidth) z *= 0.95;
    return z;
  }

  wrap(s: string, width: number, size: number, bold = false, serif = true): string[] {
    const out: string[] = [];
    let line = '';
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (!line || this.width(next, size, bold, serif) <= width) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  }

  // Wraps text with bold and regular parts and returns the new baseline.
  rich(x: number, y: number, width: number, segs: Seg[], size: number, lh: number, o: { serif?: boolean; align?: 'left' | 'center'; fill?: string; indent?: number } = {}): number {
    const serif = o.serif !== false;
    // A word that starts with punctuation (", daughter of") is glued to
    // the word before it, so no space appears before a comma or full stop.
    const words: { t: string; b: boolean; g: boolean }[] = [];
    for (const s of segs) for (const t of s.text.split(/\s+/).filter(Boolean)) words.push({ t, b: Boolean(s.bold), g: /^[,.;:)]/.test(t) });
    const space = this.width(' ', size, false, serif);
    const lines: { t: string; b: boolean; g: boolean }[][] = [];
    let cur: { t: string; b: boolean; g: boolean }[] = [];
    let curW = o.indent ?? 0;
    for (const w of words) {
      const ww = this.width(w.t, size, w.b, serif);
      const gap = cur.length && !w.g ? space : 0;
      if (cur.length && curW + gap + ww > width && !w.g) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      curW += (cur.length && !w.g ? space : 0) + ww;
      cur.push(w);
    }
    if (cur.length) lines.push(cur);
    lines.forEach((ln, i) => {
      // Merge runs of the same weight into tspans.
      const runs: { t: string; b: boolean }[] = [];
      ln.forEach((w, j) => {
        const text = j && !w.g ? ` ${w.t}` : w.t;
        const last = runs[runs.length - 1];
        if (last && last.b === w.b) last.t += text;
        else runs.push({ t: text, b: w.b });
      });
      const lineW = ln.reduce((a, w, j) => a + this.width(w.t, size, w.b, serif) + (j && !w.g ? space : 0), 0);
      const lx = o.align === 'center' ? x + (width - lineW) / 2 : x + (i === 0 ? (o.indent ?? 0) : 0);
      this.parts.push(
        `<text x="${f2(lx)}" y="${f2(y + i * lh)}" font-size="${f2(size)}" font-family="${serif ? SERIF : SANS}" fill="${o.fill ?? INK}" xml:space="preserve">${runs
          .map((r) => (r.b ? `<tspan font-weight="700">${esc(r.t)}</tspan>` : `<tspan>${esc(r.t)}</tspan>`))
          .join('')}</text>`
      );
    });
    return y + lines.length * lh;
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke = INK, w = 0.3, dash?: string) {
    this.parts.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; rx?: number; dash?: string } = {}) {
    this.parts.push(
      `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 0.3}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`
    );
  }

  circle(cx: number, cy: number, r: number, o: { fill?: string; stroke?: string; sw?: number; dash?: string } = {}) {
    this.parts.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 0.3}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`);
  }

  // Images are data URLs produced in the browser; only data:image/ URLs
  // are ever written into the document.
  image(x: number, y: number, w: number, h: number, img: CertImage | undefined) {
    if (!img || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img.src)) return;
    this.parts.push(`<image x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="xMidYMid meet" href="${img.src}"/>`);
  }
}

// Logo fit rule: keep the aspect ratio inside the template's box; a wide
// logo may use up to twice the box width at a reduced height.
export function fitImage(aspect: number, boxW: number, boxH: number, allowWide = true): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const maxW = allowWide && a > 1.6 ? boxW * 2 : boxW;
  let w = Math.min(maxW, boxH * a);
  let h = w / a;
  if (h > boxH) {
    h = boxH;
    w = h * a;
  }
  return { w, h };
}

const LOGO_BOX: Record<TemplateId, number> = { classic: 26, formal: 22, modern: 24, celebration: 28 };

function v(doc: CertDoc, id: string): string {
  return (doc.values[id] ?? '').trim();
}

function schoolLines(doc: CertDoc): string[] {
  const aff = [v(doc, 'affiliation') && `Affiliation No. ${v(doc, 'affiliation')}`, v(doc, 'schoolCode') && `School Code ${v(doc, 'schoolCode')}`].filter(Boolean).join('   |   ');
  const contact = [v(doc, 'phone') && `Phone ${v(doc, 'phone')}`, v(doc, 'email')].filter(Boolean).join('   |   ');
  return [v(doc, 'address'), aff, contact].filter(Boolean);
}

// ---- page frames and headers ------------------------------------------------

function frame(s: Svg, t: TemplateId) {
  if (t === 'classic') {
    s.rect(7, 7, 196, 283, { stroke: INK, sw: 0.9 });
    s.rect(9.5, 9.5, 191, 278, { stroke: INK, sw: 0.25 });
  } else if (t === 'formal') {
    s.rect(9, 9, 192, 279, { stroke: INK, sw: 0.35 });
  } else if (t === 'modern') {
    s.rect(0, 0, 210, 7, { fill: BRAND.sapphire });
    s.rect(0, 7, 210, 1.2, { fill: BRAND.royal });
    s.rect(0, 288.8, 210, 1.2, { fill: BRAND.royal });
    s.rect(0, 290, 210, 7, { fill: BRAND.sapphire });
    s.rect(9, 12, 192, 273, { stroke: BRAND.royal, sw: 0.3 });
  } else {
    // Celebration: a border in the brand spectrum and soft corner marks.
    const stripes = [BRAND.sapphire, BRAND.royal, BRAND.cyan, BRAND.turquoise, BRAND.leaf, BRAND.sunshine, BRAND.gold, BRAND.tangerine, BRAND.coral, BRAND.grape, BRAND.violet];
    const seg = 196 / stripes.length;
    stripes.forEach((c, i) => {
      s.rect(7 + i * seg, 7, seg, 3, { fill: c });
      s.rect(7 + i * seg, 287, seg, 3, { fill: stripes[stripes.length - 1 - i] });
    });
    const side = 280 / stripes.length;
    stripes.forEach((c, i) => {
      s.rect(7, 10 + i * side, 3, side, { fill: stripes[stripes.length - 1 - i] });
      s.rect(200, 10 + i * side, 3, side, { fill: c });
    });
    s.rect(13, 13, 184, 271, { stroke: BRAND.gold, sw: 0.5 });
    for (const [cx, cy, c] of [
      [13, 13, BRAND.cyan],
      [197, 13, BRAND.grape],
      [13, 284, BRAND.tangerine],
      [197, 284, BRAND.leaf],
    ] as [number, number, string][]) {
      s.circle(cx, cy, 5, { fill: c });
      s.circle(cx, cy, 2.2, { fill: '#ffffff' });
    }
  }
}

// Returns the y just below the header.
function header(s: Svg, doc: CertDoc): number {
  const t = doc.template;
  const logo = doc.images.logo;
  const name = v(doc, 'schoolName').toUpperCase();
  const lines = schoolLines(doc);
  const colour = t === 'modern' ? BRAND.sapphire : t === 'celebration' ? BRAND.royalDeep : INK;
  const box = LOGO_BOX[t];

  if (t === 'formal' || t === 'celebration') {
    let y = t === 'celebration' ? 20 : 16;
    if (logo) {
      const { w, h } = fitImage(logo.aspect, box, box);
      s.image(105 - w / 2, y, w, h, logo);
      y += h + 5;
    } else y += 4;
    const size = s.fit(name, 6.4, 170, true, true);
    s.text(105, y + size * 0.8, name, size, { bold: true, anchor: 'middle', fill: colour });
    y += size + 3;
    for (const l of lines) {
      const z = s.fit(l, 3.1, 175, false, false);
      s.text(105, y + 2.5, l, z, { anchor: 'middle', serif: false, fill: MUTED });
      y += 4.4;
    }
    y += 1.5;
    if (t === 'formal') {
      s.line(20, y, 190, y, INK, 0.6);
      s.line(20, y + 1, 190, y + 1, INK, 0.2);
    }
    return y + 5;
  }

  // Classic and modern: logo on the left, school details centred.
  const top = t === 'modern' ? 18 : 17;
  let left = 105;
  let width = 176;
  let logoH = 0;
  if (logo) {
    const { w, h } = fitImage(logo.aspect, box, box, false);
    s.image(18 + (box - w) / 2, top + (box - h) / 2, w, h, logo);
    left = 18 + box + (192 - 18 - box) / 2;
    width = 192 - 18 - box - 4;
    logoH = box;
  }
  const nameLines = s.wrap(name, width, 6.2, true, t !== 'modern');
  const size = nameLines.length > 1 ? s.fit(name, 6.2, width * 1.9, true, t !== 'modern') : s.fit(name, 6.2, width, true, t !== 'modern');
  const wrapped = s.wrap(name, width, size, true, t !== 'modern').slice(0, 2);
  let y = top + size;
  for (const l of wrapped) {
    s.text(left, y, l, size, { bold: true, anchor: 'middle', serif: t !== 'modern', fill: colour });
    y += size * 1.15;
  }
  y += 0.5;
  for (const l of lines) {
    const z = s.fit(l, 3.1, width, false, false);
    s.text(left, y + 1.2, l, z, { anchor: 'middle', serif: false, fill: MUTED });
    y += 4.4;
  }
  y = Math.max(y, top + logoH) + 2;
  if (t === 'classic') {
    s.line(12, y, 198, y, INK, 0.7);
    s.line(12, y + 1, 198, y + 1, INK, 0.2);
  } else s.line(14, y, 196, y, BRAND.royal, 0.5);
  return y + 5;
}

function title(s: Svg, doc: CertDoc, y: number, text: string): number {
  const t = doc.template;
  if (t === 'celebration') {
    s.text(105, y + 13, 'CERTIFICATE', 13, { bold: true, anchor: 'middle', fill: BRAND.royal, spacing: 1.6 });
    s.text(105, y + 21, `OF ${text.replace(/^Certificate of /i, '').toUpperCase()}`, 5.2, { anchor: 'middle', fill: BRAND.grape, spacing: 1.2, serif: false, bold: true });
    s.line(70, y + 25, 140, y + 25, BRAND.gold, 0.8);
    return y + 33;
  }
  const colour = t === 'modern' ? BRAND.sapphire : INK;
  const up = text.toUpperCase();
  const size = 6;
  s.text(105, y + size, up, size, { bold: true, anchor: 'middle', fill: colour, spacing: 0.9, serif: t !== 'modern' });
  const w = s.width(up, size, true, t !== 'modern') + up.length * 0.9;
  s.line(105 - w / 2, y + size + 1.8, 105 + w / 2, y + size + 1.8, t === 'modern' ? BRAND.royal : INK, 0.35);
  return y + size + 8;
}

function numberLine(s: Svg, doc: CertDoc, y: number, left: string, right: string): number {
  s.text(20, y, left, 3.4, { bold: true, serif: doc.template !== 'modern' });
  s.text(190, y, right, 3.4, { bold: true, anchor: 'end', serif: doc.template !== 'modern' });
  return y + 7;
}

// ---- footers -----------------------------------------------------------------

interface Signer {
  name: string;
  title: string;
  image?: CertImage;
}

const FOOTER_TOP = 240;

function footer(s: Svg, doc: CertDoc, left: Signer | null, right: Signer, dateLine: string | null) {
  const serif = doc.template !== 'modern';
  const lineY = 268;
  const drawSigner = (cx: number, sg: Signer) => {
    if (sg.image) {
      const { w, h } = fitImage(sg.image.aspect, 44, 16);
      s.image(cx - w / 2, lineY - h - 1, w, h, sg.image);
    }
    s.line(cx - 25, lineY, cx + 25, lineY, INK, 0.3);
    s.text(cx, lineY + 4.6, sg.name, 3.3, { bold: true, anchor: 'middle', serif });
    s.text(cx, lineY + 8.8, sg.title, 3, { anchor: 'middle', serif, fill: MUTED });
  };
  drawSigner(162, right);
  if (left) drawSigner(48, left);
  if (doc.options.qr) {
    const x = left ? 91 : 22;
    qr(s, doc, x, 243, 24);
  } else if (doc.images.stamp) {
    const { w, h } = fitImage(doc.images.stamp.aspect, 30, 30, false);
    s.image(105 - w / 2, 248 - h / 2 + 8, w, h, doc.images.stamp);
  } else if (doc.options.stampBox) {
    s.circle(105, 256, 13, { stroke: '#8a8a8a', sw: 0.3, dash: '1.2 1.2' });
    s.text(105, 257.2, 'School seal', 2.6, { anchor: 'middle', fill: '#6b6b6b', serif: false });
  }
  if (doc.options.qr && doc.images.stamp) {
    const { w, h } = fitImage(doc.images.stamp.aspect, 26, 26, false);
    s.image(128 - w / 2, 244, w, h, doc.images.stamp);
  }
  if (dateLine) s.text(20, FOOTER_TOP - 4, dateLine, 3.3, { serif });
}

function qrText(doc: CertDoc): string {
  const person = v(doc, doc.def.personField);
  const no = v(doc, doc.def.numberField);
  const date = formatDate(v(doc, 'issueDate') || v(doc, 'paymentDate'));
  return [v(doc, 'schoolName'), doc.def.docTitle, no && `No. ${no}`, person, date && `Issued ${date}`].filter(Boolean).join('\n');
}

function qr(s: Svg, doc: CertDoc, x: number, y: number, size: number) {
  const code = QRCode.create(qrText(doc), { errorCorrectionLevel: 'M' });
  const n = code.modules.size;
  const cell = size / (n + 2);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.modules.data[r * n + c]) d += `M${f2(x + (c + 1) * cell)} ${f2(y + (r + 1) * cell)}h${f2(cell)}v${f2(cell)}h-${f2(cell)}z`;
  s.rect(x, y, size, size, { fill: '#ffffff' });
  s.parts.push(`<path d="${d}" fill="#000000"/>`);
  s.text(x + size / 2, y + size + 3.2, 'Scan for certificate details', 2.3, { anchor: 'middle', serif: false, fill: MUTED });
}

// ---- bodies ------------------------------------------------------------------

function tcBody(s: Svg, doc: CertDoc, y0: number, scale: number): number {
  const dob = v(doc, 'dob');
  const rows: [string, string][] = [
    ['Name of the student', v(doc, 'studentName')],
    ['Father’s or guardian’s name', v(doc, 'fatherName')],
    ['Mother’s name', v(doc, 'motherName')],
    ['Date of birth (in figures)', formatDate(dob)],
    ['Date of birth (in words)', dateInWords(dob)],
    ['Gender', v(doc, 'gender')],
    ['Nationality', v(doc, 'nationality')],
    ['Category', v(doc, 'category')],
    ['Date of first admission, with class', [formatDate(v(doc, 'admissionDate')), v(doc, 'admissionClass')].filter(Boolean).join(', ')],
    ['Class in which the student last studied', v(doc, 'lastClass')],
    ['Last examination taken, with result', v(doc, 'boardResult')],
    ['Whether qualified for promotion', v(doc, 'promotion')],
    ['Total working days / days present', [v(doc, 'workingDays'), v(doc, 'daysPresent')].some(Boolean) ? `${v(doc, 'workingDays') || '—'} / ${v(doc, 'daysPresent') || '—'}` : ''],
    ['Whether all dues are paid', v(doc, 'dues')],
    ['Fee concession, if any', v(doc, 'concession')],
    ['Scholarship, if any', v(doc, 'scholarship')],
    ['Games and activities', v(doc, 'activities')],
    ['General conduct', v(doc, 'conduct')],
    ['Date of last attendance', formatDate(v(doc, 'lastAttendance'))],
    ['Date of application for certificate', formatDate(v(doc, 'applicationDate'))],
    ['Date of issue of certificate', formatDate(v(doc, 'issueDate'))],
    ['Reason for leaving the school', v(doc, 'reason')],
    ['Any other remarks', v(doc, 'remarks')],
  ];
  const size = 3.35 * scale;
  const lh = 4.5 * scale;
  let y = y0;
  rows.forEach(([label, value], i) => {
    const labelLines = s.wrap(label, 72, size, false, true);
    const valueLines = s.wrap(value || '—', 88, size, true, true);
    s.text(20, y, `${i + 1}.`, size, {});
    labelLines.forEach((l, j) => s.text(27, y + j * lh, l, size, {}));
    valueLines.forEach((l, j) => {
      s.text(102, y + j * lh, l, size, { bold: true });
      s.line(101, y + j * lh + 1.2, 190, y + j * lh + 1.2, '#9a9a9a', 0.15, '0.6 0.8');
    });
    y += Math.max(labelLines.length, valueLines.length) * lh + 1.3 * scale;
  });
  return y;
}

function paragraphBody(s: Svg, doc: CertDoc, y0: number, scale: number): number {
  const t = doc.def.type;
  const B = (text: string): Seg => ({ text, bold: true });
  const T = (text: string): Seg => ({ text });
  const cls = [v(doc, 'className'), v(doc, 'section') && `Section ${v(doc, 'section')}`].filter(Boolean).join(', ');
  const dob = v(doc, 'dob');
  const dobSegs: Seg[] = dob ? [T('The date of birth as per school records is'), B(formatDate(dob)), T(`(${dateInWords(dob)}).`)] : [];
  let paras: Seg[][] = [];
  if (t === 'bonafide') {
    const was = v(doc, 'status') || 'is a bonafide student';
    paras = [
      [T('This is to certify that'), B(v(doc, 'studentName')), T(`, ${v(doc, 'relation') || 'ward'} of`), B(v(doc, 'parentName')), T(', bearing Admission No.'), B(v(doc, 'admissionNo')), T(`, ${was} of this school${was.startsWith('was') ? ', and studied' : ', studying'} in Class`), B(cls), T('during the academic year'), B(`${v(doc, 'year')}.`)],
      dobSegs,
      [T('This certificate is issued on request for the purpose of'), B(`${v(doc, 'purpose')}.`)],
    ];
  } else if (t === 'study') {
    const studied = v(doc, 'status') === 'studied';
    const adm = v(doc, 'admissionDate');
    paras = [
      [T('This is to certify that'), B(v(doc, 'studentName')), T(`, ${v(doc, 'relation') || 'ward'} of`), B(v(doc, 'parentName')), T(', Admission No.'), B(v(doc, 'admissionNo')), T(studied ? ', studied in Class' : ', is studying in Class'), B(cls), T('of this school in the academic year'), B(`${v(doc, 'year')}.`), ...(adm ? [T('The student was admitted on'), B(`${formatDate(adm)}.`)] : [])],
      dobSegs,
      [T('This certificate is issued on request for the purpose of'), B(`${v(doc, 'purpose')}.`)],
    ];
  } else {
    const parent = v(doc, 'parentName');
    paras = [
      [T('This is to certify that'), B(v(doc, 'studentName')), ...(parent ? [T(', ward of'), B(parent)] : []), ...(v(doc, 'admissionNo') ? [T(', Admission No.'), B(v(doc, 'admissionNo'))] : []), T(', was a student of this school'), ...(v(doc, 'className') ? [T('up to Class'), B(v(doc, 'className'))] : []), T('during'), B(`${v(doc, 'period')}.`)],
      [T('During this period the student’s conduct and character were'), B(`${v(doc, 'conduct')}.`), ...(v(doc, 'participation') ? [T(`The student took part in ${v(doc, 'participation')}.`)] : [])],
      [T(v(doc, 'discipline') || 'No disciplinary action is on record.')],
      [T('We wish the student every success in life.'), ...(v(doc, 'purpose') ? [T('This certificate is issued for the purpose of'), B(`${v(doc, 'purpose')}.`)] : [])],
    ];
  }
  const size = 4.3 * scale;
  let y = y0 + 4;
  for (const p of paras.filter((x) => x.length)) {
    y = s.rich(22, y, 166, p, size, size * 2, { indent: 10 }) + size * 0.8;
  }
  return y;
}

function detailsGrid(s: Svg, doc: CertDoc, y: number, pairs: [string, string][], scale: number): number {
  const size = 3.4 * scale;
  const serif = doc.template !== 'modern';
  for (let i = 0; i < pairs.length; i += 2) {
    [pairs[i], pairs[i + 1]].forEach((pair, j) => {
      if (!pair) return;
      const x = j === 0 ? 20 : 108;
      s.text(x, y, `${pair[0]}:`, size, { serif, fill: MUTED });
      s.text(x + 30, y, pair[1] || '—', size, { serif, bold: true });
    });
    y += size * 1.75;
  }
  return y + 2;
}

interface Col {
  label: string;
  w: number;
  num?: boolean;
}

function table(s: Svg, doc: CertDoc, y: number, cols: Col[], rows: string[][], scale: number, foot?: string[]): number {
  const size = 3.3 * scale;
  const h = size * 2.1;
  const serif = doc.template !== 'modern';
  const head = doc.template === 'modern' ? BRAND.sapphire : '#e6e6e6';
  const headInk = doc.template === 'modern' ? '#ffffff' : INK;
  const totalW = cols.reduce((a, c) => a + c.w, 0);
  const x0 = 105 - totalW / 2;
  const cellText = (text: string, col: Col, x: number, yy: number, bold: boolean, fill = INK) => {
    const t = s.wrap(text, col.w - 3, size, bold, serif)[0] ?? '';
    s.text(col.num ? x + col.w - 1.5 : x + 1.5, yy, t, size, { anchor: col.num ? 'end' : 'start', bold, serif, fill });
  };
  s.rect(x0, y, totalW, h, { fill: head });
  let x = x0;
  for (const c of cols) {
    cellText(c.label, c, x, y + h * 0.68, true, headInk);
    x += c.w;
  }
  y += h;
  const all = foot ? [...rows, foot] : rows;
  all.forEach((r, ri) => {
    const isFoot = foot && ri === all.length - 1;
    if (isFoot) s.rect(x0, y, totalW, h, { fill: '#f2f2f2' });
    let xx = x0;
    r.forEach((cell, ci) => {
      cellText(cell, cols[ci], xx, y + h * 0.68, Boolean(isFoot));
      xx += cols[ci].w;
    });
    s.line(x0, y + h, x0 + totalW, y + h, '#9a9a9a', 0.2);
    y += h;
  });
  s.rect(x0, y - h * (all.length + 1), totalW, h * (all.length + 1), { stroke: INK, sw: 0.3 });
  return y + 4;
}

const n2 = (s: string) => {
  const x = Number(s.replace(/,/g, ''));
  return s.trim() === '' || !Number.isFinite(x) ? NaN : x;
};
const fmt = (x: number) => (Number.isFinite(x) ? String(Number(x.toFixed(2))) : '—');

export function marksheetTotals(doc: CertDoc) {
  const bands = parseGrades(v(doc, 'grades') || 'A1:91, A2:81, B1:71, B2:61, C1:51, C2:41, D:33, E:0');
  const pass = Number.isFinite(n2(v(doc, 'passPercent'))) ? n2(v(doc, 'passPercent')) : 33;
  const subjects = (doc.rows.subjects ?? [])
    .filter((r) => (r.subject ?? '').trim())
    .map((r) => {
      const max = n2(r.max ?? '');
      const th = n2(r.theory ?? '');
      const pr = n2(r.practical ?? '');
      const total = (Number.isFinite(th) ? th : 0) + (Number.isFinite(pr) ? pr : 0);
      const has = Number.isFinite(th) || Number.isFinite(pr);
      const percent = Number.isFinite(max) && max > 0 && has ? (total / max) * 100 : NaN;
      return { subject: r.subject.trim(), max, th, pr, total: has ? total : NaN, percent, grade: bands && Number.isFinite(percent) ? gradeFor(percent, bands) : '—', passed: Number.isFinite(percent) && percent >= pass };
    });
  const counted = subjects.filter((x) => Number.isFinite(x.total) && Number.isFinite(x.max));
  const total = counted.reduce((a, x) => a + x.total, 0);
  const max = counted.reduce((a, x) => a + x.max, 0);
  const percent = max > 0 ? (total / max) * 100 : NaN;
  const complete = counted.length === subjects.length && subjects.length > 0;
  const result = !complete ? 'Incomplete' : subjects.every((x) => x.passed) ? 'Pass' : 'Needs improvement';
  return { subjects, total, max, percent, grade: bands && Number.isFinite(percent) ? gradeFor(percent, bands) : '—', result, pass };
}

function marksheetBody(s: Svg, doc: CertDoc, y0: number, scale: number): number {
  const exam = v(doc, 'examName');
  s.text(105, y0, [exam, v(doc, 'year') && `Academic Year ${v(doc, 'year')}`].filter(Boolean).join('   ·   '), 3.8 * scale, { anchor: 'middle', bold: true, serif: doc.template !== 'modern' });
  let y = y0 + 8;
  y = detailsGrid(
    s,
    doc,
    y,
    [
      ['Student', v(doc, 'studentName')],
      ['Roll No.', v(doc, 'rollNo')],
      ['Class', [v(doc, 'className'), v(doc, 'section')].filter(Boolean).join(' - ')],
      ['Admission No.', v(doc, 'admissionNo')],
      ['Date of birth', formatDate(v(doc, 'dob'))],
      ['Attendance', v(doc, 'attendance')],
    ],
    scale
  );
  const m = marksheetTotals(doc);
  y = table(
    s,
    doc,
    y,
    [
      { label: 'Subject', w: 58 },
      { label: 'Maximum', w: 22, num: true },
      { label: 'Theory', w: 22, num: true },
      { label: 'Practical', w: 22, num: true },
      { label: 'Total', w: 22, num: true },
      { label: 'Grade', w: 20 },
    ],
    m.subjects.map((x) => [x.subject, fmt(x.max), fmt(x.th), Number.isFinite(x.pr) ? fmt(x.pr) : '—', fmt(x.total), x.grade]),
    scale,
    ['Total', fmt(m.max), '', '', fmt(m.total), m.grade]
  );
  const serif = doc.template !== 'modern';
  const size = 3.6 * scale;
  s.text(20, y + 2, `Percentage: ${Number.isFinite(m.percent) ? `${m.percent.toFixed(2)}%` : '—'}`, size, { bold: true, serif });
  s.text(88, y + 2, `Overall grade: ${m.grade}`, size, { bold: true, serif });
  s.text(190, y + 2, `Result: ${m.result}`, size, { bold: true, serif, anchor: 'end' });
  y += 9;
  for (const [label, id] of [
    ['Class teacher’s remarks', 'teacherRemarks'],
    ['Principal’s remarks', 'principalRemarks'],
  ] as const) {
    if (!v(doc, id)) continue;
    y = s.rich(20, y, 170, [{ text: `${label}:`, bold: true }, { text: v(doc, id) }], 3.4 * scale, 5 * scale, { serif }) + 1.5;
  }
  s.text(20, y + 2, `Pass mark in each subject: ${m.pass} out of every 100. Grades follow the scale set by the school.`, 2.7 * scale, { serif: false, fill: MUTED });
  return y + 6;
}

export function receiptTotals(doc: CertDoc) {
  const heads = (doc.rows.heads ?? []).filter((r) => (r.head ?? '').trim() || (r.amount ?? '').trim()).map((r) => ({ head: (r.head ?? '').trim(), amount: n2(r.amount ?? '') }));
  const subtotal = heads.reduce((a, h) => a + (Number.isFinite(h.amount) ? h.amount : 0), 0);
  const discount = Number.isFinite(n2(v(doc, 'discount'))) ? n2(v(doc, 'discount')) : 0;
  const late = Number.isFinite(n2(v(doc, 'lateFee'))) ? n2(v(doc, 'lateFee')) : 0;
  const total = subtotal - discount + late;
  const paid = Number.isFinite(n2(v(doc, 'paid'))) ? n2(v(doc, 'paid')) : 0;
  return { heads, subtotal, discount, late, total, paid, balance: total - paid };
}

function receiptBody(s: Svg, doc: CertDoc, y0: number, scale: number): number {
  let y = detailsGrid(
    s,
    doc,
    y0,
    [
      ['Student', v(doc, 'studentName')],
      ['Admission No.', v(doc, 'admissionNo')],
      ['Class', v(doc, 'className')],
      ['Academic year', v(doc, 'year')],
      ['Parent', v(doc, 'parentName')],
      ['Payment date', formatDate(v(doc, 'paymentDate'))],
    ],
    scale
  );
  const r = receiptTotals(doc);
  const cols: Col[] = [
    { label: 'S. No.', w: 16 },
    { label: 'Fee head', w: 100 },
    { label: 'Amount', w: 46, num: true },
  ];
  const rows = r.heads.map((h, i) => [String(i + 1), h.head, Number.isFinite(h.amount) ? rupees(h.amount) : '—']);
  if (r.discount) rows.push(['', 'Less: discount', `- ${rupees(r.discount)}`]);
  if (r.late) rows.push(['', 'Add: late fee', rupees(r.late)]);
  y = table(s, doc, y, cols, rows, scale, ['', 'Total payable', rupees(r.total)]);
  const serif = doc.template !== 'modern';
  const size = 3.6 * scale;
  s.text(20, y + 2, `Amount paid: ${rupees(r.paid)}`, size, { bold: true, serif });
  s.text(190, y + 2, `Balance: ${rupees(r.balance)}`, size, { bold: true, serif, anchor: 'end' });
  y += 8;
  y = s.rich(20, y, 170, [{ text: 'Amount received in words:', bold: true }, { text: rupeesInWords(r.paid) }], 3.4 * scale, 5 * scale, { serif }) + 2;
  y = detailsGrid(
    s,
    doc,
    y + 2,
    [
      ['Payment mode', v(doc, 'mode') || 'Cash'],
      ['Transaction No.', v(doc, 'transactionId')],
    ],
    scale
  );
  s.text(20, y + 2, 'This is a receipt for the payment described above. Please keep it for your records.', 2.8 * scale, { serif: false, fill: MUTED });
  return y + 6;
}

function achievementBody(s: Svg, doc: CertDoc, y0: number, scale: number): number {
  const colour = doc.template === 'celebration';
  let y = y0 + 6;
  s.text(105, y, 'This certificate is proudly presented to', 4.4 * scale, { anchor: 'middle', italic: true, fill: colour ? BRAND.sapphire : INK });
  y += 14 * scale;
  const name = v(doc, 'recipientName');
  const size = s.fit(name, 11 * scale, 160, true, true);
  s.text(105, y, name, size, { anchor: 'middle', bold: true, fill: colour ? BRAND.goldDeep : INK });
  s.line(40, y + 3, 170, y + 3, colour ? BRAND.gold : INK, 0.5);
  y += 12 * scale;
  const role = v(doc, 'recipientRole') === 'Teacher' ? '' : v(doc, 'className') ? `of Class ${v(doc, 'className')}` : '';
  const event = v(doc, 'event');
  const award = v(doc, 'award');
  const lines: Seg[] = [
    ...(role ? [{ text: `${role},` }] : []),
    { text: award ? 'for' : 'for outstanding' },
    ...(award ? [{ text: award, bold: true }, { text: 'in' }] : [{ text: 'participation in' }]),
    { text: `${event}`, bold: true },
    ...(v(doc, 'level') ? [{ text: `at ${v(doc, 'level').toLowerCase()} level` }] : []),
    ...(v(doc, 'eventDate') ? [{ text: `held on ${formatDate(v(doc, 'eventDate'))}` }] : []),
    ...(v(doc, 'organizer') ? [{ text: `organised by ${v(doc, 'organizer')}` }] : []),
    { text: '.' },
  ];
  y = s.rich(25, y, 160, lines, 4.6 * scale, 8 * scale, { align: 'center', fill: colour ? BRAND.royalDeep : INK });
  if (v(doc, 'year')) {
    s.text(105, y + 4, `Academic Year ${v(doc, 'year')}`, 3.6 * scale, { anchor: 'middle', fill: MUTED, serif: false });
    y += 8;
  }
  return y;
}

// ---- document -----------------------------------------------------------------

export function renderCertificateSvg(doc: CertDoc, measure: Measure = approxMeasure): string {
  const t = doc.def.type;
  const place = v(doc, 'place');
  const issue = formatDate(v(doc, 'issueDate'));
  const dateLine = [issue && `Date: ${issue}`, place && `Place: ${place}`].filter(Boolean).join('      ');
  const signer: Signer = {
    name: v(doc, 'signName'),
    title: v(doc, 'signTitle') || (t === 'fee-receipt' ? 'Authorised signatory' : 'Principal'),
    image: doc.images.signature,
  };

  // Lay out the body, shrinking it until it clears the footer.
  let best = '';
  for (const scale of [1, 0.93, 0.86, 0.8, 0.74]) {
    const s = new Svg(measure);
    frame(s, doc.template);
    let y = header(s, doc);
    const docTitle = t === 'achievement' ? `Certificate of ${v(doc, 'kind') || 'Achievement'}` : doc.def.docTitle;
    y = title(s, doc, y, docTitle);
    const no = v(doc, doc.def.numberField);
    if (t === 'transfer') y = numberLine(s, doc, y, `TC No.: ${no}`, `Admission No.: ${v(doc, 'admissionNo')}`);
    else if (t === 'fee-receipt') y = numberLine(s, doc, y, `Receipt No.: ${no}`, `Date: ${formatDate(v(doc, 'paymentDate'))}`);
    else if (t === 'marksheet') y += 2;
    else if (t !== 'achievement' || no) y = numberLine(s, doc, y, no ? `No.: ${no}` : '', t === 'achievement' ? '' : `Date: ${issue}`);

    const end =
      t === 'transfer'
        ? tcBody(s, doc, y + 2, scale)
        : t === 'marksheet'
          ? marksheetBody(s, doc, y + 2, scale)
          : t === 'fee-receipt'
            ? receiptBody(s, doc, y + 2, scale)
            : t === 'achievement'
              ? achievementBody(s, doc, y, scale)
              : paragraphBody(s, doc, y, scale);

    if (t === 'marksheet') footer(s, doc, { name: v(doc, 'teacherName'), title: 'Class Teacher' }, signer, dateLine || null);
    else if (t === 'fee-receipt') footer(s, doc, { name: v(doc, 'cashier'), title: 'Received by' }, signer, null);
    else if (t === 'achievement') footer(s, doc, v(doc, 'sign2Name') ? { name: v(doc, 'sign2Name'), title: v(doc, 'sign2Title') } : null, signer, dateLine || null);
    else footer(s, doc, null, signer, dateLine || null);

    best = s.parts.join('');
    if (end <= FOOTER_TOP - 8) break;
  }
  const label = `${doc.def.docTitle}${v(doc, 'schoolName') ? `, ${v(doc, 'schoolName')}` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm" role="img" aria-label="${esc(label)}"><rect width="210" height="297" fill="#ffffff"/>${best}</svg>`;
}

// Every field label on a document, for bulk CSV headers.
export function csvHeaders(doc: Pick<CertDoc, 'def'>): string[] {
  return [...SCHOOL_FIELDS, ...doc.def.fields].map((f) => f.label);
}
