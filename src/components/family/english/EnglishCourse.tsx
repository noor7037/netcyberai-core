'use client';
import { Picture } from '../Picture';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import type { AssessmentKind, LessonKind, Track } from '@/lib/family/english/course';
import type { Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';
import { Pic } from './Pictures';
import { TRACK_THEME } from './theme';

// The English tab (docs/family-app/12 §8): the course map — a winding village path with 18 stops, the current unit
// open with its five lessons — the week against the parent's goal, today's new lessons, and the checks. No ranks.

type LessonState = 'done' | 'placed' | 'open' | 'rest' | 'locked';
type Overview = {
  child: { firstName: string };
  track: Track;
  placedUnit: number;
  today: { newLessons: number; perDay: number };
  week: { done: number; goal: number };
  reviewDue: number;
  units: { key: string; position: number; titleEn: string; titleHi: string; canDoEn: string; canDoHi: string; pic: string; lessons: { key: string; kind: LessonKind; titleEn: string; titleHi: string; minutes: number; state: LessonState; stars: number }[] }[];
  assessments: { kind: AssessmentKind; open: boolean; result: { total: number } | null }[];
};

const KIND_PIC: Record<LessonKind, string> = { words: '🔤', pattern: '🧩', listen: '👂', speak: '🗣️', review: '🔁' };

function Ring({ done, goal, hex, light }: { done: number; goal: number; hex: string; light: string }) {
  const share = Math.min(1, goal ? done / goal : 0);
  return (
    <svg viewBox="0 0 44 44" className="h-16 w-16 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r="18" fill="none" stroke={light} strokeOpacity="0.35" strokeWidth="6" />
      <circle cx="22" cy="22" r="18" fill="none" stroke={hex} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${share * 113.1} 113.1`} className="transition-all duration-700 motion-reduce:transition-none" />
    </svg>
  );
}

export function EnglishCourse({ w, lang }: { w: Words; lang: 'en' | 'hi' }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openUnit, setOpenUnit] = useState<string | null>(null);

  useEffect(() => {
    void familyApi<Overview>('/api/family/english', 'GET').then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, []);

  if (error) {
    const text = error === 'consent_needed' ? w['fam.english.consent'] : error === 'off' ? w['fam.english.off'] : error === 'no_course' ? w['fam.english.noCourse'] : w['fam.english.error'];
    return (
      <div className="flex flex-col items-start gap-3 fam-card bg-white p-5 text-slate">
        <Pic pic={error === 'consent_needed' ? '🙋' : '🌱'} size={48} />
        <p className="text-lg font-bold text-slate">{text}</p>
        {error === 'consent_needed' && (
          <Link href="/family/parent" className="fam-press flex min-h-[44px] items-center rounded-full bg-royal px-5 font-bold text-white">
            {w['fam.english.consentButton']}
          </Link>
        )}
      </div>
    );
  }
  if (!data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate/10 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const theme = TRACK_THEME[data.track];
  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const current = data.units.find((u) => u.lessons.some((l) => l.state === 'open' || l.state === 'rest')) ?? data.units[data.units.length - 1];
  const shown = openUnit ?? current?.key;
  const restToday = data.units.some((u) => u.lessons.some((l) => l.state === 'rest'));
  const checks = data.assessments.filter((a) => a.open || a.result);

  return (
    <div className="flex flex-col gap-4">
      <section className={`fam-rise flex items-center gap-4 rounded-2xl p-4 shadow-lg ${theme.header}`}>
        <Ring done={data.week.done} goal={data.week.goal} hex={data.track === 'a' ? colors.slate : colors.offWhite} light={colors.offWhite} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold uppercase tracking-wide">{w[`fam.english.track.${data.track}`]}</p>
          <p className="text-lg font-extrabold">{w['fam.english.week'].replace('{done}', String(data.week.done)).replace('{goal}', String(data.week.goal))}</p>
          <p className="text-sm font-semibold">{w['fam.english.today'].replace('{done}', String(data.today.newLessons)).replace('{max}', String(data.today.perDay))}</p>
        </div>
      </section>

      {restToday && <p className="fam-rise rounded-2xl bg-leaf/15 p-4 text-base font-bold text-slate"><Picture e="🌙" /> {w['fam.english.rest']}</p>}
      {data.reviewDue > 0 && <p className="rounded-2xl bg-cyan/15 p-4 text-base font-semibold text-slate"><Picture e="🔁" /> {w['fam.english.reviewDue'].replace('{n}', String(data.reviewDue))}</p>}

      {checks.map((a) => (
        <div key={a.kind} className="flex items-center gap-3 fam-card bg-white p-4 text-slate">
          <Pic pic={a.result ? '📈' : '📝'} size={40} />
          <div className="flex flex-1 flex-col">
            <p className="text-lg font-bold text-slate">{w[`fam.english.check.${a.kind}`]}</p>
            {a.result && <p className="text-base text-slate">{w['fam.english.check.score'].replace('{n}', String(a.result.total))}</p>}
          </div>
          {a.open && !a.result && (
            <Link href={`/family/english/check/${a.kind}`} className={`fam-press flex min-h-[44px] items-center rounded-full px-4 font-bold ${theme.button}`}>
              {w['fam.english.check.take']}
            </Link>
          )}
        </div>
      ))}

      <ol className="relative flex flex-col gap-6 py-2" aria-label={w['fam.english.course']}>
        <svg aria-hidden="true" className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2" preserveAspectRatio="none" viewBox="0 0 100 1000">
          <path d="M50 0 C 95 60, 5 120, 50 180 S 95 300, 50 360 S 5 480, 50 540 S 95 660, 50 720 S 5 840, 50 900 S 95 960, 50 1000" fill="none" stroke={theme.hex} strokeOpacity="0.25" strokeWidth="10" strokeLinecap="round" strokeDasharray="2 22" />
        </svg>
        {data.units.map((u, i) => {
          const done = u.lessons.every((l) => l.state === 'done' || l.state === 'placed');
          const locked = u.lessons.every((l) => l.state === 'locked');
          const isCurrent = u.key === current?.key;
          const stars = u.lessons.reduce((n, l) => n + l.stars, 0);
          return (
            <li key={u.key} className={`relative flex flex-col gap-2 ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
              <button
                type="button"
                onClick={() => setOpenUnit(shown === u.key ? null : u.key)}
                aria-expanded={shown === u.key}
                className={`fam-lift relative flex w-11/12 items-center gap-3 rounded-2xl p-3 text-left shadow-md ring-2 animate-rise-in motion-reduce:animate-none ${locked ? 'bg-off-white text-slate ring-slate/10' : isCurrent ? `bg-white text-slate ${theme.ring}` : 'bg-white text-slate ring-slate/10'}`}
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: 'both' }}
              >
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: locked ? undefined : `${theme.light}33` }}>
                  {isCurrent && <span aria-hidden="true" className="absolute inset-0 rounded-full animate-glow motion-reduce:animate-none" style={{ background: `${theme.hex}55` }} />}
                  <Pic pic={locked ? '🔒' : done ? '🌻' : u.pic} size={36} />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{w['fam.english.unit'].replace('{n}', String(u.position))}</span>
                  <span className="text-lg font-extrabold leading-tight text-slate">{t(u.titleEn, u.titleHi)}</span>
                  {stars > 0 && <span className="text-sm text-slate"><Picture e="⭐" /> {stars}</span>}
                </span>
              </button>
              {shown === u.key && (
                <div className="flex w-11/12 flex-col gap-2 fam-card bg-white p-3 text-slate animate-rise-in motion-reduce:animate-none">
                  <p className="rounded-2xl bg-sunshine/20 p-2 text-sm font-semibold text-slate"><Picture e="🎯" /> {t(u.canDoEn, u.canDoHi)}</p>
                  {u.lessons.map((l) => {
                    const can = l.state === 'done' || l.state === 'placed' || l.state === 'open';
                    const body = (
                      <>
                        <Pic pic={l.state === 'locked' ? '🔒' : KIND_PIC[l.kind]} size={28} />
                        <span className="flex flex-1 flex-col">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{w[`fam.english.kind.${l.kind}`]} · {w['fam.english.minutes'].replace('{n}', String(l.minutes))}</span>
                          <span className="text-base font-bold text-slate">{t(l.titleEn, l.titleHi)}</span>
                          {l.state === 'locked' && <span className="text-xs text-slate">{w['fam.english.locked']}</span>}
                          {l.state === 'placed' && <span className="text-xs text-slate/70">{w['fam.english.placed']}</span>}
                        </span>
                        {l.state === 'done' && <span aria-label={w['fam.english.results.stars'].replace('{n}', String(l.stars))}>{Array.from({ length: l.stars }, (_, i) => (
                        <Picture key={i} e="⭐" />
                      ))}</span>}
                        {l.state === 'open' && <span className={`rounded-full px-3 py-1 text-sm font-bold ${theme.button}`}>{w['fam.english.start']}</span>}
                      </>
                    );
                    return can ? (
                      <Link key={l.key} href={`/family/english/lesson/${l.key}`} className={`fam-lift flex min-h-[56px] items-center gap-3 rounded-xl p-2 text-slate ${l.state === 'open' ? theme.soft : 'bg-off-white text-slate'}`}>
                        {body}
                      </Link>
                    ) : (
                      <div key={l.key} className="flex min-h-[56px] items-center gap-3 rounded-2xl bg-off-white p-2 text-slate">
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
