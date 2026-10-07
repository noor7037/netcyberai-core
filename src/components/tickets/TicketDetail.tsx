'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { ErrorState, Skeleton } from '@/components/app-ui/States';
import { StatusPill } from '@/components/app-ui/StatusPill';
import { moduleById, isModuleId } from '@/lib/contracts/modules';
import {
  canReply,
  nextStatuses,
  TICKET_CATEGORY_LABEL,
  TICKET_LIMITS,
  TICKET_SCREENSHOTS_PER_TICKET,
  TICKET_STATUS_LABEL,
  type TicketDetail as Ticket,
  type TicketStatus,
} from '@/lib/contracts/tickets';
import { ALERT, AREA, FIELD, moveLabel, NOTE, PRIMARY, SECONDARY, screenshotProblem, size, TICKET_STATUS_HELP, TICKET_STATUS_TONE, when } from './ticket-ui';
import type { TicketRoutes, TicketsApi } from './tickets-api';

// One ticket (C126): what was asked, the screenshots, the replies in order,
// a reply box while the ticket is being worked on, and the moves this side
// may make (contracts/tickets.ts decides; the server checks again). After
// every change the ticket is read again from the server.
export function TicketDetail({ api, routes, ticketId, initial }: { api: TicketsApi; routes: TicketRoutes; ticketId: string; initial?: Ticket }) {
  const side = api.side;
  const [ticket, setTicket] = useState<Ticket | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [then, setThen] = useState<TicketStatus | ''>('');

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get(ticketId)
      .then(setTicket)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load this ticket.'));
  }, [api, ticketId]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<void>, done?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      done?.();
      setTicket(await api.get(ticketId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!ticket) return <Skeleton lines={8} />;

  const moves = nextStatuses(ticket.status, side);
  const replyOpen = canReply(ticket.status);
  const replyOk = [...reply.trim()].length >= 1 && [...reply.trim()].length <= TICKET_LIMITS.message[1];
  const canAdd = !!api.upload && replyOpen && ticket.attachments.length < TICKET_SCREENSHOTS_PER_TICKET;
  const sendReply = (e: FormEvent) => {
    e.preventDefault();
    if (replyOk) act(() => api.reply(ticketId, reply.trim(), then || undefined), () => (setReply(''), setThen('')));
  };
  const open = (attachmentId: string) =>
    act(async () => {
      window.open(await api.screenshotUrl(ticketId, attachmentId), '_blank', 'noopener');
    });
  const add = (file: File | undefined) => {
    if (!file) return;
    const problem = screenshotProblem(file);
    if (problem) return setError(problem);
    act(() => api.upload!(ticketId, file));
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href={routes.list} className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-sapphire underline">
        ← All tickets
      </Link>
      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}

      <AppCard title={ticket.subject} description={`${ticket.ref} · ${TICKET_CATEGORY_LABEL[ticket.category]}${ticket.moduleId && isModuleId(ticket.moduleId) ? ` · ${moduleById(ticket.moduleId).label}` : ''}`} tone="sapphire" actions={<StatusPill tone={TICKET_STATUS_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</StatusPill>}>
        <p className={ticket.status === 'waiting_on_school' && side === 'school' ? NOTE : 'text-sm text-slate/70'}>{TICKET_STATUS_HELP[side][ticket.status]}</p>
        <dl className="grid gap-x-6 gap-y-1 text-sm text-slate sm:grid-cols-2">
          {ticket.schoolName && (
            <div>
              <dt className="inline font-semibold">School: </dt>
              <dd className="inline">{ticket.schoolName}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-semibold">Raised by: </dt>
            <dd className="inline">
              {ticket.raisedByName ?? 'A staff member'} ({ticket.raisedRole.replace(/_/g, ' ')})
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold">Raised: </dt>
            <dd className="inline">{when(ticket.createdAt)}</dd>
          </div>
          {ticket.resolvedAt && (
            <div>
              <dt className="inline font-semibold">Resolved: </dt>
              <dd className="inline">{when(ticket.resolvedAt)}</dd>
            </div>
          )}
        </dl>
        <p className="whitespace-pre-wrap break-words rounded-md bg-off-white p-3 text-sm text-slate">{ticket.body}</p>
        {moves.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Change status">
            {moves.map((to) => (
              <button key={to} type="button" disabled={busy} onClick={() => act(() => api.setStatus(ticketId, to))} className={to === 'resolved' || to === 'closed' ? PRIMARY : SECONDARY}>
                {moveLabel(to, side)}
              </button>
            ))}
          </div>
        )}
      </AppCard>

      <AppCard title={`Screenshots (${ticket.attachments.length})`} tone="azure">
        {ticket.attachments.length === 0 ? (
          <p className="text-sm text-slate/70">None added.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ticket.attachments.map((a) => (
              <li key={a.attachmentId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-white px-3 text-sm text-slate">
                <span className="min-w-0 break-all py-2">
                  {a.fileName}{' '}
                  <span className="text-slate/70">
                    ({size(a.sizeBytes)}, {when(a.createdAt)})
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => open(a.attachmentId)} aria-label={`View ${a.fileName}`} className="min-h-[44px] min-w-[44px] bg-white font-semibold text-sapphire underline disabled:opacity-60">
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
        {canAdd && (
          <label className="text-sm font-semibold text-slate">
            Add a screenshot
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => (add(e.target.files?.[0]), (e.target.value = ''))} className="mt-1 block min-h-[44px] w-full text-sm font-normal text-slate" />
            <span className="mt-1 block text-xs font-normal text-slate/70">PNG, JPEG or WebP, up to 4 MB. Links to screenshots work for five minutes.</span>
          </label>
        )}
      </AppCard>

      <AppCard title={`Replies (${ticket.messages.length})`} tone="royal">
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-slate/70">{side === 'school' ? 'No reply yet. NetCyberAI will answer here.' : 'No reply yet.'}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {ticket.messages.map((m) => (
              <li key={m.messageId} className={`rounded-lg border p-3 text-sm text-slate ${m.side === 'platform' ? 'border-sapphire/20 bg-sapphire/5' : 'border-slate/10 bg-white'}`}>
                <p className="mb-1 text-xs font-semibold text-slate/70">
                  {m.side === 'platform' ? (m.authorName ? `${m.authorName} · NetCyberAI support` : 'NetCyberAI support') : (m.authorName ?? 'School')} · {when(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
        {replyOpen ? (
          <form onSubmit={sendReply} className="flex flex-col gap-3 border-t border-slate/10 pt-3">
            <label className="text-sm font-semibold text-slate">
              {side === 'school' ? 'Your reply' : 'Reply to the school'}
              <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={TICKET_LIMITS.message[1]} className={AREA} />
            </label>
            {side === 'platform' && moves.length > 0 && (
              <label className="text-sm font-semibold text-slate">
                After sending, set the status to
                <select value={then} onChange={(e) => setThen(e.target.value as TicketStatus | '')} className={`${FIELD} block md:max-w-xs`}>
                  <option value="">No change</option>
                  {moves.map((to) => (
                    <option key={to} value={to}>
                      {TICKET_STATUS_LABEL[to]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" disabled={busy || !replyOk} className={`${PRIMARY} self-start`}>
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </form>
        ) : (
          <p className="border-t border-slate/10 pt-3 text-sm text-slate/70">Reopen the ticket to reply.</p>
        )}
      </AppCard>
    </div>
  );
}
