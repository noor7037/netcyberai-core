import type { ReactNode } from 'react';
import { tones, type Tone } from '@/lib/semantic';
import { colors } from '@/lib/design-tokens';
import { Icon, type IconName } from './Icons';
import { ChatIn, ChatOut, PhoneFrame } from './Frames';
import { ColumnChart, Funnel, LineChart, Meter, Ring, Sparkline } from './Charts';
import {
  admissionsBoard,
  admissionsFunnel,
  attendanceTrend,
  certificateSteps,
  classPerformance,
  complianceLedger,
  examResults,
  exceptionsList,
  feeBuckets,
  feeCollectionTrend,
  financeSummary,
  homeworkBoard,
  homeworkCompletion,
  learningGrowth,
  parentResponse,
  personalBest,
  principalTiles,
  pulseToday,
  schoolHealth,
  teacherImpactSignals,
  teacherToday,
} from '@/demo-fixture/website-demo';
import { demoSchool } from '@/demo-fixture/website-demo';

// NetCyberAI product UI previews, built from real components rather
// than screenshots. All figures come from src/demo-fixture/ and every
// screen carries the fictional school's name in its header.

export function ScreenHeader({ title, role, tone, icon }: { title: string; role: string; tone: Tone; icon: IconName }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate/10 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone].solid}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-slate">{title}</p>
          <p className="truncate text-xs text-slate/70">{demoSchool.name}</p>
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone].soft}`}>{role}</span>
    </div>
  );
}

export function Kpi({ label, value, tone, icon, trend }: { label: string; value: string; tone: Tone; icon: IconName; trend?: number[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate/10 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[tone].solid}`}>
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-xs font-medium text-slate/70">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-slate">{value}</p>
      {trend && <Sparkline values={trend} color={tones[tone].fill} label={`${label} trend`} />}
    </div>
  );
}

function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate/70">{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone].soft}`}>{children}</span>;
}

const tileIcons: IconName[] = ['users', 'attendance', 'fees', 'alert'];
const tileTones: Tone[] = ['trust', 'success', 'action', 'alert'];

// ---- Principal ---------------------------------------------------------------

