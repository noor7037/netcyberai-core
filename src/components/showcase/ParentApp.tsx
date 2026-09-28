'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones } from '@/lib/semantic';
import { PARENT, PARENT_HOMEWORK, PARENT_MESSAGE, PARENT_MONTH, PARENT_MORE, PARENT_RESULTS } from '@/demo-fixture/role-apps';
import { PhoneShell } from './PhoneShell';
import { LINK_LEAVE_NOTE, LINK_REPLY, LINK_THANKS, PULSE_REPLIES, type AppLink, type Channel, type LinkState, type ParentAction } from './link';

// The parent app as a phone preview, shown beside the teacher app on the
// homepage from 1024px (founder, 2026-09-29, Decision Log C84). It reads
// the shared state in `link`: what the teacher does arrives here at once,
// and what the parent does here reaches the teacher app. The parent app is
// optional and coming soon, for families who want more detail; WhatsApp
// stays the main channel and no parent has to install it. Taps work;
// nothing is sent.

type Tab = 'today' | 'attendance' | 'homework' | 'progress' | 'more';
type More = (typeof PARENT_MORE)[number]['id'];

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'parent' },
  { id: 'attendance', label: 'Attendance', icon: 'attendance' },
  { id: 'homework', label: 'Homework', icon: 'homework' },
  { id: 'progress', label: 'Progress', icon: 'exams' },
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

