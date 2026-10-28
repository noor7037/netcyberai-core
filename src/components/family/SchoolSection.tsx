'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { LinkedSchool, PulseAnswer, SchoolEvent, SchoolHomework, SchoolNotice, SchoolPeriod, SchoolPulse, SchoolResult } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from './client';
import { ExamTimetable } from './ExamTimetable';
import { SchoolText } from './SchoolText';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// The parent area's "Your school" (C230-AA; docs/family-app/03 §4). A family uses the app on its own; when its school
// is on NetCyberAI, the school's office gives the parent a Family app code and the parent connects here. Then each of
// the guardian's children at the school can be matched to a child in this app (the parent chooses; nothing is merged
// by guess), and the school's part shows. Disconnecting takes the school's part away at once; the app's own learning
// stays.

export type SchoolLinkView = { linkId: string; school: LinkedSchool; pairs: { studentId: string; childId: string }[] };

const rupees = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
// A due day (yyyy-mm-dd) as "24 Oct" / "24 अक्टू॰", read as a calendar day (no time zone moves it).
const day = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));

// The homework the school set for a matched child's class and section (C329), read only.
function HomeworkList({ w, lang, items }: { w: Words; lang: 'en' | 'hi'; items: SchoolHomework[] }) {
  return (
    <div className="flex flex-col gap-1" data-school-homework>
      <p className="text-sm font-semibold text-slate">{w['fam.school.homework']}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.homeworkNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((h, i) => (
            <li key={i} className="rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p className="font-semibold">
                <SchoolText text={h.subject ? `${h.subject}: ${h.title}` : h.title} />
              </p>
              {h.details && (
                <p className="whitespace-pre-line">
                  <SchoolText text={h.details} />
                </p>
              )}
              <p>
                {h.due ? fill(w['fam.school.homeworkDue'], { date: day(h.due, lang) }) : ''}
                {h.done ? `${h.due ? ' · ' : ''}${w['fam.school.homeworkDone']}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The school's Daily Pulse for a matched child's class (C336, R9), newest first. With the school's consent for messages
// the parent answers it here, as they would by WhatsApp ("1" understood, "2" needs help), and the teacher sees it;
// without it, read only (C230-AD).
function PulseList({ w, lang, linkId, studentId, pulse }: { w: Words; lang: 'en' | 'hi'; linkId: string; studentId: string; pulse: { items: SchoolPulse[]; canAnswer: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<Record<string, string>>({});
  const answerWords = (a: PulseAnswer) => (a === 'understood' ? w['fam.school.pulseUnderstood'] : w['fam.school.pulseNeedsHelp']);
  const answer = async (pulseId: string, a: PulseAnswer) => {
    setBusy(pulseId);
    setError({});
    const r = await familyApi('/api/family/school/pulse', 'POST', { linkId, studentId, pulseId, answer: a });
    setBusy('');
    if (!r.ok && r.error !== 'already') return setError({ [pulseId]: r.error === 'closed' ? w['fam.school.pulseClosed'] : r.error === 'no_consent' ? w['fam.school.pulseReadOnly'] : w['fam.school.saveError'] });
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-1" data-school-pulse>
      <p className="text-sm font-semibold text-slate">{w['fam.school.pulse']}</p>
      {pulse.items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.pulseNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pulse.items.map((p) => (
            <li key={p.pulseId} data-pulse={p.pulseId} className="flex flex-col gap-2 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p>{fill(w['fam.school.pulseFor'], { date: day(p.sentOn, lang) })}</p>
              <p className="whitespace-pre-line">{lang === 'hi' && p.body.hi.trim() ? p.body.hi : p.body.en}</p>
              {p.answer ? (
                <p className="font-semibold">
                  {fill(w['fam.school.pulseAnswered'], { answer: answerWords(p.answer) })}
                  {p.answer === 'needs_help' ? ` ${w['fam.school.pulseHelpNote']}` : ''}
                </p>
              ) : p.open && pulse.canAnswer ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={busy !== ''} onClick={() => void answer(p.pulseId, 'understood')}>
                    {w['fam.school.pulseUnderstood']}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy !== ''} onClick={() => void answer(p.pulseId, 'needs_help')}>
                    {w['fam.school.pulseNeedsHelp']}
                  </Button>
                </div>
              ) : null}
              {error[p.pulseId] && (
                <p role="alert" className="font-semibold text-red-800">
                  {error[p.pulseId]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {!pulse.canAnswer && pulse.items.some((p) => p.open && !p.answer) && <p className="text-sm text-slate">{w['fam.school.pulseReadOnly']}</p>}
    </div>
  );
}

function ConnectForm({ w, again }: { w: Words; again: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/school/connect', 'POST', { code });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'too_many_tries' ? w['fam.school.tooMany'] : w['fam.school.badCode']);
    setCode('');
    router.refresh();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      {!again && <p className="text-sm text-slate">{w['fam.school.lead']}</p>}
      <Input id="fam-school-code" label={again ? w['fam.school.another'] : w['fam.school.code']} value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} autoComplete="off" helperText={w['fam.school.codeHelp']} />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || code.replace(/[\s-]/g, '').length !== 8} className="self-start">
        {w['fam.school.connect']}
      </Button>
    </form>
  );
}

// The notices the school sent for a matched child's class or the whole school (C331), read only.
function NoticeList({ w, lang, items }: { w: Words; lang: 'en' | 'hi'; items: SchoolNotice[] }) {
  return (
    <div className="flex flex-col gap-1" data-school-notices>
      <p className="text-sm font-semibold text-slate">{w['fam.school.notices']}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.noticesNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n, i) => (
            <li key={i} className="rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p className="whitespace-pre-line">
                <SchoolText text={n.body} />
              </p>
              <p>{fill(w['fam.school.noticeSent'], { date: day(n.sentOn, lang) })}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The events the school invited the family to (C331), soonest first; a cancelled one says so.
function EventList({ w, lang, items }: { w: Words; lang: 'en' | 'hi'; items: SchoolEvent[] }) {
  return (
    <div className="flex flex-col gap-1" data-school-events>
      <p className="text-sm font-semibold text-slate">{w['fam.school.events']}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.eventsNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((e, i) => (
            <li key={i} className="rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p className="font-semibold">
                <SchoolText text={e.title} />
                {e.cancelled ? ` · ${w['fam.school.eventCancelled']}` : ''}
              </p>
              <p>{e.startsAt ? `${day(e.heldOn, lang)}, ${e.startsAt}` : day(e.heldOn, lang)}</p>
              <p className="whitespace-pre-line">
                <SchoolText text={e.details} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// An ISO weekday's name (1 is Monday) in the family's language: 1 January 2024 was a Monday.
const weekdayName = (iso: number, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, iso))));

// The class's published timetable (C332), one line a day, read only.
function Timetable({ w, lang, periods }: { w: Words; lang: 'en' | 'hi'; periods: SchoolPeriod[] }) {
  const days = Array.from(new Set(periods.map((p) => p.weekday)));
  return (
    <div className="flex flex-col gap-1" data-school-timetable>
      <p className="text-sm font-semibold text-slate">{w['fam.school.timetable']}</p>
      {days.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.timetableNone']}</p>
      ) : (
        <ul className="flex flex-col gap-1 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
          {days.map((d) => (
            <li key={d}>
              <span className="font-semibold">{weekdayName(d, lang)}: </span>
              {periods
                .filter((p) => p.weekday === d)
                .map((p, i) => (
                  <span key={p.period}>
                    {i > 0 ? ' · ' : ''}
                    {p.period}. <SchoolText text={p.subject ?? '—'} />
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A percent and grade as the report card says them (the percent, then the grade), or "not complete" while marks are
// missing.
const scored = (w: Words, percent: number | null, grade: string | null) => (percent === null ? w['fam.school.resultNotComplete'] : grade ? `${percent}% · ${grade}` : `${percent}%`);

// The results the school published for a matched child's class (C333), newest first, read only. A subject whose
// script the teacher checked and approved opens its checked paper (C351).
function Results({ w, lang, items, childId }: { w: Words; lang: 'en' | 'hi'; items: SchoolResult[]; childId: string | null }) {
  return (
    <div className="flex flex-col gap-1" data-school-results>
      <p className="text-sm font-semibold text-slate">{w['fam.school.results']}</p>
      {items.length > 0 && childId && (
        <Link href={`/family/parent/progress/${childId}`} data-progress-link className="fam-press inline-flex min-h-[44px] items-center self-start font-semibold text-royal underline underline-offset-2">
          {w['fam.schoolProgress.open']}
        </Link>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.resultsNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p className="font-semibold">
                <SchoolText text={r.term ? `${r.exam} · ${r.term}` : r.exam} />
              </p>
              <p>{fill(w['fam.school.resultPublished'], { date: day(r.publishedOn, lang) })}</p>
              <ul className="flex flex-col">
                {r.subjects.map((s, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-x-3">
                    <span>
                      <SchoolText text={s.name} />: {scored(w, s.percent, s.grade)}
                    </span>
                    {s.checked && childId && (
                      <Link
                        href={`/family/parent/results/${childId}/${s.paperId}`}
                        aria-label={fill(w['fam.marks.openSubject'], { subject: s.name })}
                        data-checked-paper-link={s.paperId}
                        className="fam-press inline-flex min-h-[44px] items-center font-semibold text-royal underline underline-offset-2"
                      >
                        {w['fam.marks.open']}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="font-semibold">
                {w['fam.school.resultOverall']}: {scored(w, r.overall.percent, r.overall.grade)}
              </p>
              {r.coScholastic.length > 0 && <p>{r.coScholastic.map((c) => `${c.area}: ${c.grade}`).join(' · ')}</p>}
              {r.remark && (
                <p className="whitespace-pre-line">
                  {w['fam.school.resultRemark']}: {r.remark}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkCard({ w, lang, link, children }: { w: Words; lang: 'en' | 'hi'; link: SchoolLinkView; children: { childId: string; firstName: string }[] }) {
  const router = useRouter();
  const initial = Object.fromEntries(link.school.children.map((c) => [c.studentId, link.pairs.find((p) => p.studentId === c.studentId)?.childId ?? '']));
  const [choice, setChoice] = useState<Record<string, string>>(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(choice) !== JSON.stringify(initial);
  const save = async () => {
    setError('');
    const r = await familyApi('/api/family/school/children', 'POST', { linkId: link.linkId, pairs: link.school.children.map((c) => ({ studentId: c.studentId, childId: choice[c.studentId] || null })) });
    if (!r.ok) return setError(w['fam.school.saveError']);
    setSaved(true);
    router.refresh();
  };
  const unlink = async () => {
    const r = await familyApi('/api/family/school/unlink', 'POST', { linkId: link.linkId });
    if (!r.ok) return setError(w['fam.school.saveError']);
    router.refresh();
  };
  // The parent is looking at the school's part: what was new from it is now seen (C338).
  useEffect(() => {
    void familyApi('/api/family/school/seen', 'POST', { linkId: link.linkId });
  }, [link.linkId]);
  const usedElsewhere = (studentId: string) => new Set(Object.entries(choice).filter(([s, c]) => s !== studentId && c).map(([, c]) => c));
  return (
    <div data-school-link={link.linkId} className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
      <p className="text-base font-bold text-slate">
        {/* The school's name in its own words, inside the app's sentence. */}
        {(w['fam.school.connected'] ?? '').split('{school}').map((part, i) => (
          <span key={i}>
            {i > 0 && <SchoolText text={link.school.schoolName} />}
            {part}
          </span>
        ))}
      </p>
      {link.school.children.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.noChildren']}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {link.school.children.map((c) => (
            <li key={c.studentId} data-school-child={c.studentId} className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate/10">
              <p className="text-base font-semibold text-slate">
                <SchoolText text={c.name} />
                {c.className ? ` · ${c.className}` : ''}
              </p>
              <p className="text-sm text-slate">
                {fill(w['fam.school.today'], { mark: w[`fam.school.mark.${c.today ?? 'none'}`] })}
                {c.markedDays > 0 ? ` · ${fill(w['fam.school.present'], { present: c.presentDays, marked: c.markedDays })}` : ''}
                {c.dueMinor > 0 ? ` · ${fill(w['fam.school.due'], { amount: rupees(c.dueMinor) })}` : ''}
              </p>
              {c.pulse && <PulseList w={w} lang={lang} linkId={link.linkId} studentId={c.studentId} pulse={c.pulse} />}
              {c.homework && <HomeworkList w={w} lang={lang} items={c.homework} />}
              {c.notices && <NoticeList w={w} lang={lang} items={c.notices} />}
              {c.events && <EventList w={w} lang={lang} items={c.events} />}
              {c.timetable && <Timetable w={w} lang={lang} periods={c.timetable} />}
              {c.examSchedule && <ExamTimetable w={w} lang={lang} papers={c.examSchedule} />}
              {c.results && <Results w={w} lang={lang} items={c.results} childId={link.pairs.find((p) => p.studentId === c.studentId)?.childId ?? null} />}
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate" htmlFor={`fam-school-pair-${c.studentId}`}>
                {w['fam.school.whichChild']}
                <select
                  id={`fam-school-pair-${c.studentId}`}
                  value={choice[c.studentId] ?? ''}
                  onChange={(e) => {
                    setSaved(false);
                    setChoice({ ...choice, [c.studentId]: e.target.value });
                  }}
                  className="min-h-[44px] rounded-xl border border-slate/30 bg-white px-3 text-base text-slate"
                >
                  <option value="">{w['fam.school.notLinked']}</option>
                  {children
                    .filter((k) => !usedElsewhere(c.studentId).has(k.childId))
                    .map((k) => (
                      <option key={k.childId} value={k.childId}>
                        {k.firstName}
                      </option>
                    ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
      {link.school.awaitingConsent > 0 && <p className="text-sm text-slate">{fill(w['fam.school.awaiting'], { n: link.school.awaitingConsent })}</p>}
      {children.length === 0 && <p className="text-sm text-slate">{w['fam.school.addChildFirst']}</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="text-sm font-semibold text-emerald-text">
          {w['fam.school.saved']}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {link.school.children.length > 0 && (
          <Button type="button" disabled={!dirty} onClick={() => void save()}>
            {w['fam.school.save']}
          </Button>
        )}
        {!confirm ? (
          <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
            {w['fam.school.disconnect']}
          </Button>
        ) : (
          <>
            <p className="w-full text-sm text-slate">{w['fam.school.disconnectNote']}</p>
            <Button type="button" variant="outline" onClick={() => void unlink()}>
              {w['fam.school.disconnectYes']}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              {w['fam.common.cancel']}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function SchoolSection({ w, lang, links, children }: { w: Words; lang: 'en' | 'hi'; links: SchoolLinkView[]; children: { childId: string; firstName: string }[] }) {
  return (
    <section data-school-section className="fam-card fam-section fam-rise bg-white">
      <h2 className="fam-h2 text-slate">{w['fam.school.title']}</h2>
      {links.map((l) => (
        <LinkCard key={l.linkId} w={w} lang={lang} link={l} children={children} />
      ))}
      <ConnectForm w={w} again={links.length > 0} />
    </section>
  );
}
