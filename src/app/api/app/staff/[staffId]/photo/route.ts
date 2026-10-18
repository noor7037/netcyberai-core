import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, appRouteAfter, jsonError, ruleError } from '@/lib/frameworks/route';
import { mayOpenStaffProfile } from '@/lib/staff/profile';
import { photoResponse, readPhotoForm } from '@/lib/staff/profile-routes';
import { mayEditStaffProfile, readStaffPhoto, removeStaffPhoto, setStaffPhoto } from '@/lib/staff/profile-write';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// A member of staff's photo (C238).
//   GET ?v=<version>  the picture, for the office and the person themself, from the school's own session: the bytes
//                     the store holds, sent with the type read from them, nosniff and a sandbox, kept by the browser
//                     for a day (private: never a shared cache) and asked again when the version changes. Never a
//                     storage link.
//   POST (multipart "photo", drawn in the browser)  sets or replaces it: the principal and the school admin only,
//                     refused before the form is read for anyone else; a PNG, JPEG or WebP by its first bytes, at most
//                     5 MB. The old file is removed once the new one is on the row.
//   DELETE            removes it (the office).
type Ctx = { params: { staffId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return appRoute(req, async ({ claims, db }) => {
    if (!mayOpenStaffProfile(claims, params.staffId)) return ruleError(403, 'not_allowed');
    const photo = isUuid(params.staffId) ? await readStaffPhoto(db, supabaseFileStorage, claims.schoolId, params.staffId) : null;
    if (!photo) return NextResponse.json({ error: 'no photo' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(Buffer.from(photo.bytes), {
      status: 200,
      headers: {
        'Content-Type': photo.type,
        'Content-Length': String(photo.bytes.length),
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return appRouteAfter(
    req,
    async (claims) => (mayEditStaffProfile(claims.role) ? readPhotoForm(req, params.staffId) : ruleError(403, 'not_allowed')),
    async ({ claims, db, prepared }) => photoResponse(await setStaffPhoto(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.staffId, prepared))
  );
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.staffId)) return jsonError(404, 'this member of staff was not found', { code: 'not_found' });
    return photoResponse(await removeStaffPhoto(db, supabaseFileStorage, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.staffId));
  });
}
