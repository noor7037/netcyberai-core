'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { isTicketCategory, TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_LIMITS, TICKET_SCREENSHOTS_PER_TICKET, type TicketSummary } from '@/lib/contracts/tickets';
import { ALERT, NOTE, PRIMARY, SECONDARY, screenshotProblem, size } from './ticket-ui';
import type { TicketRoutes, TicketsApi } from './tickets-api';

// Only parts of the app that exist today can be the subject of a ticket.
const BUILT_MODULES = MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial');

// Raise a ticket (C126): what it is about, a subject, what happened, and
// up to five screenshots. The ticket is raised first; screenshots are added
// to it after, so a screenshot that fails never loses the ticket.
export function RaiseTicketForm({ api, routes, initialRaised }: { api: TicketsApi; routes: TicketRoutes; initialRaised?: { ticket: TicketSummary; notAdded: string[] } }) {
  const [category, setCategory] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raised, setRaised] = useState(initialRaised ?? null);

  const count = (s: string) => [...s.trim()].length;
  const subjectOk = count(subject) >= TICKET_LIMITS.subject[0] && count(subject) <= TICKET_LIMITS.subject[1];
  const bodyOk = count(body) >= TICKET_LIMITS.body[0] && count(body) <= TICKET_LIMITS.body[1];
  const ready = isTicketCategory(category) && subjectOk && bodyOk && !busy;

  function choose(list: FileList | null) {
    const picked = [...files, ...Array.from(list ?? [])];
    const problems = picked.map(screenshotProblem).filter(Boolean) as string[];
    const good = picked.filter((f) => !screenshotProblem(f));
    if (good.length > TICKET_SCREENSHOTS_PER_TICKET) problems.push(`Only the first ${TICKET_SCREENSHOTS_PER_TICKET} screenshots are kept.`);
    setFiles(good.slice(0, TICKET_SCREENSHOTS_PER_TICKET));
    setFileNote(problems.length ? problems.join(' ') : null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || !api.raise || !isTicketCategory(category)) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await api.raise({ category, subject: subject.trim(), body: body.trim(), moduleId: moduleId || null });
      const notAdded: string[] = [];
      for (const f of files) {
        try {
          await api.upload?.(ticket.ticketId, f);
        } catch (err) {
          notAdded.push(`${f.name}: ${err instanceof Error ? err.message : 'not added.'}`);
        }
      }
      setRaised({ ticket, notAdded });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The ticket was not raised.');
    } finally {
      setBusy(false);
    }
  }

  if (raised) {
    return (
      <AppCard title={`Ticket ${raised.ticket.ref} raised`} tone="turquoise">
        <p className="text-sm text-slate">NetCyberAI has been told. Replies appear on the ticket; check back here.</p>
        {raised.notAdded.length > 0 && (
          <div role="alert" className={NOTE}>
            <p className="font-semibold">Some screenshots were not added. You can add them from the ticket.</p>
            <ul className="mt-1 list-disc pl-5">
              {raised.notAdded.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={routes.detail(raised.ticket.ticketId)} className={PRIMARY}>
            Open the ticket
          </Link>
          <Link href={routes.list} className={SECONDARY}>
            All tickets
          </Link>
        </div>
      </AppCard>
    );
  }

  return (
    <AppCard title="Raise a ticket" description="Do not include passwords or one-time codes." tone="sapphire">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className={ALERT}>
            {error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Select id="ticket-category" label="What is it about?" required value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select id="ticket-module" label="Which part of the app? (optional)" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            <option value="">Not sure / general</option>
            {BUILT_MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <Input id="ticket-subject" label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={TICKET_LIMITS.subject[1]} />
        <Textarea
          id="ticket-body"
          label="What happened?"
          required
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={TICKET_LIMITS.body[1]}
          placeholder="What you were doing, what you expected and what you saw"
          helperText={`At least ${TICKET_LIMITS.body[0]} characters.`}
        />
        <div className="text-sm font-semibold text-slate">
          <div className="flex flex-wrap items-center gap-x-1">
            <label htmlFor="ticket-files">Screenshots (optional)</label>
            <InfoTip>
              Up to {TICKET_SCREENSHOTS_PER_TICKET} images (PNG, JPEG or WebP), 4 MB each.
            </InfoTip>
          </div>
          <input id="ticket-files" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => (choose(e.target.files), (e.target.value = ''))} className="mt-1 block min-h-[44px] w-full text-sm font-normal text-slate" />
          <p className="mt-1 text-xs font-normal text-slate/70">Hide anything private first.</p>
          {fileNote && (
            <p role="alert" className={`${NOTE} mt-2 font-normal`}>
              {fileNote}
            </p>
          )}
          {files.length > 0 && (
            <ul aria-label="Chosen screenshots" className="mt-2 flex flex-col gap-1 font-normal">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-slate/10 bg-white px-3 text-slate">
                  <span className="min-w-0 truncate">
                    {f.name} <span className="text-slate/70">({size(f.size)})</span>
                  </span>
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`} className="min-h-[44px] min-w-[44px] bg-white font-semibold text-sapphire">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!ready} className={PRIMARY}>
            {busy ? 'Sending…' : 'Raise ticket'}
          </button>
          <Link href={routes.list} className={SECONDARY}>
            Cancel
          </Link>
        </div>
      </form>
    </AppCard>
  );
}
