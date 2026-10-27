import { hasServiceRoleKey } from '@/lib/auth/env';
import { newAuthAdminClient } from '@/lib/auth/supabase';
import { FileStorageUnavailableError, type DirectUploadStorage } from './file-storage';

// FileStorage on the private Supabase `documents` bucket (the bucket the
// document capture already uses; keys are prefixed by school). One of the
// allowlisted callers of the service-role client
// (scripts/check_service_role.py): nothing else reaches the bucket.
//
// Direct uploads (C235-D2): an upload link is Supabase's signed upload URL
// for one key, made without upsert, so it can never replace a file that is
// already there (Supabase keeps such a link valid for two hours, which the
// app cannot shorten; the app's own ticket stops after ten minutes). The
// bucket's own limits (size, and the four types it takes) still apply to
// what the browser sends to it.

function client() {
  // The storage credential is not configured on this deployment.
  if (!hasServiceRoleKey()) throw new FileStorageUnavailableError();
  return newAuthAdminClient();
}

// Whether the store takes this deployment's key (C236): one listing of at most one item at the bucket's root. Throws
// when it does not. What the store said is never passed on: an error can describe the key.
export async function probeFileStorage(): Promise<void> {
  let refused: boolean;
  try {
    refused = !!(await client().storage.from('documents').list('', { limit: 1 })).error;
  } catch {
    refused = true;
  }
  if (refused) throw new FileStorageUnavailableError('the file store refused the listing');
}

// One private bucket's store. S2 (C375): the Family app's tutor files live in their own private bucket, `family-tutor`
// (supabase/migrations/20261027210308_s2_tutor.sql), reached only through src/lib/family/tutor-files.ts.
function bucketStorage(BUCKET: 'documents' | 'family-tutor'): DirectUploadStorage {
  return {
    async put(key, bytes, contentType) {
      const { error } = await client().storage.from(BUCKET).upload(key, Buffer.from(bytes), { contentType, upsert: false });
      if (error) throw new Error(`file upload failed: ${error.message}`);
    },
    async signedUrl(key, ttlSeconds) {
      const { data, error } = await client().storage.from(BUCKET).createSignedUrl(key, ttlSeconds);
      if (error || !data) throw new Error(`could not create a signed link: ${error?.message ?? 'unknown error'}`);
      return data.signedUrl;
    },
    async remove(key) {
      const { error } = await client().storage.from(BUCKET).remove([key]);
      if (error) throw new Error(`file delete failed: ${error.message}`);
    },
    async signedUploadUrl(key) {
      const { data, error } = await client().storage.from(BUCKET).createSignedUploadUrl(key, { upsert: false });
      if (error || !data) throw new FileStorageUnavailableError(`could not create an upload link: ${error?.message ?? 'unknown error'}`);
      return data.signedUrl;
    },
    // A file's size and type as the store recorded them, from its folder's listing (the listing call every version of
    // the bucket's API has), or null when nothing is at the key.
    async stat(key) {
      const slash = key.lastIndexOf('/');
      const name = key.slice(slash + 1);
      const { data, error } = await client().storage.from(BUCKET).list(key.slice(0, slash), { search: name, limit: 10 });
      if (error) throw new FileStorageUnavailableError(`could not read a file's details: ${error.message}`);
      const found = (data ?? []).find((f) => f.name === name && f.id);
      if (!found) return null;
      const size = Number(found.metadata?.size);
      if (!Number.isFinite(size) || size < 0) throw new FileStorageUnavailableError('the file store did not say the file’s size');
      return { sizeBytes: size, contentType: typeof found.metadata?.mimetype === 'string' ? found.metadata.mimetype : null };
    },
    async get(key) {
      const { data, error } = await client().storage.from(BUCKET).download(key);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    // Inside the bucket, by the store itself: nothing is downloaded, and the type it recorded goes with the file.
    async move(from, to) {
      const { error } = await client().storage.from(BUCKET).move(from, to);
      if (error) throw new FileStorageUnavailableError(`could not move a file: ${error.message}`);
    },
    // The oldest first, at most 100 a call: a sweep that runs again finds the rest.
    async removeOlderThan(prefix, before) {
      const { data, error } = await client().storage.from(BUCKET).list(prefix.replace(/\/$/, ''), { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
      if (error) throw new FileStorageUnavailableError(`could not list files: ${error.message}`);
      const old = (data ?? []).filter((f) => f.id && f.created_at && Date.parse(f.created_at) < before.getTime()).map((f) => `${prefix}${f.name}`);
      if (!old.length) return 0;
      const gone = await client().storage.from(BUCKET).remove(old);
      if (gone.error) throw new FileStorageUnavailableError(`could not remove files: ${gone.error.message}`);
      return old.length;
    },
  };
}

export const supabaseFileStorage: DirectUploadStorage = bucketStorage('documents');
export const familyTutorFileStorage: DirectUploadStorage = bucketStorage('family-tutor');
