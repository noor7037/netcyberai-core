import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { StudentsView } from '@/components/students/StudentsView';

// ?new=1 comes from the shell's "+ New → Add student" and opens the form.
export default async function StudentsPage({ searchParams }: { searchParams: { new?: string } }) {
  const off = await moduleOffReason('students');
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  return <StudentsView title="Students" description="All students at this school." openNew={searchParams.new === '1'} />;
}
