'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import { CLASS_MAX, CLASS_MIN, HUB_IDS, type HubEntryProblem, type HubEntryRow } from '@/lib/content/hub-entries';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Hubs (W4-3, C387): the entries of the Career Hub, the Exam Portal and Schemes & Scholarships.
// Staff add an entry with its source link and the day it was checked, edit it, publish it and withdraw it. An entry
// shows to families only while it is published and before its review day. Every change goes to the Control API, which
// checks the session, validates and writes the audit row.

const PROBLEMS: HubEntryProblem[] = ['hub', 'title_en', 'title_hi', 'body_en', 'body_hi', 'scope', 'state_code', 'class_band', 'source_url', 'verified_on', 'review_on', 'not_found', 'expired'];
const HUB_KEY: Record<(typeof HUB_IDS)[number], MessageKey> = { careers: 'fam.hub.career', exams_portal: 'fam.hub.exams', opportunities: 'fam.hub.schemes' };
const CLASSES = Array.from({ length: CLASS_MAX - CLASS_MIN + 1 }, (_, i) => CLASS_MIN + i);

type Form = {
  hub: string;
  titleEn: string;
  titleHi: string;
  bodyEn: string;
  bodyHi: string;
  scope: string;
  stateCode: string;
  classFrom: string;
  classTo: string;
  sourceUrl: string;
  verifiedOn: string;
  reviewOn: string;
};
const EMPTY: Form = { hub: 'careers', titleEn: '', titleHi: '', bodyEn: '', bodyHi: '', scope: 'national', stateCode: '', classFrom: '1', classTo: '12', sourceUrl: '', verifiedOn: '', reviewOn: '' };
const formOf = (e: HubEntryRow): Form => ({
  hub: e.hub,
  titleEn: e.titleEn,
  titleHi: e.titleHi ?? '',
  bodyEn: e.bodyEn,
  bodyHi: e.bodyHi ?? '',
  scope: e.scope,
  stateCode: e.stateCode ?? '',
  classFrom: String(e.classFrom),
  classTo: String(e.classTo),
  sourceUrl: e.sourceUrl,
  verifiedOn: e.verifiedOn,
  reviewOn: e.reviewOn,
});
const complete = (f: Form) => Boolean(f.titleEn.trim() && f.bodyEn.trim() && f.sourceUrl.trim() && f.verifiedOn && f.reviewOn && (f.scope === 'national' || f.stateCode));

