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

// A file the browser sends straight to the store (C235-D2), never through the app's server. The server still decides
// everything: it chooses a pending key, gives a link that takes one file at that key only (never overwriting one),
// reads what arrived (its size and type first, then its bytes), and only then moves it to the key a row refers to.
// What is left under a pending prefix was never confirmed, and is removed once old enough.
export type StoredFileInfo = { sizeBytes: number; contentType: string | null };
export interface DirectUploadStorage extends FileStorage {
  signedUploadUrl(key: string): Promise<string>;
  stat(key: string): Promise<StoredFileInfo | null>;
  get(key: string): Promise<Uint8Array | null>;
  move(from: string, to: string): Promise<void>;
  // Removes the files directly under `prefix` (a folder, ending in "/") stored before `before`; how many it removed.
  removeOlderThan(prefix: string, before: Date): Promise<number>;
}

export class FileStorageUnavailableError extends Error {
  constructor(message = 'file storage is not available') {
    super(message);
    this.name = 'FileStorageUnavailableError';
  }
}

// Keeps files in memory: for tests and previews without a bucket.
export class MemoryFileStorage implements DirectUploadStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  // When each file was stored (milliseconds), and an upload link's token → the one key it may write.
  readonly storedAt = new Map<string, number>();
  readonly uploadLinks = new Map<string, string>();
  async put(key: string, bytes: Uint8Array, contentType: string) {
    if (this.files.has(key)) throw new Error('a file already exists at this key');
    this.files.set(key, { bytes, contentType });
    this.storedAt.set(key, Date.now());
  }
  async move(from: string, to: string) {
    const f = this.files.get(from);
    if (!f) throw new Error('no file at this key');
    if (this.files.has(to)) throw new Error('a file already exists at this key');
    this.files.set(to, f);
    this.storedAt.set(to, this.storedAt.get(from) ?? Date.now());
    this.files.delete(from);
    this.storedAt.delete(from);
  }
  async removeOlderThan(prefix: string, before: Date) {
    let removed = 0;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/') && (this.storedAt.get(key) ?? 0) < before.getTime()) {
        await this.remove(key);
        removed += 1;
      }
    }
    return removed;
  }
  async signedUploadUrl(key: string) {
    const token = crypto.randomUUID();
    this.uploadLinks.set(token, key);
    return `memory-upload://${key}?token=${token}`;
  }
  // What a browser's PUT to an upload link does: the file lands at the link's own key, once, never over another.
  async receive(url: string, bytes: Uint8Array, contentType: string) {
    const key = this.uploadLinks.get(new URL(url).searchParams.get('token') ?? '');
    if (!key) throw new Error('not an upload link');
    await this.put(key, bytes, contentType);
  }
  async stat(key: string) {
    const f = this.files.get(key);
    return f ? { sizeBytes: f.bytes.length, contentType: f.contentType } : null;
  }
  async get(key: string) {
    return this.files.get(key)?.bytes ?? null;
  }
  async signedUrl(key: string, ttlSeconds: number) {
    if (!this.files.has(key)) throw new Error('no file at this key');
    return `memory://${key}?ttl=${ttlSeconds}`;
  }
  async remove(key: string) {
    this.files.delete(key);
    this.storedAt.delete(key);
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
