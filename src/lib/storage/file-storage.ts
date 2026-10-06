// FileStorage (16 §3.2): where uploaded files live. Business code depends on
// this interface only; the Supabase bucket is today's implementation
// (supabase-file-storage.ts) and another store can replace it without
// touching a caller.
//
// Keys are built by the caller and always start with the school's id taken
// from a verified session ("<schoolId>/<area>/..."), never from client
// input. A file is only ever handed out as a short-lived signed link, after
// the caller has read its row under row level security.

export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  remove(key: string): Promise<void>;
}

export class FileStorageUnavailableError extends Error {
  constructor(message = 'file storage is not available') {
    super(message);
    this.name = 'FileStorageUnavailableError';
  }
}

// Keeps files in memory: for tests and previews without a bucket.
export class MemoryFileStorage implements FileStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async put(key: string, bytes: Uint8Array, contentType: string) {
    if (this.files.has(key)) throw new Error('a file already exists at this key');
    this.files.set(key, { bytes, contentType });
  }
  async signedUrl(key: string, ttlSeconds: number) {
    if (!this.files.has(key)) throw new Error('no file at this key');
    return `memory://${key}?ttl=${ttlSeconds}`;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

// What a file really is, from its first bytes (never from its name or the
// type the browser claims). Returns null for anything that is not one of
// the image types asked for.
export function sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}
