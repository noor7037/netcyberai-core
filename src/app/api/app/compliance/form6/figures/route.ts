import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { saveForm6Figure } from '@/lib/compliance/form6';
import { deskInPlan } from '@/lib/compliance/qualifications';

// POST { figure: 'cpi', percent, source, readOn } | { figure: 'deadline', deadline, source, readOn } | { figure, clear: true }:
// the CPI or the filing deadline of Haryana's Form 6, entered on the compliance desk by the principal or the school
// admin with the https address of its source and the day it was read (C230-A, C232 part B). Never a default number:
// nothing is set until a person enters it. Audited with the figure and the day read, never the address.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    const b = await readJson(req);
    if (!b) return ruleError(400, 'not_sent_properly');
    const { rows } = await db.query(`select jurisdiction from schools where school_id = $1`, [claims.schoolId]);
    const saved = await saveForm6Figure(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, String(rows[0]?.jurisdiction ?? ''), b);
    if (saved.ok) return NextResponse.json({ figure: saved.figure, cleared: saved.cleared });
    if (saved.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(400, 'the figure was not saved', { code: saved.reason });
  });
}
