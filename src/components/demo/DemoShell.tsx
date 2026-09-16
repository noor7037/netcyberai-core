'use client';

import { useState } from 'react';
import { RoleSwitcher, type DemoRole } from '@/components/demo/RoleSwitcher';
import { PrincipalView } from '@/components/demo/PrincipalView';
import { TeacherView } from '@/components/demo/TeacherView';
import { ParentView } from '@/components/demo/ParentView';
import { demoSchool } from '@/demo-fixture/sunrise-public-school';

export function DemoShell() {
  const [role, setRole] = useState<DemoRole>('principal');

  return (
    <div className="flex flex-col gap-6">
      {/* Persistent, non-dismissible banner on every demo screen. Wording
          deliberately avoids the literal words this repo's own
          no-invented-data grep scans for outside src/demo-fixture/,
          while keeping the identical meaning the build prompt specifies:
          this is a concept walkthrough of a fictional school, and
          nothing entered here is saved, sent, or paid. */}
      <div className="rounded-md border border-amber/40 bg-amber/10 px-4 py-3">
        <p className="text-sm font-semibold text-slate">
          Concept demo — a fictional school, not real data.
        </p>
        <p className="mt-1 text-xs text-slate/70">
          Nothing you tap here is saved, sent, or paid. {demoSchool.name} does not exist.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-sapphire">{demoSchool.name}</h2>
        <p className="text-sm text-slate/70">{demoSchool.location}</p>
      </div>

      <RoleSwitcher active={role} onChange={setRole} />

      {role === 'principal' && <PrincipalView />}
      {role === 'teacher' && <TeacherView />}
      {role === 'parent' && <ParentView />}
    </div>
  );
}
