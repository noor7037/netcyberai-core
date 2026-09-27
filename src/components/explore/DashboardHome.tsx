import { Icon, type IconName } from '@/components/visual/Icons';
import { ColumnChart } from '@/components/visual/Charts';
import { colors } from '@/lib/design-tokens';
import { tones, type Tone } from '@/lib/semantic';
import {
  classAttendance,
  heroDashboard as d,
  pct,
  recentActivity,
  siteDemoSchool,
  timetableToday,
  upcomingEvents,
  weekAttendance,
} from '@/demo-fixture/website-demo';

// The principal's full home screen in the product tour, built from the
// founder's dashboard reference with the Constitution applied: no class
// "topper" names, no fees paired with students' standing or parents'
// numbers; Personal Bests are counted per class instead.

const KPI_STYLE: { icon: IconName; tone: Tone }[] = [
  { icon: 'users', tone: 'trust' },
  { icon: 'attendance', tone: 'success' },
  { icon: 'fees', tone: 'action' },
  { icon: 'alert', tone: 'alert' },
];
const BUCKET_COLOURS = ['bg-turquoise', 'bg-gold', 'bg-coral'];

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate/10 bg-white p-4 ${className}`}>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate/70">{title}</h3>
      {children}
    </section>
  );
}

function statusOf(p: number): { label: string; tone: Tone } {
  if (p >= 95) return { label: 'Good', tone: 'success' };
  if (p >= 92) return { label: 'Watch', tone: 'action' };
  return { label: 'Needs attention', tone: 'alert' };
}

export function DashboardHome({ onOpen }: { onOpen: (moduleId: string) => void }) {
  const actions: { label: string; icon: IconName; tone: Tone; target: string }[] = [
    { label: 'Add a student', icon: 'users', tone: 'trust', target: 'students' },
    { label: 'Record a fee', icon: 'fees', tone: 'action', target: 'fees' },
    { label: 'Send the Pulse', icon: 'pulse', tone: 'communication', target: 'pulse' },
    { label: 'Open reports', icon: 'reports', tone: 'intelligence', target: 'reports' },
  ];

  return (
    <div className="flex flex-col gap-4 bg-off-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold text-slate">{d.greeting}</p>
          <p className="text-xs text-slate/70">{`Here is ${siteDemoSchool.name} today · ${d.date}`}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones.trust.soft}`}>Principal</span>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.kpis.map((k, i) => (
          <li key={k.label} className="flex items-center gap-3 rounded-xl border border-slate/10 bg-white p-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[KPI_STYLE[i].tone].solid}`}>
              <Icon name={KPI_STYLE[i].icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-extrabold leading-none text-slate">{k.value}</span>
              <span className="block truncate text-xs font-semibold text-slate">{k.label}</span>
              <span className="block truncate text-[11px] text-slate/70">{k.note}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Attendance by band, and absences this week" className="xl:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {d.attendanceBands.map((b) => (
              <div key={b.band} className="rounded-lg bg-off-white p-2.5">
                <p className="text-[11px] font-bold text-slate/70">{b.band}</p>
                <p className="text-lg font-extrabold text-slate">{`${b.value}%`}</p>
                <p className="truncate text-[10px] text-slate/70">{b.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <ColumnChart
              title="Students absent each day this week"
              data={weekAttendance.map((w) => ({ label: w.day, value: w.absent }))}
              color={colors.coral}
              height={150}
            />
          </div>
        </Panel>

        <Panel title="Fee collection">
          <p className="text-3xl font-extrabold text-slate">{`${d.fees.collected}%`}</p>
          <p className="text-xs text-slate/70">collected this term</p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full" role="img" aria-label={d.fees.buckets.map((b) => `${b.label} ${b.share} percent`).join(', ')}>
            {d.fees.buckets.map((b, i) => (
              <div key={b.label} className={BUCKET_COLOURS[i]} style={{ width: `${b.share}%` }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {d.fees.buckets.map((b, i) => (
              <li key={b.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${BUCKET_COLOURS[i]}`} />
                  {b.label}
                </span>
                <span className="font-bold text-slate">{`${b.amount} · ${b.share}%`}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate/70">{d.fees.reminder}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Class-wise attendance today" className="xl:col-span-2">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-xs">
              <caption className="sr-only">Attendance by class today, with Personal Bests recorded this week</caption>
              <thead>
                <tr className="text-slate/70">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Class</th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Present</th>
                  <th scope="col" className="w-1/3 py-1.5 pr-2 font-semibold">Attendance</th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Personal Bests</th>
                  <th scope="col" className="py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {classAttendance.map((c) => {
                  const p = pct(c.present, c.total);
                  const st = statusOf(p);
                  return (
                    <tr key={c.name} className="border-t border-slate/10 text-slate">
                      <th scope="row" className="py-1.5 pr-2 font-semibold">{c.name}</th>
                      <td className="py-1.5 pr-2">{`${c.present}/${c.total}`}</td>
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate/10">
                            <span className="block h-full rounded-full bg-royal" style={{ width: `${p}%` }} />
                          </span>
                          <span className="w-10 text-right">{`${p}%`}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">{c.personalBests}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[st.tone].soft}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Quick actions">
            <ul className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <li key={a.label}>
                  <button
                    type="button"
                    onClick={() => onOpen(a.target)}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-slate/10 p-2 text-left text-xs font-semibold text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[a.tone].solid}`}>
                      <Icon name={a.icon} className="h-4 w-4" />
                    </span>
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Exceptions needing an owner">
            <ul className="flex flex-col divide-y divide-slate/10">
              {d.exceptions.map((e) => (
                <li key={e.title} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-xs font-semibold text-slate">{e.title}</p>
                  <p className="text-[11px] text-slate/70">{`Owner: ${e.owner}`}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Today’s timetable">
          <ul className="flex flex-col gap-2">
            {timetableToday.map((t) => (
              <li key={t.time} className="flex gap-3">
                <span className="w-12 shrink-0 text-xs font-bold text-slate">{t.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate">{`${t.subject} · ${t.cls}`}</span>
                  <span className="block text-[11px] text-slate/70">{t.teacher}</span>
                </span>
                <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.state === 'Now' ? tones.success.soft : tones.product.soft}`}>{t.state}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Upcoming">
          <ul className="flex flex-col gap-2">
            {upcomingEvents.map((e) => (
              <li key={e.title} className="flex gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.achievement.solid}`}>
                  <Icon name={e.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate">{e.title}</span>
                  <span className="block text-[11px] text-slate/70">{`${e.date} · ${e.detail}`}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent activity">
          <ul className="flex flex-col gap-2">
            {recentActivity.map((a) => (
              <li key={a.title} className="flex gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.product.soft}`}>
                  <Icon name={a.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate">{a.title}</span>
                  <span className="block text-[11px] text-slate/70">{`${a.detail} · ${a.when}`}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
