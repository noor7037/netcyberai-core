import type { NextRequest } from 'next/server';
import { paperLink, recordSubject } from '@/lib/documents/record-document-routes';
import { appRoute } from '@/lib/frameworks/route';

// GET: a link to one version of a paper on a member of staff's record that works for five minutes (C235-D). Each
// link given out is in the audit log.
type Ctx = { params: { staffId: string; documentId: string; versionId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => paperLink(ctx, recordSubject('staff', params.staffId), params.documentId, params.versionId));
}
