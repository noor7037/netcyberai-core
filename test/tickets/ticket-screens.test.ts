import { beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RaiseTicketForm } from '@/components/tickets/RaiseTicketForm';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketList } from '@/components/tickets/TicketList';
import { moveLabel, screenshotProblem, TICKET_STATUS_HELP, TICKET_STATUS_TONE } from '@/components/tickets/ticket-ui';
import type { TicketRoutes } from '@/components/tickets/tickets-api';
import { createTicketsPreviewApi, resetTicketsPreview } from '@/demo-fixture/tickets';
import { nextStatuses, TICKET_STATUSES, type TicketDetail as Ticket } from '@/lib/contracts/tickets';

// The ticket screens (C128), rendered on the in-memory stand-in for the
// APIs: what each side sees and may do in every status.

const routes: TicketRoutes = { list: '/t', raise: '/t/new', detail: (id) => `/t/${id}` };
const school = createTicketsPreviewApi('school');
const platform = createTicketsPreviewApi('platform');
beforeEach(resetTicketsPreview);

const WAITING = '00000004-0000-4000-8000-000000000000';
const RESOLVED = '00000002-0000-4000-8000-000000000000';
const CLOSED = '00000001-0000-4000-8000-000000000000';
const detail = async (side: 'school' | 'platform', id: string, patch: Partial<Ticket> = {}) => {
  const api = side === 'school' ? school : platform;
  return renderToStaticMarkup(h(TicketDetail, { api, routes, ticketId: id, initial: { ...(await api.get(id)), ...patch } }));
};

describe('ticket list', () => {
  it('a school sees its own tickets with status, subject and reference, and a button to raise one', async () => {
    const html = renderToStaticMarkup(h(TicketList, { api: school, routes, initial: await school.list({}) }));
    expect(html).toContain('Attendance for 5A will not save');
    expect(html).toContain('T-00000004');
    expect(html).toContain('Waiting on school');
    expect(html).toContain('href="/t/00000004-0000-4000-8000-000000000000"');
    expect(html).toContain('href="/t/new"');
    expect(html).not.toContain('Illustrative Academy'); // another school's ticket
    expect(html).not.toContain('>School<'); // no school column or filter for a school
  });

  it('the founder sees every school’s tickets with the school’s name, a school filter and no raise button', async () => {
    const html = renderToStaticMarkup(h(TicketList, { api: platform, routes: { list: '/q', detail: (id) => `/q/${id}` }, initial: await platform.list({}) }));
    expect(html).toContain('Illustrative Academy');
    expect(html).toContain('Illustrative Public School');
    expect(html).toContain('All schools');
    expect(html).toContain('All statuses');
    expect(html).not.toContain('Raise a ticket');
  });

  it('says what to do when there are none', () => {
    expect(renderToStaticMarkup(h(TicketList, { api: school, routes, initial: [] }))).toContain('raise a ticket and NetCyberAI will answer here');
    expect(renderToStaticMarkup(h(TicketList, { api: platform, routes, initial: [] }))).toContain('you get an email');
  });
});

