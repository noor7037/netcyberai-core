import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { lastNightlyRun } from '@/lib/fees/nightly';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { COUNTER_METHODS, openDues, recentReceipts, reconcile, takePayment } from '@/lib/fees/payments';
import { FINANCE } from '@/lib/fees/structures';

// Payments at the counter (docs/23 6c, C160).
//   GET  ?studentId=&scope=student|family  what is still owed, oldest first
//   GET                                     the school's totals, what is overdue, the last nightly check and its latest receipts
//   POST take a payment and issue one receipt. `clientRef` makes a repeat of the same press harmless.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const q = req.nextUrl.searchParams;
    const studentId = q.get('studentId');
    if (studentId !== null) {
      if (!isUuid(studentId)) return ruleError(400, 'not_sent_properly');
      const student = (await db.query(`select name, family_id is not null as in_family from fee_billing_students() where school_id = $1 and student_id = $2`, [claims.schoolId, studentId])).rows[0];
      if (!student) return jsonError(404, 'not found', { code: 'unknown_student' });
      return NextResponse.json({ student, dues: await openDues(db, claims.schoolId, studentId, q.get('scope') === 'family' ? 'family' : 'student') });
    }
    const summary = await loadFeesSummary(db);
    return NextResponse.json({ totals: await reconcile(db, claims.schoolId), overdue: { minor: summary.overdueMinor, count: summary.overdueCount }, lastRun: await lastNightlyRun(db, claims.schoolId), receipts: await recentReceipts(db, claims.schoolId), mayReverse: claims.role === 'principal' || claims.role === 'school_admin' });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const method = COUNTER_METHODS.find((m) => m === body?.method);
    const raw = body?.allocations;
    if (!isUuid(body?.studentId) || typeof body?.amountMinor !== 'number' || !method || (body?.clientRef != null && !isUuid(body.clientRef)) || (raw != null && (!Array.isArray(raw) || raw.length > 100))) return ruleError(400, 'not_sent_properly');
    const allocations = Array.isArray(raw) ? (raw as { feeId?: unknown; amountMinor?: unknown }[]) : null;
    if (allocations && !allocations.every((a) => isUuid(a?.feeId) && typeof a?.amountMinor === 'number')) return ruleError(400, 'not_sent_properly');
    const result = await takePayment(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, scope: body.scope === 'family' ? 'family' : 'student', amountMinor: body.amountMinor, method, reference: typeof body.reference === 'string' ? body.reference : null, allocations: allocations as { feeId: string; amountMinor: number }[] | null, clientRef: (body.clientRef as string | undefined) ?? null });
    if (result.ok) return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'unknown_student' ? 404 : 400, 'the payment was not taken', { code: result.reason });
  });
}
