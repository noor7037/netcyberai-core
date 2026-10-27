import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { BATCH_MAX, isCertificateType } from '@/lib/documents/certificate-rules';
import { isResultCertType } from '@/lib/documents/result-certificate-rules';
import { certificateRefusal } from '@/lib/documents/refusal';
import { certificateHome, certificateRegister, certificateRoster, certificatesToPrint, issueCertificates, markImages, storedReader } from '@/lib/documents/certificates';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { indiaDate } from '@/lib/time/india';

// Certificates from the student record (docs/28 row 10e, C228). The principal and the school admin only.
//   GET                               the classes, the school year printed, whether a seal is kept, whether this person
//                                     signs and keeps a signature (the principal: the school admins to name), which
//                                     types ask the fee clearance, the numbering and the next numbers, and what this
//                                     person may do (waive, withdraw, keep the seal)
//   GET ?view=roster&type=&classId=   the class's children for a type: owed, cleared, and any live certificate of it
//   GET ?view=register[&type=][&classId=]   the issue register, newest first
//   GET ?view=print&ids=a,b,c         the certificates as they print (in the order asked) with the seal and signature
//   POST { type, studentIds, typed, waivers }   issue one certificate per child; the held, duplicate and incomplete
//                                     children are listed, not issued. A waiver (the principal's) is { studentId: why }.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const q = req.nextUrl.searchParams;
    const headers = { 'Cache-Control': 'no-store' };
    const view = q.get('view');
    if (view === 'roster') {
      const type = q.get('type');
      const classId = q.get('classId');
      if (!isCertificateType(type) || !isUuid(classId)) return ruleError(400, 'not_sent_properly');
      const children = await certificateRoster(db, actor, classId, type);
      return children ? NextResponse.json({ children }, { headers }) : ruleError(403, 'not_allowed');
    }
    if (view === 'register') {
      const type = q.get('type');
      const classId = q.get('classId');
      if ((type !== null && !isCertificateType(type) && !isResultCertType(type)) || (classId !== null && !isUuid(classId))) return ruleError(400, 'not_sent_properly');
      const rows = await certificateRegister(db, actor, { type: type as never, classId });
      return rows ? NextResponse.json({ rows }, { headers }) : ruleError(403, 'not_allowed');
    }
    if (view === 'print') {
      const ids = (q.get('ids') ?? '').split(',').filter(Boolean);
      if (ids.length === 0 || ids.length > BATCH_MAX || !ids.every(isUuid)) return ruleError(400, 'not_sent_properly');
      const list = await certificatesToPrint(db, actor, ids);
      if (!list) return ruleError(403, 'not_allowed');
      // The seal, and on each certificate the signature the database chooses for it (its own signer's, or none).
      return NextResponse.json({ list, marks: await markImages(db, claims.schoolId, storedReader(supabaseFileStorage), list.map((c) => c.certificateId)) }, { headers });
    }
    if (view !== null) return ruleError(400, 'not_sent_properly');
    const home = await certificateHome(db, actor, indiaDate());
    return home ? NextResponse.json(home, { headers }) : ruleError(403, 'not_allowed');
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    if (!b || !isCertificateType(b.type) || !Array.isArray(b.studentIds) || b.studentIds.length > BATCH_MAX || !b.studentIds.every(isUuid) || !plain(b.typed) || (b.waivers !== undefined && !plain(b.waivers))) return ruleError(400, 'not_sent_properly');
    const made = await issueCertificates(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { type: b.type, studentIds: b.studentIds as string[], typed: b.typed, waivers: (b.waivers ?? {}) as Record<string, unknown> }, indiaDate());
    if (made.ok) return NextResponse.json(made, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return certificateRefusal(400, made.reason, { field: made.field ?? null });
  });
}
