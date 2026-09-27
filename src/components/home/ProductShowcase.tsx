'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { BrowserFrame } from '@/components/visual/Frames';
import {
  AdmissionsScreen,
  AttendanceScreen,
  CertificateWorkflowScreen,
  ComplianceScreen,
  ExamsScreen,
  FinanceScreen,
  HomeworkScreen,
  OperationsScreen,
  ParentPulsePhone,
  PulseComposerScreen,
  RecognitionScreen,
  ReportsScreen,
  StudentProfileScreen,
  TeacherImpactScreen,
} from '@/components/visual/Screens';
import { tones, type Tone } from '@/lib/semantic';
import { useFinePointer } from '@/lib/hooks';

interface Module {
  name: string;
  icon: IconName;
  tone: Tone;
  role: string;
  flow: string[];
  outcome: string;
  href: string;
  screen: () => ReactNode;
}

const frame = (url: string, node: ReactNode) => <BrowserFrame url={`demo.netcyberai.com/${url}`}>{node}</BrowserFrame>;

const MODULES: Module[] = [
  { name: 'Admissions', icon: 'admissions', tone: 'action', role: 'Admissions desk', flow: ['Enquiry', 'Follow-up', 'Application', 'Admission'], outcome: 'Every enquiry has a stage and a next step.', href: '/products/school-management', screen: () => frame('admissions', <AdmissionsScreen />) },
  { name: 'Students & guardians', icon: 'users', tone: 'trust', role: 'School Admin', flow: ['Enrol', 'Link guardians', 'Verify WhatsApp', 'Record consent'], outcome: 'One validated record every module reads from.', href: '/products/school-management', screen: () => frame('students', <StudentProfileScreen />) },
  { name: 'Attendance', icon: 'attendance', tone: 'success', role: 'Teacher, Admin', flow: ['Mark', 'Validate', 'Notify parent', 'Flag exceptions'], outcome: 'Absences reach parents and the principal the same morning.', href: '/products/attendance-safety', screen: () => frame('attendance', <AttendanceScreen />) },
  { name: 'Homework', icon: 'homework', tone: 'product', role: 'Teacher', flow: ['Set', 'Share in Pulse', 'Track submissions', 'Review'], outcome: 'Parents see homework the day it is set.', href: '/products/academics', screen: () => frame('homework', <HomeworkScreen />) },
  { name: 'Exams & results', icon: 'exams', tone: 'intelligence', role: 'Teacher, Principal', flow: ['Schedule', 'Enter marks', 'Validate', 'Publish'], outcome: 'Results by subject and student, without spreadsheets.', href: '/products/academics', screen: () => frame('exams', <ExamsScreen />) },
  { name: 'Fees', icon: 'fees', tone: 'action', role: 'Finance', flow: ['Due', 'Reminder + UPI', 'Payment', 'Receipt'], outcome: 'Follow-ups happen on schedule, not from memory.', href: '/products/fees-billing', screen: () => frame('fees', <FinanceScreen />) },
  { name: 'Parent communication', icon: 'chat', tone: 'communication', role: 'Parent, Teacher', flow: ['Message', 'Consent gate', 'WhatsApp', 'Reply routed'], outcome: 'Two-way, on the channel parents already use.', href: '/products/communication', screen: () => <ParentPulsePhone /> },
  { name: 'Daily Learning Pulse', icon: 'pulse', tone: 'intelligence', role: 'Teacher, Parent', flow: ['Verified activity', 'Draft', 'Teacher approves', 'Parent reads'], outcome: 'Parents know what was taught today.', href: '/products/parent-engagement', screen: () => frame('pulse', <PulseComposerScreen />) },
  { name: 'Teacher Impact', icon: 'sparkle', tone: 'intelligence', role: 'Teacher, Principal', flow: ['Signals', 'Private card', 'Reflection', 'Support'], outcome: 'Useful feedback, never a public leaderboard.', href: '/products/ai-insights', screen: () => frame('impact', <TeacherImpactScreen />) },
  { name: 'Personal Best', icon: 'trophy', tone: 'achievement', role: 'Student, Parent', flow: ['Baseline', 'Improvement', 'Badge', 'Certificate'], outcome: 'Recognition for progress against their own past.', href: '/products/ai-insights', screen: () => frame('recognition', <RecognitionScreen />) },
  { name: 'Certificates', icon: 'certificate', tone: 'trust', role: 'Office, Principal', flow: ['Clearance', 'Generate PDF', 'WhatsApp', 'Audit'], outcome: 'Issued only after financial clearance or a formal waiver.', href: '/products/school-management', screen: () => frame('certificates', <CertificateWorkflowScreen />) },
  { name: 'Reports & analytics', icon: 'reports', tone: 'intelligence', role: 'Principal', flow: ['Collect', 'Validate', 'Chart', 'Act'], outcome: 'Trends from real, validated records.', href: '/products/reports-analytics', screen: () => frame('reports', <ReportsScreen />) },
  { name: 'Compliance', icon: 'shield', tone: 'trust', role: 'Admin, Principal', flow: ['Consent', 'Ledger', 'Audit trail', 'Review'], outcome: 'Consent and every change on the record.', href: '/products/compliance-security', screen: () => frame('compliance', <ComplianceScreen />) },
  { name: 'School operations', icon: 'operations', tone: 'action', role: 'Admin, Principal', flow: ['Detect', 'Assign', 'Resolve', 'Verify'], outcome: 'Gaps get an owner instead of getting lost.', href: '/products/school-management', screen: () => frame('operations', <OperationsScreen />) },
];

