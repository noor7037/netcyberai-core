// Raise Ticket (17 §3 row 33, PR-4): a school asks NetCyberAI for help; the
// founder answers from a queue in Control. The status is an explicit state
// machine (16 §3.1): the table below is the only list of moves, used by the
// API, the screens and (mirrored) by a trigger in the database.

export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_on_school', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Who is acting: someone at the school, or NetCyberAI (the founder, in Control).
export type TicketSide = 'school' | 'platform';

export const TICKET_CATEGORIES = ['not_working', 'how_to', 'data_correction', 'sign_in', 'billing', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  not_working: 'Something is not working',
  how_to: 'How do I…?',
  data_correction: 'Data needs correcting',
  sign_in: 'Sign-in or access',
  billing: 'Plan or billing',
  other: 'Something else',
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_school: 'Waiting on school',
  resolved: 'Resolved',
  closed: 'Closed',
};

// from → to → who may make the move. Reopen is resolved → open and
// closed → open. A school's reply to a ticket that is waiting on it moves
// the ticket back to in progress. That move is made by replying only:
// a school cannot set it without answering (schoolMayMove).
export const TICKET_TRANSITIONS: Record<TicketStatus, Partial<Record<TicketStatus, readonly TicketSide[]>>> = {
  open: { in_progress: ['platform'], waiting_on_school: ['platform'], resolved: ['platform'] },
  in_progress: { waiting_on_school: ['platform'], resolved: ['platform'] },
  waiting_on_school: { in_progress: ['platform', 'school'], resolved: ['platform'] },
  resolved: { closed: ['platform', 'school'], open: ['platform', 'school'] },
  closed: { open: ['platform', 'school'] },
};

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === 'string' && (TICKET_STATUSES as readonly string[]).includes(v);
}

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === 'string' && (TICKET_CATEGORIES as readonly string[]).includes(v);
}

export function canTransition(from: TicketStatus, to: TicketStatus, side: TicketSide): boolean {
  return TICKET_TRANSITIONS[from][to]?.includes(side) ?? false;
}

// What a school may ask for directly: confirm closed, or reopen.
export function schoolMayMove(from: TicketStatus, to: TicketStatus): boolean {
  return canTransition(from, to, 'school') && !(from === 'waiting_on_school' && to === 'in_progress');
}

// The moves this side may make from a status, in the table's order.
export function nextStatuses(from: TicketStatus, side: TicketSide): TicketStatus[] {
  return (Object.keys(TICKET_TRANSITIONS[from]) as TicketStatus[]).filter((to) => (side === 'school' ? schoolMayMove(from, to) : canTransition(from, to, side)));
}

// A reply is possible while the ticket is being worked on; a resolved or
// closed ticket is reopened first.
export function canReply(status: TicketStatus): boolean {
  return status === 'open' || status === 'in_progress' || status === 'waiting_on_school';
}

// Screenshots: images only, checked by content, not by the file's name.
export const TICKET_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type TicketScreenshotType = (typeof TICKET_SCREENSHOT_TYPES)[number];
// 4 MB: under the host's request limit, so the app's own message is what people see.
export const TICKET_SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;
export const TICKET_SCREENSHOTS_PER_TICKET = 5;

export const TICKET_LIMITS = { subject: [3, 150], body: [10, 5000], message: [1, 5000] } as const;

// The short reference people quote: "T-1A2B3C4D".
export function ticketRef(ticketId: string): string {
  return `T-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export type TicketSummary = {
  ticketId: string;
  ref: string;
  schoolId: string;
  schoolName?: string; // Control only
  subject: string;
  category: TicketCategory;
  moduleId: string | null;
  status: TicketStatus;
  raisedBy: string;
  raisedByName: string | null;
  raisedRole: string;
  createdAt: string;
  lastActivityAt: string;
};

export type TicketMessage = {
  messageId: string;
  side: TicketSide;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type TicketAttachment = {
  attachmentId: string;
  fileName: string;
  mimeType: TicketScreenshotType;
  sizeBytes: number;
  uploadedSide: TicketSide;
  createdAt: string;
};

export type TicketDetail = TicketSummary & {
  body: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
};

export type NewTicket = { subject: string; body: string; category: TicketCategory; moduleId?: string | null };
