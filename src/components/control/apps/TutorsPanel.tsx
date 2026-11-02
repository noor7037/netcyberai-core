'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useWords } from '@/components/app-shell/Words';
import { Button } from '@/components/ui/Button';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import type { ControlTutor } from '@/lib/control/family-settings';
import type { Lang, MessageKey } from '@/lib/i18n';

// Control → Family: the platform's tutors (W16-A3; add, change and switch since 2 Nov 2026). Each row: the tutor's name,
// its subject, the language it speaks, how it teaches, "Off" when it is switched off for every family, and Change /
// Switch off. "Add a tutor" opens the one form (both names, both lines, subject, language). Every save needs a reason,
// asks for the authenticator if this session has not shown it, and is audited; the server answers with the whole list.
type Draft = { key: string | null; nameEn: string; nameHi: string; styleEn: string; styleHi: string; subject: string; language: 'en' | 'hi' | 'both'; enabled: boolean };
const EMPTY: Draft = { key: null, nameEn: '', nameHi: '', styleEn: '', styleHi: '', subject: '', language: 'both', enabled: true };
const FIELD = 'min-h-[44px] w-full rounded-xl border border-slate/30 px-3 text-base';

export function TutorsPanel({ initial, lang }: { initial: readonly ControlTutor[]; lang: Lang }) {
  const { t } = useWords();
  const { stepUpFetch } = useStepUp();
  const [tutors, setTutors] = useState<readonly ControlTutor[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const reasonOk = reason.trim().length >= 3;
  const words = (d: Draft) => [d.nameEn, d.nameHi].every((s) => s.trim().length >= 1 && s.trim().length <= 40) && [d.styleEn, d.styleHi].every((s) => s.trim().length >= 1 && s.trim().length <= 140);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tutor_save', ...body, reason: reason.trim() }) });
    const got = res?.ok ? ((await res.json().catch(() => null)) as { tutors?: ControlTutor[] } | null) : null;
    setBusy(false);
    if (got?.tutors) {
      setTutors(got.tutors);
      setReason('');
      setDraft(null);
    }
    setNote(got?.tutors ? { ok: true, text: t('control.family.tutors.saved') } : { ok: false, text: t('control.family.tutors.failed') });
    return Boolean(got?.tutors);
  };
  const save = async () => {
    if (!draft) return;
    if (!words(draft) || !reasonOk) return setNote({ ok: false, text: t('control.family.tutors.need') });
    await send({ key: draft.key, nameEn: draft.nameEn.trim(), nameHi: draft.nameHi.trim(), styleEn: draft.styleEn.trim(), styleHi: draft.styleHi.trim(), subject: draft.subject || null, language: draft.language, enabled: draft.enabled });
  };
  const toggle = async (x: ControlTutor) => {
    if (!reasonOk) return setNote({ ok: false, text: t('control.family.tutors.need') });
    await send({ key: x.key, nameEn: x.nameEn, nameHi: x.nameHi, styleEn: x.styleEn, styleHi: x.styleHi, subject: x.subject, language: x.language, enabled: !x.enabled });
  };

  return (
    <section data-control-tutors className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold text-slate">{t('control.family.tutors.title')}</h2>
        <p className="text-sm text-slate">{t('control.family.tutors.lead')}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
        {t('control.family.tutors.reason')}
        <input type="text" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} data-tutor-reason className={FIELD} />
      </label>
      {tutors.length === 0 ? (
        <p className="text-sm text-slate">{t('control.family.tutors.none')}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {tutors.map((x) => (
            <li key={x.key} data-control-tutor={x.key} className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate/10 p-3 text-sm text-slate">
              <p className="break-words text-base font-bold">
                {lang === 'hi' ? x.nameHi : x.nameEn}
                {!x.enabled && <span className="ml-2 rounded-full bg-slate/10 px-2.5 py-0.5 text-sm font-medium">{t('control.family.tutors.off')}</span>}
              </p>
              <p className="break-words">{lang === 'hi' ? x.styleHi : x.styleEn}</p>
              <p className="text-slate/80">
                {x.subject ? t(`fam.subject.${x.subject}` as MessageKey) : t('control.family.tutors.all')} · {t(`aitutors.lang.${x.language}` as MessageKey)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy} data-tutor-edit onClick={() => setDraft({ key: x.key, nameEn: x.nameEn, nameHi: x.nameHi, styleEn: x.styleEn, styleHi: x.styleHi, subject: x.subject ?? '', language: x.language, enabled: x.enabled })}>
                  {t('control.family.tutors.edit')}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} data-tutor-switch onClick={() => void toggle(x)}>
                  {t(x.enabled ? 'control.family.tutors.switchOff' : 'control.family.tutors.switchOn')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form
          data-tutor-form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-3 rounded-lg border border-slate/20 bg-off-white p-3"
        >
          {(
            [
              ['nameEn', 'control.family.tutors.nameEn', 40],
              ['nameHi', 'control.family.tutors.nameHi', 40],
              ['styleEn', 'control.family.tutors.styleEn', 140],
              ['styleHi', 'control.family.tutors.styleHi', 140],
            ] as const
          ).map(([k, label, max]) => (
            <label key={k} className="flex flex-col gap-1 text-sm font-semibold text-slate">
              {t(label)}
              <input type="text" value={draft[k]} maxLength={max} required onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} data-tutor-field={k} className={FIELD} />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
            {t('control.family.tutors.subject')}
            <select value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} data-tutor-field="subject" className={FIELD}>
              <option value="">{t('control.family.tutors.all')}</option>
              {SUBJECT_IDS.map((s) => (
                <option key={s} value={s}>
                  {t(`fam.subject.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
            {t('control.family.tutors.language')}
            <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as Draft['language'] })} data-tutor-field="language" className={FIELD}>
              {(['both', 'en', 'hi'] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`aitutors.lang.${l}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {t('control.family.tutors.save')}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDraft(null)}>
              {t('control.family.tutors.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" disabled={busy} data-tutor-add onClick={() => setDraft(EMPTY)}>
            {t('control.family.tutors.add')}
          </Button>
        </div>
      )}
      {note && (
        <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-emerald-text' : 'text-coral-deep'}`}>
          {note.text}
        </p>
      )}
    </section>
  );
}
