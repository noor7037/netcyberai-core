// The example document Meta's reviewers see with a template that carries a PDF (C366, exam_result_pdf): Meta asks
// for one when such a template is submitted (its header's example.header_handle). A one-page PDF written here, in
// code, holding no child's data, no school's and no mark: only words that say what the real document is. It goes to
// Meta's review only, never to a family.

const enc = new TextEncoder();
export const EXAMPLE_PDF_NAME = 'checked-answer-sheets-example.pdf';
const LINES = ['Example only: no real child, school or mark.', 'A family receives one PDF of their own child\'s checked answer sheets:', 'a first page with the marks of each question, then the checked pages.'];

// PDF literal strings: printable ASCII only, with the three special characters escaped.
const literal = (s: string) => `(${s.replace(/[^\x20-\x7e]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;

export function examplePdf(): Uint8Array {
  const content = ['BT', '/F1 14 Tf', '72 760 Td', '18 TL', ...LINES.map((l) => `${literal(l)} Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(enc.encode(out).length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}
