import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/academics/syllabus';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { setOverride, type OverrideInput } from '@/lib/setup/promotion';
import { cleanSection } from '@/lib/setup/promotion-plan';

// POST { studentId, decision: 'promote' | 'repeat' | 'leave' | 'move_section', toSection?, reason? }: one student's
// decision for the coming promotion (W21-M2), saved for the current session. 'promote' clears it. The principal only;
// a reason (up to 200 letters, never an Aadhaar number) for every decision but 'promote'. Audited with ids only.
const DECISIONS = ['promote', 'repeat', 'leave', 'move_section'] as const;

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal') return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const decision = DECISIONS.find((d) => d === body?.decision);
    if (!body || !decision || typeof body.studentId !== 'string' || !isUuid(body.studentId)) return ruleError(400, 'not_sent_properly');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (decision !== 'promote' && (reason.length < 1 || reason.length > 200)) return jsonError(400, 'say why, in up to 200 letters', { code: 'promotion_reason' });
    if (hasAadhaarNumber(reason)) return jsonError(400, 'a reason never holds an Aadhaar number', { code: 'promotion_reason_aadhaar' });
    const toSection = cleanSection(body.toSection);
    if (decision === 'move_section' && !toSection) return jsonError(400, 'choose the section', { code: 'promotion_section' });
    const input: OverrideInput = { studentId: body.studentId, decision, toSection, reason: reason || null };
    const done = await setOverride(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, input);
    if (!done.ok) {
      if (done.reason === 'not_found') return jsonError(404, 'this student is not one of the school’s current students', { code: 'promotion_student' });
      if (done.reason === 'no_session') return jsonError(409, 'the school has no current session', { code: 'promotion_no_session' });
      return jsonError(400, 'the decision is not complete', { code: done.reason === 'needs_section' ? 'promotion_section' : 'promotion_reason' });
    }
    return NextResponse.json({ ok: true });
  });
}
