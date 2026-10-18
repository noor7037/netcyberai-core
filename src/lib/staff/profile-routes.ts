import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { jsonError } from '@/lib/frameworks/route';
import { PHOTO_MAX_BYTES } from './profile-rules';
import type { PhotoResult, SaveResult } from './profile-write';

// What the profile's routes share (C238): reading the photo form before any database work, and saying a refusal
// plainly, with a code the screen says in the person's language (sprof.err.<code>).

// The photo, refused from its declared length before any of it is read when it cannot be one photo of 5 MB.
export async function readPhotoForm(req: NextRequest, staffId: string): Promise<Uint8Array | NextResponse> {
  if (!isUuid(staffId)) return jsonError(404, 'this member of staff was not found', { code: 'not_found' });
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
  if (declared > PHOTO_MAX_BYTES + 64 * 1024) return jsonError(413, 'the photo is larger than 5 MB', { code: 'photo_too_large' });
  const form = await req.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!photo || typeof photo === 'string') return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
  if (photo.size > PHOTO_MAX_BYTES) return jsonError(413, 'the photo is larger than 5 MB', { code: 'photo_too_large' });
  return new Uint8Array(await photo.arrayBuffer());
}

const SAID: Record<string, [number, string]> = {
  not_allowed: [403, 'only the principal or the school admin changes a staff profile'],
  not_found: [404, 'this member of staff was not found'],
  code_taken: [409, 'another member of staff already has this staff code'],
  photo_empty: [400, 'the photo file is empty'],
  photo_too_large: [413, 'the photo is larger than 5 MB'],
  photo_not_image: [400, 'the photo must be a JPEG, PNG or WebP picture'],
  photo_dimensions: [400, 'the photo must be between 16 and 1024 pixels on each side, and not a thin strip'],
  storage_unavailable: [503, 'the photo cannot be saved right now; try again later'],
};

export function saveResponse(result: SaveResult): NextResponse {
  if (result.ok) return NextResponse.json({ created: result.created, changed: result.changed });
  if (result.reason === 'field') return jsonError(400, `the ${result.problem.field.replace(/_/g, ' ')} was not accepted`, { code: 'field', field: result.problem.field, problem: result.problem.reason });
  const [status, sentence] = SAID[result.reason];
  return jsonError(status, sentence, { code: result.reason });
}

export function photoResponse(result: PhotoResult): NextResponse {
  if (result.ok) return NextResponse.json({ photoVersion: result.photoVersion });
  const [status, sentence] = SAID[result.reason];
  return jsonError(status, sentence, { code: result.reason });
}
