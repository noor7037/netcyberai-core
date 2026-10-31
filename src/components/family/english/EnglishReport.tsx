'use client';
import { Picture } from '../Picture';

import { useCallback, useEffect, useState } from 'react';
import { chartSeries, colors } from '@/lib/design-tokens';
import type { Track } from '@/lib/family/english/course';
import type { Report } from '@/lib/family/english/report';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';

// The parent's English report (docs/family-app/12 §8): the week against the goal, lessons and check scores by week,
// speaking minutes, words learned and still learning, the can-do statements reached, and the day-0, day-45 and day-90
// checks side by side; then the weekly goal and the course level. Our own SVG charts, each with its numbers on it and a
// table view (docs/19 §3.5). Never a rank and never a comparison with other children.

type Data = { child: { firstName: string }; track: Track; report: Report; home: { en: string; hi?: string } | null };

function Columns({ values, labels, max, color, unit = '' }: { values: (number | null)[]; labels: string[]; max: number; color: string; unit?: string }) {
  const n = values.length;
  const w = 100 / Math.max(n, 1);
  return (
    <svg viewBox="0 0 100 60" className="w-full" role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v ?? '–'}${unit}`).join(', ')}>
      <line x1="0" y1="50" x2="100" y2="50" stroke={colors.slate} strokeOpacity="0.2" strokeWidth="0.4" />
      {values.map((v, i) => {
        const h = v === null || max === 0 ? 0 : (v / max) * 40;
        const x = i * w + w * 0.2;
        return (
          <g key={i}>
            <rect x={x} y={50 - h} width={w * 0.6} height={h} rx="1.2" fill={color} className="transition-all duration-700 motion-reduce:transition-none" />
            <text x={x + w * 0.3} y={Math.max(8, 48 - h)} textAnchor="middle" fontSize="3.6" fontWeight="700" fill={colors.slate}>
              {v ?? ''}
            </text>
            <text x={x + w * 0.3} y="57" textAnchor="middle" fontSize="3" fill={colors.slate}>
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function EnglishReport({ childId, w, lang, tracks }: { childId: string; w: Words; lang: 'en' | 'hi'; tracks: Track[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState(5);
  const [track, setTrack] = useState<Track | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void familyApi<Data>(`/api/family/english/report?childId=${childId}`, 'GET').then((r) => {
      if (!r.ok) return setError(r.error);
      setData(r.data);
      setGoal(r.data.report.thisWeek.goal);
      setTrack(r.data.track);
    });
  }, [childId]);
  useEffect(() => load(), [load]);

  if (error) return <p className="fam-card bg-white p-5 text-base font-bold text-slate">{error === 'consent_needed' ? w['fam.english.parent.consentFirst'] : w['fam.english.error']}</p>;
  if (!data) return <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-slate/10 motion-reduce:animate-none" />;

  const name = data.child.firstName;
  const r = data.report;
  const weekLabels = r.weeks.map((x) => fill(w['fam.english.parent.week'], { date: x.from }));
  const save = async () => {
    const res = await familyApi('/api/family/english/settings', 'POST', { childId, weeklyGoal: goal, ...(track && track !== data.track ? { track } : {}) });
    setSaved(res.ok);
    if (res.ok) load();
    else setError(res.error);
  };
  const card = 'flex flex-col gap-3 fam-card bg-white p-4 text-slate';
  const share = Math.min(1, r.thisWeek.goal ? r.thisWeek.done / r.thisWeek.goal : 0);
  const totalWords = r.totals.wordsLearned + r.totals.wordsLearning;

  return (
    <div className="flex flex-col gap-4">
      <section className="fam-band fam-rise flex items-center gap-4 rounded-2xl bg-ink p-4 text-white shadow-lg">
        <svg viewBox="0 0 44 44" className="h-20 w-20 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke={colors.offWhite} strokeOpacity="0.3" strokeWidth="6" />
          <circle cx="22" cy="22" r="18" fill="none" stroke={colors.sunshine} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${share * 113.1} 113.1`} />
        </svg>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold uppercase tracking-wide text-white">{w[`fam.english.track.${data.track}`]}</p>
          <p className="text-xl font-extrabold text-white">{fill(w['fam.english.parent.thisWeek'], { done: r.thisWeek.done, goal: r.thisWeek.goal })}</p>
          <p className="text-sm font-semibold text-white">{fill(w['fam.english.parent.totals'], { lessons: r.totals.lessons, units: r.totals.units })}</p>
        </div>
      </section>

      {r.totals.lessons === 0 && <p className="rounded-2xl bg-sunshine/25 p-4 text-base text-slate">{fill(w['fam.english.parent.empty'], { name })}</p>}

      <section className={card}>
        <h2 className="fam-h2 text-slate">{w['fam.english.parent.lessons']}</h2>
        <Columns values={r.weeks.map((x) => x.lessons)} labels={weekLabels} max={Math.max(7, ...r.weeks.map((x) => x.lessons))} color={chartSeries[0]} />
        <h2 className="fam-h2 text-slate">{w['fam.english.parent.scores']}</h2>
        <Columns values={r.weeks.map((x) => x.meanScore)} labels={weekLabels} max={100} color={chartSeries[3]} />
        <h2 className="fam-h2 text-slate">{w['fam.english.parent.voice']}</h2>
        <Columns values={r.weeks.map((x) => x.voiceMinutes)} labels={weekLabels} max={Math.max(10, ...r.weeks.map((x) => x.voiceMinutes))} color={chartSeries[4]} />
        <details className="text-sm text-slate">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-ink">{w['fam.english.parent.table']}</summary>
          <table className="w-full text-left text-sm text-slate">
            <thead>
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">{w['fam.english.parent.lessons']}</th>
                <th className="py-1 pr-2">{w['fam.english.parent.scores']}</th>
                <th className="py-1">{w['fam.english.parent.voice']}</th>
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((x, i) => (
                <tr key={x.from} className="border-t border-slate/10">
                  <td className="py-1 pr-2">{weekLabels[i]}</td>
                  <td className="py-1 pr-2">{x.lessons}</td>
                  <td className="py-1 pr-2">{x.meanScore ?? '–'}</td>
                  <td className="py-1">{x.voiceMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className={card}>
        <h2 className="fam-h2 text-slate">{w['fam.english.parent.words']}</h2>
        {/* The bar repeats the two numbers written under it, so screen readers skip it. */}
        <div aria-hidden="true" className="flex h-6 overflow-hidden rounded-full bg-slate/10">
          <span style={{ width: `${totalWords ? (100 * r.totals.wordsLearned) / totalWords : 0}%`, background: chartSeries[2] }} />
          <span style={{ width: `${totalWords ? (100 * r.totals.wordsLearning) / totalWords : 0}%`, background: chartSeries[1] }} />
        </div>
        <p className="flex flex-wrap gap-4 text-base font-semibold text-slate">
          <span><Picture e="🌳" /> {w['fam.english.parent.learned']}: {r.totals.wordsLearned}</span>
          <span><Picture e="🌱" /> {w['fam.english.parent.learning']}: {r.totals.wordsLearning}</span>
        </p>
      </section>

      {r.canDos.length > 0 && (
        <section className={card}>
          <h2 className="fam-h2 text-slate">{fill(w['fam.english.parent.canDos'], { name })}</h2>
          <ul className="flex flex-col gap-2">
            {r.canDos.map((c) => (
              <li key={c.unitKey} className="flex items-start gap-2 rounded-2xl bg-leaf/10 p-3 text-slate">
                <span aria-hidden="true"><Picture e="✅" /></span>
                <span>{lang === 'hi' ? c.hi : c.en}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.assessments.length > 0 && (
        <section className={card}>
          <h2 className="fam-h2 text-slate">{w['fam.english.parent.checks']}</h2>
          <ul className="flex flex-col gap-3">
            {(['listening', 'words', 'grammar', 'reading', 'speaking'] as const).map((skill) => {
              const rows = r.assessments.map((a) => ({ kind: a.kind, v: a[skill] })).filter((x) => x.v !== null);
              if (!rows.length) return null;
              return (
                <li key={skill} className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-slate">{w[`fam.english.skill.${skill}`]}</span>
                  {rows.map((x, i) => (
                    <span key={x.kind} className="flex items-center gap-2 text-sm text-slate">
                      <span className="w-24 shrink-0">{w[`fam.english.check.${x.kind}`]}</span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate/10">
                        <span className="block h-full rounded-full" style={{ width: `${x.v}%`, background: chartSeries[i] }} />
                      </span>
                      <span className="w-8 text-right font-bold">{x.v}</span>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.home && (
        <section className="flex flex-col gap-1 rounded-2xl bg-grape/10 p-4 text-slate">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate"><Picture e="🏡" /> {w['fam.english.parent.home']}</h2>
          <p lang="en" className="text-lg font-bold text-slate">
            {data.home.en}
          </p>
          {data.home.hi && (
            <p lang="hi" className="text-base text-slate">
              {data.home.hi}
            </p>
          )}
        </section>
      )}

      <section className={card}>
        <label className="flex flex-col gap-1 text-base font-semibold text-slate">
          {w['fam.english.parent.goal']}
          <select value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="min-h-[44px] rounded-xl border border-slate/20 bg-white px-3 text-slate">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-base font-semibold text-slate">
          {w['fam.english.parent.track']}
          <select value={track ?? data.track} onChange={(e) => setTrack(e.target.value as Track)} className="min-h-[44px] rounded-xl border border-slate/20 bg-white px-3 text-slate">
            {tracks.map((t) => (
              <option key={t} value={t}>
                {w[`fam.english.track.${t}`]}
              </option>
            ))}
          </select>
          <span className="text-sm font-normal text-slate">{w['fam.english.parent.trackNote']}</span>
        </label>
        <button type="button" onClick={() => void save()} className="min-h-[44px] self-start rounded-full bg-saffron px-5 font-bold text-ink">
          {w['fam.english.parent.save']}
        </button>
        {saved && <p aria-live="polite" className="text-sm font-semibold text-slate"><Picture e="✅" /> {w['fam.english.parent.saved']}</p>}
      </section>
      <p className="text-sm text-slate">{fill(w['fam.english.parent.noRanks'], { name })}</p>
    </div>
  );
}
