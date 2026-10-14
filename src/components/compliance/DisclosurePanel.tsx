'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import type { DisclosureItem } from '@/lib/compliance/disclosure';
import { CARD, dayFormat, FIELD, PRIMARY, refusal, send, TAP, type Say } from './desk-client';

// The mandatory public disclosure data of the compliance desk (C227): each item as the school's board names it, what
// the school discloses, and where it comes from. Every change is kept as a new version, with who and when; the earlier
// versions are shown under each item. The printable page and the CSV show exactly what is in force. Nothing is put on
// the website.

type Form = { itemId: string | null; heading: string; value: string; source: string };
const EMPTY: Form = { itemId: null, heading: '', value: '', source: '' };

export function DisclosurePanel({ items, reload, say }: { items: DisclosureItem[]; reload: () => Promise<void>; say: Say }) {
  const { t, lang } = useT();
  const [form, setForm] = useState<Form>(EMPTY);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = dayFormat(lang);

  const save = async () => {
    setBusy(true);
    const reply = await send('/api/app/compliance/disclosure', 'POST', form);
    setBusy(false);
    if (!reply.ok) return say(false, t(refusal(reply)));
    say(true, t(form.itemId ? 'cdk.dis.changed' : 'cdk.dis.added'));
    setForm(EMPTY);
    await reload();
  };
  const remove = async (itemId: string) => {
    setBusy(true);
    const reply = await send(`/api/app/compliance/disclosure/${itemId}`, 'DELETE');
    setBusy(false);
    setRemoving(null);
    if (!reply.ok) return say(false, t(refusal(reply)));
    say(true, t('cdk.dis.removed'));
    await reload();
  };

  return (
    <section data-cdk-disclosure className={CARD}>
      <div>
        <h2 className="text-base font-bold">{t('cdk.dis.title')}</h2>
        <p className="text-slate/70">{t('cdk.dis.how')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/app/compliance/desk/disclosure" data-cdk-print className={TAP}>{t('cdk.dis.print')}</a>
        <a href="/api/app/compliance/disclosure/export" data-cdk-csv className={TAP}>{t('cdk.dis.csv')}</a>
      </div>
      {items.length === 0 ? (
        <p data-cdk-dis-empty className="rounded-md bg-off-white px-3 py-2">{t('cdk.dis.none')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i, n) => (
            <li key={i.item_id} data-cdk-item={i.item_id} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
              <p className="break-words font-bold">{n + 1}. {i.heading}</p>
              <p className="whitespace-pre-wrap break-words">{i.value}</p>
              <p className="break-words text-slate/70">{t('cdk.dis.from', { source: i.source })}</p>
              <p className="text-slate/70">{t('cdk.dis.changedBy', { name: i.changed_by ?? '', date: date(i.changed_at) })}</p>
              {i.earlier.length > 0 && (
                <details className="rounded-md bg-off-white px-3">
                  <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('cdk.dis.earlier', { n: i.earlier.length })}</summary>
                  <ul className="flex flex-col gap-2 pb-2">
                    {i.earlier.map((v) => (
                      <li key={v.changed_at} className="flex flex-col break-words">
                        <span className="font-semibold">{v.heading}</span>
                        <span className="whitespace-pre-wrap">{v.value}</span>
                        <span className="text-slate/70">{t('cdk.dis.from', { source: v.source ?? '' })}</span>
                        <span className="text-slate/70">{t('cdk.dis.changedBy', { name: v.changed_by ?? '', date: date(v.changed_at) })}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" data-cdk-item-change className={TAP} onClick={() => setForm({ itemId: i.item_id, heading: i.heading, value: i.value, source: i.source })}>{t('cdk.dis.change')}</button>
                {removing === i.item_id ? (
                  <>
                    <button type="button" data-cdk-item-remove-yes disabled={busy} className={TAP} onClick={() => void remove(i.item_id)}>{t('cdk.dis.removeYes')}</button>
                    <button type="button" className={TAP} onClick={() => setRemoving(null)}>{t('cdk.cancel')}</button>
                  </>
                ) : (
                  <button type="button" data-cdk-item-remove className={TAP} onClick={() => setRemoving(i.item_id)}>{t('cdk.dis.remove')}</button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div data-cdk-dis-form className="flex flex-col gap-3 rounded-md bg-off-white p-3">
        <p className="font-semibold">{t(form.itemId ? 'cdk.dis.changeTitle' : 'cdk.dis.addTitle')}</p>
        <Input id="cdk-dis-heading" label={t('cdk.dis.heading')} helperText={t('cdk.dis.headingHelp')} maxLength={160} value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} />
        <div className="flex flex-col gap-1">
          <label htmlFor="cdk-dis-value" className="text-sm font-medium">{t('cdk.dis.value')}</label>
          <textarea id="cdk-dis-value" rows={3} maxLength={2000} className={`${FIELD} py-2`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        </div>
        <Input id="cdk-dis-source" label={t('cdk.dis.source')} helperText={t('cdk.dis.sourceHelp')} maxLength={300} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <button type="button" data-cdk-dis-save disabled={busy || !form.heading.trim() || !form.value.trim() || !form.source.trim()} className={PRIMARY} onClick={() => void save()}>
            {t(form.itemId ? 'cdk.dis.saveChange' : 'cdk.dis.add')}
          </button>
          {form.itemId && <button type="button" className={TAP} onClick={() => setForm(EMPTY)}>{t('cdk.cancel')}</button>}
        </div>
      </div>
    </section>
  );
}
