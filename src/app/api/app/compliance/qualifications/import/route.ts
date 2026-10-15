import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, IMPORT_MAX_BYTES, importRegister } from '@/lib/compliance/qualifications';

// POST { csv, apply }: the teacher register from a CSV in the website tool's own columns (TEACHER_COLUMNS, read by its
// teachersFromCsv). Each line is matched with one staff account by name. apply false: what each line would do, nothing
// saved. apply true: the lines that are ready are saved, each audited. The principal and the school admin (C227).
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > IMPORT_MAX_BYTES * 2) return jsonError(413, 'the file is too large', { code: 'too_large' });
    const b = await readJson(req);
    if (!b || typeof b.csv !== 'string' || typeof b.apply !== 'boolean') return ruleError(400, 'not_sent_properly');
    const result = await importRegister(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, b.csv, b.apply);
    if (result.ok) return NextResponse.json(result);
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'too_large' ? 413 : 400, 'the file was not read', { code: result.reason });
  });
}
