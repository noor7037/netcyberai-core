import { StudentsView } from '@/components/students/StudentsView';

// ?new=1 comes from the shell's "+ New → Add student" and opens the form.
export default function StudentsPage({ searchParams }: { searchParams: { new?: string } }) {
  return <StudentsView title="Students" description="All students at this school." openNew={searchParams.new === '1'} />;
}
