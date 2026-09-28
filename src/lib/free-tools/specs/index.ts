import type { ToolSpec } from '../engine';
import { admissionSpec } from './admission';
import { attendanceRecoverySpec } from './attendance-recovery';
import { capacitySpec } from './capacity';
import { feeLeakageSpec } from './fee-leakage';
import { feePlannerSpec } from './fee-planner';
import { operationsCostSpec } from './operations-cost';
import { payrollSpec } from './payroll';
import { teacherWorkloadSpec } from './teacher-workload';
import { timetableSpec } from './timetable';

// Every calculator that runs through the shared ToolShell. The marks
// analyzer and the certificate studio have their own screens.
export const toolSpecs: ToolSpec[] = [
  feePlannerSpec,
  attendanceRecoverySpec,
  capacitySpec,
  timetableSpec,
  payrollSpec,
  feeLeakageSpec,
  admissionSpec,
  teacherWorkloadSpec,
  operationsCostSpec,
];

export function findToolSpec(slug: string): ToolSpec | undefined {
  return toolSpecs.find((s) => s.slug === slug);
}
