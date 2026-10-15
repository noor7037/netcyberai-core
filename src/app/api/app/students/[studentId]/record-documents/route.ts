import type { NextRequest } from 'next/server';
import { addPaper, listPapers, readNewPaper, recordSubject } from '@/lib/documents/record-document-routes';
import { appRoute, appRouteAfter } from '@/lib/frameworks/route';

// The papers on a student's record (C235-D): GET lists them with every version; POST adds one (multipart: file, kind,
// title). Not the scan that fills in the record (../documents, the OCR capture). Who may do what:
// src/lib/documents/record-documents.ts.
type Ctx = { params: { studentId: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => listPapers(ctx, recordSubject('student', params.studentId)));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const subject = recordSubject('student', params.studentId);
  return appRouteAfter(req, (claims) => readNewPaper(req, claims, subject), (ctx) => addPaper(ctx, subject));
}
