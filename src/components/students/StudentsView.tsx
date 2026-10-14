'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { SiblingSuggestions } from './SiblingSuggestions';
import type { SiblingSuggestion } from '@/lib/contracts/families';
import { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { explainError } from '@/lib/errors/catalogue';

type Student = {
  student_id: string;
  admission_no: string | null;
  name: string;
  class_id: string | null;
  class_name: string | null;
  roll_no: string | null;
  dob: string | null;
  status: 'pending_consent' | 'active' | 'inactive' | 'transferred';
};

// A class as GET /api/app/classes gives it. `class_teacher_active`: its class teacher is still an active teacher.
type ClassRow = { class_id: string; name: string; class_teacher_id?: string | null; class_teacher_name?: string | null; class_teacher_active?: boolean };
type TeacherOption = { user_id: string; name: string };

type ImportRowError = { row: number; name: string; admissionNo: string | null; errors: string[] };
type ImportResult = {
  alreadyImported: boolean;
  preview: boolean;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errors: ImportRowError[];
  siblingSuggestions: { row: number; studentId: string | null; name: string; matches: SiblingSuggestion[] }[];
};

const STATUS_VARIANT: Record<Student['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending_consent: 'warning',
  active: 'success',
  inactive: 'neutral',
  transferred: 'danger',
};

type Props = {
  title: string;
  description?: string;
  statusFilter?: Student['status'];
  // Arrived from "+ New → Add student" (?new=1): the form opens by itself.
  openNew?: boolean;
  // Arrived from the School Health Auditor's class-teacher check (?classes=1): the list of classes opens by itself (C210).
  openClasses?: boolean;
};

export function StudentsView({ title, description, statusFilter, openNew = false, openClasses = false }: Props) {
  const router = useRouter();
  const { t, tCount } = useT();
  const [students, setStudents] = useState<Student[] | null>(null);
  // How many students the list has in all: the number a dashboard tile opened this screen for (C203).
  const [total, setTotal] = useState(0);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(openNew);
  useEffect(() => {
    if (openNew) setModalOpen(true);
  }, [openNew]);
  // Closing the form drops ?new=1, so "+ New" opens it again next time.
  const closeModal = () => {
    setModalOpen(false);
    if (openNew) router.replace('/app/students');
  };
  const [classModalOpen, setClassModalOpen] = useState(openClasses);
  useEffect(() => {
    if (openClasses) setClassModalOpen(true);
  }, [openClasses]);
  // Closing the list drops ?classes=1 the same way.
  const closeClassModal = () => {
    setClassModalOpen(false);
    if (openClasses) router.replace('/app/students');
  };
  // The class teacher of each class (C210): the principal and the school admin choose from the active teachers.
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [mayChangeClassTeacher, setMayChangeClassTeacher] = useState(false);
  const [savingClass, setSavingClass] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const toast = useToast();

  async function load() {
    setState('loading');
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      qs.set('limit', '200');
      if (search) qs.set('search', search);
      const [studentsRes, classesRes] = await Promise.all([
        fetch(`/api/app/students?${qs.toString()}`),
        fetch('/api/app/classes'),
      ]);
      if (!studentsRes.ok) throw new Error('could not load students');
      const studentsBody = await studentsRes.json();
      const classesBody = classesRes.ok ? await classesRes.json() : { classes: [] };
      setStudents(studentsBody.students);
      setTotal(Number(studentsBody.total ?? studentsBody.students.length));
      setClasses(classesBody.classes);
      setTeachers(classesBody.teachers ?? []);
      setMayChangeClassTeacher(classesBody.mayChangeClassTeacher === true);
      setClassesLoaded(classesRes.ok);
      setState('ready');
    } catch {
      setErrorMessage('Could not load students. Check your connection and try again.');
      setState('error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get('name') ?? ''),
      admissionNo: String(form.get('admissionNo') ?? ''),
      classId: String(form.get('classId') ?? '') || null,
      rollNo: String(form.get('rollNo') ?? ''),
      dob: String(form.get('dob') ?? '') || null,
    };
    const res = await fetch('/api/app/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // The form stays open with everything typed still in it.
      toast.show(explainError(await res.json().catch(() => null), 'The student was not added. Check the details and try again.', 'en', res.status), 'danger');
      return;
    }
    closeModal();
    toast.show('Student added — status: pending consent', 'success');
    load();
  }

  async function handleCreateClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('className') ?? '').trim();
    const res = await fetch('/api/app/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.show(explainError(await res.json().catch(() => null), 'The class was not added. Check the name and try again.', 'en', res.status), 'danger');
      return;
    }
    const { class: created } = await res.json();
    setClasses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    (e.target as HTMLFormElement).reset();
    toast.show(`Class "${created.name}" added`, 'success');
  }

  // Set or clear one class's class teacher. The list shows what the server now holds, or stays as it was.
  async function chooseClassTeacher(c: ClassRow, teacherId: string | null) {
    setSavingClass(c.class_id);
    const res = await fetch(`/api/app/classes/${c.class_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classTeacherId: teacherId }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setSavingClass(null);
    if (!res?.ok || !body?.class) {
      toast.show(t(body?.code === 'not_a_teacher' ? 'cls.teacher.notTeacher' : 'cls.teacher.failed'), 'danger');
      return;
    }
    const saved = body.class as ClassRow;
    setClasses((prev) => prev.map((x) => (x.class_id === saved.class_id ? { ...x, ...saved } : x)));
    toast.show(saved.class_teacher_id ? t('cls.teacher.set', { name: saved.class_teacher_name ?? '', class: saved.name }) : t('cls.teacher.cleared', { class: saved.name }), 'success');
  }

  // `preview`: check every row and suggest siblings; nothing is written (C116).
  async function runImport(formEl: HTMLFormElement, preview: boolean) {
    const form = new FormData(formEl);
    if (!(form.get('file') instanceof File) || (form.get('file') as File).size === 0) {
      toast.show('Choose a CSV file first', 'danger');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/app/students/import${preview ? '?preview=1' : ''}`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        toast.show(body.error ?? 'import failed', 'danger');
        return;
      }
      setImportResult(body);
      if (preview) {
        toast.show(`Checked ${body.rowCount} rows: ${body.rowCount - body.skippedCount} ready, ${body.skippedCount} with errors`, body.skippedCount > 0 ? 'warning' : 'success');
        return;
      }
      toast.show(
        body.alreadyImported
          ? 'This exact file was already imported — showing the original result'
          : `Imported ${body.importedCount} of ${body.rowCount} rows`,
        body.skippedCount > 0 ? 'warning' : 'success'
      );
      load();
    } finally {
      setImporting(false);
    }
  }

  function handleImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    runImport(e.currentTarget, false);
  }

  const [linking, setLinking] = useState<string | null>(null);
  async function confirmImportedSibling(studentId: string, s: SiblingSuggestion) {
    setLinking(s.parentId);
    const res = await fetch('/api/app/families/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, parentId: s.parentId }),
    });
    setLinking(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not link' }));
      return toast.show(error, 'danger');
    }
    setImportResult((r) =>
      r ? { ...r, siblingSuggestions: r.siblingSuggestions.filter((x) => x.studentId !== studentId) } : r
    );
    toast.show(`Linked to ${s.guardianName} and their family`, 'success');
  }

  const columns: TableColumn<Student>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <Link href={`/app/students/${s.student_id}`} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire hover:underline">
          {s.name}
        </Link>
      ),
    },
    { key: 'admission_no', header: 'Admission No', render: (s) => s.admission_no ?? '—' },
    { key: 'class_name', header: 'Class', render: (s) => s.class_name ?? '—' },
    { key: 'roll_no', header: 'Roll No', render: (s) => s.roll_no ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{s.status.replace('_', ' ')}</Badge>,
    },
  ];

  return (
    <ModulePage
      moduleId={statusFilter === 'pending_consent' ? 'admissions' : 'students'}
      help="add-a-student"
      tour="students"
      title={title}
      purpose={description ?? 'All students at this school.'}
      primary={
        <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_ACTION}>
          + Add student
        </button>
      }
      more={
        <>
          <button type="button" onClick={() => setClassModalOpen(true)} className={QUIET_ACTION}>
            Manage classes
          </button>
          {statusFilter === 'pending_consent' && (
            <button type="button" onClick={() => setImportModalOpen(true)} className={QUIET_ACTION}>
              Import CSV
            </button>
          )}
        </>
      }
      search={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="flex max-w-sm gap-2"
          >
            <Input
              id="search"
              label="Search"
              placeholder="Name or admission no."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
          </form>
      }
    >

      {state === 'ready' && students && students.length > 0 && (
        <p data-students-count={total} className="text-sm text-slate">
          {tCount('students.list.count', total)}
          {total > students.length && ` ${t('students.list.more', { shown: students.length })}`}
        </p>
      )}
      <Table
        columns={columns}
        rows={students ?? []}
        getRowId={(s) => s.student_id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        errorMessage={errorMessage}
        empty={
          // Nothing matches the search; nobody is waiting (Admissions); or the school has no student yet.
          search ? (
            <TeachEmpty id="students-no-match" onAction={() => setSearch('')} />
          ) : statusFilter === 'pending_consent' ? (
            <TeachEmpty id="students-none-waiting" onAction={() => setModalOpen(true)} />
          ) : (
            <TeachEmpty id="students" onAction={() => setModalOpen(true)} />
          )
        }
        retryAction={
          <button type="button" onClick={load} className="text-sm font-semibold text-sapphire">
            Retry
          </button>
        }
      />

      <Modal open={modalOpen} onClose={closeModal} title="Add student">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input id="name" name="name" label="Full name" required />
          <Input id="admissionNo" name="admissionNo" label="Admission number" />
          <Select id="classId" name="classId" label="Class">
            <option value="">— Unassigned —</option>
            {classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input id="rollNo" name="rollNo" label="Roll number" />
          <Input id="dob" name="dob" label="Date of birth" type="date" />
          <p className="text-sm text-slate/70">
            New students start as <strong>pending consent</strong> until a verified guardian grants both required consents.
          </p>
          <button
            type="submit"
            className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
          >
            Save
          </button>
        </form>
      </Modal>

      <Modal open={classModalOpen} onClose={closeClassModal} title="Manage classes">
        <form onSubmit={handleCreateClass} className="mb-4 flex items-end gap-2">
          <Input id="className" name="className" label="New class (e.g. 8-A)" required className="flex-1" />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Add
          </button>
        </form>
        {classes.length === 0 ? (
          classesLoaded ? <TeachEmpty id="classes" compact onAction={() => document.getElementById('className')?.focus()} /> : <TeachEmpty id="not-loaded" compact />
        ) : (
          <div className="flex flex-col gap-2">
            {mayChangeClassTeacher && <p className="text-sm text-slate">{t(teachers.length > 0 ? 'cls.teacher.how' : 'cls.teacher.noTeachers')}</p>}
            <ul data-classes className="flex flex-col gap-2">
              {classes.map((c) => (
                <li key={c.class_id} data-class={c.class_id} className="flex flex-col gap-2 rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
                  <span className="font-semibold">{c.name}</span>
                  {mayChangeClassTeacher ? (
                    <Select
                      id={`class-teacher-${c.class_id}`}
                      label={t('cls.teacher.label', { class: c.name })}
                      data-class-teacher={c.class_id}
                      value={c.class_teacher_id ?? ''}
                      disabled={savingClass === c.class_id}
                      onChange={(e) => void chooseClassTeacher(c, e.target.value || null)}
                    >
                      <option value="">{t('cls.teacher.none')}</option>
                      {c.class_teacher_id && !teachers.some((x) => x.user_id === c.class_teacher_id) && (
                        <option value={c.class_teacher_id}>{t('cls.teacher.off', { name: c.class_teacher_name ?? '' })}</option>
                      )}
                      {teachers.map((x) => (
                        <option key={x.user_id} value={x.user_id}>
                          {x.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span>{c.class_teacher_name ? t('cls.teacher.is', { name: c.class_teacher_name }) : t('cls.teacher.isNone')}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setImportResult(null);
        }}
        title="Import students from CSV"
      >
        <form onSubmit={handleImport} className="flex flex-col gap-4">
          <p className="text-sm text-slate/70">
            Columns: <code>name</code> (required), <code>admission_no</code>, <code>class_name</code> (must match an
            existing class exactly), <code>roll_no</code>, <code>dob</code> (YYYY-MM-DD). Every row lands in{' '}
            <strong>pending consent</strong>. Re-uploading the exact same file is safe — it won&apos;t create
            duplicates. Optional <code>guardian_phone</code> / <code>guardian_email</code> columns are used only to
            suggest siblings already on record; nothing is linked until you confirm.
          </p>
          <label htmlFor="csv-file" className="text-sm font-medium text-slate">
            CSV file
          </label>
          <input
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="min-h-[44px] text-sm text-slate"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={(e) => e.currentTarget.form && runImport(e.currentTarget.form, true)}
              className="min-h-[44px] rounded-md border border-sapphire px-4 text-sm font-semibold text-sapphire disabled:opacity-60"
            >
              Check file
            </button>
            <button
              type="submit"
              disabled={importing}
              className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {importing ? 'Working…' : 'Import'}
            </button>
          </div>
        </form>

        {importResult && (
          <div className="mt-4 border-t border-slate/10 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate">
              {importResult.preview
                ? `Check only, nothing saved: ${importResult.rowCount - importResult.skippedCount} of ${importResult.rowCount} rows ready`
                : `${importResult.importedCount} imported, ${importResult.skippedCount} skipped of ${importResult.rowCount} rows${importResult.alreadyImported ? ' (previously imported)' : ''}`}
            </p>
            {importResult.siblingSuggestions.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {importResult.siblingSuggestions.map((row) => (
                  <div key={row.row}>
                    <p className="mb-1 text-sm text-slate">
                      Row {row.row}: {row.name}
                    </p>
                    <SiblingSuggestions
                      suggestions={row.matches}
                      onConfirm={row.studentId ? (s) => confirmImportedSibling(row.studentId!, s) : undefined}
                      busyParentId={linking}
                    />
                  </div>
                ))}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                {importResult.errors.map((e) => (
                  <li key={e.row} className="rounded-md border border-red-600/20 p-2 text-red-800">
                    Row {e.row} ({e.name || e.admissionNo || 'unnamed'}): {e.errors.join('; ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </ModulePage>
  );
}
