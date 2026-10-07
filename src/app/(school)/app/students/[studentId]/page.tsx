import { notFound } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { StudentDetailView } from '@/components/students/StudentDetailView';

// dob is read as text (YYYY-MM-DD): the driver would otherwise hand the page
// a Date object, which cannot be shown as it is and broke this page for
// every student with a date of birth (found by the screenshot harness, C133).
async function fetchStudent(schoolId: string, studentId: string, claims: Parameters<typeof withTenantContext>[0]) {
  return withTenantContext(claims, async (client) => {
    const { rows } = await client.query(
      `select s.student_id, s.admission_no, s.name, s.class_id, c.name as class_name,
              s.roll_no, s.dob::text as dob, s.status
       from students s
       left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       where s.school_id = $1 and s.student_id = $2`,
      [schoolId, studentId]
    );
    return rows[0] ?? null;
  });
}

export default async function StudentDetailPage({ params }: { params: { studentId: string } }) {
  const session = await getServerSession();
  if (!session || !session.schoolId) notFound();

  const student = await fetchStudent(session.schoolId, params.studentId, session);
  if (!student) notFound();

  return <StudentDetailView student={student} canEdit={session.role === 'school_admin' || session.role === 'principal'} />;
}
