'use client';

import { useMemo } from 'react';
import { RaiseTicketForm } from '@/components/tickets/RaiseTicketForm';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketList } from '@/components/tickets/TicketList';
import type { TicketRoutes } from '@/components/tickets/tickets-api';
import { createTicketsPreviewApi } from '@/demo-fixture/tickets';

export function TicketsPreview({ side, view }: { side: 'school' | 'platform'; view: string }) {
  const api = useMemo(() => createTicketsPreviewApi(side), [side]);
  const base = `/design-system/shell/tickets?side=${side === 'platform' ? 'control' : 'school'}`;
  const routes: TicketRoutes = { list: base, ...(side === 'school' ? { raise: `${base}&view=new` } : {}), detail: (id) => `${base}&view=${id}` };
  if (view === 'new' && side === 'school') return <RaiseTicketForm api={api} routes={routes} />;
  if (view) return <TicketDetail api={api} routes={routes} ticketId={view} />;
  return <TicketList api={api} routes={routes} />;
}
