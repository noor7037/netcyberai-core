import type { NextRequest } from 'next/server';
import { askUpload, recordSubject } from '@/lib/documents/record-document-routes';
import { appRoute } from '@/lib/frameworks/route';

// POST: asks to send a paper for a student's record straight to the file store (C235-D2), as JSON { kind, title } for
// a new paper or { documentId } for a new version, with { fileName, sizeBytes, mimeType }. The same checks as an
// upload; answers with a link for the one file and a sealed ticket that works for ten minutes. Nothing is written yet.
// src/lib/documents/record-direct-upload.ts.
type Ctx = { params: { studentId: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  return appRoute(req, (ctx) => askUpload(ctx, req, recordSubject('student', params.studentId)));
}
