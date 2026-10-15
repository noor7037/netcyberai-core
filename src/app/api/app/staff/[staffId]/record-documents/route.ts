import type { NextRequest } from 'next/server';
import { addPaper, listPapers, readNewPaper, recordSubject } from '@/lib/documents/record-document-routes';
import { appRoute, appRouteAfter } from '@/lib/frameworks/route';

// The papers on a member of staff's record (C235-D): GET lists them with every version; POST adds one (multipart:
// file, kind, title). Who may do what: src/lib/documents/record-documents.ts.
type Ctx = { params: { staffId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => listPapers(ctx, recordSubject('staff', params.staffId)));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const subject = recordSubject('staff', params.staffId);
  return appRouteAfter(req, (claims) => readNewPaper(req, claims, subject), (ctx) => addPaper(ctx, subject));
}
