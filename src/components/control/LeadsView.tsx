'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { LEAD_SOURCES, LEAD_STATUSES, MAX_REPLY_BODY, type Lead, type LeadReply, type LeadStatus } from '@/lib/control/leads';
import { COUNTRY_CODES } from '@/lib/leads/contact';
import type { MessageKey } from '@/lib/i18n';

// Control → Leads (W7-L): every website lead, newest first, 50 a page. Cards at phone width, a table from 768 px.
// A lead opens in a panel with every field, its status and the founder's notes. Export takes the current filter;
// import takes a CSV. W12-F: the switch for the automatic first reply, and in the panel the replies sent and a reply
// by email. Every word comes from the message files (control.leads.*).

type Page = { leads: Lead[]; total: number; page: number; pageSize: number };
type ImportResult = { inserted: number; duplicates: number; rejected: { line: number; reason: string }[] };

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  new: 'warning',
  contacted: 'neutral',
  qualified: 'neutral',
  converted: 'success',
  rejected: 'danger',
  duplicate: 'neutral',
};
const LINK = 'inline-flex min-h-[44px] items-center text-sapphire underline';
const KEEP = '';

function query(status: string, source: string, q: string, page?: number): string {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (source) p.set('source', source);
  if (q.trim()) p.set('q', q.trim());
  if (page && page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function LeadsView({ initial, autoReply: initialAutoReply = true }: { initial: Page; autoReply?: boolean }) {
  const { t, lang } = useWords();
  const [data, setData] = useState<Page>(initial);
  const [autoReply, setAutoReply] = useState(initialAutoReply);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState(false);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<Lead | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const firstRun = useRef(true);

  const statusLabel = (s: string) => t(`control.leads.status.${s}` as MessageKey);
  const sourceLabel = (s: string) => t(`control.leads.source.${s}` as MessageKey);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/control/leads${query(status, source, q, page)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Page);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [status, source, q, page]);

  // The first page came with the screen; a change of filter, search or page asks again (the search after a pause).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImported(null);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/control/leads/import', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof body?.error === 'string' && ['too_big', 'too_many', 'empty', 'unreadable'].includes(body.error) ? body.error : 'other';
        setImportError(t(`control.leads.import.error.${code}` as MessageKey));
        return;
      }
      setImported(body as ImportResult);
      await load();
    } catch {
      setImportError(t('control.leads.import.error.other'));
    } finally {
      setImporting(false);
    }
  }

  async function toggleAutoReply() {
    setAutoBusy(true);
    setAutoError(false);
    try {
      const res = await fetch('/api/control/leads/auto-reply', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !autoReply }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.on !== 'boolean') setAutoError(true);
      else setAutoReply(body.on);
    } catch {
      setAutoError(true);
    } finally {
      setAutoBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const phoneCell = (l: Lead) =>
    l.phoneE164 ? (
      <a href={`tel:${l.phoneE164}`} className={LINK}>
        {l.phoneE164}
      </a>
    ) : (
      <span className="inline-flex min-h-[44px] items-center text-slate">{l.contactPhone}</span>
    );
  const emailCell = (l: Lead) =>
    l.contactEmail ? (
      <a href={`mailto:${l.contactEmail}`} className={LINK}>
        {l.contactEmail}
      </a>
    ) : (
      <span className="text-slate/70">—</span>
    );

  return (
    <div className="flex flex-col gap-4" data-leads-view>
      <section className="flex flex-col gap-1 rounded-lg border border-slate/20 p-3" data-leads-auto-reply>
        <Switch
          id="leads-auto-reply"
          label={t('control.leads.autoReply.label')}
          stateText={autoReply ? t('control.leads.autoReply.on') : t('control.leads.autoReply.off')}
          checked={autoReply}
          disabled={autoBusy}
          onChange={toggleAutoReply}
        />
        <p className="text-xs text-slate/70">{t('control.leads.autoReply.help')}</p>
        {autoError && (
          <p role="alert" className="text-sm text-red-800">
            {t('control.leads.autoReply.error')}
          </p>
        )}
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Input id="leads-search" type="search" floating label={t('control.leads.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select id="leads-status" label={t('control.leads.filter.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('control.leads.filter.all')}</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select id="leads-source" label={t('control.leads.filter.source')} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option value="">{t('control.leads.filter.all')}</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/control/leads/export${query(status, source, q)}`}
          download
          className="inline-flex min-h-[44px] items-center rounded-full border-2 border-sapphire px-5 text-sm font-semibold text-sapphire hover:bg-sapphire/10"
        >
          {t('control.leads.export')}
        </a>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-2 border-sapphire px-5 text-sm font-semibold text-sapphire hover:bg-sapphire/10 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sapphire">
          {importing ? t('control.leads.importing') : t('control.leads.import')}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={importing} onChange={onImport} />
        </label>
        <p className="w-full text-xs text-slate/70">{t('control.leads.import.help')}</p>
      </div>

      {(imported || importError) && (
        <div role="status" className="rounded-xl border border-slate/10 bg-white p-4 text-sm text-slate">
          {importError ?? t('control.leads.import.done', { inserted: imported!.inserted, duplicates: imported!.duplicates, rejected: imported!.rejected.length })}
          {imported && imported.rejected.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-slate/70">
              {imported.rejected.slice(0, 20).map((r) => (
                <li key={r.line}>{t('control.leads.import.line', { line: r.line, reason: t(`control.leads.import.reason.${r.reason}` as MessageKey) })}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate/70">
        <span aria-live="polite">{loading ? t('control.leads.loading') : t('control.leads.total', { n: data.total })}</span>
        {loadError && <span className="text-red-800">{t('control.leads.error.load')}</span>}
      </div>

      {data.total === 0 && !status && !source && !q ? (
        <EmptyState title={t('control.leads.empty.title')} description={t('control.leads.empty.lead')} />
      ) : data.leads.length === 0 ? (
        <EmptyState title={t('control.leads.none')} />
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden" data-leads-cards>
            {data.leads.map((l) => (
              <li key={l.leadId} className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setOpen(l)} className="min-h-[44px] text-left font-semibold text-slate underline decoration-slate/30 underline-offset-4">
                    {l.schoolName}
                  </button>
                  <Badge variant={STATUS_VARIANT[l.status] ?? 'neutral'}>{statusLabel(l.status)}</Badge>
                </div>
                <p className="text-sm text-slate/70">
                  {l.contactName}
                  {l.city ? ` · ${l.city}` : ''}
                </p>
                <div className="mt-1 flex flex-col break-all">
                  {phoneCell(l)}
                  {emailCell(l)}
                </div>
                <p className="mt-1 text-xs text-slate/70">
                  {date(l.createdAt)} · {sourceLabel(l.source)}
                  {l.studentCountBand ? ` · ${l.studentCountBand}` : ''}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate/10 bg-white md:block">
            <table className="w-full text-left text-sm" data-leads-table>
              <thead className="bg-slate/5 text-xs uppercase text-slate/70">
                <tr>
                  {(['date', 'source', 'school', 'name', 'phone', 'email', 'city', 'students', 'modules', 'status'] as const).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {t(`control.leads.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.leadId} className="border-t border-slate/10 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate/70">{date(l.createdAt)}</td>
                    <td className="px-3 py-2 text-slate/70">{sourceLabel(l.source)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpen(l)}
                        aria-label={t('control.leads.open', { school: l.schoolName })}
                        className="min-h-[44px] text-left font-semibold text-sapphire underline"
                      >
                        {l.schoolName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate">{l.contactName}</td>
                    <td className="whitespace-nowrap px-3 py-2">{phoneCell(l)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{emailCell(l)}</td>
                    <td className="px-3 py-2 text-slate">{l.city ?? '—'}</td>
                    <td className="px-3 py-2 text-slate">{l.studentCountBand ?? '—'}</td>
                    <td className="px-3 py-2 text-slate/70">{l.requiredModules.join(', ') || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[l.status] ?? 'neutral'}>{statusLabel(l.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label={t('control.leads.page', { page: data.page, pages })}>
              <Button variant="outline" disabled={data.page <= 1 || loading} onClick={() => setPage(data.page - 1)}>
                {t('control.leads.prev')}
              </Button>
              <span className="text-sm text-slate/70">{t('control.leads.page', { page: data.page, pages })}</span>
              <Button variant="outline" disabled={data.page >= pages || loading} onClick={() => setPage(data.page + 1)}>
                {t('control.leads.next')}
              </Button>
            </nav>
          )}
        </>
      )}

      {open && (
        <LeadPanel
          key={open.leadId}
          lead={open}
          date={date}
          statusLabel={statusLabel}
          sourceLabel={sourceLabel}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setData((d) => ({ ...d, leads: d.leads.map((x) => (x.leadId === saved.leadId ? saved : x)) }));
            setOpen(saved);
          }}
        />
      )}
    </div>
  );
}

