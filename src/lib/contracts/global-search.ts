import type { TicketStatus } from './tickets';

// Global search (docs/19 rule 6, C135): one box in the shell that finds a
// student, a staff member or a ticket in two seconds. Each kind is searched
// only when the person's role may use its module and the school has it
// switched on; what is found inside a kind is decided by the database's
// row-level security, never by this API. Control has the same box over
// schools, people and tickets.

export const GLOBAL_SEARCH_KINDS = ['student', 'staff', 'ticket', 'school', 'user'] as const;
export type GlobalSearchKind = (typeof GLOBAL_SEARCH_KINDS)[number];

// What a result says under its title. The screen puts it into the person's
// language; the server sends facts, not sentences.
export type GlobalSearchDetail =
  | { kind: 'student'; className: string | null; admissionNo: string | null; rollNo: string | null; guardianPhoneLast4?: string }
  | { kind: 'staff'; role: string; active: boolean }
  | { kind: 'ticket'; ref: string; status: TicketStatus; schoolName?: string }
  | { kind: 'school'; testFixture: boolean }
  | { kind: 'user'; role: string; email: string | null; schoolName: string | null };

export type GlobalSearchResult = {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  href: string;
  detail: GlobalSearchDetail;
};

export type GlobalSearchResponse = {
  results: readonly GlobalSearchResult[];
  tookMs: number; // server time, for the two-second budget
};

export const GLOBAL_SEARCH_MIN_CHARS = 2;
export const GLOBAL_SEARCH_PER_KIND = 6;
// The budget of docs/19 rule 6, measured at the 95th percentile.
export const GLOBAL_SEARCH_BUDGET_MS = 2000;
