import { NextRequest, NextResponse } from 'next/server';
import { controlRoute, jsonError } from '@/lib/frameworks/route';
import { isSchoolId, loadSchoolBrand, updateSchoolBranding } from '@/lib/school/branding';
import { brandingResponse, readBrandingForm } from '@/lib/school/branding-route';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// A school's official name and logo, set by NetCyberAI while onboarding it (C235-B). The platform role only.
//   GET                                                  { name, logoVersion }
//   POST (multipart: "name", "logo", "removeLogo")       the same change the school's principal makes in Settings
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  if (!isSchoolId(params.schoolId)) return jsonError(404, 'this school was not found', { code: 'not_found' });
  return controlRoute(req, async ({ db }) => {
    const brand = await loadSchoolBrand(db, params.schoolId);
    return brand ? NextResponse.json(brand) : jsonError(404, 'this school was not found', { code: 'not_found' });
  });
}

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  if (!isSchoolId(params.schoolId)) return jsonError(404, 'this school was not found', { code: 'not_found' });
  return controlRoute(req, async ({ claims, db }) => {
    const form = await readBrandingForm(req);
    if (form instanceof NextResponse) return form;
    return brandingResponse(await updateSchoolBranding(db, supabaseFileStorage, { userId: claims.sub, role: claims.role }, params.schoolId, form));
  });
}
