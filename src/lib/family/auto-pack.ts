// Today's plan saved for offline by itself (C539). With Control's offline module on, the home screen quietly saves the
// packs of the chapters in today's plan, through the same download as "Save for offline" (PackButton), and only:
//   - online, with the data-saver off and the phone not asking to save data (the data-saver fetches nothing ahead);
//   - on Wi-Fi or a wired connection, where the phone says what it is on (navigator.connection.type); where it does not
//     say, only once the child has left the home screen idle for a while; never on mobile data or a 2G connection;
//   - at most AUTO_MAX chapters a day, each tried once a day, while the packs on the phone stay under AUTO_BUDGET_BYTES
//     and the browser's storage is under AUTO_STORAGE_SHARE used. A pack already saved is fetched again only when it
//     ends within AUTO_RENEW_MS.
// Pure here, safe for the phone.

export const AUTO_MAX = 3;
export const AUTO_BUDGET_BYTES = 12 * 1024 * 1024;
export const AUTO_RENEW_MS = 2 * 24 * 60 * 60 * 1000;
export const AUTO_STORAGE_SHARE = 0.8;
export const AUTO_IDLE_MS = 15_000;
export const AUTO_TRIED_KEY = 'ncf.offline.autoTried';

export type AutoNet = { online: boolean; saveData?: boolean; type?: string; effectiveType?: string };
export type AutoWhen = 'now' | 'idle' | 'never';

// When the home screen may save today's plan: at once (Wi-Fi, wired), once idle (the phone does not say), or never.
export function autoSaveWhen(net: AutoNet, dataSaverOn: boolean): AutoWhen {
  if (!net.online || dataSaverOn || net.saveData === true) return 'never';
  if (net.effectiveType === 'slow-2g' || net.effectiveType === '2g') return 'never';
  if (net.type === 'wifi' || net.type === 'ethernet') return 'now';
  if (net.type === undefined || net.type === '' || net.type === 'unknown') return 'idle';
  return 'never';
}

// A plan item's chapter: a topic's key is its chapter's key and ".t<n>".
export const chapterKeyOf = (topicKey: string) => topicKey.replace(/\.t\d+$/, '');

// The chapters to save now, in the plan's order (the ones still to do first): not saved (or ending soon), not tried
// today, while the phone's packs (`phoneBytes`, every child's) leave room, at most AUTO_MAX.
export function chaptersToSave(
  items: readonly { topicKey: string; done: boolean }[],
  saved: readonly { chapterKey: string; expiresAt: string }[],
  phoneBytes: number,
  tried: readonly string[],
  now: number
): string[] {
  if (phoneBytes >= AUTO_BUDGET_BYTES) return [];
  const ordered = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)].map((i) => chapterKeyOf(i.topicKey));
  const keep = (key: string) => {
    const have = saved.find((s) => s.chapterKey === key);
    return !have || Date.parse(have.expiresAt) - now <= AUTO_RENEW_MS;
  };
  return [...new Set(ordered)].filter((k) => k && !tried.includes(k) && keep(k)).slice(0, AUTO_MAX);
}

// The chapters already tried today for this child, from the phone's note ({ day, child, tried }); any other day's or
// child's note, or a broken one, is none.
export function triedToday(raw: string | null, day: string, childId: string): string[] {
  try {
    const v = raw ? (JSON.parse(raw) as { day?: unknown; child?: unknown; tried?: unknown }) : null;
    if (!v || v.day !== day || v.child !== childId || !Array.isArray(v.tried)) return [];
    return v.tried.filter((k): k is string => typeof k === 'string').slice(0, 50);
  } catch {
    return [];
  }
}

// Room in the browser's storage: under AUTO_STORAGE_SHARE used, or unknown (the estimate is missing).
export function storageRoom(usage: number | undefined, quota: number | undefined): boolean {
  if (!usage || !quota || quota <= 0) return true;
  return usage / quota < AUTO_STORAGE_SHARE;
}
