import QRCode from 'qrcode';
import type { CertDoc, CertImage } from '@/lib/certificates/definitions';
import { approxMeasure, renderCertificateSvg, type Measure } from '@/lib/certificates/render';
import { siteUrl } from '@/lib/site-config';
import { certDef, type CertificateType } from './certificate-rules';
import { isResultCertType, resultCertDef, type ResultCertType } from './result-certificate-rules';

// A certificate of the register drawn as the studio draws it (render.ts, imported), with the school's seal and the
// signature of the person who signed it (C232 part A: the database chooses it per certificate; none means a line for
// the principal's hand), and a QR code of the public verification page in the corner the studio keeps for its own QR.
// Pure: the browser turns the SVG into the PDF (pdf.ts); the tests read the SVG.

export type IssuedForPrint = { certificateId: string; type: CertificateType | ResultCertType; number: string; issuedOn: string; token: string; printed: Record<string, string> };
// signatures: by certificate id, as public.certificate_signature_for() answered.
export type Marks = { seal?: CertImage; signatures?: Record<string, CertImage> };

// The address the QR code opens: the token only, never the number or an id.
export const verifyUrl = (token: string): string => `${siteUrl}/verify/${encodeURIComponent(token)}`;

export function certDocFor(c: IssuedForPrint, marks: Marks): CertDoc {
  // A merit or participation certificate (AJ-5) is drawn with the studio's achievement certificate; its `kind` is in what it printed.
  const def = isResultCertType(c.type) ? resultCertDef() : certDef(c.type);
  return {
    def,
    template: def.templates[0],
    values: { ...c.printed, [def.numberField]: c.number, issueDate: c.issuedOn },
    rows: {},
    images: { signature: marks.signatures?.[c.certificateId], stamp: marks.seal },
    // The studio's own QR holds the words of the certificate; ours is drawn below and holds the address instead.
    options: { stampBox: !marks.seal, qr: false },
  };
}

// The QR code as SVG markup in millimetres, with its line underneath, as the studio places its own (render.ts qr()).
const QR_CAPTION = 'Scan to check this certificate';
export function qrMarkup(text: string, x: number, y: number, size: number): string {
  const code = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = code.modules.size;
  const cell = size / (n + 2);
  const f = (v: number) => Number(v.toFixed(3));
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.modules.data[r * n + c]) d += `M${f(x + (c + 1) * cell)} ${f(y + (r + 1) * cell)}h${f(cell)}v${f(cell)}h-${f(cell)}z`;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="#000000"/><text x="${f(x + size / 2)}" y="${f(y + size + 3.2)}" font-size="2.3" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" fill="#444444">${QR_CAPTION}</text>`;
}

export function certificateSvg(c: IssuedForPrint, marks: Marks, measure: Measure = approxMeasure): string {
  const svg = renderCertificateSvg(certDocFor(c, marks), measure);
  return svg.replace(/<\/svg>$/, `${qrMarkup(verifyUrl(c.token), 22, 243, 24)}</svg>`);
}
