'use client';

import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { primeChildSettings, type ChildSettings } from '@/lib/family/child-settings';
import { errorWords, familyApi } from '../client';

// W19-C: the child's own switches on /family/settings. Each change is saved at once (PATCH /api/family/settings) and
// shown at once; a failed save puts the switch back and says so. A switch is a real button with role="switch" and
// aria-checked, 44 px and more; the voice speed is two choices. Movement off also stills this page straight away.
type SwitchKey = 'readAloud' | 'tutorFace' | 'motion' | 'handsFree';
const GROUPS: { title: string; keys: SwitchKey[] }[] = [
  { title: 'fam.w19.settings.voiceTitle', keys: ['readAloud', 'handsFree'] },
  { title: 'fam.w19.settings.lookTitle', keys: ['tutorFace', 'motion'] },
];

export function SettingsForm({ initial, w }: { initial: ChildSettings; w: Words }) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (patch: Partial<ChildSettings>) => {
    const before = s;
    const next = { ...s, ...patch };
    setS(next);
    if ('motion' in patch) document.querySelector('[data-family-settings]')?.setAttribute('data-fam-motion', next.motion ? 'on' : 'off');
    const r = await familyApi<{ settings: ChildSettings }>('/api/family/settings', 'PATCH', patch);
    if (r.ok) {
      primeChildSettings(r.data.settings);
      setStatus({ ok: true, text: w['fam.w19.settings.saved'] });
    } else {
      setS(before);
      setStatus({ ok: false, text: errorWords(w, r.error) });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g, gi) => (
        <section key={g.title} aria-labelledby={`fam-set-${gi}`} className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: `${gi * 60}ms` } as React.CSSProperties}>
          <h2 id={`fam-set-${gi}`} className="fam-h2 text-ink">
            {w[g.title]}
          </h2>
          <ul className="flex flex-col gap-2">
            {g.keys.map((k) => (
              <li key={k} className="flex items-center justify-between gap-4 rounded-xl bg-off-white px-4 py-3">
                <span className="min-w-0">
                  <span id={`fam-set-${k}`} className="block text-base font-bold text-ink">
                    {w[`fam.w19.settings.${k}`]}
                  </span>
                  <span className="block text-sm text-slate">{w[`fam.w19.settings.${k}Note`]}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={s[k]}
                  aria-labelledby={`fam-set-${k}`}
                  data-setting={k}
                  onClick={() => save({ [k]: !s[k] } as Partial<ChildSettings>)}
                  className="fam-press flex min-h-[44px] min-w-[64px] shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <span aria-hidden="true" className={`relative block h-8 w-14 rounded-full transition-colors motion-reduce:transition-none ${s[k] ? 'bg-lesson-lilac-deep' : 'bg-slate/30'}`}>
                    <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-[left] motion-reduce:transition-none ${s[k] ? 'left-7' : 'left-1'}`} />
                  </span>
                </button>
              </li>
            ))}
            {gi === 0 && (
              <li className="flex flex-col gap-3 rounded-xl bg-off-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span id="fam-set-speed" className="text-base font-bold text-ink">
                  {w['fam.w19.settings.speed']}
                </span>
                <span role="radiogroup" aria-labelledby="fam-set-speed" className="flex gap-2">
                  {(['slow', 'normal'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={s.voiceSpeed === v}
                      data-speed={v}
                      onClick={() => s.voiceSpeed !== v && save({ voiceSpeed: v })}
                      className={`fam-press min-h-[44px] rounded-full px-5 text-sm font-bold ${s.voiceSpeed === v ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-ink/20'}`}
                    >
                      {w[`fam.w19.settings.${v}`]}
                    </button>
                  ))}
                </span>
              </li>
            )}
          </ul>
        </section>
      ))}
      <p role="status" data-settings-status className={`min-h-[1.5rem] px-1 text-sm font-semibold ${status?.ok === false ? 'text-red-800' : 'text-emerald-text'}`}>
        {status?.text ?? ''}
      </p>
    </div>
  );
}
