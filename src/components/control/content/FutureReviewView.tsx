'use client';

import { useRef, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { DomainRow, ReviewFilter, ReviewRow } from '@/lib/future/review';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Future: the founder's review queue. Each listing shows its confidence, the source sentence behind
// every date, and the state of its Apply link; the founder approves, edits or rejects. A low-confidence listing
// (under 0.8) is marked and can be filtered to; approving one needs a note saying what was checked. Nothing shows to a
// family until approved. Every action goes to the Control API, which checks the session, validates and audits.

// The same look as the other Control forms (components/exams/SchemeParts), kept here so this page picks only its own words.
const TAP = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const SECTION = 'rounded-lg border border-slate/15 bg-white p-4';

const FILTERS: { id: ReviewFilter; key: MessageKey }[] = [
  { id: 'pending', key: 'control.future.filter.pending' },
  { id: 'low', key: 'control.future.filter.low' },
  { id: 'approved', key: 'control.future.filter.approved' },
  { id: 'rejected', key: 'control.future.filter.rejected' },
  { id: 'all', key: 'control.future.filter.all' },
];
const ERRS = ['not_found', 'title_en', 'title_hi', 'text', 'url', 'classes', 'states', 'last_date', 'note_needed', 'state', 'domain'];

type Form = Record<string, string>;
const formOf = (l: ReviewRow): Form => ({
  titleEn: l.titleEn, titleHi: l.titleHi ?? '', summaryEn: l.summaryEn ?? '', summaryHi: l.summaryHi ?? '', eligibilityEn: l.eligibilityEn ?? '', eligibilityHi: l.eligibilityHi ?? '',
  benefitEn: l.benefitEn ?? '', benefitHi: l.benefitHi ?? '', feeEn: l.feeEn ?? '', feeHi: l.feeHi ?? '', applyUrl: l.applyUrl ?? '', sourceUrl: l.sourceUrl,
  classes: l.classes.join(', '), prepareClasses: [...l.prepareClasses, ...l.futureClasses].sort((a, b) => a - b).join(', '), states: l.states.join(', '), lastDate: l.lastDate ?? '',
  documentsEn: l.documents.map((d) => d.en).join('\n'), documentsHi: l.documents.map((d) => d.hi ?? '').join('\n'), stepsEn: l.prepareSteps.map((d) => d.en).join('\n'), stepsHi: l.prepareSteps.map((d) => d.hi ?? '').join('\n'),
});
const FIELDS: [string, MessageKey, boolean][] = [
  ['titleEn', 'control.future.f.titleEn', false], ['titleHi', 'control.future.f.titleHi', false], ['summaryEn', 'control.future.f.summaryEn', true], ['summaryHi', 'control.future.f.summaryHi', true],
  ['eligibilityEn', 'control.future.f.eligibilityEn', true], ['eligibilityHi', 'control.future.f.eligibilityHi', true], ['benefitEn', 'control.future.f.benefitEn', true], ['benefitHi', 'control.future.f.benefitHi', true],
  ['feeEn', 'control.future.f.feeEn', true], ['feeHi', 'control.future.f.feeHi', true], ['documentsEn', 'control.future.f.documentsEn', true], ['documentsHi', 'control.future.f.documentsHi', true],
  ['stepsEn', 'control.future.f.stepsEn', true], ['stepsHi', 'control.future.f.stepsHi', true], ['applyUrl', 'control.future.f.applyUrl', false], ['sourceUrl', 'control.future.f.sourceUrl', false],
  ['classes', 'control.future.f.classes', false], ['prepareClasses', 'control.future.f.prepareClasses', false], ['states', 'control.future.f.states', false], ['lastDate', 'control.future.f.lastDate', false],
];

export function FutureReviewView({ initial, domains: initialDomains, pendingCount: initialPending }: { initial: ReviewRow[]; domains: DomainRow[]; pendingCount: number }) {
  const { t } = useWords();
  const approveAll = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [rows, setRows] = useState<ReviewRow[]>(initial);
  const [domains, setDomains] = useState<DomainRow[]>(initialDomains);
  const [pendingCount, setPendingCount] = useState(initialPending);
  const [editing, setEditing] = useState<{ id: string; form: Form } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async (f: ReviewFilter) => {
    const res = await fetch(`/api/control/content/future?filter=${f}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { listings: ReviewRow[]; domains: DomainRow[]; pendingCount?: number } | null) : null;
    if (got) {
      setRows(got.listings);
      setDomains(got.domains);
      if (typeof got.pendingCount === 'number') setPendingCount(got.pendingCount);
    }
  };
  const send = async (payload: unknown): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/content/future', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setBusy(false);
      const code = got?.code as string | undefined;
      setNote({ ok: false, text: t(code && ERRS.includes(code) ? (`control.future.err.${code}` as MessageKey) : 'control.future.err.other') });
      return false;
    }
    await load(filter);
    setBusy(false);
    setNote({ ok: true, text: t('control.future.saved') });
    return true;
  };
  const pick = async (f: ReviewFilter) => {
    setFilter(f);
    setEditing(null);
    await load(f);
  };

  return (
    <div className="flex flex-col gap-4" data-future-review>
      <div role="group" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" data-filter={f.id} aria-pressed={filter === f.id} onClick={() => void pick(f.id)} className={`${TAP} ${filter === f.id ? 'ring-2 ring-sapphire' : ''}`}>
            {t(f.key)}
          </button>
        ))}
      </div>
      <div>
        <button type="button" data-approve-all className={PRIMARY} disabled={busy || pendingCount === 0} onClick={() => approveAll.current?.showModal()}>
          {t('control.future.approveAll').replace('{n}', String(pendingCount))}
        </button>
        <dialog ref={approveAll} className="w-[min(24rem,92vw)] rounded-lg border border-slate/15 bg-white p-4 text-slate">
          <h2 className="text-base font-extrabold text-slate">{t('control.future.approveAllTitle')}</h2>
          <p className="mt-1 text-sm text-slate">{t('control.future.approveAllBody').replace('{n}', String(pendingCount))}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={busy} onClick={async () => { if (await send({ action: 'approve-all', confirm: 'approve-pending' })) approveAll.current?.close(); }}>
              {t('control.future.approveAllConfirm')}
            </button>
            <button type="button" className={TAP} onClick={() => approveAll.current?.close()}>{t('control.future.approveAllCancel')}</button>
          </div>
        </dialog>
      </div>
      {note && (
        <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-emerald-text' : 'text-red-800'}`}>
          {note.text}
        </p>
      )}
      {rows.length === 0 && <p className="text-sm text-slate">{t('control.future.empty')}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((l) => (
          <li key={l.id} data-future-row={l.id} data-low={l.low ? 'true' : 'false'} className={`${SECTION} flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={l.low ? 'warning' : 'success'}>{t('control.future.confidence').replace('{n}', l.confidence.toFixed(2))}</Badge>
              {l.low && <Badge variant="danger">{t('control.future.review.low')}</Badge>}
              <Badge>{l.reviewState}</Badge>
              <Badge>{`${t('control.future.status')}: ${l.status}`}</Badge>
              <Badge>{l.states.join(', ')}</Badge>
              <Badge>{l.classes.map((c) => (c === -2 ? t('fam.class.nursery') : c === -1 ? t('fam.class.lkg') : c === 0 ? t('fam.class.ukg') : String(c))).join(', ')}</Badge>
            </div>
            <h3 className="text-base font-extrabold text-slate">{l.titleEn}</h3>
            {l.titleHi && <p lang="hi" className="text-sm text-slate">{l.titleHi}</p>}
            <p className="text-xs text-slate">{l.provider} · {l.cycle}</p>
            <p className="text-xs text-slate">
              {t('control.future.linkStatus')}: {l.applyUrl ? <a href={l.applyUrl} target="_blank" rel="noopener noreferrer" className="underline">{new URL(l.applyUrl).hostname}</a> : t('control.future.noApply')} · {l.applyUrlStatus} ·{' '}
              <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{t('control.future.openSource')}</a>
            </p>
            <details>
              <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-sapphire">{t('control.future.sourceQuotes')}</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {l.keyDates.map((d, i) => (
                  <li key={i} className="text-xs text-slate">
                    <strong>{d.kind}</strong> {d.date}{d.end ? ` – ${d.end}` : ''}{d.approx ? ' ~' : ''}: <q lang="und">{d.quote ?? t('control.future.noQuote')}</q>
                  </li>
                ))}
              </ul>
              {l.notes && <p className="mt-1 text-xs text-slate"><strong>{t('control.future.noteSeed')}:</strong> {l.notes}</p>}
            </details>
            {editing?.id === l.id ? (
              <div className="flex flex-col gap-2" data-future-edit>
                {FIELDS.map(([k, label, long]) =>
                  long ? (
                    <Textarea key={k} id={`${l.id}-${k}`} label={t(label)} floating={false} rows={k.startsWith('documents') || k.startsWith('steps') ? 5 : 3} value={editing.form[k]} onChange={(e) => setEditing({ id: l.id, form: { ...editing.form, [k]: e.target.value } })} />
                  ) : (
                    <Input key={k} id={`${l.id}-${k}`} label={t(label)} floating={false} value={editing.form[k]} onChange={(e) => setEditing({ id: l.id, form: { ...editing.form, [k]: e.target.value } })} />
                  )
                )}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} className={PRIMARY} onClick={async () => { if (await send({ action: 'edit', listingId: l.id, ...editing.form })) setEditing(null); }}>
                    {t('control.future.save')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Textarea id={`${l.id}-note`} label={t('control.future.note')} floating={false} rows={2} value={notes[l.id] ?? l.reviewNote ?? ''} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-approve disabled={busy} className={PRIMARY} onClick={() => void send({ action: 'approve', listingId: l.id, note: notes[l.id] ?? l.reviewNote ?? '' })}>
                    {t('control.future.approve')}
                  </button>
                  <button type="button" data-edit disabled={busy} className={TAP} onClick={() => setEditing({ id: l.id, form: formOf(l) })}>
                    {t('control.future.edit')}
                  </button>
                  <button type="button" data-reject disabled={busy} className={TAP} onClick={() => void send({ action: 'reject', listingId: l.id, note: notes[l.id] ?? l.reviewNote ?? '' })}>
                    {t('control.future.reject')}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <section className={`${SECTION} flex flex-col gap-2`} data-future-domains>
        <h2 className="text-base font-extrabold text-slate">{t('control.future.domains')}</h2>
        <p className="text-sm text-slate">{t('control.future.domainsAbout')}</p>
        <ul className="flex flex-col gap-1">
          {domains.map((d) => (
            <li key={d.domain} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate">
              <span>
                <strong>{d.domain}</strong> · {d.who}
              </span>
              <button type="button" data-domain={d.domain} aria-pressed={d.enabled} disabled={busy} className={`${TAP} ${d.enabled ? 'ring-2 ring-sapphire' : ''}`} onClick={() => void send({ action: 'domain', domain: d.domain, enabled: !d.enabled })}>
                {d.enabled ? t('control.future.domainOn') : t('control.future.domainOff')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
