import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { importClassCsv, MAX_CLASS_CSV_CHARS } from '@/lib/classes/class-csv';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// POST { csv, preview }: classes from a CSV file (grade, section, class_teacher_email), the principal and the school
// admin (C235-A). preview: check every line, write nothing. Otherwise all or nothing: with any problem nothing is
// added and the answer lists every problem by its line.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (typeof body?.csv !== 'string' || body.csv.length > MAX_CLASS_CSV_CHARS) return ruleError(400, 'not_sent_properly');
    const preview = body.preview === true;
    const done = await importClassCsv(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.csv, { preview });
    if (!done.ok) return ruleError(403, 'not_allowed');
    const { ok: _ok, ...result } = done;
    if (!preview && !done.committed) return jsonError(422, 'nothing was added: the file has problems', { code: 'import_problems', ...result });
    return NextResponse.json(result, { status: done.committed ? 201 : 200 });
  });
}
