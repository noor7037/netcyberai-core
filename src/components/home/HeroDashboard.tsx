import { BrowserFrame } from '@/components/visual/Frames';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { heroDashboard as d, siteDemoSchool } from '@/demo-fixture/website-demo';

// The homepage's primary product visual: one principal's morning in the
// fictional Sunrise Public School. Static fixture data only; it never
// touches the database. Mobile shows a shorter stack (KPIs, the learning
// signal and exceptions) instead of a shrunken desktop layout.

const KPI_STYLE: { icon: IconName; tone: Tone }[] = [
  { icon: 'users', tone: 'trust' },
  { icon: 'attendance', tone: 'success' },
  { icon: 'fees', tone: 'action' },
  { icon: 'alert', tone: 'alert' },
];

const NAV: { icon: IconName; label: string; active?: boolean }[] = [
  { icon: 'principal', label: 'Dashboard', active: true },
  { icon: 'users', label: 'Students' },
  { icon: 'attendance', label: 'Attendance' },
  { icon: 'homework', label: 'Homework' },
  { icon: 'fees', label: 'Fees' },
  { icon: 'pulse', label: 'Daily Pulse' },
  { icon: 'reports', label: 'Reports' },
];

const BUCKET_COLOURS = ['bg-turquoise', 'bg-gold', 'bg-coral'];
const REPLY_COLOURS = ['bg-turquoise', 'bg-gold', 'bg-coral'];

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate/10 bg-white p-3 transition-shadow duration-200 hover:shadow-md ${className}`}>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate/70">{title}</p>
      {children}
    </div>
  );
}

export function HeroDashboard() {
  const replyTotal = d.learning.replies.reduce((a, r) => a + r.count, 0);
  return (
    <BrowserFrame url="demo.netcyberai.com/principal">
      <div className="flex bg-off-white">
        <nav aria-label="Demo dashboard sections" className="hidden w-12 shrink-0 flex-col items-center gap-1 bg-midnight py-3 text-white sm:flex">
          {NAV.map((n) => (
            <span
              key={n.label}
              title={n.label}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${n.active ? 'bg-royal' : 'opacity-70'}`}
            >
              <Icon name={n.icon} className="h-4 w-4" />
              <span className="sr-only">{n.label}</span>
            </span>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-extrabold text-slate">{d.greeting}</p>
              <p className="truncate text-[11px] text-slate/70">{`${siteDemoSchool.name} · ${d.date}`}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones.trust.soft}`}>Principal</span>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {d.kpis.map((k, i) => (
              <li key={k.label} className="rounded-xl border border-slate/10 bg-white p-2.5 transition-transform duration-200 hover:-translate-y-0.5">
                <span className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-md ${tones[KPI_STYLE[i].tone].solid}`}>
                  <Icon name={KPI_STYLE[i].icon} className="h-3.5 w-3.5" />
                </span>
                <p className="text-lg font-extrabold leading-none text-slate">{k.value}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate">{k.label}</p>
                <p className="truncate text-[10px] text-slate/70">{k.note}</p>
              </li>
            ))}
          </ul>

          <div className="hidden grid-cols-2 gap-2.5 sm:grid">
            <Card title="Attendance by class band">
              <ul className="flex flex-col gap-2">
                {d.attendanceBands.map((b) => (
                  <li key={b.band}>
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate">{b.band}</span>
                      <span className="text-slate/70">{`${b.value}%`}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate/10" role="img" aria-label={`${b.band} attendance ${b.value} percent`}>
                      <div className="h-full rounded-full bg-royal" style={{ width: `${(b.value - 80) * 5}%` }} />
                    </div>
                    <p className="text-[10px] text-slate/70">{b.note}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Fee collection">
              <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={d.fees.buckets.map((b) => `${b.label} ${b.share} percent`).join(', ')}>
                {d.fees.buckets.map((b, i) => (
                  <div key={b.label} className={BUCKET_COLOURS[i]} style={{ width: `${b.share}%` }} />
                ))}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {d.fees.buckets.map((b, i) => (
                  <li key={b.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${BUCKET_COLOURS[i]}`} />
                      {b.label}
                    </span>
                    <span className="font-semibold text-slate">{b.amount}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] text-slate/70">{d.fees.reminder}</p>
            </Card>
          </div>

          <Card title="Today’s learning signal">
            <p className="text-[11px] font-semibold text-slate">{d.learning.title}</p>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full" role="img" aria-label={d.learning.replies.map((r) => `${r.label} ${r.count}`).join(', ')}>
              {d.learning.replies.map((r, i) => (
                <div key={r.label} className={REPLY_COLOURS[i]} style={{ width: `${(r.count / replyTotal) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {d.learning.replies.map((r, i) => (
                <li key={r.label} className="flex items-center gap-1 text-[10px] text-slate">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${REPLY_COLOURS[i]}`} />
                  {`${r.label} · ${r.count}`}
                </li>
              ))}
            </ul>
            <p className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tones.intelligence.soft}`}>
              <Icon name="check" className="h-3 w-3" /> {d.learning.followUp}
            </p>
          </Card>

          <Card title="Exceptions needing an owner">
            <ul className="flex flex-col divide-y divide-slate/10">
              {d.exceptions.map((e) => (
                <li key={e.title} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate">{e.title}</p>
                    <p className="text-[10px] text-slate/70">{`Owner: ${e.owner}`}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.status === 'open' ? tones.alert.soft : tones.action.soft}`}>
                    {e.status === 'open' ? 'Open' : 'In progress'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </BrowserFrame>
  );
}
