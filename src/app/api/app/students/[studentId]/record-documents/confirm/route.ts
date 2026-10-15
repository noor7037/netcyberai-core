import type { NextRequest } from 'next/server';
import { confirmUpload, readConfirm, recordSubject } from '@/lib/documents/record-document-routes';
import { appRouteAfter } from '@/lib/frameworks/route';

// POST { pendingId }: the file sent for a student's record after ../upload (C235-D2) is read back and checked (its real
// size, its first bytes, the Aadhaar check), then written as a new paper or version and audited, once. Anything wrong:
// the file is taken away and nothing is written. src/lib/documents/record-direct-upload.ts.
type Ctx = { params: { studentId: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const subject = recordSubject('student', params.studentId);
  return appRouteAfter(req, (claims) => readConfirm(req, claims, subject), (ctx) => confirmUpload(ctx, subject));
}
