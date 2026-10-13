import type { ModuleId, SchoolRole } from './modules';

// "My Day" (docs/19 rule 2, C136): the home a person lands on, with today's
// work first and one tap to each. Every module contributes its own "today"
// cards through this one contract; the home never keeps a list of its own.
//
// A card carries facts, never sentences and never an invented number:
// `count` and `total` are computed from the school's own records, under the
// person's own row-level security. The screen says them in the person's
// language (message keys `today.<type>.<state>…`). A provider with nothing
// to say returns no card; a home with no card shows an honest empty state.

export const TODAY_CARD_TYPES = ['attendance-class', 'attendance-school', 'attendance-requests', 'followups-open', 'homework-to-check', 'consent-waiting', 'fees-due-today', 'fees-overdue', 'payments-to-verify', 'promises-due', 'replies-waiting', 'complaints-overdue', 'tickets-waiting', 'messages-held', 'timetable-today'] as const;
export type TodayCardType = (typeof TODAY_CARD_TYPES)[number];

export type TodayCard = {
  // Unique on the page: the type, plus what it is about when there are several.
  id: string;
  type: TodayCardType;
  moduleId: ModuleId;
  // todo: work is waiting. done: today's work of this kind is finished.
  state: 'todo' | 'done';
  // How many are waiting (todo) or were done (done). Computed.
  count: number;
  // Out of how many, where that is known (students in a class).
  total?: number;
  // A name the card is about (a class), shown as it is: a name, not words.
  subject?: string;
  // One tap opens the place where the work is done.
  href: string;
};

// What a provider is told about the person.
// `sunday`: today is a Sunday in India (worked out once for all providers).
export type TodayContext = { schoolId: string; userId: string; role: SchoolRole; sunday: boolean };

// A minimal SQL client: the caller's own tenant-context transaction.
export type TodaySql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type TodayProvider = {
  type: TodayCardType;
  // The module the card belongs to: switched off, the card is not computed
  // and does not appear (docs/19 rule 7).
  moduleId: ModuleId;
  // Whose day this is part of.
  roles: readonly SchoolRole[];
  load: (db: TodaySql, ctx: TodayContext) => Promise<TodayCard[]>;
};

export type MyDay = {
  // Waiting first, in the providers' order; then what is done.
  cards: TodayCard[];
  // How many cards are waiting: "3 things need you today".
  waiting: number;
};

export function arrangeMyDay(cards: readonly TodayCard[]): MyDay {
  const todo = cards.filter((c) => c.state === 'todo');
  return { cards: [...todo, ...cards.filter((c) => c.state === 'done')], waiting: todo.length };
}
