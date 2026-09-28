'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones } from '@/lib/semantic';
import {
  CLASS_ROSTER,
  COPILOT_BRIEF,
  IMPACT_CARD,
  MARKS_ENTRY,
  PULSE_TOPICS,
  ROSTER_ABSENT_DEFAULT,
  TEACHER,
  TEACHER_HOMEWORK,
  TEACHER_MESSAGES,
  TEACHER_MORE,
  TEACHER_PERIODS,
  TEACHER_PTM,
  TEACHER_SIGNALS,
} from '@/demo-fixture/role-apps';
import { PhoneShell } from './PhoneShell';
import { LINK_CHILD, LINK_HOMEWORK, LINK_LEAVE_NOTE, LINK_THANKS, type AppLink, type Channel, type TeacherAction } from './link';

// The teacher's staff app as a phone preview: every teacher-side module of
// the principal dashboard (timetable and proxy, attendance, homework,
// marks, Daily Pulse, Copilot, Early Warning, PTM, leave, messages and
// the private Impact Card). Taps work; nothing is saved. With `link` (the
// homepage's side-by-side parent app, C84) its actions reach the parent
// app and the parent's replies show up here; without it nothing changes.

type Tab = 'today' | 'attendance' | 'homework' | 'marks' | 'more';
type More = (typeof TEACHER_MORE)[number]['id'];

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'teacher' },
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'homework', label: 'Homework', icon: 'homework' },
  { id: 'marks', label: 'Marks', icon: 'exams' },
  { id: 'more', label: 'More', icon: 'sparkle' },
];