function Arrived({ children }: { children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.communication.soft}`}>
      {children}
    </span>
  );
}

// What has reached the parent today, newest first, for the Today feed.
function feed(s: LinkState): { channel: Channel; icon: IconName; title: string; detail: string; waiting: boolean }[] {
  const items: { channel: Channel; icon: IconName; title: string; detail: string; waiting: boolean }[] = [];
  if (s.att) items.push({ channel: 'attendance', icon: 'attendance', title: s.att === 'absent' ? 'Aarav is absent today' : 'Aarav is in school', detail: 'Marked 8:45 by Ms Mehta', waiting: s.att === 'absent' && !s.leave });
  if (s.hw) items.push({ channel: 'homework', icon: 'homework', title: `New homework: ${s.hw}`, detail: 'Mathematics · due Monday', waiting: !s.hwDone });
  if (s.pulse) items.push({ channel: 'pulse', icon: 'pulse', title: `Daily Pulse: ${s.pulse}`, detail: 'Ask Aarav what he learnt today', waiting: !s.pulseReply });
  if (s.marks) items.push({ channel: 'marks', icon: 'exams', title: `Fractions check: ${s.marks.mark}/20`, detail: s.marks.mark > s.marks.best ? 'A Personal Best' : 'Published by the principal', waiting: !s.ack });
  if (s.ptm) items.push({ channel: 'ptm', icon: 'users', title: 'PTM agenda for Sat 26 Sep', detail: '10:00 with Ms Mehta', waiting: !s.ptmConfirm });
  if (s.reply) items.push({ channel: 'messages', icon: 'chat', title: 'Ms Mehta replied', detail: LINK_REPLY, waiting: !s.thanks });
  return items.reverse();
}

export function ParentApp({ link }: { link: AppLink<ParentAction> }) {
  const [tab, setTab] = useState<Tab>('today');
  const [more, setMore] = useState<More | null>(null);
  const [note, setNote] = useState('');
  const s = link.state;

  const say = (m: string) => setNote(m);
  const go = (t: Tab) => {
    setTab(t);
    setMore(null);
    setNote('');
  };
  const show = (c: Channel) => {
    const to: Record<Channel, [Tab, More | null]> = {
      attendance: ['attendance', null],
      homework: ['homework', null],
      marks: ['progress', null],
      pulse: ['more', 'pulse'],
      ptm: ['more', 'ptm'],
      messages: ['more', 'messages'],
    };
    setTab(to[c][0]);
    setMore(to[c][1]);
  };

  const emit = (channel: Channel, patch: Partial<LinkState>, text: string) => link.emit({ from: 'parent', channel, patch, text });
  const act: Record<ParentAction, () => void> = {
    leave: () => {
      say('Leave note sent to Ms Mehta.');
      emit('attendance', { leave: true }, 'Leave note: Aarav has a fever');
    },
    hwDone: () => {
      say('Marked done. Ms Mehta sees it in her homework list.');
      emit('homework', { hwDone: true }, 'Aarav’s homework marked done');
    },
    pulseReply: () => pulseReply(PULSE_REPLIES[1]),
    ack: () => {
      say('Thank-you sent to Ms Mehta.');
      emit('marks', { ack: true }, 'Thank-you sent for the Personal Best');
    },
    ptmConfirm: () => {
      say('Confirmed. See you on Saturday at 10:00.');
      emit('ptm', { ptmConfirm: true }, 'PTM attendance confirmed');
    },
    thanks: () => {
      say('Message sent to Ms Mehta.');
      emit('messages', { thanks: true }, 'Message: “Thank you, ma’am!”');
    },
  };
  function pulseReply(r: string) {
    say('Reply sent. Ms Mehta sees how the class is doing.');
    emit('pulse', { pulseReply: r }, `Pulse reply: “${r}”`);
  }

  // Requests from the simulation: open a screen and/or act.
  const cmd = link.command;
  useEffect(() => {
    if (!cmd) return;
    if (cmd.view) show(cmd.view);
    if (cmd.act) act[cmd.act]();
    // Only a new request should run; the closures read the current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd?.id]);

  // Announce what the teacher just sent.
  const last = link.last;
  useEffect(() => {
    if (last?.from === 'teacher') say(`From school · ${last.text}`);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let body: ReactNode;
  if (tab === 'today') {
    const items = feed(s);
    body = (
      <>
        <div>
          <p className="text-lg font-extrabold text-slate">{PARENT.greeting}</p>
          <p className="text-xs text-slate/70">{`${PARENT.date} · ${PARENT.child}, ${PARENT.cls}`}</p>
        </div>
        <Section title="Updates from school" action={items.length > 0 ? <Arrived>{`${items.length} new`}</Arrived> : undefined}>
          {items.length === 0 ? (
            <p className="text-xs text-slate/70">Nothing new yet today. Updates from Aarav’s teachers appear here the moment they are sent.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map((it) => (
                <li key={it.channel}>
                  <button type="button" onClick={() => show(it.channel)} className="nca-lift flex w-full items-start gap-2 rounded-lg border border-slate/10 bg-white p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones.communication.soft}`}>
                      <Icon name={it.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-xs text-slate">{it.title}</b>
                      <span className="block truncate text-[11px] text-slate/70">{it.detail}</span>
                    </span>
                    {it.waiting && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tones.action.soft}`}>Reply</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="At a glance">
          <ul className="grid grid-cols-2 gap-1.5">
            <li className="rounded-lg bg-off-white p-2">
              <span className="block text-lg font-extrabold text-slate">{`${PARENT_MONTH.present}/${PARENT_MONTH.days}`}</span>
              <span className="block text-[10px] text-slate/70">{`Days present · ${PARENT_MONTH.label}`}</span>
            </li>
            <li className="rounded-lg bg-off-white p-2">
              <span className="block text-lg font-extrabold text-slate">Paid</span>
              <span className="block text-[10px] text-slate/70">Term 2 fees · receipt ready</span>
            </li>
          </ul>
        </Section>
      </>
    );
  } else if (tab === 'attendance') {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">{`${PARENT.child} · Attendance`}</p>
        <Section title="Today" action={s.att ? <Arrived>Marked 8:45</Arrived> : undefined}>
          {s.att === null && <p className="text-xs text-slate/70">Not marked yet. You are told the moment Ms Mehta marks the register.</p>}
          {s.att === 'present' && <p className="text-xs font-bold text-slate">Aarav is in school today ✓</p>}
          {s.att === 'absent' && (
            <>
              <p className="text-xs font-bold text-slate">Aarav was marked absent in 6-A at 8:45.</p>
              {s.leave ? (
                <p className="rounded-lg bg-leaf/15 p-2 text-[11px] text-slate">{`Leave note sent: “${LINK_LEAVE_NOTE}”`}</p>
              ) : (
                <button type="button" onClick={act.leave} className={`${btn} w-fit bg-royal text-white`}>
                  Send leave note: unwell
                </button>
              )}
            </>
          )}
        </Section>
        <Section title={PARENT_MONTH.label}>
          <p className="text-xs text-slate">{`Present ${PARENT_MONTH.present} of ${PARENT_MONTH.days} school days.`}</p>
          <span className="h-1.5 overflow-hidden rounded-full bg-slate/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-turquoise" style={{ width: `${(PARENT_MONTH.present / PARENT_MONTH.days) * 100}%` }} />
          </span>
        </Section>
      </>
    );
  } else if (tab === 'homework') {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">Homework</p>
        <ul className="flex flex-col gap-1.5">
          {s.hw && (
            <li className="nca-pop flex flex-col gap-1.5 rounded-lg border border-royal/30 bg-white p-2.5">
              <span className="flex items-center justify-between gap-2 text-xs">
                <b className="text-slate">{s.hw}</b>
                <Arrived>New</Arrived>
              </span>
              <span className="text-[11px] text-slate/70">Mathematics · due Monday · from Ms Mehta</span>
              {s.hwDone ? (
                <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.success.soft}`}>Done ✓</span>
              ) : (
                <button type="button" onClick={act.hwDone} className={`${btn} w-fit bg-royal text-white`}>
                  Mark as done
                </button>
              )}
            </li>
          )}
          {PARENT_HOMEWORK.map((h) => (
            <li key={h.title} className="flex flex-col gap-1 rounded-lg border border-slate/10 bg-white p-2.5">
              <span className="flex justify-between text-xs">
                <b className="text-slate">{h.title}</b>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.success.soft}`}>Done ✓</span>
              </span>
              <span className="text-[11px] text-slate/70">{`${h.subject} · due ${h.due}`}</span>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (tab === 'progress') {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">{`${PARENT.child} · Progress`}</p>
        <Section title="Fractions check (out of 20)">
          {s.marks ? (
            <>
              <p className="flex items-center gap-2 text-xs text-slate">
                <b className="text-2xl font-extrabold">{s.marks.mark}</b>
                <span>/20</span>
                {s.marks.mark > s.marks.best && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tones.achievement.solid}`}>Personal Best</span>}
              </p>
              <p className="text-[11px] text-slate/70">{`His best before was ${s.marks.best}. Personal Best compares Aarav only with his own past.`}</p>
              {s.ack ? (
                <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.success.soft}`}>Thank-you sent ✓</span>
              ) : (
                <button type="button" onClick={act.ack} className={`${btn} w-fit bg-royal text-white`}>
                  Say thank you to Ms Mehta
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-slate/70">Marks appear here after the principal publishes them.</p>
          )}
        </Section>
        <Section title="Earlier results">
          <ul className="flex flex-col">
            {PARENT_RESULTS.map((r) => (
              <li key={r.test} className="nca-row flex justify-between rounded px-1 py-1.5 text-xs">
                <span className="text-slate">{r.test}</span>
                <b className="text-slate">{r.score}</b>
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  } else if (more === null) {
    body = (
      <>
        <p className="text-base font-extrabold text-slate">More</p>
        <ul className="grid grid-cols-2 gap-2">
          {PARENT_MORE.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setMore(m.id)} className="nca-lift flex w-full flex-col items-start gap-2 rounded-xl border border-slate/10 bg-white p-3 text-left text-xs font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones.communication.soft}`}>
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
      <button type="button" onClick={() => { setMore(null); setNote(''); }} className="w-fit text-xs font-bold text-royal underline-offset-2 hover:underline">
        ← More
      </button>
    );
    const screens: Record<More, ReactNode> = {
      pulse: (
        <Section title="Daily Learning Pulse">
          {s.pulse ? (
            <>
              <p className="text-xs text-slate">{`Today in Maths: ${s.pulse}. Ghar par 5 minute poochhiye: aaj kya seekha?`}</p>
              <ul className="flex flex-wrap gap-1.5">
                {PULSE_REPLIES.map((r) => (
                  <li key={r}>
                    <button type="button" aria-pressed={s.pulseReply === r} onClick={() => pulseReply(r)} className={`${btn} ${s.pulseReply === r ? 'bg-royal text-white' : 'border border-slate/15 text-slate'}`}>
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate/70">Tonight’s Pulse arrives at 6:30 pm, after Ms Mehta saves what 6-A learnt.</p>
          )}
        </Section>
      ),
      ptm: (
        <Section title="Parent-teacher meeting">
          <p className="text-xs font-bold text-slate">Sat 26 Sep · 10:00 · Ms Mehta · booked</p>
          {s.ptm ? (
            <>
              <p className="rounded-lg bg-off-white p-2 text-[11px] text-slate">Agenda: Aarav’s fractions progress, the homework routine and attendance this month.</p>
              {s.ptmConfirm ? (
                <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${tones.success.soft}`}>Confirmed ✓</span>
              ) : (
                <button type="button" onClick={act.ptmConfirm} className={`${btn} w-fit bg-royal text-white`}>
                  Confirm I will attend
                </button>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate/70">Ms Mehta shares the agenda before the meeting.</p>
          )}
        </Section>
      ),
      messages: (
        <Section title="Ms Mehta · Mathematics">
          <ul className="flex flex-col gap-1.5 text-xs">
            <li className="ml-6 rounded-lg bg-royal/10 p-2 text-slate">
              {PARENT_MESSAGE.text}
              <span className="block text-[10px] text-slate/70">{PARENT_MESSAGE.when}</span>
            </li>
            {s.reply && (
              <li className="nca-pop mr-6 rounded-lg bg-off-white p-2 text-slate">
                {LINK_REPLY}
                <span className="block text-[10px] text-slate/70">Ms Mehta · today</span>
              </li>
            )}
            {s.thanks && (
              <li className="nca-pop ml-6 rounded-lg bg-royal/10 p-2 text-slate">
                {LINK_THANKS}
                <span className="block text-[10px] text-slate/70">You · just now</span>
              </li>
            )}
          </ul>
          {!s.thanks && (
            <button type="button" onClick={act.thanks} className={`${btn} w-fit bg-royal text-white`}>
              Send: “Thank you, ma’am!”
            </button>
          )}
        </Section>
      ),
      fees: (
        <Section title="Fees & receipts">
          <p className="text-xs text-slate">Term 2 fees are paid. The receipt is ready to download.</p>
          <button type="button" onClick={() => say('Receipt opened. In the real app it downloads as a PDF.')} className={`${btn} w-fit ${tones.communication.soft}`}>
            View receipt
          </button>
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
      label="Demo parent app screen"
      bar="royal"
      header={
        <div className="flex items-center gap-2 bg-royal px-3 pb-2.5 pt-1 text-white">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-[11px] font-extrabold text-slate">
            {PARENT.initials}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{PARENT.name}</span>
            <span className="block truncate text-[11px] opacity-90">{`${PARENT.child} · ${PARENT.cls} · Parent app`}</span>
          </span>
        </div>
      }
      footer={
        <nav aria-label="Parent app sections" className="grid grid-cols-5 border-t border-slate/10 bg-white">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => go(t.id)}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-royal ${tab === t.id ? 'text-royal' : 'text-slate/70 hover:text-slate'}`}
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
        <p aria-live="polite" className={note ? 'rounded-lg bg-royal px-3 py-2 text-[11px] font-semibold text-white' : 'sr-only'}>
          {note}
        </p>
      </div>
    </PhoneShell>
  );
}
