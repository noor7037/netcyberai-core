// How many pages of the site this tab has shown (W14-E), for the Back control: with at least two, the page before the
// current one is ours and the browser's Back returns to it. In sessionStorage, so it belongs to the tab; every read and
// write is guarded, because storage can be blocked or empty (a private window, cleared site data).
const KEY = 'ncai.nav';

type Saved = { depth: number; last: string };

function read(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    return typeof v.depth === 'number' && typeof v.last === 'string' ? { depth: v.depth, last: v.last } : null;
  } catch {
    return null;
  }
}

export function readNavDepth(): number {
  return read()?.depth ?? 1;
}

// A page was shown. `step` turns the old depth into the new one (nextDepth); the same page twice counts once.
export function noteNavPage(pathname: string, popped: boolean, step: (depth: number, popped: boolean) => number): void {
  try {
    const saved = read();
    if (saved?.last === pathname) return;
    const depth = saved ? step(saved.depth, popped) : 1;
    window.sessionStorage.setItem(KEY, JSON.stringify({ depth, last: pathname }));
  } catch {
    // nothing to keep: Back then goes to the parent level
  }
}
