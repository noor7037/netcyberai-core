import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { SCHOOL_ROLES } from '@/lib/contracts/modules';
import { StudentsView } from '@/components/students/StudentsView';

// ?new=1 comes from the shell's "+ New → Add student" and opens the form.
// ?status=active|inactive|transferred comes from a dashboard number and lists the students with that status (C203).
// ?classes=1 comes from the School Health Auditor's class-teacher check and opens the list of classes, where the
// class teacher of each class is chosen (C210).
// Students waiting for consent have their own screen, /app/admissions.
const LISTED = ['active', 'inactive', 'transferred'] as const;
export default async function StudentsPage({ searchParams }: { searchParams: { new?: string; status?: string; classes?: string } }) {
  // Every school role (W14-A): a teacher's My Day opens this list on her own classes (the database's rule), read only.
  const off = await moduleOffReason('students', { roles: SCHOOL_ROLES });
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  return <StudentsView title="Students" description="All students at this school." statusFilter={LISTED.find((s) => s === searchParams.status)} openNew={searchParams.new === '1'} openClasses={searchParams.classes === '1'} />;
}
