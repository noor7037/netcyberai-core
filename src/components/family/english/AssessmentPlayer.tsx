'use client';
import { Skeleton } from '../ui/Skeleton';
import { Picture } from '../Picture';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AssessmentKind, AssessmentSkill, Bi, ChildCheckItem, Track } from '@/lib/family/english/course';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '@/components/family/client';
import { Burst, CheckItemView, answerOf } from './LessonPlayer';
import { Pic } from './Pictures';
import { speak } from './speech';
import { TRACK_THEME } from './theme';

// The day-0, day-45 and day-90 checks (docs/family-app/12 §3, §8): one section at a time, the speaking tasks rated
// 0–2 on each criterion (by the child, or the grown-up in track A), scored on the server, the result per skill.

type Loaded = { track: Track; kind: AssessmentKind; sections: { skill: AssessmentSkill; items: ChildCheckItem[] }[]; speaking: { key: string; prompt: Bi; model: string; criteria: Bi[] }[] };
type Result = { total: number; scores: Record<string, number | null>; placedUnit: number | null };

export function AssessmentPlayer({ kind, w, lang }: { kind: AssessmentKind; w: Words; lang: 'en' | 'hi' }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [ratings, setRatings] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void familyApi<Loaded>(`/api/family/english/assessments/${kind}`, 'GET').then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, [kind]);

  if (error) return <p className="rounded-3xl bg-white p-5 text-lg font-bold text-slate shadow-sm ring-1 ring-slate/10">{error === 'locked' || error === 'already_taken' ? w['fam.english.locked'] : w['fam.english.error']}</p>;
  if (!data) return <Skeleton label={w['fam.d13.loading.lesson']} lines={3} />;

  const theme = TRACK_THEME[data.track];
  const hindi = lang === 'hi' || data.track === 'a' || data.track === 'b';
  const pages = data.sections.length + 1;
  const section = data.sections[at];
  const onSpeaking = at === data.sections.length;

  if (result) {
    const skills = (['listening', 'words', 'grammar', 'reading', 'speaking'] as const).filter((s) => result.scores[s] !== null && result.scores[s] !== undefined);
    return (
      <section className="relative flex flex-col gap-4 rounded-3xl bg-white p-6 text-slate shadow-md ring-1 ring-slate/10">
        <Burst />
        <h2 className="text-2xl font-extrabold text-slate"><Picture e="📈" /> {w[`fam.english.check.${kind}`]}</h2>
        <p className="text-lg font-bold text-slate">{w['fam.english.check.score'].replace('{n}', String(result.total))}</p>
        <ul className="flex flex-col gap-3">
          {skills.map((s, i) => (
            <li key={s} className="flex flex-col gap-1">
              <span className="flex justify-between text-sm font-bold text-slate">
                <span>{w[`fam.english.skill.${s}`]}</span>
                <span>{result.scores[s]}</span>
              </span>
              <span className="h-4 overflow-hidden rounded-full bg-slate/10">
                <span className="block h-full rounded-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${result.scores[s]}%`, background: theme.hex, transitionDelay: `${i * 120}ms` }} />
              </span>
            </li>
          ))}
        </ul>
        {result.placedUnit && result.placedUnit > 1 && <p className="rounded-2xl bg-leaf/15 p-3 text-base font-bold text-slate">{w['fam.english.check.placed'].replace('{n}', String(result.placedUnit))}</p>}
        <Link href="/family/english" className={`flex min-h-[44px] items-center self-start rounded-full px-5 font-bold ${theme.button}`}>
          {w['fam.english.results.map']}
        </Link>
      </section>
    );
  }

  const send = async () => {
    setSending(true);
    const all = data.sections.flatMap((s) => s.items);
    const r = await familyApi<Result>(`/api/family/english/assessments/${kind}`, 'POST', {
      answers: Object.fromEntries(all.map((c) => [c.key, answerOf(c, answers[c.key])])),
      speaking: ratings,
    });
    setSending(false);
    if (r.ok) setResult(r.data);
    else setError(r.error);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="h-4 overflow-hidden rounded-full bg-slate/10" role="progressbar" aria-valuemin={0} aria-valuemax={pages} aria-valuenow={at + 1} aria-label={w[`fam.english.check.${kind}`]}>
        <div className="h-full rounded-full transition-all duration-300 motion-reduce:transition-none" style={{ width: `${((at + 1) / pages) * 100}%`, background: theme.hex }} />
      </div>
      <div key={at} className="flex flex-col gap-4 animate-rise-in motion-reduce:animate-none">
        {section && (
          <>
            <h2 className="text-xl font-extrabold text-slate">{w[`fam.english.skill.${section.skill}`]}</h2>
            {section.items.map((c) => (
              <CheckItemView key={c.key} item={c} value={answers[c.key]} onChange={(v) => setAnswers({ ...answers, [c.key]: v })} w={w} track={data.track} hindi={hindi} />
            ))}
          </>
        )}
        {onSpeaking && (
          <>
            <h2 className="text-xl font-extrabold text-slate"><Picture e="🗣️" /> {w['fam.english.skill.speaking']}</h2>
            {data.track === 'a' && <p className="text-base text-slate">{w['fam.english.rate.grownup']}</p>}
            {data.speaking.map((sp) => (
              <div key={sp.key} className="flex flex-col gap-3 rounded-3xl bg-white p-4 text-slate shadow-sm ring-1 ring-slate/10">
                <p className="text-lg font-bold text-slate"><span lang="en">{sp.prompt.en}</span></p>
                {hindi && sp.prompt.hi && (
                  <p lang="hi" className="text-base text-slate/80">
                    {sp.prompt.hi}
                  </p>
                )}
                <div className="flex items-center gap-2 rounded-2xl bg-off-white p-3 text-slate">
                  <Pic pic="💬" size={28} />
                  <p className="flex-1 text-base text-slate"><span lang="en">{sp.model}</span></p>
                  <button type="button" onClick={() => void speak(sp.model)} aria-label={fill(w['fam.english.listenTo'], { text: sp.model })} className="min-h-[44px] min-w-[44px] rounded-full bg-white text-xl text-slate ring-1 ring-slate/10">
                    <Picture e="🔊" />
                  </button>
                </div>
                <p className="text-sm font-bold text-slate">{w['fam.english.rate']}</p>
                {sp.criteria.map((c, ci) => (
                  <div key={ci} className="flex flex-col gap-1">
                    <span className="text-base text-slate">
                      <span lang="en">{c.en}</span>
                      {hindi && c.hi ? ` · ${c.hi}` : ''}
                    </span>
                    <div className="flex gap-2">
                      {[0, 1, 2].map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={ratings[sp.key]?.[ci] === v}
                          onClick={() => {
                            const cur = [...(ratings[sp.key] ?? sp.criteria.map(() => 0))];
                            cur[ci] = v;
                            setRatings({ ...ratings, [sp.key]: cur });
                          }}
                          className={`min-h-[44px] flex-1 rounded-2xl px-2 text-sm font-bold ${ratings[sp.key]?.[ci] === v ? theme.button : 'bg-off-white text-slate ring-1 ring-slate/20'}`}
                        >
                          <Picture e={['🌱', '🌿', '🌳'][v]} /> {w[`fam.english.rate.${v}`]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="sticky bottom-20 flex justify-end">
        {!onSpeaking ? (
          <button type="button" onClick={() => setAt(at + 1)} className={`min-h-[52px] rounded-full px-8 text-lg font-extrabold shadow-md ${theme.button}`}>
            {w['fam.english.next']} →
          </button>
        ) : (
          <button type="button" disabled={sending} onClick={() => void send()} className={`min-h-[52px] rounded-full px-8 text-lg font-extrabold shadow-md disabled:opacity-50 ${theme.button}`}>
            {w['fam.english.check.send']}
          </button>
        )}
      </div>
    </section>
  );
}
