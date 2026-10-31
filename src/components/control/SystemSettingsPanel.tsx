'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';

// Control → System Settings: the platform's own settings, read only, each with the screen that changes it. Editing
// happens on that screen, never here. A secret-looking setting shows the word "hidden", not its value.

type Row = { key: string; hidden: boolean; value: string | null; updatedAt: string | null; screen: string | null };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate';

export function SystemSettingsPanel() {
  const { t, lang, has } = useWords();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/system-settings').catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { settings: Row[] } | null) : null;
    setRows(body?.settings ?? null);
    setFailed(!body);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const columns: TableColumn<Row>[] = [
    { key: 'key', header: t('control.sys.col.key'), render: (r) => <span className="break-all font-mono text-xs">{r.key}</span> },
    {
      key: 'value',
      header: t('control.sys.col.value'),
      render: (r) => (r.hidden ? <em>{t('control.sys.hidden')}</em> : <code className="break-all text-xs">{r.value}</code>),
    },
    { key: 'updated', header: t('control.sys.col.updated'), render: (r) => (r.updatedAt ? <time dateTime={r.updatedAt}>{when.format(new Date(r.updatedAt))}</time> : t('control.sys.neverChanged')) },
    {
      key: 'screen',
      header: t('control.sys.col.screen'),
      render: (r) => {
        if (!r.screen) return t('control.sys.noScreen');
        const word = `control.sys.screen.${r.screen.replace('/control/', '')}`;
        return (
          <Link href={r.screen} className={TAP}>
            {has(word) ? t(word as MessageKey) : r.screen}
          </Link>
        );
      },
    },
  ];

  return (
    <section lang={lang} data-system-settings className="flex flex-col gap-4">
      <Table
        columns={columns}
        rows={rows ?? []}
        getRowId={(r) => r.key}
        state={rows === null && !failed ? 'loading' : failed ? 'error' : 'ready'}
        errorMessage={t('control.sys.error')}
        retryAction={
          <button type="button" className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate" onClick={() => void load()}>
            {t('control.sys.retry')}
          </button>
        }
        emptyTitle={t('control.sys.empty')}
      />
    </section>
  );
}
