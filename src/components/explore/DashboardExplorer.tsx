'use client';

import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/visual/Icons';
import { DemoLabel } from '@/components/visual/Primitives';
import { DashboardHome } from '@/components/explore/DashboardHome';
import {
  AdmissionsScreen,
  AttendanceScreen,
  CertificateWorkflowScreen,
  ComplianceScreen,
  ExamsScreen,
  FinanceScreen,
  HomeworkScreen,
  OperationsScreen,
  PulseComposerScreen,
  RecognitionScreen,
  ReportsScreen,
  SchoolHealthScreen,
  StudentProfileScreen,
  TeacherImpactScreen,
  TeacherTodayScreen,
} from '@/components/visual/Screens';

// The full, clickable product tour: the founder's dashboard reference as
// an explorable demo app. Every module opens a demo screen fed by
// src/demo-fixture/; nothing here calls an API or touches the database.
// Roles change what the sidebar shows, mirroring how the real app gives
// each staff role its own first screen.

type RoleId = 'principal' | 'teacher' | 'finance';

interface Module {
  id: string;
  label: string;
  icon: IconName;
  url: string;
  group: string;
  render: (open: (id: string) => void) => ReactNode;
}

const MODULES: Record<string, Module> = {
  dashboard: { id: 'dashboard', label: 'Dashboard', icon: 'principal', url: 'principal', group: 'Main', render: (open) => <DashboardHome onOpen={open} /> },
  today: { id: 'today', label: 'My day', icon: 'teacher', url: 'today', group: 'Main', render: () => <TeacherTodayScreen /> },
  students: { id: 'students', label: 'Students', icon: 'users', url: 'students', group: 'School', render: () => <StudentProfileScreen /> },
  attendance: { id: 'attendance', label: 'Attendance', icon: 'attendance', url: 'attendance', group: 'School', render: () => <AttendanceScreen /> },
  admissions: { id: 'admissions', label: 'Admissions', icon: 'admissions', url: 'admissions', group: 'School', render: () => <AdmissionsScreen /> },
  homework: { id: 'homework', label: 'Homework', icon: 'homework', url: 'homework', group: 'Learning', render: () => <HomeworkScreen /> },
  exams: { id: 'exams', label: 'Exams & results', icon: 'exams', url: 'exams', group: 'Learning', render: () => <ExamsScreen /> },
  pulse: { id: 'pulse', label: 'Daily Pulse', icon: 'pulse', url: 'pulse', group: 'Parents', render: () => <PulseComposerScreen /> },
  recognition: { id: 'recognition', label: 'Personal Best', icon: 'trophy', url: 'recognition', group: 'Learning', render: () => <RecognitionScreen /> },
  fees: { id: 'fees', label: 'Fees', icon: 'fees', url: 'fees', group: 'Money', render: () => <FinanceScreen /> },
  certificates: { id: 'certificates', label: 'Certificates', icon: 'certificate', url: 'certificates', group: 'Money', render: () => <CertificateWorkflowScreen /> },
  impact: { id: 'impact', label: 'Teacher Impact', icon: 'chart', url: 'impact', group: 'Insight', render: () => <TeacherImpactScreen /> },
  health: { id: 'health', label: 'School health', icon: 'sparkle', url: 'health', group: 'Insight', render: () => <SchoolHealthScreen /> },
  reports: { id: 'reports', label: 'Reports', icon: 'reports', url: 'reports', group: 'Insight', render: () => <ReportsScreen /> },
  operations: { id: 'operations', label: 'Operations', icon: 'operations', url: 'operations', group: 'Insight', render: () => <OperationsScreen /> },
  compliance: { id: 'compliance', label: 'Consent & audit', icon: 'shield', url: 'compliance', group: 'Trust', render: () => <ComplianceScreen /> },
};

