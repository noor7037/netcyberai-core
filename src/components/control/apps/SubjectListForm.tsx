'use client';

import { useState } from 'react';
import { useStepUp } from '@/components/auth/StepUp';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';
import type { MessageKey } from '@/lib/i18n';

// Control → Family: one of its two lists of subjects. `open_subjects` (C298): open to every child, whatever their free
// subject is. `reviewed_only` (C300): chapters and topics show only checked explanations. The pilot sets both to EVS for
// its Class 5 children (C230-S). Saving asks for the authenticator if this session has not shown it, and is audited.
export function SubjectListForm({ list, subjects, initial }: { list: 'open_subjects' | 'reviewed_only'; subjects: readonly string[]; initial: readonly string[] }) {
  const k = list === 'open_subjects' ? 'open' : 'reviewed';
  const { t } = useT();
  const { stepUpFetch } = useStepUp();
  const [chosen, setChosen] = useState<string[]>([...initial]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: list, subjects: chosen }) }).catch(() => null);
    setBusy(false);
    setNote(res?.ok ? { ok: true, text: t(`control.family.${k}.saved` as MessageKey) } : { ok: false, text: t(`control.family.${k}.failed` as MessageKey) });
  };

  return (
    <section aria-labelledby={`subjects-${list}`} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <h2 id={`subjects-${list}`} className="text-lg font-bold text-slate">
        {t(`control.family.${k}.title` as MessageKey)}
      </h2>
      <p className="text-sm text-slate/80">{t(`control.family.${k}.lead` as MessageKey)}</p>
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <legend className="sr-only">{t(`control.family.${k}.title` as MessageKey)}</legend>
        {subjects.map((s) => (
          <label key={s} className="flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm text-slate hover:bg-off-white">
            <input type="checkbox" className="h-5 w-5" checked={chosen.includes(s)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))} />
            {t(`fam.subject.${s}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {t(`control.family.${k}.save` as MessageKey)}
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
