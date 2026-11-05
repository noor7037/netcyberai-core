'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';

// Control → Audit Logs: the platform-wide audit trail, read only. Newest first, 50 a page, narrowed by school, who
// did it, the start of the action and day (W21-M6). The after-state shows as a short preview; a state with a long
// value shows its field names only, and a personal value is hidden. A row opens its detail; the filtered rows
// download as CSV, without any state.

type Row = {
  id: string;
  at: string;
  actorName: string | null;
  schoolId: string | null;
  schoolName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  afterPreview: string | null;
  keysOnly: boolean;
};
type Preview = { preview: string | null; keysOnly: boolean };
type Detail = Omit<Row, 'afterPreview' | 'keysOnly'> & { actorRole: string | null; before: Preview; after: Preview };
type Answer = { rows: Row[]; page: number; hasMore: boolean; schools: { id: string; name: string }[] };
type Filters = { schoolId: string; actor: string; action: string; from: string; to: string };
const NONE: Filters = { schoolId: '', actor: '', action: '', from: '', to: '' };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

const query = (f: Filters, extra: Record<string, string>) => {
  const qs = new URLSearchParams(extra);
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  return qs.toString();
};

export function AuditLogsPanel() {
  const { t, lang } = useWords();
  const [draft, setDraft] = useState<Filters>(NONE);
  const [applied, setApplied] = useState<Filters>(NONE);
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/control/audit-logs?${query(applied, { page: String(page) })}`).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as Answer | null) : null;
    if (body) setAnswer(body);
    setFailed(!body);
    setLoading(false);
  }, [applied, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setDetailFailed(false);
    const res = await fetch(`/api/control/audit-logs?id=${encodeURIComponent(id)}`).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { row: Detail } | null) : null;
    if (body) setDetail(body.row);
    else setDetailFailed(true);
  };

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const state = (p: Preview | null) =>
    !p || p.preview === null ? (
      <span className="text-sm text-slate">{t('control.m6.audit.none')}</span>
    ) : p.keysOnly ? (
      <span className="break-all text-xs">{p.preview ? t('control.audit.keysOnly', { keys: p.preview }) : t('control.audit.longHidden')}</span>
    ) : (
      <code className="break-all text-xs">{p.preview}</code>
    );
  const columns: TableColumn<Row>[] = [
    { key: 'time', header: t('control.audit.col.time'), render: (r) => <time dateTime={r.at}>{when.format(new Date(r.at))}</time> },
    { key: 'action', header: t('control.audit.col.action'), render: (r) => <span className="break-all font-mono text-xs">{r.action}</span> },
    { key: 'actor', header: t('control.audit.col.actor'), render: (r) => r.actorName ?? t('control.audit.noActor') },
    { key: 'school', header: t('control.audit.col.school'), render: (r) => r.schoolName ?? t('control.audit.platform') },
    {
      key: 'target',
      header: t('control.audit.col.target'),
      render: (r) => (r.targetType || r.targetId ? <span className="break-all">{[r.targetType, r.targetId].filter(Boolean).join(' ')}</span> : null),
    },
    { key: 'after', header: t('control.audit.col.after'), render: (r) => (r.afterPreview === null ? null : state({ preview: r.afterPreview, keysOnly: r.keysOnly })) },
    {
      key: 'open',
      header: t('control.m6.audit.col.detail'),
      render: (r) => (
        <button type="button" className={TAP} onClick={() => void open(r.id)} aria-label={t('control.m6.audit.openFor', { action: r.action })}>
          {t('control.m6.audit.open')}
        </button>
      ),
    },
  ];

  const apply = () => {
    setPage(1);
    setApplied(draft);
  };
  const clear = () => {
    setPage(1);
    setDraft(NONE);
    setApplied(NONE);
  };

  return (
    <section lang={lang} data-audit-logs className="flex flex-col gap-4">
      <form
        data-audit-filters
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Select id="audit-school" label={t('control.audit.filter.school')} value={draft.schoolId} onChange={(e) => setDraft({ ...draft, schoolId: e.target.value })}>
          <option value="">{t('control.audit.filter.allSchools')}</option>
          {(answer?.schools ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input id="audit-actor" label={t('control.m6.audit.filter.actor')} maxLength={80} value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />
        <Input id="audit-action" label={t('control.m6.audit.filter.actionStart')} maxLength={120} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value.trim() })} />
        <Input id="audit-from" type="date" floating={false} label={t('control.audit.filter.from')} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <Input id="audit-to" type="date" floating={false} label={t('control.audit.filter.to')} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={PRIMARY}>
            {t('control.audit.filter.apply')}
          </button>
          <button type="button" className={TAP} onClick={clear}>
            {t('control.audit.filter.clear')}
          </button>
          <a data-audit-export className={`${TAP} inline-flex items-center`} href={`/api/control/audit-logs?${query(applied, { format: 'csv' })}`} download>
            {t('control.m6.audit.export')}
          </a>
        </div>
        <p className="text-sm text-slate sm:col-span-2 lg:col-span-5">{t('control.m6.audit.exportHelp')}</p>
      </form>

      {detailFailed && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {t('control.m6.audit.detailError')}
        </p>
      )}

      <Table
        columns={columns}
        rows={answer?.rows ?? []}
        getRowId={(r) => r.id}
        state={loading && !answer ? 'loading' : failed ? 'error' : 'ready'}
        errorMessage={t('control.audit.error')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.audit.retry')}
          </button>
        }
        emptyTitle={t('control.audit.empty')}
        emptyDescription={t('control.audit.emptyHelp')}
      />

      {answer && (page > 1 || answer.hasMore) && (
        <nav data-audit-paging className="flex flex-wrap items-center gap-3">
          <button type="button" className={TAP} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>
            {t('control.audit.prev')}
          </button>
          <span className="text-sm text-slate">{t('control.audit.page', { page })}</span>
          <button type="button" className={TAP} disabled={loading || !answer.hasMore} onClick={() => setPage(page + 1)}>
            {t('control.audit.next')}
          </button>
        </nav>
      )}

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={t('control.m6.audit.detailTitle')} wide>
        {detail && (
          <dl data-audit-detail className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold text-slate">{t('control.audit.col.time')}</dt>
            <dd>
              <time dateTime={detail.at}>{when.format(new Date(detail.at))}</time>
            </dd>
            <dt className="font-semibold text-slate">{t('control.audit.col.action')}</dt>
            <dd className="break-all font-mono text-xs">{detail.action}</dd>
            <dt className="font-semibold text-slate">{t('control.audit.col.actor')}</dt>
            <dd>{[detail.actorName ?? t('control.audit.noActor'), detail.actorRole].filter(Boolean).join(' · ')}</dd>
            <dt className="font-semibold text-slate">{t('control.audit.col.school')}</dt>
            <dd>{detail.schoolName ?? t('control.audit.platform')}</dd>
            <dt className="font-semibold text-slate">{t('control.audit.col.target')}</dt>
            <dd className="break-all">{[detail.targetType, detail.targetId].filter(Boolean).join(' ') || t('control.m6.audit.none')}</dd>
            <dt className="font-semibold text-slate">{t('control.m6.audit.before')}</dt>
            <dd>{state(detail.before)}</dd>
            <dt className="font-semibold text-slate">{t('control.audit.col.after')}</dt>
            <dd>{state(detail.after)}</dd>
            <dt className="font-semibold text-slate">{t('control.m6.audit.recordId')}</dt>
            <dd className="font-mono text-xs">{detail.id}</dd>
          </dl>
        )}
      </Modal>
    </section>
  );
}
