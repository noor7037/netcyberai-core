// The template outlines kept on the phone for offline use (C514). The Family app has no service worker (public/sw.js
// serves the school app only), so the page keeps the outlines itself in Cache Storage: when the Draw tab or a lesson
// opens online, the outlines of the child's class are fetched once and kept; opening a template reads the kept copy
// first, then the network. The manifest (titles, tasks, labels, colours) is code in the app's own script, so it is there
// whenever the app is. Storage may be missing or blocked (a private window): every call then does nothing.
import { templateSrc } from '@/lib/family/draw-template-entry';

const CACHE = 'ncf-draw-templates-v1';

const hasCaches = () => typeof caches !== 'undefined';

export async function keepForOffline(ids: readonly string[]): Promise<void> {
  try {
    if (!hasCaches() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    const cache = await caches.open(CACHE);
    for (const id of ids) {
      const url = templateSrc(id);
      if (await cache.match(url)) continue;
      await cache.add(url).catch(() => undefined);
    }
  } catch {
    // Nothing kept; the outlines still open online.
  }
}

// The outline's SVG text, or null when it cannot be had (offline and never kept).
export async function outlineOf(id: string): Promise<string | null> {
  const url = templateSrc(id);
  try {
    if (hasCaches()) {
      const kept = await (await caches.open(CACHE)).match(url);
      if (kept) return await kept.text();
    }
  } catch {
    // Fall through to the network.
  }
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const text = await res.clone().text();
    if (hasCaches()) await (await caches.open(CACHE)).put(url, res).catch(() => undefined);
    return text;
  } catch {
    return null;
  }
}
