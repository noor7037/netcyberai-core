'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useWords } from '@/components/app-shell/Words';
import { Button } from '@/components/ui/Button';

// Control → Family: the tutor's daily caps per child (W16-B4): text turns, voice minutes and photo doubts, and what a
// family on Plus gets (the multiplier). The numbers shown are the ones that apply now. Saving needs a reason, asks for
// the authenticator if this session has not shown it, and is audited with the numbers before and after.
type Caps = { textTurns: number; voiceMinutes: number; photoDoubts: number; plusMultiplier: number };
const FIELDS = [
  { id: 'textTurns', label: 'control.family.caps.text', max: 10_000, step: 1 },
  { id: 'voiceMinutes', label: 'control.family.caps.voice', max: 10_000, step: 1 },
  { id: 'photoDoubts', label: 'control.family.caps.photo', max: 10_000, step: 1 },
  { id: 'plusMultiplier', label: 'control.family.caps.plus', max: 20, step: 1 },
] as const;

export function TutorCapsForm({ initial }: { initial: Caps }) {
  const { t } = useWords();
  const { stepUpFetch } = useStepUp();
  const [saved, setSaved] = useState<Caps>(initial);
  const [value, setValue] = useState<Record<keyof Caps, string>>({ textTurns: String(initial.textTurns), voiceMinutes: String(initial.voiceMinutes), photoDoubts: String(initial.photoDoubts), plusMultiplier: String(initial.plusMultiplier) });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const num = (k: keyof Caps) => (/^\d+$/.test(value[k].trim()) ? Number(value[k].trim()) : NaN);
  const valid = FIELDS.every((f) => Number.isInteger(num(f.id)) && num(f.id) <= f.max && (f.id !== 'plusMultiplier' || num(f.id) >= 1)) && reason.trim().length >= 3;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    const next: Caps = { textTurns: num('textTurns'), voiceMinutes: num('voiceMinutes'), photoDoubts: num('photoDoubts'), plusMultiplier: num('plusMultiplier') };
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tutor_caps', ...next, reason: reason.trim() }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved(next);
      setReason('');
    }
    setNote(res?.ok ? { ok: true, text: t('control.family.caps.saved') } : { ok: false, text: t('control.family.caps.failed') });
  };

  return (
    <section aria-labelledby="family-tutor-caps" data-tutor-caps={`${saved.textTurns}/${saved.voiceMinutes}/${saved.photoDoubts}/${saved.plusMultiplier}`} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id="family-tutor-caps" className="text-lg font-bold text-slate">
        {t('control.family.caps.title')}
      </h2>
      <p className="text-sm text-slate/80">{t('control.family.caps.lead')}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.id} className="flex flex-col gap-1 text-sm font-semibold text-slate">
            {t(f.label)}
            <input type="text" inputMode="numeric" value={value[f.id]} onChange={(e) => setValue({ ...value, [f.id]: e.target.value })} aria-invalid={!Number.isInteger(num(f.id))} data-tutor-cap={f.id} className="min-h-[44px] w-full rounded-xl border border-slate/30 px-3 text-base" />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
        {t('control.family.caps.reason')}
        <input type="text" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} data-tutor-cap-reason className="min-h-[44px] w-full rounded-xl border border-slate/30 px-3 text-base" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={busy || !valid}>
          {t('control.family.caps.save')}
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
