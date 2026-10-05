import { hasServiceRoleKey } from '@/lib/auth/env';
import { newAuthAdminClient } from '@/lib/auth/supabase';
import { FileStorageUnavailableError, type FileStorage } from './file-storage';

// FileStorage on the private Supabase `documents` bucket (the bucket the
// document capture already uses; keys are prefixed by school). One of the
// allowlisted callers of the service-role client
// (scripts/check_service_role.py): nothing else reaches the bucket.

const BUCKET = 'documents';

function client() {
  // The storage credential is not configured on this deployment.
  if (!hasServiceRoleKey()) throw new FileStorageUnavailableError();
  return newAuthAdminClient();
}

export const supabaseFileStorage: FileStorage = {
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
};
