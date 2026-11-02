'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import type { MessageKey } from '@/lib/i18n';
import type { OwnTutorRow, PlatformTutorRow, TutorLanguage, TutorsView } from '@/lib/ai-tutors';

// AI Tutors (W16-A3), for the principal and the school admin: NetCyberAI's tutors (read only; a switch for each, for this
// school) and the school's own tutors (add, edit, switch off). The server decides everything and audits every change;
// every word is in the message files. Nothing is removed: a tutor is switched off.

const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const QUIET = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const BOX = 'flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4';
const ROW = 'flex min-w-0 flex-col gap-2 rounded-xl border border-slate/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between';
const FIELD = 'min-h-[44px] w-full rounded-md border border-slate/30 bg-white px-3 text-base text-slate';

type Draft = { tutorId: string | null; name: string; subject: string; style: string; language: TutorLanguage };
const EMPTY: Draft = { tutorId: null, name: '', subject: '', style: '', language: 'both' };

export function AiTutorsView() {
  const { t, lang } = useT();
  const [data, setData] = useState<TutorsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/ai-tutors', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as TutorsView | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/app/ai-tutors', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const fault = (await res?.json().catch(() => null)) as { error?: string } | null;
      setNote({ ok: false, text: fault?.error ?? t('aitutors.failed') });
      return false;
    }
    setNote({ ok: true, text: t('aitutors.saved') });
    await load();
    return true;
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.style.trim()) return setNote({ ok: false, text: t('aitutors.needWords') });
    const words = { name: draft.name, subject: draft.subject === '' ? null : draft.subject, style: draft.style, language: draft.language };
    const done = draft.tutorId ? await send('PATCH', { tutorId: draft.tutorId, ...words }) : await send('POST', words);
    if (done) setDraft(null);
  };

  const subjectName = (s: string | null) => (s ? t(`fam.subject.${s}` as MessageKey) : t('aitutors.subject.any'));
  const languageName = (l: TutorLanguage) => t(`aitutors.lang.${l}` as MessageKey);

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('aitutors.loadFailed')}</p>;
  if (!data) return null;
  return (
    <div lang={lang} data-ai-tutors className="flex flex-col gap-6 text-sm text-slate">
      {note && (
        <p role={note.ok ? 'status' : 'alert'} data-ai-tutors-note={note.ok ? 'ok' : 'failed'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      <section data-ai-tutors-platform className={BOX}>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold text-slate">{t('aitutors.platform.title')}</h2>
          <p>{t('aitutors.platform.lead')}</p>
        </div>
        <ul className="flex list-none flex-col gap-2 p-0">
          {data.platform.map((p) => (
            <PlatformRow key={p.key} row={p} busy={busy} subject={subjectName(p.subject)} language={languageName(p.language)} onSwitch={() => void send('PATCH', { platformKey: p.key, enabled: !p.enabled })} />
          ))}
        </ul>
      </section>

      <section data-ai-tutors-own className={BOX}>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold text-slate">{t('aitutors.own.title')}</h2>
          <p>{t('aitutors.own.lead')}</p>
        </div>
        {data.own.length === 0 && !draft && <p data-empty="ai-tutors">{t('aitutors.own.empty')}</p>}
        <ul className="flex list-none flex-col gap-2 p-0">
          {data.own.map((o) => (
            <OwnRow
              key={o.tutorId}
              row={o}
              busy={busy}
              subject={subjectName(o.subject)}
              language={languageName(o.language)}
              onEdit={() => setDraft({ tutorId: o.tutorId, name: o.name, subject: o.subject ?? '', style: o.style, language: o.language })}
              onSwitch={() => void send('PATCH', { tutorId: o.tutorId, enabled: !o.enabled })}
            />
          ))}
        </ul>
        {draft ? (
          <form
            data-ai-tutors-form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-3 rounded-xl border border-slate/20 bg-off-white p-3"
          >
            <label className="flex flex-col gap-1 font-semibold">
              {t('aitutors.field.name')}
              <input className={FIELD} value={draft.name} maxLength={40} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              {t('aitutors.field.subject')}
              <select className={FIELD} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}>
                <option value="">{t('aitutors.subject.any')}</option>
                {SUBJECT_IDS.map((s) => (
                  <option key={s} value={s}>
                    {t(`fam.subject.${s}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              {t('aitutors.field.style')}
              <input className={FIELD} value={draft.style} maxLength={140} required onChange={(e) => setDraft({ ...draft, style: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              {t('aitutors.field.language')}
              <select className={FIELD} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as TutorLanguage })}>
                {(['both', 'en', 'hi'] as const).map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={PRIMARY}>
                {t('aitutors.save')}
              </button>
              <button type="button" disabled={busy} onClick={() => setDraft(null)} className={QUIET}>
                {t('aitutors.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button type="button" data-ai-tutors-add onClick={() => setDraft(EMPTY)} className={PRIMARY}>
              {t('aitutors.add')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function PlatformRow({ row, busy, subject, language, onSwitch }: { row: PlatformTutorRow; busy: boolean; subject: string; language: string; onSwitch: () => void }) {
  const { t, lang } = useT();
  return (
    <li data-platform-tutor={row.key} data-enabled={row.enabled} className={ROW}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="break-words text-base font-bold text-slate">
          {lang === 'hi' ? row.nameHi : row.nameEn} <Badge variant={row.enabled ? 'success' : 'neutral'}>{row.enabled ? t('aitutors.state.on') : t('aitutors.state.off')}</Badge>
        </p>
        <p className="break-words">{lang === 'hi' ? row.styleHi : row.styleEn}</p>
        <p className="text-slate/80">
          {subject} · {language}
        </p>
      </div>
      <button type="button" disabled={busy} onClick={onSwitch} className={QUIET}>
        {row.enabled ? t('aitutors.switch.off') : t('aitutors.switch.on')}
      </button>
    </li>
  );
}

function OwnRow({ row, busy, subject, language, onEdit, onSwitch }: { row: OwnTutorRow; busy: boolean; subject: string; language: string; onEdit: () => void; onSwitch: () => void }) {
  const { t } = useT();
  return (
    <li data-own-tutor={row.tutorId} data-enabled={row.enabled} className={ROW}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="break-words text-base font-bold text-slate">
          {row.name} <Badge variant={row.enabled ? 'success' : 'neutral'}>{row.enabled ? t('aitutors.state.on') : t('aitutors.state.off')}</Badge>
        </p>
        <p className="break-words">{row.style}</p>
        <p className="text-slate/80">
          {subject} · {language}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onEdit} className={QUIET}>
          {t('aitutors.edit')}
        </button>
        <button type="button" disabled={busy} onClick={onSwitch} className={QUIET}>
          {row.enabled ? t('aitutors.switch.off') : t('aitutors.switch.on')}
        </button>
      </div>
    </li>
  );
}
