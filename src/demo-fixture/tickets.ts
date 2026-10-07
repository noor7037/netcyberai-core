import type { TicketsApi } from '@/components/tickets/tickets-api';
import { canReply, canTransition, schoolMayMove, ticketRef, type TicketDetail, type TicketSide, type TicketStatus } from '@/lib/contracts/tickets';

// Illustrative, in-memory stand-in for the ticket APIs, for the development
// preview and tests only. One store behind both sides, so a ticket raised
// in the school preview shows in the Control preview, and the moves follow
// the same table as the real API (contracts/tickets.ts).

const SCHOOLS = { s1: 'Illustrative Public School', s2: 'Illustrative Academy' } as const;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

function seed(): TicketDetail[] {
  const base = (n: number, schoolId: keyof typeof SCHOOLS, status: TicketStatus, subject: string, body: string, extra: Partial<TicketDetail> = {}): TicketDetail => ({
    ticketId: id(n),
    ref: ticketRef(id(n)),
    schoolId,
    schoolName: SCHOOLS[schoolId],
    subject,
    body,
    category: 'not_working',
    moduleId: 'attendance',
    status,
    raisedBy: 'u1',
    raisedByName: 'Illustrative Teacher',
    raisedRole: 'teacher',
    createdAt: '2026-10-05T04:10:00.000Z',
    lastActivityAt: '2026-10-05T04:10:00.000Z',
    resolvedAt: null,
    closedAt: null,
    messages: [],
    attachments: [],
    ...extra,
  });
  return [
    base(4, 's1', 'waiting_on_school', 'Attendance for 5A will not save', 'When I mark attendance for class 5A and press Save, the page shows an error and the marks are gone.', {
      lastActivityAt: '2026-10-06T06:30:00.000Z',
      messages: [{ messageId: 'm1', side: 'platform', authorName: 'Illustrative Founder', body: 'Thank you. Which date were you marking, and does it happen for other classes too?', createdAt: '2026-10-06T06:30:00.000Z' }],
      attachments: [{ attachmentId: 'a1', fileName: 'attendance-error.png', mimeType: 'image/png', sizeBytes: 184_320, uploadedSide: 'school', createdAt: '2026-10-05T04:11:00.000Z' }],
    }),
    base(3, 's2', 'open', 'How do I add a second section to class 3?', 'We opened a new section this term and I cannot find where to add it.', { category: 'how_to', moduleId: 'setup', raisedByName: 'Illustrative Principal', raisedRole: 'principal', lastActivityAt: '2026-10-06T03:00:00.000Z' }),
    base(2, 's1', 'resolved', 'A student’s date of birth is wrong', 'The date of birth on one admission was typed wrongly and the office cannot change it.', {
      category: 'data_correction',
      moduleId: 'students',
      raisedByName: 'Illustrative Principal',
      raisedRole: 'principal',
      lastActivityAt: '2026-10-04T09:00:00.000Z',
      resolvedAt: '2026-10-04T09:00:00.000Z',
      messages: [
        { messageId: 'm2', side: 'platform', authorName: 'Illustrative Founder', body: 'The office can now edit it from the student’s profile. Please check.', createdAt: '2026-10-04T09:00:00.000Z' },
      ],
    }),
    base(1, 's1', 'closed', 'Cannot sign in on my phone', 'The code from the email is not accepted on my phone.', { category: 'sign_in', moduleId: null, lastActivityAt: '2026-10-02T09:00:00.000Z', resolvedAt: '2026-10-01T09:00:00.000Z', closedAt: '2026-10-02T09:00:00.000Z' }),
  ];
}

const store = { tickets: seed(), n: 10 };
// Tests start from the same four tickets every time.
export function resetTicketsPreview() {
  store.tickets = seed();
  store.n = 10;
}

export function createTicketsPreviewApi(side: TicketSide): TicketsApi {
  const mine = () => (side === 'school' ? store.tickets.filter((t) => t.schoolId === 's1') : store.tickets);
  const find = (ticketId: string) => {
    const t = mine().find((x) => x.ticketId === ticketId);
    if (!t) throw new Error('Ticket not found.');
    return t;
  };
  const touch = (t: TicketDetail) => (t.lastActivityAt = new Date().toISOString());
  const move = (t: TicketDetail, to: TicketStatus) => {
    t.status = to;
    t.resolvedAt = to === 'resolved' ? new Date().toISOString() : to === 'open' ? null : t.resolvedAt;
    t.closedAt = to === 'closed' ? new Date().toISOString() : to === 'open' ? null : t.closedAt;
    touch(t);
  };
  // A school sees NetCyberAI's replies without a person's name, as the real API answers.
  const view = (t: TicketDetail): TicketDetail => ({
    ...t,
    schoolName: side === 'platform' ? t.schoolName : undefined,
    messages: t.messages.map((m) => (side === 'school' && m.side === 'platform' ? { ...m, authorName: null } : m)),
    attachments: [...t.attachments],
  });

  return {
    side,
    async list({ status, schoolId }) {
      return mine()
        .filter((t) => (!status || t.status === status) && (!schoolId || t.schoolId === schoolId))
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .map(view);
    },
    async get(ticketId) {
      return view(find(ticketId));
    },
    async reply(ticketId, body, thenStatus) {
      const t = find(ticketId);
      if (!canReply(t.status)) throw new Error('Reopen the ticket to reply.');
      t.messages.push({ messageId: `m${store.n++}`, side, authorName: side === 'platform' ? 'Illustrative Founder' : 'Illustrative Teacher', body, createdAt: new Date().toISOString() });
      if (side === 'school' && t.status === 'waiting_on_school') move(t, 'in_progress');
      else if (side === 'platform' && thenStatus && thenStatus !== t.status && canTransition(t.status, thenStatus, 'platform')) move(t, thenStatus);
      else touch(t);
    },
    async setStatus(ticketId, to) {
      const t = find(ticketId);
      const ok = side === 'school' ? schoolMayMove(t.status, to) : canTransition(t.status, to, 'platform');
      if (!ok) throw new Error(`A ticket that is ${t.status.replace(/_/g, ' ')} cannot be set to ${to.replace(/_/g, ' ')}.`);
      move(t, to);
    },
    async screenshotUrl() {
      return PIXEL;
    },
    ...(side === 'school'
      ? {
          async raise(input) {
            const n = store.n++;
            const t: TicketDetail = {
              ticketId: id(n),
              ref: ticketRef(id(n)),
              schoolId: 's1',
              schoolName: SCHOOLS.s1,
              subject: input.subject,
              body: input.body,
              category: input.category,
              moduleId: input.moduleId ?? null,
              status: 'open',
              raisedBy: 'u1',
              raisedByName: 'Illustrative Teacher',
              raisedRole: 'teacher',
              createdAt: new Date().toISOString(),
              lastActivityAt: new Date().toISOString(),
              resolvedAt: null,
              closedAt: null,
              messages: [],
              attachments: [],
            };
            store.tickets.unshift(t);
            return view(t);
          },
          async upload(ticketId: string, file: File) {
            const t = find(ticketId);
            t.attachments.push({ attachmentId: `a${store.n++}`, fileName: file.name, mimeType: 'image/png', sizeBytes: file.size, uploadedSide: 'school', createdAt: new Date().toISOString() });
            touch(t);
          },
        }
      : {}),
  };
}
