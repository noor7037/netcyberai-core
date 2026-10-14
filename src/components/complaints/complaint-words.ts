import type { MessageKey } from '@/lib/i18n';

// Who a complaint is from, as both lists of the Complaints screen write it: the rows a dashboard number opens
// (ComplaintsShown, drawn on the server) and the screen's own list below them (ComplaintsView, in the browser).
//
// A name is the reader's to read or it is not: row level security decides. A teacher is given a complaint she
// owns whatever class the child is in, and the guardians and children of her own classes only. So a complaint
// the office gave her about a child of another class comes back with no guardian and no child. It is still hers
// to read, note and close, and it says so in plain words instead of an empty name. The office reads every
// guardian, so it never sees these words.
type Say = (key: MessageKey, params?: Record<string, string | number>) => string;

export function complaintFrom(say: Say, c: { guardian: string | null; child: string | null }): string {
  const guardian = c.guardian ?? say('cmp.guardianElsewhere');
  return c.child ? say('cmp.fromAbout', { guardian, child: c.child }) : guardian;
}
