import { serviceRoleKeyShape, type ServiceKeyShape } from '@/lib/auth/env';
import { probeFileStorage } from '@/lib/storage/supabase-file-storage';

// Whether file storage works on this deployment (C236). From 7 Oct production's server key belonged to the other
// Supabase project, so every upload and every login invite failed and no screen said so. Now /api/health reports it
// and Control and the school office see a red line until it is fixed.
//
//   ok            -- the store listed the documents bucket with this deployment's key;
//   missing       -- the key is not set;
//   other_project -- the key is a JWT for another Supabase project (read from the key itself, no call made);
//   refused       -- the key is not a server key, or the store refused the listing or did not answer in 3 s.
//
// One answer is kept for 5 minutes on each server instance, so a page asks the store at most once in that time. The
// answer is one of these four words: never the key, a part of it, or what the store said.

export type StorageHealth = 'ok' | 'missing' | 'other_project' | 'refused';
export const STORAGE_HEALTH_STATES: readonly StorageHealth[] = ['ok', 'missing', 'other_project', 'refused'];
export const STORAGE_CHECK_TIMEOUT_MS = 3000;
export const STORAGE_CHECK_KEEP_MS = 5 * 60 * 1000;

export type StorageProbe = { keyShape: () => ServiceKeyShape; list: () => Promise<void>; now: () => number; timeoutMs?: number };

const production: StorageProbe = { keyShape: serviceRoleKeyShape, list: probeFileStorage, now: () => Date.now() };

export async function checkStorage(probe: StorageProbe): Promise<StorageHealth> {
  let shape: ServiceKeyShape;
  try {
    shape = probe.keyShape();
  } catch {
    return 'refused';
  }
  if (shape === 'missing' || shape === 'other_project') return shape;
  if (shape === 'not_service_role') return 'refused';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe.list(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), probe.timeoutMs ?? STORAGE_CHECK_TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'refused';
  } finally {
    clearTimeout(timer);
  }
}

// The kept answer (a promise, so callers at the same moment share one listing), and the probe that gave it: another
// probe asks for itself. checkStorage never rejects.
let kept: { probe: StorageProbe; at: number; answer: Promise<StorageHealth> } | null = null;

export function storageHealth(probe: StorageProbe = production): Promise<StorageHealth> {
  const now = probe.now();
  if (kept && kept.probe === probe && now >= kept.at && now - kept.at < STORAGE_CHECK_KEEP_MS) return kept.answer;
  const answer = checkStorage(probe);
  kept = { probe, at: now, answer };
  return answer;
}

// For tests: the next call asks again.
export function forgetStorageHealth(): void {
  kept = null;
}
