import { getServerSession } from '@/lib/auth/server-session';
import { SyllabusView } from '@/components/academics/SyllabusView';

export default async function SyllabusPage() {
  const session = await getServerSession();
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-slate">Taught today</h1>
        <p className="text-sm text-slate/70">
          Record what each class learned. This is the only input the Daily Learning Pulse needs, and a lesson marked
          “Not taught” is never described to parents as taught.
        </p>
      </div>
      <SyllabusView isTeacher={session?.role === 'teacher'} />
    </div>
  );
}
