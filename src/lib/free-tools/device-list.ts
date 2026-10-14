import { browserStore, type KeyValueStore } from './school-profile';

// A tracker's list kept on this device, only when the school ticks "Keep on
// this device" (Decision Log C198-B). Lists of people are never kept by
// default: the tool works in the tab, and the school can save a CSV file.
// Each row is passed through the tool's own clean() so nothing unexpected
// read back from storage is ever trusted.

export const DEVICE_LIST_PREFIX = 'nca-free-tool-list:';
export const MAX_DEVICE_ROWS = 500;

const key = (slug: string) => `${DEVICE_LIST_PREFIX}${slug}`;

// The saved rows, or null when this device keeps nothing for the tool.
export function readDeviceList<T>(slug: string, clean: (row: unknown) => T | null, store: KeyValueStore | null = browserStore()): T[] | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .slice(0, MAX_DEVICE_ROWS)
      .map(clean)
      .filter((r): r is T => r !== null);
  } catch {
    return null;
  }
}

// Returns false when the browser refused (storage off or full).
export function writeDeviceList<T>(slug: string, rows: T[], store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(key(slug), JSON.stringify(rows.slice(0, MAX_DEVICE_ROWS)));
    return true;
  } catch {
    return false;
  }
}

export function forgetDeviceList(slug: string, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.removeItem(key(slug));
  } catch {
    // Nothing to forget.
  }
}
