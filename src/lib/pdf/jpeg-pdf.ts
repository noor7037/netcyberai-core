// A minimal PDF writer for pages that are already JPEG images. Every
// free tool and certificate draws its page on a canvas in the visitor's
// browser (at 300 DPI for A4) and hands the JPEG bytes here, so a PDF is
// produced without any server, library or upload. JPEG data is embedded
// as-is (DCTDecode), which keeps the file small and the pixels exact.

export interface JpegPage {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

// A4 in PDF points (1/72 inch).
export const A4_PT = { w: 595.28, h: 841.89 } as const;
// A4 at 300 DPI: 210mm x 297mm.
export const A4_300DPI = { w: 2480, h: 3508 } as const;

const enc = new TextEncoder();

function pdfString(s: string): string {
  // PDF literal strings: escape the three special characters and keep to
  // printable ASCII, so a title can never break the file structure.
  return `(${s.replace(/[^\x20-\x7e]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

export function jpegPagesToPdf(pages: JpegPage[], opts: { title?: string; pageSize?: { w: number; h: number } } = {}): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.');
  const size = opts.pageSize ?? A4_PT;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const b = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(b);
    length += b.length;
  };
  const startObj = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  // Object numbers: 1 catalog, 2 page tree, 3 info, then per page
  // (page, contents, image) = 4 + 3i, 5 + 3i, 6 + 3i.
  const pageObj = (i: number) => 4 + i * 3;
  const total = 3 + pages.length * 3;

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`);
  startObj(3);
  push(`<< /Title ${pdfString(opts.title ?? 'Document')} /Producer (Browser-generated) >>\nendobj\n`);

  pages.forEach((p, i) => {
    const n = pageObj(i);
    const w = size.w.toFixed(2);
    const h = size.h.toFixed(2);
    startObj(n);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>\nendobj\n`);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    startObj(n + 1);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(n + 2);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    push(p.bytes);
    push('\nendstream\nendobj\n');
  });

  const xref = length;
  let table = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
