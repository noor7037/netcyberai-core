'use client';

import { useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { tones } from '@/lib/semantic';
import {
  AI_CORE,
  AI_FLOW,
  AI_STATS,
  ATT_CLASS,
  ATT_TOP3,
  ATT_WEEKS,
  DASH_KPIS,
  DELAYED_FEES,
  ECO_SIGNALS,
  EVENTS_UPCOMING,
  FEE_SUMMARY,
  ONTIME_FEES,
  QUICK_ACTIONS,
  RECENT_ACTIVITY,
  SCHOOL,
  TIMETABLE_TODAY,
  attendanceBands,
  classPct,
  type ActivityKind,
  type ModuleId,
} from '@/demo-fixture/principal-dashboard';
import { Card, Chip, Progress, Ring, fillOf } from './bits';

// The reference dashboard's home page, every panel in its order:
// greeting, KPIs, attendance overview, fee collection, quick actions,
// the intelligence loop, K–12 attendance, timetable, events, activity,
// and the ten-module AI core.

type WeekKey = keyof typeof ATT_WEEKS;

function AttendanceOverview() {
  const [week, setWeek] = useState<WeekKey>('This Week');
  const data = ATT_WEEKS[week];
  const present = ATT_CLASS.reduce((a, c) => a + c.present, 0);
  const total = ATT_CLASS.reduce((a, c) => a + c.total, 0);
  const today = classPct(present, total);
  return (
    <Card
      title="Attendance Overview"
      aside={
        <label className="text-xs text-slate">
          <span className="sr-only">Attendance period</span>
          <select value={week} onChange={(e) => setWeek(e.target.value as WeekKey)} className="min-h-[32px] rounded-lg border border-slate/20 bg-white px-2 text-xs font-semibold text-slate">
            {(Object.keys(ATT_WEEKS) as WeekKey[]).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      }
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg bg-off-white p-3">
        <Ring segments={[[today, 'success']]} size={76} stroke={9} label={`${today}% present today`}>
          <span className="text-sm font-extrabold text-slate">{`${today}%`}</span>
        </Ring>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-extrabold text-slate">{`${today}% · ${present.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')} present`}</p>
          <ul className="grid grid-cols-3 gap-2">
            {attendanceBands().map((b) => (
              <li key={b.band} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate/70">{b.band}</span>
                <span className="text-sm font-extrabold text-slate">{`${b.pct}%`}</span>
                <Progress value={b.pct} />
                <span className="text-[10px] text-slate/70">{b.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-bold text-slate/70">Top-3 attendance · opt-in families only</p>
        <ol className="grid grid-cols-3 gap-2">
          {ATT_TOP3.map((t) => (
            <li key={t.rank} className="nca-lift flex flex-col rounded-lg border border-gold/40 bg-gold/10 px-2 py-1.5">
              <span className="text-[10px] font-extrabold text-gold-deep">{`#${t.rank}`}</span>
              <span className="truncate text-xs font-bold text-slate">{t.name}</span>
              <span className="truncate text-[10px] text-slate/70">{t.note}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex h-28 items-end gap-3" role="img" aria-label={data.map((d) => `${d.day}: ${d.present} present, ${d.absent} absent`).join('; ')}>
        {data.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <span title={`${d.day} · present ${d.present}`} className="w-3 rounded-t bg-turquoise transition-opacity hover:opacity-75" style={{ height: `${(d.present / total) * 100}%` }} />
              <span title={`${d.day} · absent ${d.absent}`} className="w-3 rounded-t bg-coral transition-opacity hover:opacity-75" style={{ height: `${Math.max(6, (d.absent / 120) * 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-slate/70">{d.day}</span>
          </div>
        ))}
      </div>
      <p className="flex gap-4 text-[11px] font-semibold text-slate">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-turquoise" /> Present (share of 1,240)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-coral" /> Absent (out of 120)
        </span>
      </p>
    </Card>
  );
}

function FeeCollection() {
  const max = 12.4;
  return (
    <Card title="Fee Collection" sub="Timing matters: on time, delayed and overdue.">
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <Ring segments={FEE_SUMMARY.buckets.map((b) => [b.share, b.tone] as [number, typeof b.tone])} size={96} stroke={12} label={`${FEE_SUMMARY.collectedPct}% collected`}>
          <span className="text-base font-extrabold text-slate">{`${FEE_SUMMARY.collectedPct}%`}</span>
          <span className="text-[10px] text-slate/70">Collected</span>
        </Ring>
        <ul className="flex flex-col gap-1.5">
          {FEE_SUMMARY.buckets.map((b) => (
            <li key={b.label} className="nca-row grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-1">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${fillOf(b.tone)}`} />
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-slate">{b.amount}</span>
                <span className="block truncate text-[11px] text-slate/70">{`${b.label} · ${b.note}`}</span>
              </span>
              <Chip tone={b.tone === 'success' ? 'success' : b.tone === 'action' ? 'action' : 'alert'}>{`${b.share}%`}</Chip>
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Amounts in lakh rupees">
        {FEE_SUMMARY.buckets.map((b) => (
          <li key={b.label} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-[11px]">
            <span className="font-semibold text-slate">{b.label}</span>
            <span className="h-3 overflow-hidden rounded bg-slate/5">
              <span className={`block h-full rounded ${fillOf(b.tone)}`} style={{ width: `${(parseFloat(b.amount.replace(/[^\d.]/g, '')) / max) * 100}%` }} />
            </span>
            <span className="text-right font-bold text-slate">{b.amount}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        {[
          { title: 'Delayed fee · student, class, parent', list: DELAYED_FEES, tone: 'action' as const },
          { title: 'On time or paid in advance', list: ONTIME_FEES, tone: 'success' as const },
        ].map((col) => (
          <div key={col.title} className="flex flex-col gap-1 rounded-lg bg-off-white p-2">
            <p className={`text-[11px] font-extrabold ${tones[col.tone].fg}`}>{col.title}</p>
            {col.list.map((f) => (
              <div key={f.student} className="nca-row flex flex-col rounded px-1 py-1 text-[11px]">
                <span className="flex justify-between gap-2">
                  <b className="text-slate">{f.student}</b>
                  <b className="shrink-0 text-slate">{f.amount}</b>
                </span>
                <span className="text-slate/70">{f.parent}</span>
                <span className="text-slate/70">{f.note}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="rounded-lg bg-coral/10 px-3 py-2 text-[11px] text-slate">
        <b>{FEE_SUMMARY.defaulterTitle}</b> {FEE_SUMMARY.defaulterNote}
      </p>
    </Card>
  );
}

function EcosystemCard({ open }: { open: (id: ModuleId) => void }) {
  const nodes = [
    { x: 78, y: 92, label: 'SCHOOL', sub: 'ERP + Ops', fill: '#1E293B' },
    { x: 582, y: 92, label: 'TEACHER', sub: 'Copilot', fill: '#0F766E' },
    { x: 582, y: 228, label: 'PARENT', sub: 'On WhatsApp', fill: '#C2410C' },
    { x: 78, y: 228, label: 'STUDENT', sub: 'Learning graph', fill: '#6D28D9' },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-midnight p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">NetCyberAI · Connected School Intelligence</p>
          <h3 className="text-lg font-extrabold">One School → One Intelligence Loop</h3>
          <p className="max-w-2xl text-xs opacity-90">
            School operations create evidence. NetCyberAI connects that evidence across students, teachers, parents and administration, recommends the next action, records outcomes and feeds the result back into the system.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/25 px-2.5 py-1 text-[10px] font-bold">Closed-loop view</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
        <svg viewBox="0 0 660 320" className="w-full" role="img" aria-label="The school, teacher, parent and student connected in a loop through the NetCyberAI intelligence core">
          <ellipse cx="330" cy="160" rx="284" ry="132" fill="none" stroke="#ffffff" strokeOpacity="0.15" />
          <ellipse cx="330" cy="160" rx="206" ry="92" fill="none" stroke="#ffffff" strokeOpacity="0.1" />
          <path className="nca-flow-line" d="M52 160 C110 42 220 28 330 48 S548 74 608 160" fill="none" stroke="#14B8A6" strokeWidth="3" />
          <path className="nca-flow-line" d="M608 160 C548 246 450 284 330 272 S105 254 52 160" fill="none" stroke="#FF7A1A" strokeWidth="3" />
          <path d="M105 78 C192 124 238 148 300 157" fill="none" stroke="#F5B90A" strokeWidth="2" strokeOpacity="0.8" />
          <path d="M360 160 C432 152 494 116 555 76" fill="none" stroke="#8B3DFF" strokeWidth="2" strokeOpacity="0.8" />
          {nodes.map((n) => (
            <g key={n.label} className="transition-opacity hover:opacity-80">
              <circle cx={n.x} cy={n.y} r="42" fill={n.fill} stroke="#ffffff" strokeOpacity="0.3" />
              <text x={n.x} y={n.y - 2} fill="#fff" textAnchor="middle" fontSize="11" fontWeight="800">
                {n.label}
              </text>
              <text x={n.x} y={n.y + 12} fill="#fff" textAnchor="middle" fontSize="8">
                {n.sub}
              </text>
            </g>
          ))}
          <circle cx="330" cy="160" r="62" fill="#8B3DFF" />
          <circle cx="330" cy="160" r="48" fill="#061233" />
          <text x="330" y="156" fill="#fff" textAnchor="middle" fontSize="15" fontWeight="900">
            NetCyberAI
          </text>
          <text x="330" y="172" fill="#fff" textAnchor="middle" fontSize="8">
            INTELLIGENCE CORE
          </text>
        </svg>
        <ul className="grid grid-cols-2 gap-2">
          {ECO_SIGNALS.map((s) => (
            <li key={s.label} className="nca-lift flex flex-col rounded-lg border border-white/15 bg-white/5 p-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold opacity-90">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${fillOf(s.tone)}`} />
                {s.label}
              </span>
              <span className="text-lg font-extrabold">{s.value}</span>
              <span className="text-[10px] opacity-80">{s.note}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="grid grid-cols-5 gap-1.5">
        {AI_CORE.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => open(m.id)} className="nca-lift flex w-full flex-col rounded-lg bg-white/10 px-2 py-1.5 text-left hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
              <span className="text-[10px] font-extrabold opacity-80">{m.num}</span>
              <span className="text-xs font-bold">{m.name}</span>
              <span className="text-[10px] opacity-80">{m.rail}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap justify-between gap-2 text-[11px] opacity-90">
        <span>
          <b>Data</b> → evidence → intelligence → human action → outcome → feedback
        </span>
        <span>Built for school, teacher, parent and student in one school-scoped platform</span>
      </p>
    </section>
  );
}

function ClassTable() {
  return (
    <Card title="K–12 Attendance + Class Toppers" sub="Every class, its top attendance (opt-in) and attendance signal in one scan." aside={<Chip tone="neutral">13 classes</Chip>}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate/10 text-slate/70">
            {['Class', 'Present %', 'Total', 'Top attendance (opt-in)', 'Attendance', 'Progress'].map((h) => (
              <th key={h} scope="col" className="px-2 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ATT_CLASS.map((c) => {
            const p = classPct(c.present, c.total);
            const label = p >= 96 ? 'Excellent' : p >= 93 ? 'Good' : p >= 90 ? 'Watch' : 'Needs attention';
            return (
              <tr key={c.cls} className="nca-row border-b border-slate/5 last:border-0">
                <td className="px-2 py-1.5 font-bold text-slate">{c.cls}</td>
                <td className="px-2 py-1.5">
                  <Chip tone={p >= 93 ? 'success' : 'action'}>{`${p}%`}</Chip>
                </td>
                <td className="px-2 py-1.5 text-slate">{c.total}</td>
                <td className="px-2 py-1.5 text-slate">
                  <b>{c.top}</b>
                  {c.notes && <span className="block text-[10px] text-slate/70">{c.notes}</span>}
                </td>
                <td className="px-2 py-1.5 text-slate">{`${c.present}/${c.total}`}</td>
                <td className="w-40 px-2 py-1.5">
                  <span className="flex justify-between text-[10px] font-semibold text-slate">
                    <span>{label}</span>
                    <b>{`${p}%`}</b>
                  </span>
                  <Progress value={p} tone={p >= 93 ? 'success' : 'action'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

const ACT_FILTERS: ('All Activity' | ActivityKind)[] = ['All Activity', 'Fees', 'Admissions', 'Staff', 'Academics'];

export function PrincipalHome({ open, onAdd, toast }: { open: (id: ModuleId) => void; onAdd: () => void; toast: (msg: string) => void }) {
  const [filter, setFilter] = useState<(typeof ACT_FILTERS)[number]>('All Activity');
  const activity = RECENT_ACTIVITY.filter((a) => filter === 'All Activity' || a.kind === filter);
  const linkCls = 'text-xs font-bold text-emerald underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate">Good Afternoon, Principal!</h2>
          <p className="text-sm text-slate/70">Here’s what’s happening at your school today.</p>
        </div>
        <span className="rounded-full bg-slate/5 px-3 py-1 text-xs font-bold text-slate">{SCHOOL.dateLine}</span>
      </div>

      <ul className="grid grid-cols-4 gap-3">
        {DASH_KPIS.map((k) => (
          <li key={k.label} className="nca-lift flex items-center gap-3 rounded-xl border border-slate/10 bg-white p-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[k.tone].solid}`}>
              <Icon name={k.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-extrabold leading-none text-slate">{k.value}</span>
              <span className="block text-xs text-slate/70">{k.label}</span>
            </span>
            <Chip tone={k.trendAlert ? 'alert' : 'success'}>{k.trend}</Chip>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <AttendanceOverview />
        <FeeCollection />
      </div>

      <Card title="Quick Actions">
        <ul className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((q) => (
            <li key={q.label}>
              <button
                type="button"
                onClick={() => (q.action === 'add-student' ? onAdd() : open(q.action))}
                className="nca-lift flex w-full items-center gap-2.5 rounded-lg border border-slate/10 bg-off-white px-3 py-2.5 text-left text-sm font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[q.tone].solid}`}>
                  <Icon name={q.icon} className="h-4 w-4" />
                </span>
                {q.label}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <EcosystemCard open={open} />
      <ClassTable />

      <div className="grid grid-cols-3 gap-3">
        <Card title="Today's Timetable" aside={<button type="button" onClick={() => open('timetable')} className={linkCls}>View All</button>}>
          <ul className="flex flex-col">
            {TIMETABLE_TODAY.map((r) => (
              <li key={r.time}>
                <button type="button" onClick={() => toast(`${r.time} · ${r.subject} · ${r.detail}`)} className="nca-row flex w-full gap-2 rounded-md px-1.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                  <span className="w-16 shrink-0 text-[11px] font-bold text-slate/70">{r.time}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs text-slate">{r.subject}</b>
                    <span className="block text-[11px] text-slate/70">{r.detail}</span>
                  </span>
                  <Chip tone={r.status === 'Ongoing' ? 'success' : 'neutral'}>{r.status}</Chip>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Upcoming Events" aside={<button type="button" onClick={() => open('events')} className={linkCls}>View All</button>}>
          <ul className="flex flex-col">
            {EVENTS_UPCOMING.map((e) => (
              <li key={e.title}>
                <button type="button" onClick={() => toast(`${e.title} · ${e.detail}`)} className="nca-row flex w-full items-start gap-2 rounded-md px-1.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.action.soft}`}>
                    <Icon name={e.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs text-slate">{e.title}</b>
                    <span className="block text-[11px] text-slate/70">{e.detail}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-slate">{e.time}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Recent Activity"
          aside={
            <label>
              <span className="sr-only">Filter activity</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="min-h-[32px] rounded-lg border border-slate/20 bg-white px-2 text-xs font-semibold text-slate">
                {ACT_FILTERS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          }
        >
          <ul className="flex flex-col">
            {activity.map((a) => (
              <li key={a.title}>
                <button type="button" onClick={() => toast(`Activity: ${a.title} · ${a.detail}`)} className="nca-row flex w-full items-start gap-2 rounded-md px-1.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.success.soft}`}>
                    <Icon name={a.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-xs text-slate">{a.title}</b>
                    <span className="block text-[11px] text-slate/70">{a.detail}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate/70">{a.when}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-grape/20 bg-grape/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate">NetCyberAI Core · Intelligence Across the Entire School</h3>
            <p className="max-w-3xl text-xs text-slate/70">
              One connected layer joins the ERP, student lifecycle, teacher workflow, family engagement, finance and school operations so decisions become evidence-led and actions become measurable.
            </p>
          </div>
          <Chip tone="intelligence">10 Core Modules · Closed-Loop Intelligence</Chip>
        </div>
        <ul className="grid grid-cols-5 gap-2">
          {AI_CORE.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => open(m.id)} className="nca-lift flex h-full w-full flex-col gap-1 rounded-lg border border-slate/10 bg-white p-2.5 text-left hover:border-grape focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                <span className="flex items-center justify-between text-[10px] font-extrabold text-grape-deep">
                  <span>{m.num}</span>
                  <span>NETCYBER AI</span>
                </span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones.intelligence.solid}`}>
                  <Icon name={m.icon} className="h-4 w-4" />
                </span>
                <b className="text-xs text-slate">{m.name}</b>
                <span className="text-[11px] text-slate/70">{m.line}</span>
                <span className="mt-auto text-[11px] font-bold text-emerald">{m.metric}</span>
              </button>
            </li>
          ))}
        </ul>
        <ol className="grid grid-cols-6 gap-1.5">
          {AI_FLOW.map((f, i) => (
            <li key={f} className="rounded-lg bg-white px-2 py-1.5 text-center">
              <span className="block text-[10px] font-extrabold text-grape-deep">{`0${i + 1}`}</span>
              <span className="text-[11px] font-bold text-slate">{f}</span>
            </li>
          ))}
        </ol>
        <ul className="grid grid-cols-4 gap-2">
          {AI_STATS.map((s) => (
            <li key={s.label} className="rounded-lg bg-white px-3 py-2">
              <span className="block text-[11px] text-slate/70">{s.label}</span>
              <span className="text-lg font-extrabold text-slate">{s.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-slate p-4 text-white">
        <div>
          <h3 className="text-base font-extrabold">One school. One connected system. One intelligence layer.</h3>
          <p className="text-xs opacity-90">Explore every module from the navigation, then use the actions to see how the platform works as one product.</p>
        </div>
        <button type="button" onClick={() => open('learning-genome')} className="nca-lift shrink-0 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan">
          Explore AI Intelligence
        </button>
      </div>
    </div>
  );
}
