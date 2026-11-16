'use client';

import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import type { MessageKey } from '@/lib/i18n';
import { errorWords, familyApi } from './client';

// v21: the parent's switch, one per child: the tutor reads a fresh answer aloud by itself (on by default, every class).
// Saved at once (PATCH /api/family/children/[childId]/settings); a failed save puts the switch back and says so. A real
// button with role="switch", 44 px and more; no motion under reduced motion.
export const AUTOPLAY_KEYS: MessageKey[] = ['fam.parent.autoPlay.title', 'fam.parent.autoPlay.lead', 'fam.w19.settings.saved', 'fam.err.network', 'fam.err.parent_pin_required', 'fam.err.not_found', 'fam.err.bad_request'];

export type AutoPlayChild = { childId: string; firstName: string; autoPlay: boolean };

export function AutoPlaySection({ w, children }: { w: Words; children: AutoPlayChild[] }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(children.map((c) => [c.childId, c.autoPlay])));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const flip = async (childId: string) => {
    const before = on[childId];
    setOn((o) => ({ ...o, [childId]: !before }));
    const r = await familyApi<{ autoPlay: boolean }>(`/api/family/children/${childId}/settings`, 'PATCH', { autoPlay: !before });
    if (r.ok) {
      setOn((o) => ({ ...o, [childId]: r.data.autoPlay }));
      setStatus({ ok: true, text: w['fam.w19.settings.saved'] });
    } else {
      setOn((o) => ({ ...o, [childId]: before }));
      setStatus({ ok: false, text: errorWords(w, r.error) });
    }
  };
  if (children.length === 0) return null;
  return (
    <section data-autoplay-section aria-labelledby="fam-autoplay" className="fam-card flex flex-col gap-3 bg-white p-4">
      <h2 id="fam-autoplay" className="text-base font-extrabold text-ink">
        {w['fam.parent.autoPlay.title']}
      </h2>
      <p className="text-sm text-slate">{w['fam.parent.autoPlay.lead']}</p>
      <ul className="flex flex-col gap-2">
        {children.map((c) => (
          <li key={c.childId} className="flex items-center justify-between gap-4 rounded-xl bg-off-white px-4 py-3">
            <span id={`fam-autoplay-${c.childId}`} className="min-w-0 break-words text-base font-bold text-ink">
              {c.firstName}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on[c.childId]}
              aria-labelledby={`fam-autoplay-${c.childId}`}
              data-autoplay-child={c.childId}
              onClick={() => void flip(c.childId)}
              className="fam-press flex min-h-[44px] min-w-[64px] shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden="true" className={`relative block h-8 w-14 rounded-full transition-colors motion-reduce:transition-none ${on[c.childId] ? 'bg-lesson-lilac-deep' : 'bg-slate/30'}`}>
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-[left] motion-reduce:transition-none ${on[c.childId] ? 'left-7' : 'left-1'}`} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {status && (
        <p role="status" className={`text-sm font-semibold ${status.ok ? 'text-slate' : 'text-ink'}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}
