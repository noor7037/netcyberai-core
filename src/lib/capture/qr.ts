import { randomBytes } from 'crypto';
import QRCode from 'qrcode';

// PRD Sec6.2, non-negotiable: the QR payload is an OPAQUE RANDOM TOKEN,
// never name/admission number/class/phone/DOB/school name. 128-bit
// random, base64url-encoded (22 chars, no padding) so the printed QR
// stays small and scans reliably even on a cheap phone camera.
export function generateToken(): string {
  return randomBytes(16).toString('base64url');
}

const TOKEN_PREFIX = 'nca:s:'; // PRD Sec6.2's own literal payload shape

export function tokenToQrPayload(token: string): string {
  return `${TOKEN_PREFIX}${token}`;
}

export function qrPayloadToToken(payload: string): string | null {
  return payload.startsWith(TOKEN_PREFIX) ? payload.slice(TOKEN_PREFIX.length) : null;
}

// SVG, not PNG: scales cleanly for print (ID cards get printed at
// varying sizes) with no raster artifacts, and is small enough to
// inline directly into the card page with no separate image request.
export async function generateQrSvg(token: string): Promise<string> {
  return QRCode.toString(tokenToQrPayload(token), { type: 'svg', margin: 1, width: 240 });
}
