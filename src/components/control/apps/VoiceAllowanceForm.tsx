'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';

// Control → Family: the daily voice allowance per family, in characters (C230-AS, C388). The server voice's lines
// (the chapter reader and live English) meter against it, not against the family's AI requests; when it is used up the
// phone's own voice reads, and the screen says so. 0 keeps the server voice off for families. Saving asks for the
// authenticator if this session has not shown it, and is audited.
const MAX = 1_000_000;

export function VoiceAllowanceForm({ initial }: { initial: number | null }) {
  const { t } = useT();
  const { stepUpFetch } = useStepUp();
  const [saved, setSaved] = useState<number | null>(initial);
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const valid = Number.isInteger(n) && n >= 0 && n <= MAX;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'voice_allowance', chars: n }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setSaved(n);
    setNote(res?.ok ? { ok: true, text: t('control.family.voice.saved') } : { ok: false, text: t('control.family.voice.failed') });
  };

  return (
    <section aria-labelledby="family-voice-allowance" data-voice-allowance={saved ?? 'unset'} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id="family-voice-allowance" className="text-lg font-bold text-slate">
        {t('control.family.voice.title')}
      </h2>
      <p className="text-sm text-slate/80">{t('control.family.voice.lead')}</p>
      <p className="text-sm font-semibold text-slate">{saved === null ? t('control.family.voice.unset') : t('control.family.voice.now', { n: saved.toLocaleString('en-IN') })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
          {t('control.family.voice.label')}
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid}
            className="min-h-[44px] w-40 rounded-xl border border-slate/30 px-3 text-base"
          />
        </label>
        <Button type="button" onClick={() => void save()} disabled={busy || !valid}>
          {t('control.family.voice.save')}
        </Button>
        {note && (
          <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-emerald-text' : 'text-coral-deep'}`}>
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
