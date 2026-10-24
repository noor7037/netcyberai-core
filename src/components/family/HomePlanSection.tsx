'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { fill, type Words } from '@/lib/family/fill';
import { MAX_PLAN_TOPICS, type HomePlan } from '@/lib/family/home-plan-shape';
import { familyApi } from './client';

// The parent area's home plan after a parent-teacher meeting (M3-7, C337; R5, Plus). For each child: the open plan's 14
// nights (done from the child's checked answers), the parent's notes, "Ask the teacher to follow up" for a child matched
// to a connected school, and stopping it; or, with none open, choosing up to seven topics of the child's catalog, in
// the subjects the child can open, to make one from tonight.

export type PlanSubject = { subject: string; name: string; chapters: { title: string; topics: { key: string; title: string }[] }[] };
export type HomePlanChild = { childId: string; firstName: string; plan: HomePlan | null; linked: boolean; subjects: PlanSubject[] };

const day = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function OpenPlan({ w, lang, child }: { w: Words; lang: 'en' | 'hi'; child: HomePlanChild & { plan: HomePlan } }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const call = async (action: 'stop' | 'followup') => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/home-plan', 'POST', { action, childId: child.childId });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'no_consent' ? w['fam.homePlan.askNoConsent'] : w['fam.school.saveError']);
    router.refresh();
  };
  const plan = child.plan;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1" data-home-plan-nights>
        {plan.nights.map((n) => (
          <li key={n.night} data-night={n.night} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-slate ${plan.tonight?.night === n.night ? 'bg-royal/10 font-semibold' : 'bg-slate/5'}`}>
            <span className="min-w-0">
              {fill(w['fam.homePlan.night'], { n: n.night })} · {day(n.date, lang)} · {n.title || '—'}
            </span>
            <span className="shrink-0 text-xs font-bold">{n.done ? w['fam.homePlan.done'] : plan.tonight?.night === n.night ? w['fam.homePlan.tonight'] : ''}</span>
          </li>
        ))}
      </ol>
      {plan.note && (
        <div className="rounded-lg bg-off-white px-3 py-2 text-sm text-slate">
          <p className="font-semibold">{w['fam.homePlan.yourNotes']}</p>
          <p className="whitespace-pre-line">{plan.note}</p>
        </div>
      )}
      {child.linked &&
        (plan.followupAsked ? (
          <p role="status" className="text-sm font-semibold text-emerald-text">
            {w['fam.homePlan.asked']}
          </p>
        ) : (
          <Button type="button" variant="outline" className="self-start" disabled={busy} onClick={() => void call('followup')}>
            {w['fam.homePlan.ask']}
          </Button>
        ))}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      {!confirm ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setConfirm(true)}>
          {w['fam.homePlan.stop']}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm text-slate">{w['fam.homePlan.stopNote']}</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void call('stop')}>
            {w['fam.homePlan.stopYes']}
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
            {w['fam.common.cancel']}
          </Button>
        </div>
      )}
    </div>
  );
}

function NewPlan({ w, child }: { w: Words; child: HomePlanChild }) {
  const router = useRouter();
  const [subject, setSubject] = useState(child.subjects[0]?.subject ?? '');
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = child.subjects.find((s) => s.subject === subject);
  const make = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/home-plan', 'POST', { action: 'start', childId: child.childId, topics: chosen, note: note.trim() || null });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'note' ? w['fam.homePlan.errNote'] : r.error === 'topics' ? w['fam.homePlan.errTopics'] : w['fam.school.saveError']);
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate">{fill(w['fam.homePlan.lead'], { name: child.firstName })}</p>
      <Textarea id={`fam-plan-note-${child.childId}`} label={w['fam.homePlan.notes']} helperText={w['fam.homePlan.notesHelp']} value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} />
      {child.subjects.length > 1 && (
        <Select id={`fam-plan-subject-${child.childId}`} label={w['fam.homePlan.subject']} value={subject} onChange={(e) => setSubject(e.target.value)}>
          {child.subjects.map((s) => (
            <option key={s.subject} value={s.subject}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
      {!shown || shown.chapters.every((c) => c.topics.length === 0) ? (
        <p className="text-sm text-slate">{w['fam.homePlan.noTopics']}</p>
      ) : (
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-xl ring-1 ring-slate/10 p-2" data-home-plan-topics>
          {shown.chapters
            .filter((c) => c.topics.length > 0)
            .map((c, i) => (
              <fieldset key={i} className="flex flex-col gap-1">
                <legend className="text-sm font-semibold text-slate">{c.title}</legend>
                {c.topics.map((t) => (
                  <label key={t.key} className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm text-slate hover:bg-off-white">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={chosen.includes(t.key)}
                      disabled={!chosen.includes(t.key) && chosen.length >= MAX_PLAN_TOPICS}
                      onChange={(e) => setChosen((x) => (e.target.checked ? [...x, t.key] : x.filter((k) => k !== t.key)))}
                    />
                    {t.title}
                  </label>
                ))}
              </fieldset>
            ))}
        </div>
      )}
      <p className="text-sm text-slate" aria-live="polite">
        {fill(w['fam.homePlan.chosen'], { n: chosen.length })}
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="button" className="self-start" disabled={busy || chosen.length === 0} onClick={() => void make()}>
        {w['fam.homePlan.make']}
      </Button>
    </div>
  );
}

export function HomePlanSection({ w, lang, children }: { w: Words; lang: 'en' | 'hi'; children: HomePlanChild[] }) {
  return (
    <section data-home-plan className="fam-card fam-rise flex flex-col gap-4 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.homePlan.title']}</h2>
      {children.map((c) => (
        <div key={c.childId} data-home-plan-child={c.childId} className="flex flex-col gap-2 rounded-2xl bg-off-white/60 p-3 ring-1 ring-slate/10">
          <p className="text-base font-bold text-slate">{c.firstName}</p>
          {c.plan ? <OpenPlan w={w} lang={lang} child={{ ...c, plan: c.plan }} /> : <NewPlan w={w} child={c} />}
        </div>
      ))}
    </section>
  );
}
