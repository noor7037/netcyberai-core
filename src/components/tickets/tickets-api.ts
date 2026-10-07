import type { NewTicket, TicketDetail, TicketSide, TicketStatus, TicketSummary } from '@/lib/contracts/tickets';
import { explainError } from '@/lib/errors/catalogue';

// What the ticket screens need from the server (C126 APIs). The school
// screens and the founder's queue are the same components on two of these;
// previews and tests pass one that keeps everything in memory.
export type TicketRoutes = { list: string; raise?: string; detail: (ticketId: string) => string };

export type TicketsApi = {
  side: TicketSide;
  list(filters: { status?: TicketStatus | ''; schoolId?: string }): Promise<TicketSummary[]>;
  get(ticketId: string): Promise<TicketDetail>;
  raise?(input: NewTicket): Promise<TicketSummary>;
  reply(ticketId: string, body: string, thenStatus?: TicketStatus): Promise<void>;
  setStatus(ticketId: string, to: TicketStatus): Promise<void>;
  upload?(ticketId: string, file: File): Promise<void>;
  screenshotUrl(ticketId: string, attachmentId: string): Promise<string>;
};

async function call<T>(url: string, init: RequestInit | undefined, pick: string, fallback: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(explainError(body, fallback, 'en', r.status));
  return body[pick] as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function httpTicketsApi(side: TicketSide): TicketsApi {
  const base = side === 'school' ? '/api/app/tickets' : '/api/control/tickets';
  const api: TicketsApi = {
    side,
    list: ({ status, schoolId }) => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (schoolId) q.set('schoolId', schoolId);
      return call(`${base}${q.size ? `?${q}` : ''}`, undefined, 'tickets', 'Could not load the tickets.');
    },
    get: (id) => call(`${base}/${id}`, undefined, 'ticket', 'Could not load this ticket.'),
    reply: async (id, body, thenStatus) => {
      await call(`${base}/${id}/messages`, json({ body, ...(thenStatus ? { thenStatus } : {}) }), 'reply', 'The reply was not sent.');
    },
    setStatus: async (id, to) => {
      await call(`${base}/${id}/status`, json({ to }), 'ticket', 'The status was not changed.');
    },
    screenshotUrl: (id, attachmentId) => call(`${base}/${id}/attachments/${attachmentId}`, undefined, 'url', 'Could not open the screenshot.'),
  };
  if (side === 'school') {
    api.raise = (input) => call(base, json(input), 'ticket', 'The ticket was not raised.');
    api.upload = async (id, file) => {
      const form = new FormData();
      form.set('file', file);
      await call(`${base}/${id}/attachments`, { method: 'POST', body: form }, 'attachment', 'The screenshot was not added.');
    };
  }
  return api;
}
