'use client';

import { useMemo } from 'react';
import { RaiseTicketForm } from './RaiseTicketForm';
import { TicketDetail } from './TicketDetail';
import { TicketList } from './TicketList';
import { httpTicketsApi, type TicketRoutes } from './tickets-api';

// The ticket screens wired to the real APIs: the school's own tickets under
// /app/help/ticket, and the founder's queue under /control/tickets.
export const SCHOOL_TICKET_ROUTES: TicketRoutes = { list: '/app/help/ticket', raise: '/app/help/ticket/new', detail: (id) => `/app/help/ticket/${id}` };
export const CONTROL_TICKET_ROUTES: TicketRoutes = { list: '/control/tickets', detail: (id) => `/control/tickets/${id}` };

export function SchoolTicketList() {
  const api = useMemo(() => httpTicketsApi('school'), []);
  return <TicketList api={api} routes={SCHOOL_TICKET_ROUTES} />;
}

export function SchoolRaiseTicket() {
  const api = useMemo(() => httpTicketsApi('school'), []);
  return <RaiseTicketForm api={api} routes={SCHOOL_TICKET_ROUTES} />;
}

export function SchoolTicketDetail({ ticketId }: { ticketId: string }) {
  const api = useMemo(() => httpTicketsApi('school'), []);
  return <TicketDetail api={api} routes={SCHOOL_TICKET_ROUTES} ticketId={ticketId} />;
}

export function ControlTicketQueue() {
  const api = useMemo(() => httpTicketsApi('platform'), []);
  return <TicketList api={api} routes={CONTROL_TICKET_ROUTES} />;
}

export function ControlTicketDetail({ ticketId }: { ticketId: string }) {
  const api = useMemo(() => httpTicketsApi('platform'), []);
  return <TicketDetail api={api} routes={CONTROL_TICKET_ROUTES} ticketId={ticketId} />;
}