const btn = 'nca-lift rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate/10 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-extrabold text-slate">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TeacherApp({ link }: { link?: AppLink<TeacherAction> } = {}) {
  const [tab, setTab] = useState<Tab>('today');
  const [more, setMore] = useState<More | null>(null);
  const [note, setNote] = useState('');
  const [absent, setAbsent] = useState<string[]>(ROSTER_ABSENT_DEFAULT);
  const [attSaved, setAttSaved] = useState(false);
  const [proxy, setProxy] = useState<'pending' | 'accepted' | 'declined'>('pending');
  const [hw, setHw] = useState(TEACHER_HOMEWORK);
  const [newHw, setNewHw] = useState('');
  const [marks, setMarks] = useState(MARKS_ENTRY.map((m) => m.mark));
  const [topic, setTopic] = useState<string | null>(null);
  const [pulseSent, setPulseSent] = useState(false);
  const [leave, setLeave] = useState(false);

  const say = (m: string) => setNote(m);
  const go = (t: Tab) => {
    setTab(t);
    setMore(null);
    setNote('');
  };

  const sync = link?.state;
  const emit = (channel: Channel, patch: Parameters<AppLink<TeacherAction>['emit']>[0]['patch'], text: string) => link?.emit({ from: 'teacher', channel, patch, text });
  const submitAttendance = (list: string[]) => {
    setAttSaved(true);
    say(`Saved. ${list.length} absence alert${list.length === 1 ? '' : 's'} queued for parents on WhatsApp (sent only with consent).`);
    const away = list.includes(LINK_CHILD);
    emit('attendance', { att: away ? 'absent' : 'present' }, away ? 'Absence alert: Aarav marked absent at 8:45' : 'Aarav marked present at 8:45');
  };
  const postHomework = (title: string) => {
    setHw((h) => [{ title, cls: '6-A', done: 0, total: 31, due: 'Monday' }, ...h]);
    setNewHw('');
    say('Homework posted to 6-A. Parents see it in tonight’s update.');
    emit('homework', { hw: title, hwDone: false }, `Homework posted: ${title}`);
  };
  const submitMarks = () => {
    say('Sent for approval. Families see marks only after the principal publishes.');
    const mark = marks[0];
    const best = MARKS_ENTRY[0].best;
    emit('marks', { marks: { mark, best } }, `Marks published: Aarav ${mark}/20${mark > best ? ', a Personal Best' : ''}`);
  };
  const savePulse = (t: string) => {
    setPulseSent(true);
    say('Saved. The Pulse goes to 6-A parents at 6:30 pm.');
    emit('pulse', { pulse: t, pulseReply: null }, `Daily Pulse: ${t}`);
  };
  const openDossiers = () => {
    say('Dossiers ready: attendance, marks and parent replies for each booked family.');
    emit('ptm', { ptm: true }, 'PTM agenda shared: Sat 26 Sep, 10:00');
  };
  const replyTo = (i: number) => {
    say(`Reply sent to ${TEACHER_MESSAGES[i].from}.`);
    if (i === 0) emit('messages', { reply: true }, 'Reply: one more fractions example');
  };

  const show = (c: Channel) => {
    const to: Record<Channel, [Tab, More | null]> = {
      attendance: ['attendance', null],
      homework: ['homework', null],
      marks: ['marks', null],
      pulse: ['more', 'pulse'],
      ptm: ['more', 'ptm'],
      messages: ['more', 'messages'],
    };
    setTab(to[c][0]);
    setMore(to[c][1]);
  };
  const run = (a: TeacherAction) => {
    if (a === 'attendance') {
      const next = absent.includes(LINK_CHILD) ? absent : [...absent, LINK_CHILD];
      setAbsent(next);
      submitAttendance(next);
    } else if (a === 'homework') postHomework(LINK_HOMEWORK);
    else if (a === 'pulse') {
      setTopic(PULSE_TOPICS[0]);
      savePulse(PULSE_TOPICS[0]);
    } else if (a === 'marks') submitMarks();
    else if (a === 'ptm') openDossiers();
    else replyTo(0);
  };

  // Requests from the simulation: open a screen and/or act.
  const cmd = link?.command;
  useEffect(() => {
    if (!cmd) return;
    if (cmd.view) show(cmd.view);
    if (cmd.act) run(cmd.act);
    // Only a new request should run; the closures read the current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd?.id]);

  // Announce what the parent just did.
  const last = link?.last;
  useEffect(() => {
    if (last?.from === 'parent') say(`Parent update · ${last.text}`);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let body: ReactNode;
  if (tab === 'today') {
    body = (
      <>
        <div>
          <p className="text-lg font-extrabold text-slate">{TEACHER.greeting}</p>
          <p className="text-xs text-slate/70">{`${TEACHER.date} · ${TEACHER.role}`}</p>
        </div>
        <Section title="Copilot morning brief" action={<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.intelligence.soft}`}>{COPILOT_BRIEF.cls}</span>}>
          <ul className="flex flex-col gap-1 text-xs text-slate">
            {COPILOT_BRIEF.points.map((p) => (
              <li key={p} className="flex gap-1.5">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-grape" />
                {p}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setTab('more'); setMore('copilot'); }} className={`${btn} w-fit ${tones.intelligence.soft}`}>
            See the 40-minute plan
          </button>
        </Section>
        <Section title="My periods today">
          <ul className="flex flex-col">
            {TEACHER_PERIODS.map((p) => (
              <li key={p.time} className="nca-row flex gap-2 rounded-md px-1 py-1.5">
                <span className="w-10 shrink-0 text-[11px] font-bold text-slate/70">{p.time}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-xs text-slate">{`${p.cls} · ${p.subject}`}</b>
                  <span className="block text-[11px] text-slate/70">{p.note}</span>
                  {p.proxy && (
                    <span className="mt-1 flex gap-1.5">
                      {proxy === 'pending' ? (
                        <>
                          <button type="button" onClick={() => { setProxy('accepted'); say('Cover accepted. The timetable and 9-B are updated.'); }} className={`${btn} bg-emerald text-white`}>
                            Accept cover
                          </button>
                          <button type="button" onClick={() => { setProxy('declined'); say('Declined. The next same-subject teacher is asked.'); }} className={`${btn} border border-slate/20 text-slate`}>
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${proxy === 'accepted' ? tones.success.soft : tones.action.soft}`}>{proxy === 'accepted' ? 'Cover accepted' : 'Declined'}</span>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Before you leave">
          <button type="button" onClick={() => { setTab('more'); setMore('pulse'); }} className={`${btn} flex items-center justify-between bg-slate text-white`}>
            Mark what you taught 6-A <span aria-hidden="true">→</span>
          </button>
          <button type="button" onClick={() => { setTab('more'); setMore('signals'); }} className={`${btn} flex items-center justify-between ${tones.alert.soft}`}>
            {`${TEACHER_SIGNALS.length} students need attention`} <span aria-hidden="true">→</span>
          </button>
        </Section>
      </>
    );
  } else if (tab === 'attendance') {
    body = (
      <>
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-slate">Class 6-A · Attendance</p>
          <span className="text-xs font-bold text-slate">{`${CLASS_ROSTER.length - absent.length}/${CLASS_ROSTER.length}`}</span>
        </div>
        <button type="button" onClick={() => { setAbsent([]); setAttSaved(false); }} className={`${btn} w-fit ${tones.success.soft}`}>
          Present all
        </button>
        <ul className="grid grid-cols-2 gap-1.5">
          {CLASS_ROSTER.map((s) => {
            const isAbsent = absent.includes(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  aria-pressed={isAbsent}
                  onClick={() => { setAttSaved(false); setAbsent((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s])); }}
                  className={`nca-lift flex w-full items-center justify-between rounded-lg border px-2 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${isAbsent ? 'border-coral bg-coral/15 text-slate' : 'border-slate/10 bg-white text-slate'}`}
                >
                  {s}
                  <span className={`rounded px-1.5 text-[10px] ${isAbsent ? 'bg-coral text-slate' : 'bg-turquoise text-slate'}`}>{isAbsent ? 'A' : 'P'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => submitAttendance(absent)}
          className={`${btn} bg-emerald text-white`}
        >
          {attSaved ? 'Saved ✓' : 'Submit attendance'}
        </button>
        {sync?.leave && <p className="nca-pop rounded-lg bg-leaf/15 p-2 text-[11px] text-slate">{`Leave note from Aarav’s parent: “${LINK_LEAVE_NOTE}”`}</p>}
      </>
    );
  } else if (tab === 'homework') {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">Homework</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newHw.trim()) return;
            postHomework(newHw.trim());
          }}
          className="flex gap-1.5"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">New homework title</span>
            <input value={newHw} onChange={(e) => setNewHw(e.target.value)} placeholder="New homework for 6-A" className="min-h-[36px] w-full rounded-lg border border-slate/20 bg-white px-2 text-xs text-slate" />
          </label>
          <button type="submit" className={`${btn} bg-slate text-white`}>
            Post
          </button>
        </form>
        <ul className="flex flex-col gap-1.5">
          {hw.map((h0) => {
            const h = sync?.hwDone && h0.title === sync.hw ? { ...h0, done: h0.done + 1 } : h0;
            return (
            <li key={h.title} className="nca-lift flex flex-col gap-1 rounded-lg border border-slate/10 bg-white p-2.5">
              <span className="flex justify-between text-xs">
                <b className="text-slate">{h.title}</b>
                <span className="text-slate/70">{`${h.cls} · ${h.due}`}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-slate/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-turquoise" style={{ width: `${(h.done / h.total) * 100}%` }} />
              </span>
              <span className="flex items-center justify-between text-[11px] text-slate/70">
                {`${h.done}/${h.total} submitted`}
                <button type="button" onClick={() => say(`${h.total - h.done} reminders queued for ${h.title}.`)} className="font-bold text-emerald underline-offset-2 hover:underline">
                  Remind pending
                </button>
              </span>
            </li>
            );
          })}
        </ul>
      </>
    );
  } else if (tab === 'marks') {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">6-A · Fractions check (out of 20)</p>
        <ul className="flex flex-col gap-1">
          {MARKS_ENTRY.map((m, i) => {
            const pb = marks[i] > m.best;
            return (
              <li key={m.name} className="nca-row flex items-center gap-2 rounded-md px-1 py-1">
                <span className="min-w-0 flex-1 text-xs font-bold text-slate">{m.name}</span>
                {pb && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tones.achievement.solid}`}>Personal Best</span>}
                <label>
                  <span className="sr-only">{`Mark for ${m.name}`}</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={marks[i]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                      setMarks((all) => all.map((x, j) => (j === i ? v : x)));
                    }}
                    className="h-8 w-14 rounded-md border border-slate/20 bg-white text-center text-xs font-bold text-slate"
                  />
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-slate/70">Personal Best compares each child with their own past, never with classmates.</p>
        <button type="button" onClick={submitMarks} className={`${btn} bg-emerald text-white`}>
          Submit for approval
        </button>
        {sync?.ack && <p className="nca-pop rounded-lg bg-leaf/15 p-2 text-[11px] text-slate">Aarav’s parent: “Thank you for the Personal Best note!”</p>}
      </>
    );
  } else if (more === null) {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">More</p>
        <ul className="grid grid-cols-2 gap-2">
          {TEACHER_MORE.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setMore(m.id)} className="nca-lift flex w-full flex-col items-start gap-2 rounded-xl border border-slate/10 bg-white p-3 text-left text-xs font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones.success.soft}`}>
                  <Icon name={m.icon} className="h-4 w-4" />
                </span>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else {
    const back = (
      <button type="button" onClick={() => { setMore(null); setNote(''); }} className="w-fit text-xs font-bold text-emerald underline-offset-2 hover:underline">
        ← More
      </button>
    );
    const screens: Record<More, ReactNode> = {
      pulse: (
        <Section title="Daily Pulse · what did 6-A learn today?">
          <ul className="flex flex-wrap gap-1.5">
            {PULSE_TOPICS.map((t) => (
              <li key={t}>
                <button type="button" aria-pressed={topic === t} onClick={() => { setTopic(t); setPulseSent(false); }} className={`${btn} ${topic === t ? 'bg-slate text-white' : 'border border-slate/15 text-slate'}`}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
          {topic && (
            <p className="rounded-lg bg-leaf/15 p-2 text-[11px] text-slate">{`Parents will read: “Today in Maths: ${topic}. Ghar par 5 minute poochhiye: aaj kya seekha?” with three reply buttons.`}</p>
          )}
          <button type="button" disabled={!topic} onClick={() => topic && savePulse(topic)} className={`${btn} bg-emerald text-white disabled:opacity-50`}>
            {pulseSent ? 'Scheduled ✓' : 'Save topic'}
          </button>
          {sync?.pulseReply && <p className="nca-pop rounded-lg bg-leaf/15 p-2 text-[11px] text-slate">{`Parent replies so far: Aarav’s parent · “${sync.pulseReply}”`}</p>}
        </Section>
      ),
      copilot: (
        <Section title={`Copilot · ${COPILOT_BRIEF.cls}`}>
          <ol className="flex flex-col gap-1">
            {COPILOT_BRIEF.plan.map(([t, s]) => (
              <li key={t} className="nca-row flex gap-2 rounded px-1 py-1 text-xs">
                <b className="w-12 shrink-0 text-grape-deep">{t}</b>
                <span className="text-slate">{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-slate/70">Suggestions only. The teacher decides.</p>
        </Section>
      ),
      signals: (
        <Section title="Early Warning · my students">
          <ul className="flex flex-col gap-1.5">
            {TEACHER_SIGNALS.map((s) => (
              <li key={s.name} className="nca-lift rounded-lg border border-slate/10 p-2 text-xs">
                <b className="block text-slate">{s.name}</b>
                <span className="block text-slate/70">{s.signal}</span>
                <button type="button" onClick={() => say(`${s.action}: added to your tasks.`)} className="mt-1 font-bold text-emerald underline-offset-2 hover:underline">
                  {s.action}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ),
      ptm: (
        <Section title="PTM · Sat 26 Sep">
          <ul className="flex flex-col">
            {TEACHER_PTM.map((p) => {
              const state = sync?.ptmConfirm && p.child.startsWith('Aarav') ? 'Confirmed' : p.state;
              return (
                <li key={p.time} className="nca-row flex justify-between gap-2 rounded px-1 py-1.5 text-xs">
                  <span className="font-bold text-slate">{p.time}</span>
                  <span className="min-w-0 flex-1 text-slate">{`${p.parent} · ${p.child}`}</span>
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${state === 'Open' ? tones.action.soft : tones.success.soft}`}>{state}</span>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={openDossiers} className={`${btn} w-fit ${tones.success.soft}`}>
            Open meeting dossiers
          </button>
        </Section>
      ),
      leave: (
        <Section title="Leave & proxy">
          <p className="text-xs text-slate">Apply for leave. Your periods are offered to free teachers of the same subject, and the principal approves.</p>
          <button type="button" onClick={() => { setLeave(true); say('Leave requested for Fri 25 Sep. 3 cover teachers found; waiting for principal approval.'); }} className={`${btn} w-fit bg-slate text-white`}>
            {leave ? 'Requested ✓' : 'Apply for Fri 25 Sep'}
          </button>
        </Section>
      ),
      messages: (
        <Section title="Messages">
          <ul className="flex flex-col gap-1.5">
            {(sync?.thanks ? [{ from: 'Sharma ji (Aarav’s parent)', text: LINK_THANKS, when: 'just now' }, ...TEACHER_MESSAGES] : TEACHER_MESSAGES).map((m, i) => (
              <li key={`${m.from}-${m.when}`} className={`rounded-lg bg-off-white p-2 text-xs ${sync?.thanks && i === 0 ? 'nca-pop' : ''}`}>
                <b className="block text-slate">{m.from}</b>
                <span className="block text-slate">{m.text}</span>
                <span className="flex justify-between text-[10px] text-slate/70">
                  {m.when}
                  <button type="button" onClick={() => (m.when === 'just now' ? say(`Reply sent to ${m.from}.`) : replyTo(TEACHER_MESSAGES.indexOf(m)))} className="font-bold text-emerald underline-offset-2 hover:underline">
                    Reply
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ),
      impact: (
        <Section title="My Impact Card · private">
          <ul className="grid grid-cols-2 gap-1.5">
            {IMPACT_CARD.map((c) => (
              <li key={c.label} className="rounded-lg bg-off-white p-2">
                <span className="block text-lg font-extrabold text-slate">{c.value}</span>
                <span className="block text-[10px] text-slate/70">{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate/70">Visible only to you and your principal. Never a public ranking.</p>
        </Section>
      ),
    };
    body = (
      <>
        {back}
        {screens[more]}
      </>
    );
  }

  return (
    <PhoneShell
      label="Demo teacher app screen"
      header={
        <div className="flex items-center gap-2 bg-slate px-3 pb-2.5 pt-1 text-white">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-[11px] font-extrabold text-slate">
            PM
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{TEACHER.name}</span>
            <span className="block truncate text-[11px] opacity-90">Sunrise International · Staff app</span>
          </span>
        </div>
      }
      footer={
        <nav aria-label="Teacher app sections" className="grid grid-cols-5 border-t border-slate/10 bg-white">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-royal ${tab === t.id ? 'text-emerald' : 'text-slate/70 hover:text-slate'}`}
            >
              <Icon name={t.icon} className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      }
    >
      <div key={`${tab}-${more}`} className="nca-pop flex flex-col gap-3 p-3">
        {body}
        <p aria-live="polite" className={note ? 'rounded-lg bg-slate px-3 py-2 text-[11px] font-semibold text-white' : 'sr-only'}>
          {note}
        </p>
      </div>
    </PhoneShell>
  );
}