const ROLES: { id: RoleId; label: string; blurb: string; modules: string[] }[] = [
  {
    id: 'principal',
    label: 'Principal',
    blurb: 'The whole school on one screen, with every open problem given an owner.',
    modules: ['dashboard', 'students', 'attendance', 'admissions', 'homework', 'exams', 'recognition', 'pulse', 'fees', 'certificates', 'impact', 'health', 'reports', 'operations', 'compliance'],
  },
  {
    id: 'teacher',
    label: 'Teacher',
    blurb: 'One Today screen: attendance, homework, the Pulse and their own private Impact Card.',
    modules: ['today', 'attendance', 'homework', 'pulse', 'exams', 'recognition', 'impact'],
  },
  {
    id: 'finance',
    label: 'Finance',
    blurb: 'Dues, reminders, receipts and the clearance step before any certificate.',
    modules: ['fees', 'certificates', 'reports'],
  },
];

export function DashboardExplorer() {
  const [roleId, setRoleId] = useState<RoleId>('principal');
  const role = ROLES.find((r) => r.id === roleId)!;
  const [moduleId, setModuleId] = useState<string>(role.modules[0]);
  const current = MODULES[role.modules.includes(moduleId) ? moduleId : role.modules[0]];

  const open = (id: string) => {
    if (role.modules.includes(id)) setModuleId(id);
  };
  const chooseRole = (id: RoleId) => {
    setRoleId(id);
    setModuleId(ROLES.find((r) => r.id === id)!.modules[0]);
  };

  const groups = role.modules.reduce<{ group: string; items: Module[] }[]>((acc, id) => {
    const m = MODULES[id];
    const g = acc.find((x) => x.group === m.group);
    if (g) g.items.push(m);
    else acc.push({ group: m.group, items: [m] });
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="View the demo as" className="inline-flex w-fit rounded-full bg-white p-1 shadow-sm">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={roleId === r.id}
              onClick={() => chooseRole(r.id)}
              className={`min-h-[40px] rounded-full px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${roleId === r.id ? 'bg-sapphire text-white' : 'text-slate hover:bg-off-white'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate/70">{role.blurb}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-2xl shadow-sapphire/10">
        <div className="flex items-center gap-1.5 border-b border-slate/10 bg-off-white px-4 py-2.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-coral" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold" />
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-leaf" />
          <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-xs text-slate/70">{`demo.netcyberai.com/${current.url}`}</span>
        </div>

        <div className="flex flex-col lg:h-[46rem] lg:flex-row">
          {/* Mobile and tablet: a scrollable row of module tabs. */}
          <nav aria-label="Demo modules" className="border-b border-slate/10 bg-midnight lg:hidden">
            <ul className="flex gap-1 overflow-x-auto p-2">
              {role.modules.map((id) => {
                const m = MODULES[id];
                const on = m.id === current.id;
                return (
                  <li key={id} className="shrink-0">
                    <button
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      onClick={() => setModuleId(id)}
                      className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan ${on ? 'bg-royal' : 'bg-white/10'}`}
                    >
                      <Icon name={m.icon} className="h-4 w-4" /> {m.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Desktop: the sidebar, grouped like the real app's navigation. */}
          <nav aria-label="Demo modules" className="hidden w-56 shrink-0 flex-col gap-3 overflow-y-auto bg-midnight p-3 text-white lg:flex">
            <p className="px-2 text-sm font-extrabold">Sunrise Public School</p>
            {groups.map((g) => (
              <div key={g.group} className="flex flex-col gap-0.5">
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{g.group}</p>
                {g.items.map((m) => {
                  const on = m.id === current.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      onClick={() => setModuleId(m.id)}
                      className={`flex min-h-[38px] items-center gap-2.5 rounded-lg px-2 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan ${on ? 'bg-royal' : 'hover:bg-white/10'}`}
                    >
                      <Icon name={m.icon} className="h-4 w-4 shrink-0" /> {m.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div aria-live="polite" aria-label={`Demo screen: ${current.label}`} role="region" className="min-w-0 flex-1 overflow-y-auto bg-off-white">
            <div key={current.id} className="nca-pop">
              {current.render(open)}
            </div>
          </div>
        </div>
      </div>
      <DemoLabel className="self-end" />
    </div>
  );
}
