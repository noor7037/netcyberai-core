import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { SyllabusView } from '@/components/academics/SyllabusView';
import { ModulePage } from '@/components/app-ui/ModulePage';

export default async function SyllabusPage() {
  const off = await moduleOffReason('academics');
  if (off) return <ModuleOffPage moduleId="academics" reason={off} />;
  const session = await getServerSession();
  return (
    <ModulePage moduleId="academics" help="taught-today" tour="taught-today" title="Taught today" purpose="Record what each class learned. This is the only input the Daily Learning Pulse needs, and a lesson marked “Not taught” is never described to parents as taught.">
      <SyllabusView isTeacher={session?.role === 'teacher'} />
    </ModulePage>
  );
}
