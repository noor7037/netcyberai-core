import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { notFound } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { IdCardView } from '@/components/students/IdCardView';

export default async function IdCardPage({ params }: { params: { studentId: string } }) {
  const off = await moduleOffReason('students');
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  const session = await getServerSession();
  if (!session || !session.schoolId) notFound();

  const data = await withTenantContext(session, async (client) => {
    const { rows } = await client.query(
      `select s.name as student_name, c.name as class_name, sc.name as school_name
       from students s
       left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       join schools sc on sc.school_id = s.school_id
       where s.school_id = $1 and s.student_id = $2`,
      [session.schoolId, params.studentId]
    );
    return rows[0] ?? null;
  });
  if (!data) notFound();

  return (
    <IdCardView
      studentId={params.studentId}
      studentName={data.student_name}
      schoolName={data.school_name}
      className={data.class_name}
    />
  );
}
