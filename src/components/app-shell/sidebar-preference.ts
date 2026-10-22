// Whether this person has hidden the sidebar on this device (F1-2). The choice is kept in the browser's own store, on
// this device only. A store that is missing, blocked, full or holding anything else means "shown": the shell renders
// correctly with no store at all, and a failed read or write never reaches the person.

export const SIDEBAR_KEY = 'nca.shell.sidebar';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStore(): Store | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSidebarHidden(store: Store | null = browserStore()): boolean {
  try {
    return store?.getItem(SIDEBAR_KEY) === 'hidden';
  } catch {
    return false;
  }
}

// "Shown" is the default, so showing the sidebar again clears the key instead of storing a second word.
export function writeSidebarHidden(hidden: boolean, store: Store | null = browserStore()): void {
  try {
    if (hidden) store?.setItem(SIDEBAR_KEY, 'hidden');
    else store?.removeItem(SIDEBAR_KEY);
  } catch {
    // Not kept this time; the sidebar is still hidden or shown for this visit.
  }
}
