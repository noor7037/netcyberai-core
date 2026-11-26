'use client';

import { useState } from 'react';
import { schoolThemes, SCHOOL_THEME_IDS, type SchoolThemeId } from '@/lib/design-tokens';
import { themeWords } from './words';

// The principal's choice of the school app's look (C553): three themes, each shown as a small dashboard in its own
// colours, so the choice is made by seeing it. One tap picks, "Use this look" saves for the whole school.
export function SchoolThemeCard({ initial, lang }: { initial: SchoolThemeId; lang: string }) {
  const w = themeWords(lang);
  const [picked, setPicked] = useState<SchoolThemeId>(initial);
  const [saved, setSaved] = useState<SchoolThemeId>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/app/school/theme', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: picked }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved(picked);
      setNote(w.saved);
      document.querySelectorAll<HTMLElement>('[data-school-app]').forEach((el) => (el.dataset.ncaTheme = picked));
      document.documentElement.dataset.ncaTheme = picked;
    } else setNote(w.failed);
  }

  return (
    <section data-theme-card className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate/10 md:p-5" lang={lang}>
      <div>
        <h2 className="text-lg font-bold text-slate">{w.title}</h2>
        <p className="text-sm text-slate/80">{w.lead}</p>
      </div>
      <div role="radiogroup" aria-label={w.title} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCHOOL_THEME_IDS.map((id) => {
          const t = schoolThemes[id];
          const on = picked === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(id)} data-theme-option={id} className={`flex flex-col gap-2 rounded-xl p-2 text-left ring-2 ${on ? 'ring-royal' : 'ring-slate/10'}`}>
              {/* A small dashboard in the theme's own colours: its band, a button and a chart. */}
              <span aria-hidden="true" className="flex flex-col gap-1.5 overflow-hidden rounded-lg bg-off-white p-2">
                <span className="h-6 rounded-md" style={{ background: t.midnight }} />
                <span className="flex items-end gap-1" style={{ height: 40 }}>
                  {t.chart.map((c, i) => (
                    <span key={c} className="flex-1 rounded-t" style={{ background: c, height: `${40 + ((i * 37) % 60)}%` }} />
                  ))}
                </span>
                <span className="h-4 w-16 rounded" style={{ background: t.sapphire }} />
              </span>
              <span className="flex min-h-[28px] items-center justify-between gap-2 px-1 text-sm font-semibold text-slate">
                {w.names[id]}
                {saved === id && <span className="rounded-full bg-royal/10 px-2 text-xs text-royal">{w.current}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy || picked === saved} className="min-h-[48px] rounded-xl bg-sapphire px-5 text-base font-semibold text-off-white disabled:opacity-50">
          {w.save}
        </button>
        {note && <p role="status" className="text-sm font-semibold text-slate">{note}</p>}
      </div>
    </section>
  );
}
