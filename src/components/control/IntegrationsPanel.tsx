'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';

// Control → Integrations (W21-M6): every outside service in one table, its state, its key as the last four
// characters, its last test, and where it is set. "Test" runs the existing test where one exists.

type Row = { id: string; kind: string; name: string; state: string; keyLast4: string | null; testedAt: string | null; testOk: boolean | null; where: string | null; test: { url: string; body: Record<string, string> } | null };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';

export function IntegrationsPanel() {
  const { t, lang, has } = useWords();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; name: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/integrations').catch(() => null);
    const out = res?.ok ? ((await res.json().catch(() => null)) as { integrations: Row[] } | null) : null;
    setRows(out?.integrations ?? null);
    setFailed(!out);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const runTest = async (r: Row) => {
    if (!r.test) return;
    setTesting(r.id);
    setNote(null);
    const res = await fetch(r.test.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.test.body) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { ok?: boolean; works?: boolean } | null;
    setTesting(null);
    setNote({ ok: Boolean(res?.ok && (out?.works ?? out?.ok)), name: r.name });
    void load();
  };

  const word = (prefix: string, v: string) => {
    const k = `${prefix}${v}`;
    return has(k) ? t(k as MessageKey) : v;
  };
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const columns: TableColumn<Row>[] = [
    { key: 'kind', header: t('control.m6.int.col.kind'), render: (r) => word('control.m6.int.kind.', r.kind) },
    { key: 'name', header: t('control.m6.int.col.name'), render: (r) => <span className="break-all">{r.name}</span> },
    { key: 'state', header: t('control.m6.int.col.state'), render: (r) => word('control.m6.int.state.', r.state) },
    { key: 'key', header: t('control.m6.int.col.key'), render: (r) => (r.keyLast4 ? <code className="text-xs">{t('control.m6.int.last4', { last4: r.keyLast4 })}</code> : '') },
    {
      key: 'tested',
      header: t('control.m6.int.col.tested'),
      render: (r) => (r.testedAt ? <span>{t(r.testOk ? 'control.m6.int.passed' : 'control.m6.int.failed')} · <time dateTime={r.testedAt}>{when.format(new Date(r.testedAt))}</time></span> : r.test ? t('control.m6.never') : t('control.m6.int.noTest')),
    },
    {
      key: 'act',
      header: t('control.m6.int.col.action'),
      render: (r) => (
        <span className="flex flex-wrap gap-2">
          {r.test && (
            <button type="button" className={TAP} disabled={testing !== null} onClick={() => void runTest(r)} aria-label={t('control.m6.int.testFor', { name: r.name })}>
              {testing === r.id ? t('control.m6.int.testing') : t('control.m6.int.test')}
            </button>
          )}
          {r.where ? (
            <Link href={r.where} className={TAP}>
              {t('control.m6.int.open')}
            </Link>
          ) : (
            <span className="text-sm text-slate">{t(r.state === 'not_started' ? 'control.m6.int.later' : 'control.m6.int.onServer')}</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <section lang={lang} data-integrations className="flex flex-col gap-4">
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={`rounded-md border-2 bg-white px-4 py-3 text-sm font-bold ${note.ok ? 'border-emerald-text text-emerald-text' : 'border-red-600 text-red-800'}`}>
          {t(note.ok ? 'control.m6.int.testOk' : 'control.m6.int.testBad', { name: note.name })}
        </p>
      )}
      <Table
        columns={columns}
        rows={rows ?? []}
        getRowId={(r) => r.id}
        state={rows === null && !failed ? 'loading' : failed ? 'error' : 'ready'}
        errorMessage={t('control.m6.loadError')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.m6.retry')}
          </button>
        }
        emptyTitle={t('control.m6.int.empty')}
      />
    </section>
  );
}
