import type { NextRequest } from 'next/server';
import { paperLink, recordSubject } from '@/lib/documents/record-document-routes';
import { appRoute } from '@/lib/frameworks/route';

// GET: a link to one version of a paper on a student's record that works for five minutes (C235-D). Each link given
// out is in the audit log.
type Ctx = { params: { studentId: string; documentId: string; versionId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => paperLink(ctx, recordSubject('student', params.studentId), params.documentId, params.versionId));
}
