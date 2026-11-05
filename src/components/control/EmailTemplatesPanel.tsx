'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';

// Control → Templates → Email (W21-M6): every email the app sends, with whose words it uses. The emails whose words
// are plain values can take the founder's own subject and words, with a preview and a reason; each save is audited.

type Row = { template: string; editable: boolean; placeholders: string[]; defaultSubject: string | null; defaultBody: string | null; override: { subject: string; body: string; updatedAt: string } | null };
type Preview = { subject: string; html: string; text: string };
const TAP = 'inline-flex min-h-[44px] items-center rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';

export function EmailTemplatesPanel() {
  const { t, lang } = useWords();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/templates/email').catch(() => null);
    const out = res?.ok ? ((await res.json().catch(() => null)) as { templates: Row[] } | null) : null;
    setRows(out?.templates ?? null);
    setFailed(!out);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const start = (r: Row) => {
    setEditing(r);
    setSubject(r.override?.subject ?? r.defaultSubject ?? '');
    setBody(r.override?.body ?? r.defaultBody ?? '');
    setReason('');
    setPreview(null);
    setError(null);
  };
  const codeWord = (code?: string) => t(code === 'reason_required' ? 'control.m6.reasonNeeded' : code === 'unknown_value' ? 'control.m6.tpl.unknownValue' : code === 'bad_words' ? 'control.m6.tpl.badWords' : 'control.m6.notSaved');
  const post = async (action: 'preview' | 'save' | 'reset') => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/control/templates/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, template: editing.template, subject, body, reason }) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { code?: string; preview?: Preview } | null;
    setBusy(false);
    if (!res?.ok) return setError(codeWord(out?.code));
    if (action === 'preview') return setPreview(out?.preview ?? null);
    setSaved(editing.template);
    setEditing(null);
    void load();
  };

  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const columns: TableColumn<Row>[] = [
    { key: 'name', header: t('control.m6.tpl.col.email'), render: (r) => <span className="break-all font-mono text-xs">{r.template}</span> },
    {
      key: 'state',
      header: t('control.m6.tpl.col.words'),
      render: (r) =>
        r.override ? (
          <span>
            {t('control.m6.tpl.yours')} · <time dateTime={r.override.updatedAt}>{when.format(new Date(r.override.updatedAt))}</time>
          </span>
        ) : (
          t('control.m6.tpl.codes')
        ),
    },
    {
      key: 'edit',
      header: t('control.m6.tpl.col.change'),
      render: (r) =>
        r.editable ? (
          <button type="button" className={TAP} onClick={() => start(r)} aria-label={t('control.m6.tpl.editFor', { name: r.template })}>
            {t('control.m6.tpl.edit')}
          </button>
        ) : (
          <span className="text-sm text-slate">{t('control.m6.tpl.fixed')}</span>
        ),
    },
  ];

  return (
    <section lang={lang} data-email-templates className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-midnight">{t('control.m6.tpl.title')}</h2>
      <p className="text-sm text-slate">{t('control.m6.tpl.about')}</p>
      {saved && (
        <p role="status" className="rounded-md border-2 border-emerald-text bg-white px-4 py-3 text-sm font-bold text-emerald-text">
          {t('control.m6.tpl.saved', { name: saved })}
        </p>
      )}
      <Table
        columns={columns}
        rows={rows ?? []}
        getRowId={(r) => r.template}
        state={rows === null && !failed ? 'loading' : failed ? 'error' : 'ready'}
        errorMessage={t('control.m6.loadError')}
        retryAction={
          <button type="button" className={TAP} onClick={() => void load()}>
            {t('control.m6.retry')}
          </button>
        }
        emptyTitle={t('control.m6.tpl.empty')}
      />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? t('control.m6.tpl.editFor', { name: editing.template }) : ''} wide>
        {editing && (
          <form
            data-email-template-form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void post('save');
            }}
          >
            <p className="text-sm text-slate">{t('control.m6.tpl.values', { names: editing.placeholders.map((n) => `{${n}}`).join(', ') })}</p>
            <Input id="email-subject" label={t('control.m6.tpl.subject')} maxLength={150} required value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea id="email-body" label={t('control.m6.tpl.body')} helperText={t('control.m6.tpl.bodyHelp')} rows={8} maxLength={3000} required value={body} onChange={(e) => setBody(e.target.value)} />
            <Input id="email-reason" label={t('control.m6.reason')} helperText={t('control.m6.reasonHelp')} minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && (
              <p role="alert" className="text-sm font-semibold text-red-800">
                {error}
              </p>
            )}
            {preview && (
              <div data-email-preview className="flex flex-col gap-2 rounded-md border border-slate/20 p-3">
                <p className="text-sm font-semibold">
                  {t('control.m6.tpl.subject')}: {preview.subject}
                </p>
                <iframe title={t('control.m6.tpl.previewTitle')} sandbox="" srcDoc={preview.html} className="h-72 w-full rounded border border-slate/10 bg-white" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={TAP} disabled={busy} onClick={() => void post('preview')}>
                {t('control.m6.tpl.preview')}
              </button>
              <button type="submit" className={PRIMARY} disabled={busy}>
                {t('control.m6.save')}
              </button>
              {editing.override && (
                <button type="button" className={TAP} disabled={busy} onClick={() => void post('reset')}>
                  {t('control.m6.tpl.reset')}
                </button>
              )}
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
