import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/frameworks/route';
import type { BrandingProblem, BrandingResult } from './branding';
import { LOGO_MAX_BYTES } from './logo-file';

// What the two branding routes share (the school's own, /api/app/school/branding, and Control's,
// /api/control/schools/<id>/branding): reading the form before any database work, and saying a refusal plainly.
// The form: "name" (the school's official name), "logo" (a file, prepared in the browser) and "removeLogo" ("1").

export type BrandingForm = { name?: string; logo?: Uint8Array; removeLogo: boolean };

// Read from the request, refused from its declared length before any of it is read when it cannot be one logo and a
// name.
export async function readBrandingForm(req: NextRequest): Promise<BrandingForm | NextResponse> {
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
  if (declared > LOGO_MAX_BYTES + 64 * 1024) return jsonError(413, 'the logo is larger than 5 MB', { code: 'logo_too_large' });
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
  const name = form.get('name');
  const logo = form.get('logo');
  if ((name !== null && typeof name !== 'string') || (logo !== null && typeof logo === 'string')) return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
  if (logo && logo.size > LOGO_MAX_BYTES) return jsonError(413, 'the logo is larger than 5 MB', { code: 'logo_too_large' });
  return {
    ...(name !== null ? { name } : {}),
    ...(logo && logo.size > 0 ? { logo: new Uint8Array(await logo.arrayBuffer()) } : {}),
    removeLogo: form.get('removeLogo') === '1',
  };
}

const SAID: Record<BrandingProblem, [number, string]> = {
  not_allowed: [403, 'only the principal or the school admin changes the school’s name and logo'],
  not_found: [404, 'this school was not found'],
  name_blank: [400, 'the school’s name needs at least 2 letters'],
  name_long: [400, 'the school’s name can be at most 120 characters'],
  name_invalid: [400, 'the school’s name has characters that cannot be kept'],
  logo_empty: [400, 'the logo file is empty'],
  logo_too_large: [413, 'the logo is larger than 5 MB'],
  logo_not_image: [400, 'the logo must be a PNG, JPEG or WebP picture'],
  logo_dimensions: [400, 'the logo must be between 16 and 1024 pixels on each side, and not a thin strip'],
  storage_unavailable: [503, 'the logo cannot be saved right now; try again later'],
};

export function brandingResponse(result: BrandingResult): NextResponse {
  if (result.ok) return NextResponse.json({ name: result.name, logoVersion: result.logoVersion, changed: result.changed });
  const [status, sentence] = SAID[result.reason];
  return jsonError(status, sentence, { code: result.reason });
}
