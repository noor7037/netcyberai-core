// Lists the "Register your school" form shows (C98). No server-only
// imports: the form, a client component, uses them too.

// ISO 3166-2:IN codes: schools.jurisdiction takes the same format. One list for the platform (src/lib/contracts).
export { INDIAN_STATES } from '@/lib/contracts/indian-states';

export const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'] as const;
export type Board = (typeof BOARDS)[number];
export const BOARD_LABELS: Record<Board, string> = { CBSE: 'CBSE', ICSE: 'ICSE / ISC', STATE: 'State board', IB: 'IB', OTHER: 'Other' };

