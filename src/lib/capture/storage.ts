import { newAuthAdminClient } from '@/lib/auth/supabase';

const BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 10 * 60; // "signed, time-limited" per PRD Sec6.1 -- 10 minutes is enough for one review-form load

// The only module that talks to the `documents` Storage bucket, same
// choke-point discipline as src/lib/auth/db.ts for Postgres session
// state: nothing else imports the service-role client for storage, and
// every path this module builds is prefixed with a schoolId the CALLER
// must have already derived from a verified session (never accepted
// here as opaque client input) -- see buildObjectPath's own comment.
//
// Guardian-ID (Aadhaar) documents never reach this module at all --
// PRD Sec6.1's constraint is "discard the image after extraction," and
// the only way this code can honestly guarantee that is to never call
// upload() for that doc_type in the first place. See
// src/lib/capture/ocr.ts and the upload route for where that branch
// happens.
export function buildObjectPath(schoolId: string, studentId: string, docType: string, extension: string): string {
  const uuid = crypto.randomUUID();
  return `${schoolId}/documents/${studentId}/${docType}/${uuid}.${extension}`;
}

export async function uploadDocument(path: string, bytes: Buffer, mimeType: string): Promise<void> {
  const client = newAuthAdminClient();
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false, // every path has a fresh uuid -- a collision means something is wrong, not something to overwrite silently
  });
  if (error) {
    throw new Error(`storage upload failed: ${error.message}`);
  }
}

export async function signedDocumentUrl(path: string): Promise<string> {
  const client = newAuthAdminClient();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`could not create signed URL: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}
