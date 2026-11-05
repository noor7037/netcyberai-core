'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { MessageKey } from '@/lib/i18n';

// Control → System Settings: the platform's own settings, each with its plain meaning and the screen that owns it.
// W21-M6: a plain setting (a switch or a number) is changed here, inside the range its code accepts, with a reason;
// each save is audited. A list setting is changed on its own screen. A secret-looking setting shows "hidden".

type Edit = { kind: 'switch'; current: boolean | null } | { kind: 'number'; min: number; max: number; whole: boolean; current: number | null };
type Row = { key: string; hidden: boolean; value: string | null; updatedAt: string | null; screen: string | null; edit: Edit | null };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const meaningKey = (key: string) => `control.m6.sys.meaning.${key.replace(/\./g, '_')}`;

export function SystemSettingsPanel() {
  const { t, lang, has } = useWords();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/system-settings').catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { settings: Row[] } | null) : null;
    setRows(body?.settings ?? null);
    setFailed(!body);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const meaning = (key: string) => {
    const k = meaningKey(key);
    return has(k) ? t(k as MessageKey) : null;
  };
  const start = (r: Row) => {
    setEditing(r);
    setError(null);
    setReason('');
    setValue(r.edit?.kind === 'switch' ? (r.edit.current ? 'on' : 'off') : r.edit?.current === null || r.edit?.current === undefined ? '' : String(r.edit.current));
  };
  const save = async () => {
    if (!editing?.edit) return;
    const v = editing.edit.kind === 'switch' ? value === 'on' : value.trim() === '' ? NaN : Number(value);
    setSaving(true);
    setError(null);
    const res = await fetch('/api/control/system-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: editing.key, value: v, reason }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { code?: string } | null;
    setSaving(false);
    if (!res?.ok) {
      setError(t(body?.code === 'reason_required' ? 'control.m6.reasonNeeded' : body?.code === 'bad_value' ? 'control.m6.sys.badValue' : 'control.m6.notSaved'));
      return;
    }
    setSaved(editing.key);
    setEditing(null);
    void load();
  };

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const columns: TableColumn<Row>[] = [
    {
      key: 'key',
      header: t('control.sys.col.key'),
      render: (r) => (
        <span className="flex flex-col gap-1">
          <span className="break-all font-mono text-xs">{r.key}</span>
          {meaning(r.key) && <span className="text-sm text-slate">{meaning(r.key)}</span>}
        </span>
      ),
    },
    {
      key: 'value',
      header: t('control.sys.col.value'),
      render: (r) => (r.hidden ? <em>{t('control.sys.hidden')}</em> : r.value === null ? <em>{t('control.m6.sys.builtIn')}</em> : <code className="break-all text-xs">{r.value}</code>),
    },
    { key: 'updated', header: t('control.sys.col.updated'), render: (r) => (r.updatedAt ? <time dateTime={r.updatedAt}>{when.format(new Date(r.updatedAt))}</time> : t('control.sys.neverChanged')) },
    {
      key: 'screen',
      header: t('control.m6.sys.col.change'),
      render: (r) => {
        if (r.edit)
          return (
            <button type="button" className={TAP} onClick={() => start(r)} aria-label={t('control.m6.sys.changeFor', { key: r.key })}>
              {t('control.m6.sys.change')}
            </button>
          );
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

  const edit = editing?.edit;
  return (
    <section lang={lang} data-system-settings className="flex flex-col gap-4">
      {saved && (
        <p role="status" className="rounded-md border-2 border-emerald-text bg-white px-4 py-3 text-sm font-bold text-emerald-text">
          {t('control.m6.sys.saved', { key: saved })}
        </p>
      )}
      <Table
        columns={columns}
        rows={rows ?? []}
        getRowId={(r) => r.key}
        state={rows === null && !failed ? 'loading' : failed ? 'error' : 'ready'}
        errorMessage={t('control.sys.error')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.sys.retry')}
          </button>
        }
        emptyTitle={t('control.sys.empty')}
      />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? t('control.m6.sys.changeFor', { key: editing.key }) : ''}>
        {editing && edit && (
          <form
            data-setting-form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {meaning(editing.key) && <p className="text-sm text-slate">{meaning(editing.key)}</p>}
            <p className="text-sm">
              {t('control.m6.sys.now')} <code className="break-all text-xs">{editing.value ?? t('control.m6.sys.builtIn')}</code>
            </p>
            {edit.kind === 'switch' ? (
              <Select id="setting-value" label={t('control.m6.sys.newValue')} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="on">{t('control.m6.sys.on')}</option>
                <option value="off">{t('control.m6.sys.off')}</option>
              </Select>
            ) : (
              <Input
                id="setting-value"
                data-autofocus
                type="number"
                inputMode="decimal"
                min={edit.min}
                max={edit.max}
                step={edit.whole ? 1 : 0.01}
                label={t('control.m6.sys.newValue')}
                helperText={t(edit.whole ? 'control.m6.sys.rangeWhole' : 'control.m6.sys.range', { min: edit.min, max: edit.max })}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <Input id="setting-reason" label={t('control.m6.reason')} helperText={t('control.m6.reasonHelp')} minLength={3} maxLength={200} required value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && (
              <p role="alert" className="text-sm font-semibold text-red-800">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={PRIMARY} disabled={saving}>
                {t('control.m6.save')}
              </button>
              <button type="button" className={TAP} onClick={() => setEditing(null)}>
                {t('control.m6.cancel')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
