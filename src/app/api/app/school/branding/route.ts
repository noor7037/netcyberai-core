import { NextRequest } from 'next/server';
import { appRouteAfter, ruleError } from '@/lib/frameworks/route';
import { mayChangeBranding, updateSchoolBranding } from '@/lib/school/branding';
import { brandingResponse, readBrandingForm } from '@/lib/school/branding-route';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// POST (multipart: "name", "logo", "removeLogo"): the school's official name and logo (C235-B), from Settings. The
// principal and the school admin of the session's own school only; anyone else is refused before the form is read.
// The form is read before the transaction opens, so no connection is held while a file arrives.
export async function POST(req: NextRequest) {
  return appRouteAfter(
    req,
    async (claims) => (mayChangeBranding(claims.role) ? readBrandingForm(req) : ruleError(403, 'not_allowed')),
    async ({ claims, db, prepared }) =>
      brandingResponse(await updateSchoolBranding(db, supabaseFileStorage, { userId: claims.sub, role: claims.role }, claims.schoolId, prepared))
  );
}
