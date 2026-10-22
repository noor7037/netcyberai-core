'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fill, type Words } from '@/lib/family/fill';
import type { ParentHabit } from '@/lib/family/habit';
import { errorWords, familyApi } from './client';

// The parent's habit section (M2-3, C277; docs/family-app/11 R7, R9), inside the PIN-guarded parent area: per child the
// weekly goal, the reward jar (set, see, mark given, remove), the weekly summary in three lines and tonight's talk
// question. Every change is the parent's own tap. NetCyberAI never holds or moves money; the parent gives the reward.
const linkButton = 'min-h-[44px] px-2 text-sm font-semibold text-royal underline-offset-4 hover:underline';

function ChildHabit({ w, name, h }: { w: Words; name: string; h: ParentHabit }) {
  const router = useRouter();
  const [reward, setReward] = useState('');
  const [target, setTarget] = useState('10');
  const [error, setError] = useState('');
  const call = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    setError('');
    const r = await familyApi('/api/family/habit', method, { childId: h.childId, ...body });
    if (!r.ok) return setError(errorWords(w, r.error));
    if (method === 'POST') setReward('');
    router.refresh();
  };
  const s = h.summary;
  const jar = h.jar;
  return (
    <li data-habit-child className="flex flex-col gap-3 rounded-2xl bg-off-white p-3 text-sm text-slate">
      <p className="text-base font-bold">{name}</p>

      <div className="flex flex-col gap-1">
        <p className="font-semibold">{w['fam.habit.parent.summaryTitle']}</p>
        <p>{fill(w['fam.habit.parent.sumDays'], { done: s.done, goal: s.goal })}</p>
        <p>{s.masteredCount > 0 ? fill(w['fam.habit.parent.sumMastered'], { n: s.masteredCount, topics: s.masteredTitles.join(', ') }) : w['fam.habit.parent.sumMasteredNone']}</p>
        <p>{s.support ? fill(w['fam.habit.parent.sumSupport'], { topic: s.support }) : w['fam.habit.parent.sumSupportNone']}</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-semibold">{w['fam.habit.parent.talkTitle']}</p>
        <p data-talk>
          {h.talk ? fill(w[`fam.habit.parent.talk.${h.talk.template}`], { name, topic: h.talk.topic }) : fill(w['fam.habit.parent.talkNone'], { name })}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-semibold">{w['fam.habit.parent.goal']}</p>
        <p className="text-slate/80">{w['fam.habit.parent.goalHelp']}</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={h.goal === n}
              aria-label={fill(w['fam.habit.parent.goalOption'], { n })}
              onClick={() => void call('PATCH', { goal: n })}
              className={`min-h-[44px] min-w-[44px] rounded-full px-3 text-base font-bold ${h.goal === n ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/20 hover:bg-slate/5'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold">{w['fam.habit.parent.jarTitle']}</p>
        {jar ? (
          <>
            <p data-jar-reward className="break-words text-base font-bold">
              {jar.reward}
            </p>
            <p>{fill(w['fam.habit.parent.jarProgress'], { days: jar.days, target: jar.targetDays })}</p>
            {jar.filled ? (
              <>
                <p className="font-semibold text-emerald-text">{w['fam.habit.parent.jarFullNote']}</p>
                <div>
                  <Button onClick={() => void call('PATCH', { given: true })}>{w['fam.habit.parent.given']}</Button>
                </div>
              </>
            ) : (
              <div>
                <button type="button" className={linkButton} onClick={() => void call('DELETE', {})}>
                  {w['fam.habit.parent.jarRemove']}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-slate/80">{w['fam.habit.parent.jarNone']}</p>
            <Input id={`reward-${h.childId}`} label={w['fam.habit.parent.reward']} floating={false} maxLength={80} value={reward} onChange={(e) => setReward(e.target.value)} />
            <Input
              id={`target-${h.childId}`}
              label={w['fam.habit.parent.target']}
              floating={false}
              type="number"
              inputMode="numeric"
              min={3}
              max={60}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <div>
              <Button onClick={() => void call('POST', { reward, targetDays: Number(target) })}>{w['fam.habit.parent.jarSet']}</Button>
            </div>
          </>
        )}
        <p className="text-xs text-slate/80">{w['fam.habit.parent.noMoney']}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </li>
  );
}

export function HabitParent({ w, habit, names }: { w: Words; habit: ParentHabit[]; names: Record<string, string> }) {
  return (
    <ul className="flex flex-col gap-2">
      {habit.map((h) => (
        <ChildHabit key={h.childId} w={w} name={names[h.childId] ?? ''} h={h} />
      ))}
    </ul>
  );
}