export function HubEntriesView({ initial }: { initial: HubEntryRow[] }) {
  const { t } = useT();
  const [entries, setEntries] = useState<HubEntryRow[]>(initial);
  const [adding, setAdding] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const classWord = (n: number) => (n === -2 ? t('fam.class.nursery') : n === -1 ? t('fam.class.lkg') : n === 0 ? t('fam.class.ukg') : String(n));

  const send = async (payload: unknown, done: MessageKey): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/content/hubs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setBusy(false);
      const code = got?.code as HubEntryProblem | undefined;
      setNote({ ok: false, text: t(code && PROBLEMS.includes(code) ? (`hubs.err.${code}` as MessageKey) : 'hubs.err.other') });
      return false;
    }
    const list = await fetch('/api/control/content/hubs', { cache: 'no-store' }).catch(() => null);
    const fresh = list?.ok ? ((await list.json().catch(() => null)) as { entries: HubEntryRow[] } | null) : null;
    if (fresh) setEntries(fresh.entries);
    setBusy(false);
    setNote({ ok: true, text: t(done) });
    return true;
  };

  const fields = (f: Form, set: (f: Form) => void, p: string) => (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id={`${p}-hub`} label={t('hubs.f.hub')} value={f.hub} onChange={(e) => set({ ...f, hub: e.target.value })}>
          {HUB_IDS.map((h) => (
            <option key={h} value={h}>
              {t(HUB_KEY[h])}
            </option>
          ))}
        </Select>
        <Select id={`${p}-scope`} label={t('hubs.f.scope')} value={f.scope} onChange={(e) => set({ ...f, scope: e.target.value, stateCode: e.target.value === 'national' ? '' : f.stateCode })}>
          <option value="national">{t('hubs.scope.national')}</option>
          <option value="state">{t('hubs.scope.state')}</option>
        </Select>
      </div>
      {f.scope === 'state' && (
        <Select id={`${p}-state`} label={t('hubs.f.state')} value={f.stateCode} onChange={(e) => set({ ...f, stateCode: e.target.value })}>
          <option value="">{t('hubs.f.statePick')}</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id={`${p}-from`} label={t('hubs.f.classFrom')} value={f.classFrom} onChange={(e) => set({ ...f, classFrom: e.target.value })}>
          {CLASSES.map((n) => (
            <option key={n} value={n}>
              {classWord(n)}
            </option>
          ))}
        </Select>
        <Select id={`${p}-to`} label={t('hubs.f.classTo')} value={f.classTo} onChange={(e) => set({ ...f, classTo: e.target.value })}>
          {CLASSES.map((n) => (
            <option key={n} value={n}>
              {classWord(n)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id={`${p}-te`} label={t('hubs.f.titleEn')} maxLength={160} value={f.titleEn} onChange={(e) => set({ ...f, titleEn: e.target.value })} />
        <Input id={`${p}-th`} lang="hi" label={t('hubs.f.titleHi')} maxLength={160} value={f.titleHi} onChange={(e) => set({ ...f, titleHi: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea id={`${p}-be`} floating={false} label={t('hubs.f.bodyEn')} maxLength={1200} rows={5} value={f.bodyEn} onChange={(e) => set({ ...f, bodyEn: e.target.value })} />
        <Textarea id={`${p}-bh`} floating={false} lang="hi" label={t('hubs.f.bodyHi')} maxLength={1200} rows={5} value={f.bodyHi} onChange={(e) => set({ ...f, bodyHi: e.target.value })} />
      </div>
      <Input id={`${p}-url`} type="url" inputMode="url" label={t('hubs.f.sourceUrl')} maxLength={500} value={f.sourceUrl} onChange={(e) => set({ ...f, sourceUrl: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id={`${p}-ver`} type="date" label={t('hubs.f.verifiedOn')} value={f.verifiedOn} onChange={(e) => set({ ...f, verifiedOn: e.target.value })} />
        <Input id={`${p}-rev`} type="date" label={t('hubs.f.reviewOn')} value={f.reviewOn} onChange={(e) => set({ ...f, reviewOn: e.target.value })} />
      </div>
    </div>
  );

  const statusBadge = (e: HubEntryRow) =>
    e.status === 'published' && !e.expired ? (
      <Badge variant="success">{t('hubs.status.published')}</Badge>
    ) : e.status === 'published' ? (
      <Badge variant="warning">{t('hubs.status.expiredPublished')}</Badge>
    ) : e.status === 'withdrawn' ? (
      <Badge variant="danger">{t('hubs.status.withdrawn')}</Badge>
    ) : (
      <Badge variant="neutral">{t('hubs.status.draft')}</Badge>
    );

  return (
    <section data-hub-entries-control className={SECTION}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold">{t('hubs.title')}</h2>
        <InfoTip>{t('hubs.how')}</InfoTip>
      </div>
      <p>{t('hubs.lead')}</p>
      {note && (
        <p role="status" data-hub-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      {entries.length === 0 && <p data-hub-none>{t('hubs.none')}</p>}
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.entryId} data-hub-entry={e.entryId} data-hub-status={e.status} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
            {editing?.id === e.entryId ? (
              <>
                {fields(editing.form, (form) => setEditing({ id: e.entryId, form }), `he-${e.entryId}`)}
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-hub-save className={PRIMARY} disabled={busy || !complete(editing.form)} onClick={() => void send({ action: 'edit', entryId: e.entryId, ...editing.form }, 'hubs.saved').then((ok) => ok && setEditing(null))}>
                    {t('hubs.save')}
                  </button>
                  <button type="button" className={TAP} disabled={busy} onClick={() => setEditing(null)}>
                    {t('gs.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(e)}
                  <span className="text-slate/70">{t(HUB_KEY[e.hub])}</span>
                  <span data-hub-expiry className={e.expired ? 'font-semibold text-red-800' : 'text-slate/70'}>
                    {e.expired ? t('hubs.expired') : t('hubs.expiresOn').replace('{date}', e.reviewOn)}
                  </span>
                </div>
                <p className="font-bold">{e.titleEn}</p>
                {e.titleHi ? <p lang="hi">{e.titleHi}</p> : <p className="text-slate/70">{t('hubs.noHindi')}</p>}
                <p className="whitespace-pre-line">{e.bodyEn}</p>
                <p className="text-slate/70">
                  {e.scope === 'state' ? (INDIAN_STATES.find((s) => s.code === e.stateCode)?.name ?? e.stateCode) : t('hubs.scope.national')} · {t('hubs.classes').replace('{from}', classWord(e.classFrom)).replace('{to}', classWord(e.classTo))}
                </p>
                <p className="break-all text-slate/70">
                  {e.sourceUrl} · {t('hubs.checked').replace('{date}', e.verifiedOn)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-hub-edit className={TAP} disabled={busy} onClick={() => setEditing({ id: e.entryId, form: formOf(e) })}>
                    {t('hubs.edit')}
                  </button>
                  {e.status !== 'published' && (
                    <button type="button" data-hub-publish className={TAP} disabled={busy} onClick={() => void send({ action: 'publish', entryId: e.entryId }, 'hubs.published')}>
                      {t('hubs.publish')}
                    </button>
                  )}
                  {e.status !== 'withdrawn' && (
                    <button type="button" data-hub-withdraw className={TAP} disabled={busy} onClick={() => void send({ action: 'withdraw', entryId: e.entryId }, 'hubs.withdrawn')}>
                      {t('hubs.withdraw')}
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div data-hub-new className="flex flex-col gap-3 border-t border-slate/10 pt-3">
        <h3 className="font-bold">{t('hubs.add.title')}</h3>
        {fields(adding, setAdding, 'hn')}
        <button type="button" data-hub-add className={`${PRIMARY} self-start`} disabled={busy || !complete(adding)} onClick={() => void send({ action: 'add', ...adding }, 'hubs.added').then((ok) => ok && setAdding(EMPTY))}>
          {t('hubs.add.save')}
        </button>
      </div>
    </section>
  );
}
