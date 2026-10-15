import type { NextRequest } from 'next/server';
import { addVersion, readNewVersion, recordSubject, removePaper } from '@/lib/documents/record-document-routes';
import { appRoute, appRouteAfter } from '@/lib/frameworks/route';

// One paper on a student's record (C235-D): POST uploads a new version of it (multipart: file), keeping the earlier
// ones; DELETE removes it with all its versions.
type Ctx = { params: { studentId: string; documentId: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const subject = recordSubject('student', params.studentId);
  return appRouteAfter(req, (claims) => readNewVersion(req, claims, subject, params.documentId), (ctx) => addVersion(ctx, subject, params.documentId));
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => removePaper(ctx, recordSubject('student', params.studentId), params.documentId));
}
