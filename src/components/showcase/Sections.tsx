import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { MODULES, NAV_GROUPS, type ModuleId } from '@/demo-fixture/principal-dashboard';
import { STATUS_LABEL, moduleStatus, type ModuleStatus } from '@/content/module-status';
import { PrincipalDashboard } from './PrincipalDashboard';
import { ScaledStage } from '@/components/home/ScaledStage';
import { TeacherApp } from './TeacherApp';
import { WhatsAppPhone } from './WhatsAppPhone';
import { LinkedApps } from './LinkedApps';

// The one demo system, shared by the homepage and /product-tour:
// the principal's desktop dashboard, the teacher's staff app and the
// parent's WhatsApp. Each section says plainly that it is a demo.

export function PrincipalSection({ headingLevel = 'h2' }: { headingLevel?: 'h1' | 'h2' }) {
  const H = headingLevel;
  return (
    <section id="principal-dashboard" aria-labelledby="principal-title" className="scroll-mt-20 bg-white">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 px-4 py-10 sm:px-6 lg:py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-2">
            <Eyebrow tone="trust">For the principal · desktop</Eyebrow>
            <H id="principal-title" className="text-3xl font-extrabold tracking-tight text-slate sm:text-4xl">
              The principal’s dashboard. Try every module.
            </H>
            <p className="text-slate/70">
              Attendance, fees, admissions, staff, exams, communication and the AI modules, with search, the “+ Add” forms for
              every role and a page for each module. Click anything: it is a working preview with example data.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button href="/product-tour#modules" variant="secondary">
              Know more
            </Button>
            <Button href="/book-demo" variant="outline">
              Book a demo
            </Button>
          </div>
        </div>
        <p className="hidden items-center gap-2 text-xs font-semibold text-slate/70 md:flex lg:hidden">
          <Icon name="arrow" className="h-4 w-4" /> Desktop preview: scroll sideways inside the frame, or open it on a laptop.
        </p>
        <div className="nca-scroll -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="region" aria-label="Principal dashboard preview" tabIndex={0}>
          {/* Phones: the whole 68rem dashboard, scaled to fit (C83). */}
          <ScaledStage width={1088} innerClassName="min-w-[68rem]">
            <PrincipalDashboard />
          </ScaledStage>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate/70">Buttons that would save or send show what would happen and change nothing.</p>
        </div>
      </div>
    </section>
  );
}

export function AppsSection({ withParent = true }: { withParent?: boolean }) {
  return (
    <section aria-labelledby="apps-title" className="bg-off-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-12">
        <div className="flex max-w-3xl flex-col gap-2">
          <Eyebrow tone="success">
            {withParent ? (
              'For teachers and parents · mobile'
            ) : (
              <>
                <span className="lg:hidden">For teachers · mobile</span>
                <span className="hidden lg:inline">Teachers and parents · in sync</span>
              </>
            )}
          </Eyebrow>
          <h2 id="apps-title" className="text-3xl font-extrabold tracking-tight text-slate sm:text-4xl">
            {withParent ? (
              'Teachers get a staff app. Parents just use WhatsApp.'
            ) : (
              <>
                Teachers get a staff app built for one-minute days.<span className="hidden lg:inline"> Parents see it the same minute.</span>
              </>
            )}
          </h2>
          <p className={`text-slate/70 ${withParent ? '' : 'lg:hidden'}`}>
            {withParent
              ? 'Both work in the phones below. Tap the tabs, mark attendance, open the chat menu, book a PTM slot.'
              : 'Tap the tabs: mark attendance, post homework, enter marks, record what was taught and accept a cover request. The parent’s side is the WhatsApp at the top of this page.'}
          </p>
          {!withParent && (
            <p className="hidden text-slate/70 lg:block">
              What the teacher does reaches the parent at once, and the parent’s replies come straight back. Watch a school day play out, or
              tap either phone to drive both yourself.
            </p>
          )}
        </div>
        {/* Homepage from 1024px: the teacher and parent apps side by side,
            in sync (C84). Below 1024px: the teacher app alone, unchanged. */}
        {!withParent && (
          <div className="hidden lg:block">
            <LinkedApps />
          </div>
        )}
        <div className={`mx-auto grid w-full max-w-4xl grid-cols-1 gap-10 ${withParent ? 'md:grid-cols-2' : 'md:grid-cols-[auto_minmax(0,1fr)] md:items-center lg:hidden'}`}>
          {[
            {
              key: 'teacher',
              title: 'Teacher staff app',
              tone: 'product' as Tone,
              points: ['Today: periods, cover requests and the Copilot brief', 'Attendance in one screen, homework, marks with Personal Best', 'Daily Pulse, Early Warning, PTM, leave and a private Impact Card'],
              phone: <TeacherApp />,
            },
            {
              key: 'parent',
              title: 'Parent on WhatsApp',
              tone: 'communication' as Tone,
              points: ['Daily Learning Pulse with one-tap replies', 'Menu: attendance, homework, marks, fees and receipts, PTM', 'Notices, message a teacher, concerns, documents and consent'],
              phone: <WhatsAppPhone />,
            },
          ]
            .filter((a) => withParent || a.key === 'teacher')
            .map((a) => (
            <div key={a.key} className="flex flex-col gap-4">
              {a.phone}
              <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-2">
                <p className="flex items-center gap-2 font-extrabold text-slate">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${tones[a.tone].dot}`} />
                  {a.title}
                </p>
                <ul className="flex flex-col gap-1">
                  {a.points.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-slate/70">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<ModuleStatus, string> = {
  live: tones.success.soft,
  partial: tones.communication.soft,
  foundation: tones.achievement.soft,
  planned: 'bg-slate/5 text-slate',
  'needs-spec': tones.intelligence.soft,
};

// Every module in the dashboard with its honest status in the real
// product (src/content/module-status.ts).
export function ModuleIndex() {
  const groups = NAV_GROUPS.map((g) => ({ title: g.title, ids: g.items.map((i) => i.id).filter((id): id is ModuleId => id !== 'dashboard' && id !== 'logout') })).filter((g) => g.ids.length > 0);
  const counts = (Object.keys(STATUS_LABEL) as ModuleStatus[]).map((s) => ({ s, n: Object.values(moduleStatus).filter((m) => m.status === s).length }));
  return (
    <section id="modules" aria-labelledby="modules-title" className="scroll-mt-20 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:py-12">
        <div className="flex max-w-3xl flex-col gap-2">
          <Eyebrow tone="trust">Every module, stated honestly</Eyebrow>
          <h2 id="modules-title" className="text-3xl font-extrabold tracking-tight text-slate">
            What each module does, and whether you can use it today
          </h2>
          <p className="text-slate/70">The demo shows the full design. This list shows the real product: what is live, what is being built, and what is still being specified.</p>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Modules by status">
          {counts.map(({ s, n }) => (
            <li key={s} className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[s]}`}>{`${STATUS_LABEL[s]} · ${n}`}</li>
          ))}
        </ul>
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate/70">{g.title}</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.ids.map((id) => {
                const st = moduleStatus[id];
                return (
                  <li key={id} className="nca-lift flex flex-col gap-2 rounded-2xl border border-slate/10 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-extrabold text-slate">{MODULES[id].title.replace(/^\d+ · /, '')}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[st.status]}`}>{STATUS_LABEL[st.status]}</span>
                    </div>
                    <p className="text-sm text-slate/70">{MODULES[id].desc}</p>
                    <p className="text-xs text-slate">{st.note}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