describe('one ticket', () => {
  it('a school waiting ticket: the question, a reply box, no status buttons, and NetCyberAI without a person’s name', async () => {
    const html = await detail('school', WAITING);
    expect(html).toContain('NetCyberAI asked a question. Reply below so work can continue.');
    expect(html).toContain('Which date were you marking');
    expect(html).toContain('NetCyberAI support');
    expect(html).not.toContain('Illustrative Founder');
    expect(html).toContain('Your reply');
    expect(html).toContain('Send reply');
    expect(html).not.toContain('aria-label="Change status"');
    expect(html).not.toContain('After sending, set the status to');
    expect(html).toContain('aria-label="View attendance-error.png"');
    expect(html).toContain('Add a screenshot');
  });

  it('the founder on the same ticket: the school’s name, who answered, the moves, and a status with the reply', async () => {
    const html = await detail('platform', WAITING);
    expect(html).toContain('Illustrative Public School');
    expect(html).toContain('Illustrative Founder · NetCyberAI support');
    expect(html).toContain('Reply to the school');
    expect(html).toContain('After sending, set the status to');
    for (const label of ['Start work', 'Mark resolved']) expect(html).toContain(label);
    expect(html).not.toContain('Add a screenshot');
  });

  it('a resolved ticket: the school confirms or reopens, and replies only after reopening; a closed one can be reopened', async () => {
    const resolved = await detail('school', RESOLVED);
    expect(resolved).toContain('Yes, it is solved: close');
    expect(resolved).toContain('Not solved: reopen');
    expect(resolved).toContain('Reopen the ticket to reply.');
    expect(resolved).not.toContain('Send reply');
    expect(resolved).not.toContain('Add a screenshot');
    const closed = await detail('school', CLOSED);
    expect(closed).toContain('Not solved: reopen');
    expect(closed).not.toContain('Yes, it is solved: close');
  });

  it('shows text as text: markup in a subject, body or reply is escaped', async () => {
    const html = await detail('platform', WAITING, { subject: '<img src=x onerror=alert(1)>', body: '<script>alert(2)</script>' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('every status has a meaning and a colour for both sides, and every move has a button', () => {
    for (const s of TICKET_STATUSES) {
      expect(TICKET_STATUS_TONE[s]).toBeTruthy();
      for (const side of ['school', 'platform'] as const) {
        expect(TICKET_STATUS_HELP[side][s].length).toBeGreaterThan(5);
        for (const to of nextStatuses(s, side)) expect(moveLabel(to, side).length).toBeGreaterThan(3);
      }
    }
  });
});

describe('raising a ticket', () => {
  it('asks what it is about, a subject, what happened and optional screenshots, and warns against secrets', () => {
    const html = renderToStaticMarkup(h(RaiseTicketForm, { api: school, routes }));
    for (const text of ['What is it about?', 'Something is not working', 'Plan or billing', 'Which part of the app? (optional)', 'Subject', 'What happened?', 'Screenshots (optional)', 'Do not include passwords or one-time codes.']) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Raise ticket/); // nothing to send yet
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
  });

  it('after raising: the reference, a link to the ticket, and any screenshot that was not added', async () => {
    const ticket = await school.raise!({ category: 'how_to', subject: 'How do I export?', body: 'I need the class list as a file.' });
    const html = renderToStaticMarkup(h(RaiseTicketForm, { api: school, routes, initialRaised: { ticket, notAdded: ['big.png: larger than 4 MB.'] } }));
    expect(html).toContain(`Ticket ${ticket.ref} raised`);
    expect(html).toContain(`href="/t/${ticket.ticketId}"`);
    expect(html).toContain('big.png: larger than 4 MB.');
    // It is in the school's list and the founder's queue, open.
    expect((await platform.list({ status: 'open' })).map((t) => t.subject)).toContain('How do I export?');
  });

  it('checks a screenshot before sending: type, size, empty', () => {
    expect(screenshotProblem({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(screenshotProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toContain('PNG, JPEG or WebP');
    expect(screenshotProblem({ name: 'a.svg', type: 'image/svg+xml', size: 1000 })).toContain('PNG, JPEG or WebP');
    expect(screenshotProblem({ name: 'big.png', type: 'image/png', size: 4 * 1024 * 1024 + 1 })).toContain('larger than 4 MB');
    expect(screenshotProblem({ name: 'e.png', type: 'image/png', size: 0 })).toContain('empty');
  });
});

describe('the stand-in follows the same rules as the API', () => {
  it('a school reply to a waiting ticket moves it to in progress; the founder’s reply can set a status; other moves are refused', async () => {
    await school.reply(WAITING, 'It was today, only 5A.');
    expect((await school.get(WAITING)).status).toBe('in_progress');
    await platform.reply(WAITING, 'Fixed. Please try again.', 'resolved');
    expect((await platform.get(WAITING)).status).toBe('resolved');
    await expect(school.reply(WAITING, 'still broken')).rejects.toThrow('Reopen the ticket to reply.');
    await expect(school.setStatus(WAITING, 'in_progress')).rejects.toThrow(/cannot be set/);
    await school.setStatus(WAITING, 'open');
    await expect(school.setStatus(WAITING, 'resolved')).rejects.toThrow(/cannot be set/);
    await expect(school.get('00000003-0000-4000-8000-000000000000')).rejects.toThrow('Ticket not found.'); // another school's
  });
});
