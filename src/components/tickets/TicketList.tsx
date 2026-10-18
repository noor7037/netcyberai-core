'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataList, type DataColumn } from '@/components/app-ui/DataList';
import { Select } from '@/components/ui/Select';
import { StatusPill } from '@/components/app-ui/StatusPill';
import { TICKET_CATEGORY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL, type TicketStatus, type TicketSummary } from '@/lib/contracts/tickets';
import { PRIMARY, TICKET_STATUS_TONE, when } from './ticket-ui';
import type { TicketRoutes, TicketsApi } from './tickets-api';

// The tickets this person can see (C126): for a school, its own (the office
// sees the school's, anyone else their own); for the founder, every
// school's, with the school's name and a school filter. Newest activity
// first. A table from 768 px, cards below.
// `raiseInHeader`: the page already shows "Raise a ticket" as its one primary
// button (ModulePage), so the list does not repeat it beside the filters.
export function TicketList({ api, routes, initial, raiseInHeader = false }: { api: TicketsApi; routes: TicketRoutes; initial?: TicketSummary[]; raiseInHeader?: boolean }) {
  const platform = api.side === 'platform';
  const [rows, setRows] = useState<TicketSummary[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [schoolId, setSchoolId] = useState('');
  // Every school seen so far, so the school filter keeps its choices once one is picked.
  const [schools, setSchools] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setError(null);
    api
      .list({ status, schoolId })
      .then((list) => {
        setRows(list);
        if (platform) setSchools((s) => ({ ...s, ...Object.fromEntries(list.map((t) => [t.schoolId, t.schoolName ?? 'School'])) }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the tickets.'));
  }, [api, status, schoolId, platform]);
  useEffect(load, [load]);

  const columns = useMemo<DataColumn<TicketSummary>[]>(
    () => [
      {
        key: 'ticket',
        header: 'Ticket',
        primary: true,
        render: (t) => (
          <span className="flex flex-col">
            <span className="font-semibold text-slate">{t.subject}</span>
            <span className="text-xs text-slate/70">{t.ref}</span>
          </span>
        ),
      },
      ...(platform ? [{ key: 'school', header: 'School', render: (t: TicketSummary) => t.schoolName ?? '—' }] : []),
      { key: 'category', header: 'About', render: (t) => TICKET_CATEGORY_LABEL[t.category] },
      { key: 'status', header: 'Status', render: (t) => <StatusPill tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</StatusPill> },
      { key: 'by', header: 'Raised by', hideOnPhone: true, render: (t) => t.raisedByName ?? t.raisedRole.replace(/_/g, ' ') },
      { key: 'activity', header: 'Last activity', render: (t) => when(t.lastActivityAt) },
    ],
    [platform]
  );
  const filtered = status !== '' || schoolId !== '';
  const raise = routes.raise ? (
    <Link href={routes.raise} className={PRIMARY}>
      Raise a ticket
    </Link>
  ) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[11rem]">
          <Select id="ticket-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | '')}>
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        {platform && (
          <div className="min-w-[11rem]">
            <Select id="ticket-school" label="School" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">All schools</option>
              {Object.entries(schools)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </Select>
          </div>
        )}
        {raise && !raiseInHeader && <div className="ml-auto">{raise}</div>}
      </div>
      <DataList
        caption={platform ? 'Support tickets from every school' : 'Your support tickets'}
        columns={columns}
        rows={rows}
        rowKey={(t) => t.ticketId}
        rowHref={(t) => routes.detail(t.ticketId)}
        error={error}
        onRetry={load}
        empty={
          filtered
            ? { title: 'No tickets match', whatToDo: 'Change the filters above.' }
            : platform
              ? { title: 'No tickets yet', whatToDo: 'A school’s ticket appears here, and you get an email.' }
              : { title: 'No tickets yet', whatToDo: 'If you need help, raise a ticket and NetCyberAI will answer here.', action: raise }
        }
      />
    </div>
  );
}
