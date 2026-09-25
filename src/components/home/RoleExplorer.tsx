'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { BrowserFrame } from '@/components/visual/Frames';
import {
  FinanceScreen,
  ParentPulsePhone,
  PrincipalScreen,
  StudentProfileScreen,
  StudentProgressScreen,
  TeacherTodayScreen,
} from '@/components/visual/Screens';
import { tones, type Tone } from '@/lib/semantic';
import { useFinePointer } from '@/lib/hooks';
import { roleKpis } from '@/demo-fixture/website-demo';

type RoleKey = keyof typeof roleKpis;

const ROLES: { key: RoleKey; label: string; icon: IconName; tone: Tone; tagline: string; flow: string[]; screen: () => ReactNode }[] = [
  {
    key: 'principal',
    label: 'Principal',
    icon: 'principal',
    tone: 'trust',
    tagline: 'School health, exceptions and teaching signals in one view, without asking around.',
    flow: ['Open dashboard', 'See school health', 'Review exceptions', 'Assign an owner'],
    screen: () => (
      <BrowserFrame url="app.netcyberai.com/principal">
        <PrincipalScreen />
      </BrowserFrame>
    ),
  },
  {
    key: 'admin',
    label: 'School Admin',
    icon: 'admin',
    tone: 'product',
    tagline: 'Students, guardians, classes and consent kept in one validated record.',
    flow: ['Enrol student', 'Link guardians', 'Record consent', 'Records stay audited'],
    screen: () => (
      <BrowserFrame url="app.netcyberai.com/students">
        <StudentProfileScreen />
      </BrowserFrame>
    ),
  },
  {
    key: 'teacher',
    label: 'Teacher',
    icon: 'teacher',
    tone: 'product',
    tagline: 'A single Today screen: attendance, classes, homework and the Learning Pulse.',
    flow: ['Mark attendance', 'Log the lesson', 'Set homework', 'Approve the Pulse'],
    screen: () => (
      <BrowserFrame url="app.netcyberai.com/today">
        <TeacherTodayScreen />
      </BrowserFrame>
    ),
  },
  {
    key: 'student',
    label: 'Student',
    icon: 'student',
    tone: 'achievement',
    tagline: 'Progress measured against their own past. Personal Best comes first; rankings are optional.',
    flow: ['Baseline', 'Improvement', 'Personal Best', 'Certificate'],
    screen: () => (
      <BrowserFrame url="app.netcyberai.com/progress">
        <StudentProgressScreen />
      </BrowserFrame>
    ),
  },
  {
    key: 'parent',
    label: 'Parent',
    icon: 'parent',
    tone: 'communication',
    tagline: 'Everything arrives on WhatsApp. No app to install, and replies go back to the school.',
    flow: ['Receive the Pulse', 'Read what was taught', 'Reply with a tap', 'Teacher sees it'],
    screen: () => <ParentPulsePhone />,
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: 'fees',
    tone: 'action',
    tagline: 'Dues, reminders, UPI payments and receipts, reconciled into one dashboard.',
    flow: ['Fee falls due', 'Reminder sent', 'Paid via UPI', 'Receipt + dashboard'],
    screen: () => (
      <BrowserFrame url="app.netcyberai.com/fees">
        <FinanceScreen />
      </BrowserFrame>
    ),
  },
];

function RoleDetail({ role }: { role: (typeof ROLES)[number] }) {
  const kpi = roleKpis[role.key];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-2xl font-extrabold text-slate">{role.label}</p>
          <p className="mt-1 text-slate/70">{role.tagline}</p>
        </div>
        <div className={`rounded-xl px-3 py-2 ${tones[role.tone].soft}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide">{kpi.label}</p>
          <p className="text-lg font-extrabold">{kpi.value}</p>
        </div>
      </div>
      <ol className="flex flex-wrap items-center gap-2" aria-label={`${role.label} workflow`}>
        {role.flow.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tones[role.tone].solid}`}>
              <span className="font-extrabold">{i + 1}</span> {step}
            </span>
            {i < role.flow.length - 1 && <Icon name="arrow" className="h-3.5 w-3.5 text-slate/70" />}
          </li>
        ))}
      </ol>
      <div key={role.key} className="nca-pop">
        {role.screen()}
      </div>
    </div>
  );
}

export function RoleExplorer() {
  const [pinned, setPinned] = useState<RoleKey>('principal');
  const [hover, setHover] = useState<RoleKey | null>(null);
  const [openMobile, setOpenMobile] = useState<RoleKey | null>('principal');
  const fine = useFinePointer();
  const timer = useRef<number | null>(null);

  const activeKey = hover ?? pinned;
  const active = ROLES.find((r) => r.key === activeKey)!;

  function preview(key: RoleKey) {
    if (!fine) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(key), 90);
  }
  function endPreview() {
    if (timer.current) window.clearTimeout(timer.current);
    setHover(null);
  }

  return (
    <section aria-labelledby="roles-title" className="bg-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="roles-title"
            eyebrow="Role explorer"
            tone="product"
            title="One school. Every role connected."
            lead="Move across a role to see what that person sees. Click to keep it open."
          />
          <DemoLabel />
        </div>

        {/* Desktop */}
        <div className="hidden gap-8 lg:grid lg:grid-cols-[16rem_1fr]">
          <div role="group" aria-label="Choose a role" className="flex flex-col gap-2" onMouseLeave={endPreview}>
            {ROLES.map((r) => {
              const isActive = r.key === activeKey;
              const isPinned = r.key === pinned;
              return (
                <button
                  key={r.key}
                  type="button"
                  onMouseEnter={() => preview(r.key)}
                  onFocus={() => setHover(r.key)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    setPinned(r.key);
                    setHover(null);
                  }}
                  aria-pressed={isPinned}
                  className={`flex items-center gap-3 rounded-2xl p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                    isActive ? `${tones[r.tone].solid} shadow-lg` : 'bg-off-white text-slate hover:bg-slate/5'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <Icon name={r.icon} className="h-5 w-5" />
                  </span>
                  <span className="flex-1 font-bold">{r.label}</span>
                  {isPinned && <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Pinned</span>}
                </button>
              );
            })}
          </div>
          <div className="min-h-[34rem] rounded-3xl border border-slate/10 bg-off-white p-6" aria-live="polite">
            <RoleDetail role={active} />
          </div>
        </div>

        {/* Mobile + tablet: tap to expand */}
        <div className="flex flex-col gap-3 lg:hidden">
          {ROLES.map((r) => {
            const open = openMobile === r.key;
            return (
              <div key={r.key} className="overflow-hidden rounded-2xl border border-slate/10 bg-off-white">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`role-panel-${r.key}`}
                  onClick={() => setOpenMobile(open ? null : r.key)}
                  className={`flex min-h-[56px] w-full items-center gap-3 p-3 text-left ${tones[r.tone].solid}`}
                >
                  <Icon name={r.icon} className="h-5 w-5" />
                  <span className="flex-1 font-bold">{r.label}</span>
                  <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div id={`role-panel-${r.key}`} className="p-4">
                    <RoleDetail role={r} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
