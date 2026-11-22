// A tap that moves to another Family screen shows at once (C539). Next.js keeps the old screen until the server has
// answered for the new one (its navigation runs in a React transition), so on a weak network a tap looked lost and was
// tapped again. The app's bar at the top shows from the tap until the new screen is there. Pure here, safe for the phone.

export const NAV_PENDING_MAX_MS = 12_000;

type Anchor = { href: string | null; target?: string | null; download?: boolean };
type Tap = { button: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };

// Does this tap on a link move this tab to another Family screen? Only a plain tap (main button, no key held) on a link
// that opens in this tab, is no download, and names another /family address on this site (not only another #part).
export function startsNavigation(a: Anchor, tap: Tap, here: string): boolean {
  if (!a.href || tap.button !== 0 || tap.metaKey || tap.ctrlKey || tap.shiftKey || tap.altKey) return false;
  if (a.download || (a.target && a.target !== '_self')) return false;
  let to: URL;
  let from: URL;
  try {
    from = new URL(here);
    to = new URL(a.href, from);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  if (!(to.pathname === '/family' || to.pathname.startsWith('/family/'))) return false;
  return to.pathname + to.search !== from.pathname + from.search;
}