export function ProductShowcase() {
  const [pinned, setPinned] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const fine = useFinePointer();
  const timer = useRef<number | null>(null);
  const idx = hover ?? pinned;
  const m = MODULES[idx];

  return (
    <section aria-labelledby="showcase-title" className="bg-off-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="showcase-title"
            eyebrow="Product showcase"
            tone="intelligence"
            title="Every module, shown working"
            lead="Fourteen parts of the school, one connected product. Pick a module to see its screen, its workflow and who uses it."
          />
          <DemoLabel />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_1fr]">
          <div
            role="group"
            aria-label="Choose a module"
            onMouseLeave={() => {
              if (timer.current) window.clearTimeout(timer.current);
              setHover(null);
            }}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {MODULES.map((mod, i) => (
              <button
                key={mod.name}
                type="button"
                onMouseEnter={() => {
                  if (!fine) return;
                  if (timer.current) window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => setHover(i), 90);
                }}
                onClick={() => {
                  setPinned(i);
                  setHover(null);
                }}
                aria-pressed={i === pinned}
                className={`flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                  i === idx ? `${tones[mod.tone].solid} shadow-md` : 'bg-white text-slate hover:bg-slate/5'
                }`}
              >
                <Icon name={mod.icon} className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{mod.name}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 self-start rounded-3xl border border-slate/10 bg-white p-5 lg:sticky lg:top-6 xl:grid-cols-5" aria-live="polite">
            <div key={`meta-${idx}`} className="nca-pop flex flex-col gap-4 xl:col-span-2">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[m.tone].solid}`}>
                <Icon name={m.icon} className="h-6 w-6" />
              </span>
              <p className="text-2xl font-extrabold text-slate">{m.name}</p>
              <p className="text-slate/70">{m.outcome}</p>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate/70">Used by</dt>
                  <dd className="font-semibold text-slate">{m.role}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate/70">Workflow</dt>
                  <dd>
                    <ol className="mt-1 flex flex-wrap gap-1.5">
                      {m.flow.map((f, i) => (
                        <li key={f} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[m.tone].soft}`}>
                          {`${i + 1}. ${f}`}
                        </li>
                      ))}
                    </ol>
                  </dd>
                </div>
              </dl>
              <Link
                href={m.href}
                className="inline-flex min-h-[44px] w-fit items-center gap-2 font-bold text-royal underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
              >
                {`See ${m.name} in depth`} <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
            <div key={`screen-${idx}`} className="nca-pop xl:col-span-3">
              {m.screen()}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