export function PrincipalScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Principal dashboard" role="Principal" tone="trust" icon="principal" />
      <div className="flex flex-col gap-3 p-3">
        <div className={`grid grid-cols-2 gap-2 ${compact ? '' : 'lg:grid-cols-4'}`}>
          {principalTiles.map((t, i) => (
            <Kpi key={t.label} label={t.label} value={t.value} tone={tileTones[i]} icon={tileIcons[i]} />
          ))}
        </div>
        {!compact && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Panel title="Attendance this week">
                <LineChart
                  title="Attendance this week vs last week"
                  labels={attendanceTrend.labels}
                  series={[
                    { name: 'This week', color: colors.royal, values: attendanceTrend.thisWeek },
                    { name: 'Last week', color: colors.turquoise, values: attendanceTrend.lastWeek },
                  ]}
                  min={80}
                  max={100}
                  unit="%"
                  height={170}
                />
              </Panel>
            </div>
            <div className="lg:col-span-2">
              <Panel title="School health">
                <div className="flex items-center gap-3">
                  <Ring value={schoolHealth.score} color={colors.turquoise} size={92} label="School health score" center={`${schoolHealth.score}`} />
                  <ul className="flex flex-1 flex-col gap-1.5">
                    {schoolHealth.dimensions.slice(0, 3).map((d) => (
                      <li key={d.label}>
                        <div className="flex justify-between text-[11px] text-slate/70">
                          <span className="truncate">{d.label}</span>
                          <span className="font-semibold text-slate">{`${d.value}%`}</span>
                        </div>
                        <Meter value={d.value} color={colors.turquoise} label={d.label} />
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            </div>
          </div>
        )}
        <Panel title="Exceptions needing an owner">
          <ul className="flex flex-col divide-y divide-slate/10">
            {exceptionsList.slice(0, compact ? 2 : 4).map((e) => (
              <li key={e.title} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate">{e.title}</p>
                  <p className="text-[11px] text-slate/70">{e.owner}</p>
                </div>
                {e.status === 'open' && <Status tone="alert">Open</Status>}
                {e.status === 'in_progress' && <Status tone="action">In progress</Status>}
                {e.status === 'resolved' && <Status tone="success">Resolved</Status>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Teacher ------------------------------------------------------------------

export function TeacherTodayScreen() {
  const present = teacherToday.roster.filter((r) => r.present).length;
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Teacher Today" role="Teacher" tone="product" icon="teacher" />
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
        <Panel title="My classes">
          <ul className="flex flex-col gap-1.5">
            {teacherToday.schedule.map((s) => (
              <li key={s.time} className="flex items-center justify-between gap-2 rounded-lg bg-off-white px-2 py-1.5">
                <span className="text-xs text-slate">
                  <span className="font-semibold">{s.time}</span> · {s.label}
                </span>
                {s.status === 'done' && <Status tone="success">Marked</Status>}
                {s.status === 'now' && <Status tone="product">Now</Status>}
                {s.status === 'next' && <Status tone="trust">Next</Status>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="7B attendance" aside={<span className="text-[11px] font-semibold text-emerald">{`${present}/${teacherToday.roster.length} present`}</span>}>
          <ul className="grid grid-cols-4 gap-1.5">
            {teacherToday.roster.map((r) =>
              r.present ? (
                <li key={r.name} className="rounded-md bg-turquoise/15 px-1 py-1.5 text-center text-[11px] font-semibold text-emerald">
                  {r.name}
                </li>
              ) : (
                <li key={r.name} className="rounded-md bg-coral/15 px-1 py-1.5 text-center text-[11px] font-semibold text-coral-deep">
                  {r.name}
                </li>
              )
            )}
          </ul>
        </Panel>
        <Panel title="Homework to review">
          <ul className="flex flex-col gap-2">
            {homeworkBoard.slice(0, 2).map((h) => (
              <li key={h.title}>
                <div className="flex justify-between text-[11px] text-slate/70">
                  <span className="truncate font-semibold text-slate">{h.title}</span>
                  <span>{`${h.done}/${h.total}`}</span>
                </div>
                <Meter value={h.done} max={h.total} color={colors.royal} label={`${h.title} submissions`} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Daily Learning Pulse">
          <p className="text-xs text-slate/70">Built from today&apos;s verified class activity.</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-grape/10 px-2 py-1.5">
            <span className="truncate text-xs font-semibold text-grape-deep">6A Science ready</span>
            <span className="rounded-md bg-grape px-2 py-0.5 text-[11px] font-bold text-white">Review</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function TeacherImpactScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="My Impact Card" role="Private" tone="intelligence" icon="sparkle" />
      <div className="flex flex-col gap-3 p-3">
        <p className="rounded-lg bg-grape/10 px-3 py-2 text-xs text-grape-deep">
          Visible only to you and your principal. Never ranked, never public.
        </p>
        <ul className="flex flex-col gap-2.5">
          {teacherImpactSignals.map((s) => (
            <li key={s.label}>
              <div className="flex justify-between text-xs text-slate/70">
                <span>{s.label}</span>
                <span className="font-semibold text-slate">{`${s.value}%`}</span>
              </div>
              <Meter value={s.value} color={colors.grape} label={s.label} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Parent (WhatsApp) -------------------------------------------------------------

export function ParentPulsePhone({ showReply = true, compact = false }: { showReply?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <PhoneFrame title={demoSchool.name} subtitle="Official school updates" compact>
        <ChatIn time="3:32 pm">
          <p className="font-bold">{`Today in ${pulseToday.className}`}</p>
          <p className="mt-1">{pulseToday.taught}</p>
          <p className="mt-1 italic">{pulseToday.askAtHome}</p>
        </ChatIn>
        <ChatOut time="8:05 pm">{pulseToday.parentReply}</ChatOut>
      </PhoneFrame>
    );
  }
  return (
    <PhoneFrame title={`${demoSchool.name}`} subtitle="Official school updates">
      <ChatIn time="3:32 pm">
        <p className="font-bold">{`Today in ${pulseToday.className}`}</p>
        <p className="mt-1">
          <span className="font-semibold">Taught:</span> {pulseToday.taught}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Homework:</span> {pulseToday.homework}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Attendance:</span> {pulseToday.attendance}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Note:</span> {pulseToday.note}
        </p>
        <p className="mt-1 italic">{pulseToday.askAtHome}</p>
      </ChatIn>
      <div className="flex flex-wrap gap-1.5 self-start">
        {pulseToday.replyTiers.map((t) => (
          <span key={t} className="rounded-full border border-emerald/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald">
            {t}
          </span>
        ))}
      </div>
      {showReply && <ChatOut time="8:05 pm">{pulseToday.parentReply}</ChatOut>}
    </PhoneFrame>
  );
}

// ---- Student --------------------------------------------------------------------

export function StudentProgressScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title={`${personalBest.studentName} · ${personalBest.className}`} role="Student" tone="achievement" icon="student" />
      <div className="flex flex-col gap-3 p-3">
        <Panel title={`${personalBest.subject} progress`} aside={<Status tone="achievement">Personal Best</Status>}>
          <LineChart
            title={`${personalBest.studentName}, ${personalBest.subject} unit test scores`}
            labels={personalBest.labels}
            series={[{ name: 'Score', color: colors.grape, values: personalBest.scores }]}
            min={40}
            max={80}
            height={160}
          />
        </Panel>
        <div className="flex items-center gap-3 rounded-xl bg-gold/20 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-slate">
            <Icon name="trophy" className="h-5 w-5" />
          </span>
          <p className="text-xs text-gold-deep">
            <span className="font-bold">New Personal Best:</span>{' '}
            {`${personalBest.scores[personalBest.personalBestIndex]}, up from ${personalBest.previousBest}. Compared with her own past, not with classmates.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Finance ---------------------------------------------------------------------

export function FinanceScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Fees & collections" role="Finance" tone="action" icon="fees" />
      <div className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="Collected, Sep" value={financeSummary.collectedThisMonth} tone="success" icon="fees" />
          <Kpi label="Due this week" value={financeSummary.dueThisWeek} tone="action" icon="bell" />
          <Kpi label="Overdue families" value={financeSummary.overdueFamilies} tone="alert" icon="alert" />
          <Kpi label="Receipts sent" value={financeSummary.receiptsIssued} tone="communication" icon="chat" />
        </div>
        <Panel title="Collection by month (₹ lakh)">
          <ColumnChart
            title="Fee collection by month, rupees lakh"
            data={feeCollectionTrend.labels.map((l, i) => ({ label: l, value: feeCollectionTrend.values[i] }))}
            color={colors.tangerine}
            unit="L"
            height={170}
          />
        </Panel>
      </div>
    </div>
  );
}

// ---- Admissions ------------------------------------------------------------------

export function AdmissionsScreen() {
  const stageTones: Tone[] = ['communication', 'product', 'intelligence', 'success'];
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Admissions pipeline" role="Admissions" tone="action" icon="admissions" />
      <div className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {admissionsBoard.map((col, i) => (
            <div key={col.stage} className="rounded-xl border border-slate/10 bg-white p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tones[stageTones[i]].dot}`} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate/70">{col.stage}</p>
              </div>
              <ul className="flex flex-col gap-1">
                {col.items.map((it) => (
                  <li key={it} className="truncate rounded-md bg-off-white px-2 py-1 text-[11px] text-slate">
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Panel title="This season's funnel">
          <Funnel
            title="Admissions funnel"
            stages={admissionsFunnel}
            colors={[colors.cyan, colors.royal, colors.grape, colors.turquoise]}
          />
        </Panel>
      </div>
    </div>
  );
}

// ---- Attendance ------------------------------------------------------------------

export function AttendanceScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Attendance" role="School Admin" tone="success" icon="attendance" />
      <div className="flex flex-col gap-3 p-3">
        <Panel title="School attendance, this week">
          <ColumnChart
            title="School attendance by day this week"
            data={attendanceTrend.labels.map((l, i) => ({ label: l, value: attendanceTrend.thisWeek[i] }))}
            color={colors.turquoise}
            max={100}
            unit="%"
            height={160}
          />
        </Panel>
        <Panel title="Absences today">
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate">Aarav, 6A</span>
              <Status tone="communication">Parent replied: fever</Status>
            </li>
            <li className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate">Riya, 6A</span>
              <Status tone="alert">3 days, no reason</Status>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Homework --------------------------------------------------------------------

export function HomeworkScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Homework" role="Academics" tone="product" icon="homework" />
      <div className="flex flex-col gap-3 p-3">
        <Panel title="Completion by class">
          <ColumnChart
            title="Homework completion by class"
            data={homeworkCompletion}
            color={colors.royal}
            max={100}
            unit="%"
            height={160}
          />
        </Panel>
        <Panel title="Open assignments">
          <ul className="flex flex-col gap-2">
            {homeworkBoard.map((h) => (
              <li key={h.title}>
                <div className="flex justify-between text-[11px] text-slate/70">
                  <span className="truncate">
                    <span className="font-semibold text-slate">{h.title}</span> · {h.className}
                  </span>
                  <span>{`${h.done}/${h.total}`}</span>
                </div>
                <Meter value={h.done} max={h.total} color={colors.royal} label={`${h.title} submissions`} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Exams & results ------------------------------------------------------------

export function ExamsScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Exams & results" role="Academics" tone="intelligence" icon="exams" />
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
        <Panel title="Term 1 average by subject">
          <ColumnChart title="Term 1 average score by subject" data={classPerformance} color={colors.grape} max={100} height={160} />
        </Panel>
        <Panel title="6A Science, unit test">
          <ul className="flex flex-col gap-1.5">
            {examResults.map((r) => (
              <li key={r.name} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-slate">{r.name}</span>
                <div className="flex-1">
                  <Meter value={r.marks} color={colors.grape} label={`${r.name} marks`} />
                </div>
                <span className="w-7 shrink-0 text-right font-semibold text-slate">{r.marks}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Recognition + certificates --------------------------------------------------

export function RecognitionScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Recognition" role="Teacher" tone="achievement" icon="trophy" />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-gold/40 bg-white p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-slate">
            <Icon name="trophy" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate">{`${personalBest.studentName} · Personal Best`}</p>
            <p className="text-xs text-slate/70">{`${personalBest.subject}: ${personalBest.scores[personalBest.personalBestIndex]}, previous best ${personalBest.previousBest}`}</p>
          </div>
        </div>
        <CertificateCard />
        <p className="text-[11px] text-slate/70">Class top-3 lists are optional and off by default.</p>
      </div>
    </div>
  );
}

export function CertificateCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-gold bg-white p-4 text-center">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 nca-spectrum-bar" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-deep">Certificate of Personal Best</p>
      <p className="mt-1 text-lg font-extrabold text-slate">{personalBest.studentName}</p>
      <p className="text-xs text-slate/70">{`${personalBest.className} · ${personalBest.subject} · ${demoSchool.name}`}</p>
      <p className="mt-2 text-xs text-slate">For beating her own best score through steady effort.</p>
    </div>
  );
}

export function CertificateWorkflowScreen() {
  const stepTones: Tone[] = ['trust', 'action', 'product', 'communication', 'success'];
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Certificates" role="Office" tone="trust" icon="certificate" />
      <ol className="flex flex-col gap-2 p-3">
        {certificateSteps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-xl border border-slate/10 bg-white p-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tones[stepTones[i]].solid}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate">{s.title}</p>
              <p className="text-[11px] text-slate/70">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- Reports ----------------------------------------------------------------------

export function ReportsScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Reports & analytics" role="Principal" tone="intelligence" icon="reports" />
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
        <Panel title="Class average, this term">
          <LineChart
            title="Class average score this term"
            labels={learningGrowth.labels}
            series={[{ name: 'Class average', color: colors.grape, values: learningGrowth.classAverage }]}
            min={50}
            max={80}
            height={150}
          />
        </Panel>
        <Panel title="Parents reading Pulse">
          <LineChart
            title="Parents who read and replied to the Daily Learning Pulse, by week"
            labels={parentResponse.labels}
            series={[
              { name: 'Read', color: colors.royal, values: parentResponse.read },
              { name: 'Replied', color: colors.tangerine, values: parentResponse.replied },
            ]}
            unit="%"
            height={150}
          />
        </Panel>
      </div>
    </div>
  );
}

// ---- Compliance -------------------------------------------------------------------

export function ComplianceScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Consent & audit" role="Compliance" tone="trust" icon="shield" />
      <div className="flex flex-col gap-3 p-3">
        <Panel title="Consent ledger · Aarav S.">
          <ul className="flex flex-col divide-y divide-slate/10">
            {complianceLedger.map((c) => (
              <li key={c.purpose} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="text-slate">{c.purpose}</span>
                {c.status === 'Consented' ? <Status tone="success">{`${c.status} · ${c.when}`}</Status> : <Status tone="alert">{`${c.status} · ${c.when}`}</Status>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Audit trail">
          <ul className="flex flex-col gap-1 text-[11px] text-slate/70">
            <li>09:02 · Attendance 6A saved by A. Mehta</li>
            <li>15:31 · Pulse 6A approved and queued</li>
            <li>16:40 · TC clearance recorded by Accounts</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Operations (gap board) --------------------------------------------------------

export function OperationsScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="School operations" role="School Admin" tone="action" icon="operations" />
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate/10 bg-white p-2">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-coral-deep">Detected</p>
          <p className="rounded-md bg-coral/15 px-2 py-1 text-[11px] text-coral-deep">Homework not updated, 7B</p>
        </div>
        <div className="rounded-xl border border-slate/10 bg-white p-2">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-tangerine-deep">Owned</p>
          <p className="rounded-md bg-tangerine/10 px-2 py-1 text-[11px] text-tangerine-deep">Fee follow-up, 12 families</p>
        </div>
        <div className="rounded-xl border border-slate/10 bg-white p-2">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald">Verified</p>
          <p className="rounded-md bg-turquoise/15 px-2 py-1 text-[11px] text-emerald">Riya&apos;s guardian reached</p>
        </div>
      </div>
    </div>
  );
}

// ---- Students & guardians -----------------------------------------------------------

export function StudentProfileScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Student profile" role="School Admin" tone="trust" icon="student" />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-slate/10 bg-white p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-white">AS</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate">Aarav Sharma</p>
            <p className="text-xs text-slate/70">Class 6A · Roll 01 · Admission 2023</p>
          </div>
        </div>
        <Panel title="Guardians">
          <ul className="flex flex-col gap-1.5 text-xs">
            <li className="flex items-center justify-between gap-2">
              <span className="text-slate">Rakesh Sharma · Father</span>
              <Status tone="communication">WhatsApp verified</Status>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-slate">Pooja Sharma · Mother</span>
              <Status tone="success">Primary contact</Status>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ---- Fee buckets (for the fees flow) -------------------------------------------------

export function FeeBucketsPanel() {
  const bucketColors = [colors.turquoise, colors.tangerine, colors.coral];
  return (
    <div className="flex flex-col gap-2">
      {feeBuckets.map((b, i) => (
        <div key={b.label}>
          <div className="flex justify-between text-xs text-slate/70">
            <span>{b.label}</span>
            <span className="font-semibold text-slate">{`${b.value}%`}</span>
          </div>
          <Meter value={b.value} color={bucketColors[i]} label={b.label} />
        </div>
      ))}
    </div>
  );
}

// ---- Pulse composer: verified class activity -> Daily Learning Pulse ----------------

export function PulseComposerScreen() {
  const verified = [
    { label: 'Attendance marked, 6A', ok: true },
    { label: 'Lesson logged: Photosynthesis', ok: true },
    { label: 'Homework set: leaf diagram', ok: true },
    { label: 'Class note from the office', ok: true },
  ];
  return (
    <div className="bg-off-white">
      <ScreenHeader title="Daily Learning Pulse" role="Teacher" tone="intelligence" icon="pulse" />
      <div className="flex flex-col gap-3 p-3">
        <Panel title="Verified class activity">
          <ul className="flex flex-col gap-1.5">
            {verified.map((v) => (
              <li key={v.label} className="flex items-center gap-2 text-xs text-slate">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-turquoise text-slate">
                  <Icon name="check" className="h-2.5 w-2.5" />
                </span>
                {v.label}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="rounded-xl border border-grape/30 bg-white p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-grape-deep">Pulse draft · built only from the items above</p>
          <p className="mt-1 text-xs text-slate">{pulseToday.taught}</p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-md bg-grape px-2 py-1 text-[11px] font-bold text-white">Approve and send</span>
            <span className="rounded-md bg-off-white px-2 py-1 text-[11px] font-semibold text-slate">Edit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SchoolHealthScreen() {
  return (
    <div className="bg-off-white">
      <ScreenHeader title="School health · end of day" role="Principal" tone="success" icon="shield" />
      <div className="flex flex-col items-center gap-4 p-4 sm:flex-row">
        <Ring value={schoolHealth.score} color={colors.turquoise} size={120} label="School health score" center={`${schoolHealth.score}`} />
        <ul className="flex w-full flex-1 flex-col gap-2">
          {schoolHealth.dimensions.map((d) => (
            <li key={d.label}>
              <div className="flex justify-between text-xs text-slate/70">
                <span>{d.label}</span>
                <span className="font-semibold text-slate">{`${d.value}%`}</span>
              </div>
              <Meter value={d.value} color={colors.turquoise} label={d.label} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