function LeadPanel({
  lead,
  date,
  statusLabel,
  sourceLabel,
  onClose,
  onSaved,
}: {
  lead: Lead;
  date: (iso: string) => string;
  statusLabel: (s: string) => string;
  sourceLabel: (s: string) => string;
  onClose: () => void;
  onSaved: (l: Lead) => void;
}) {
  const { t } = useWords();
  const [status, setStatus] = useState<LeadStatus>(lead.status as LeadStatus);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [country, setCountry] = useState(KEEP);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/control/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.leadId, status, notes, countryCode: country || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: body?.error === 'phone' ? t('control.leads.error.phone') : t('control.leads.error.save') });
        return;
      }
      setCountry(KEEP);
      setMessage({ ok: true, text: t('control.leads.saved') });
      onSaved(body.lead as Lead);
    } catch {
      setMessage({ ok: false, text: t('control.leads.error.save') });
    } finally {
      setSaving(false);
    }
  }

  const rows: [MessageKey, string | null][] = [
    ['control.leads.field.received', date(lead.createdAt)],
    ['control.leads.col.source', sourceLabel(lead.source)],
    ['control.leads.field.orgType', lead.orgType],
    ['control.leads.col.school', lead.schoolName],
    ['control.leads.col.name', lead.contactName],
    ['control.leads.field.phoneTyped', lead.contactPhone],
    ['control.leads.field.countryCode', lead.countryCode],
    ['control.leads.col.city', lead.city],
    ['control.leads.col.students', lead.studentCountBand],
    ['control.leads.col.modules', lead.requiredModules.join(', ') || null],
    ['control.leads.field.currentErp', lead.currentErp],
    ['control.leads.field.preferredDate', lead.preferredDate],
    ['control.leads.field.preferredTime', lead.preferredTime],
    ['control.leads.field.preferredContact', lead.preferredContact],
    ['control.leads.field.statusChangedAt', lead.statusChangedAt ? date(lead.statusChangedAt) : null],
  ];

  return (
    <Modal open onClose={onClose} title={t('control.leads.drawer.title', { school: lead.schoolName })} wide>
      <div className="flex flex-col gap-4" data-lead-panel>
        <div className="flex flex-col break-all">
          {lead.phoneE164 ? (
            <a href={`tel:${lead.phoneE164}`} className={LINK}>
              {lead.phoneE164}
            </a>
          ) : (
            <p className="text-sm text-red-800">{t('control.leads.noCountry')}</p>
          )}
          {lead.contactEmail && (
            <a href={`mailto:${lead.contactEmail}`} className={LINK}>
              {lead.contactEmail}
            </a>
          )}
          {lead.duplicateOfLeadId && <p className="text-sm text-slate/70">{t('control.leads.field.duplicateOf')}</p>}
        </div>
        {lead.requirements && (
          <div className="text-sm">
            <p className="text-slate/70">{t('control.leads.field.requirements')}</p>
            <p className="whitespace-pre-wrap break-words text-slate">{lead.requirements}</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select id="lead-status" label={t('control.leads.filter.status')} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          <Select id="lead-country" label={t('control.leads.field.countryCode')} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value={KEEP}>{t('control.leads.countryKeep')}</option>
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.country}
              </option>
            ))}
          </Select>
        </div>
        <Textarea id="lead-notes" label={t('control.leads.notes')} rows={4} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? t('control.leads.saving') : t('control.leads.save')}
          </Button>
          {message && (
            <p role="status" className={`text-sm ${message.ok ? 'text-emerald-text' : 'text-red-800'}`}>
              {message.text}
            </p>
          )}
        </div>
        <LeadReplies lead={lead} date={date} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {rows.map(([key, value]) => (
            <div key={key}>
              <dt className="text-slate/70">{t(key)}</dt>
              <dd className="break-words text-slate">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}

// The replies this lead was sent (each recorded once the email service accepted it), and a reply by email.
function LeadReplies({ lead, date }: { lead: Lead; date: (iso: string) => string }) {
  const { t } = useWords();
  const [replies, setReplies] = useState<LeadReply[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`/api/control/leads/reply?leadId=${encodeURIComponent(lead.leadId)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body?.replies)) throw new Error('load');
      setReplies(body.replies as LeadReply[]);
    } catch {
      setLoadError(true);
    }
  }, [lead.leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/control/leads/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.leadId, body: text }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: body?.error === 'no_email' ? t('control.leads.reply.noEmail') : t('control.leads.reply.error') });
        return;
      }
      setText('');
      setMessage({ ok: true, text: t('control.leads.reply.queued') });
    } catch {
      setMessage({ ok: false, text: t('control.leads.reply.error') });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-slate/20 pt-3" data-lead-replies data-loaded={replies !== null || loadError ? '' : undefined}>
      <h3 className="text-base font-bold text-slate">{t('control.leads.replies.title')}</h3>
      {loadError ? (
        <p className="text-sm text-red-800">{t('control.leads.replies.error')}</p>
      ) : replies === null ? (
        <p className="text-sm text-slate/70">{t('control.leads.replies.loading')}</p>
      ) : replies.length === 0 ? (
        <p className="text-sm text-slate/70">{t('control.leads.replies.none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {replies.map((r) => (
            <li key={r.replyId} className="text-sm">
              <p className="font-semibold text-slate">{t(r.kind === 'first_reply' ? 'control.leads.replies.first' : 'control.leads.replies.manual', { date: date(r.sentAt) })}</p>
              <details>
                <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-sapphire underline">{t('control.leads.reply.show')}</summary>
                <p className="whitespace-pre-wrap break-words text-slate">{r.body}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      {lead.contactEmail ? (
        <>
          <Textarea id="lead-reply" label={t('control.leads.reply.label')} rows={4} value={text} maxLength={MAX_REPLY_BODY} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={send} disabled={sending || !text.trim()}>
              {sending ? t('control.leads.reply.sending') : t('control.leads.reply.send')}
            </Button>
            {message && (
              <p role="status" className={`text-sm ${message.ok ? 'text-emerald-text' : 'text-red-800'}`}>
                {message.text}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate/70">{t('control.leads.reply.noEmail')}</p>
      )}
    </section>
  );
}
