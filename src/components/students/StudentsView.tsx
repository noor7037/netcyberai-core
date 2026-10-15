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
import { sortClasses } from '@/lib/classes/class-order';
import type { MessageKey } from '@/lib/i18n';

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

// A class as GET /api/app/classes gives it, in the class order (Nursery, LKG, UKG, 1 … 12, then section; C235-A).
// `class_teacher_active`: its class teacher is still an active teacher.
type ClassRow = { class_id: string; name: string; grade?: string | null; section?: string | null; class_teacher_id?: string | null; class_teacher_name?: string | null; class_teacher_active?: boolean };
// A problem with one line of a classes CSV file (C235-A).
type ClassCsvProblem = { line: number; code: string; value?: string; with?: number };
type ClassCsvResult = { preview: boolean; committed: boolean; rowCount: number; problems: ClassCsvProblem[]; created: { class_id: string; name: string }[] };
type TeacherOption = { user_id: string; name: string };

type ImportRowError = { row: number; name: string; admissionNo: string | null; errors: string[] };
type ImportResult = {
  alreadyImported: boolean;
  preview: boolean;
  // All or nothing (C235-A): a row had a problem, so nothing was imported.
  refused?: boolean;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errors: ImportRowError[];
  siblingSuggestions: { row: number; studentId: string | null; name: string; matches: SiblingSuggestion[] }[];
};

// The school record's gender (C222): Aadhaar's set or "not given", in this order on the form.
const GENDERS = ['not_given', 'female', 'male', 'transgender'] as const;

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
  // The standard classes in one step, and classes from a CSV file (C235-A): the principal and the school admin.
  const [mayManageClasses, setMayManageClasses] = useState(false);
  const [classesBusy, setClassesBusy] = useState(false);
  const [classCsv, setClassCsv] = useState('');
  const [classCsvResult, setClassCsvResult] = useState<ClassCsvResult | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  // The principal or the school admin (the list says so): they record a child's gender and open the student data
  // check (C222, C224). Anyone else is offered neither.
  const [office, setOffice] = useState(false);
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
      setOffice(studentsBody.office === true);
      setTotal(Number(studentsBody.total ?? studentsBody.students.length));
      setClasses(classesBody.classes);
      setTeachers(classesBody.teachers ?? []);
      setMayChangeClassTeacher(classesBody.mayChangeClassTeacher === true);
      setMayManageClasses(classesBody.mayManageClasses === true);
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
      ...(office ? { gender: String(form.get('gender') ?? '') || null } : {}),
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
    setClasses((prev) => sortClasses([...prev, created]));
    (e.target as HTMLFormElement).reset();
    toast.show(`Class "${created.name}" added`, 'success');
  }

  // Read the classes again after classes were added in bulk: the server's list, in the class order.
  async function reloadClasses() {
    const res = await fetch('/api/app/classes').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (body?.classes) setClasses(body.classes);
  }

  // Every standard class the school does not have yet: LKG, UKG, 1 to 12, sections A to C (C235-A).
  async function addStandardClasses() {
    setClassesBusy(true);
    const res = await fetch('/api/app/classes/standard', { method: 'POST' }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setClassesBusy(false);
    if (!res?.ok || !body) {
      toast.show(t('cls.standard.failed'), 'danger');
      return;
    }
    toast.show(body.createdCount > 0 ? tCount('cls.standard.added', body.createdCount) : t('cls.standard.none'), 'success');
    await reloadClasses();
  }

  // Classes from a CSV file: `preview` checks every line and writes nothing; otherwise all or nothing (C235-A).
  async function sendClassCsv(preview: boolean) {
    if (!classCsv.trim()) {
      toast.show(t('cls.csv.chooseFirst'), 'danger');
      return;
    }
    setClassesBusy(true);
    setClassCsvResult(null);
    const res = await fetch('/api/app/classes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: classCsv, preview }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setClassesBusy(false);
    if (!body || !Array.isArray(body.problems)) {
      toast.show(t('cls.csv.failed'), 'danger');
      return;
    }
    setClassCsvResult(body as ClassCsvResult);
    if (body.committed) {
      toast.show(tCount('cls.csv.added', body.created.length), 'success');
      setClassCsv('');
      await reloadClasses();
    }
  }

  const classCsvProblem = (p: ClassCsvProblem) => t(`cls.csv.problem.${p.code}` as MessageKey, { value: p.value ?? '', with: p.with ?? '' });

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
      toast.show(t('students.import.chooseFirst'), 'danger');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/app/students/import${preview ? '?preview=1' : ''}`, { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      // A refused import (any row with a problem, C235-A) answers 422 with every row to correct.
      if (!res.ok && !body?.refused) {
        toast.show(body?.error ?? t('students.import.failed'), 'danger');
        return;
      }
      setImportResult(body);
      toast.show(importSummary(body), body.skippedCount > 0 ? 'warning' : 'success');
      if (!preview && !body.refused) load();
    } finally {
      setImporting(false);
    }
  }

  // What a check or an import did, in one sentence.
  function importSummary(r: ImportResult): string {
    if (r.preview) return t('students.import.checked', { ready: r.rowCount - r.skippedCount, rows: r.rowCount });
    if (r.refused) return tCount('students.import.refused', r.skippedCount);
    return t(r.alreadyImported ? 'students.import.again' : 'students.import.done', { imported: r.importedCount, rows: r.rowCount });
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
          {office && (
            <Link href="/app/students/data-check" data-students-data-check title={t('students.dataCheck.how')} className={QUIET_ACTION}>
              {t('students.dataCheck.link')}
            </Link>
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
          {office && (
            <Select id="gender" name="gender" label={t('students.gender.label')} defaultValue="not_given" data-student-gender>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`sdc.gender.${g}`)}
                </option>
              ))}
            </Select>
          )}
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

      <Modal open={classModalOpen} onClose={closeClassModal} title="Manage classes" wide>
        <form onSubmit={handleCreateClass} className="mb-4 flex items-end gap-2">
          <Input id="className" name="className" label="New class (e.g. 8-A)" required className="flex-1" />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Add
          </button>
        </form>
        {mayManageClasses && (
          <div data-classes-tools className="mb-4 flex flex-col gap-3 rounded-md border border-slate/10 p-3">
            <p className="text-sm text-slate">{t('cls.standard.how')}</p>
            <button type="button" data-classes-standard disabled={classesBusy} onClick={() => void addStandardClasses()} className={`${PRIMARY_ACTION} self-start`}>
              {classesBusy ? t('cls.standard.adding') : t('cls.standard.add')}
            </button>
            <details data-classes-csv>
              <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-sapphire">{t('cls.csv.title')}</summary>
              <div className="flex flex-col gap-3 pt-1">
                <a href="/api/app/classes/export" download data-classes-download className={`${QUIET_ACTION} self-start`}>
                  {t('cls.csv.download')}
                </a>
                <p className="text-sm text-slate">{t('cls.csv.how')}</p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label={t('cls.csv.file')}
                  data-classes-csv-file
                  className="min-h-[44px] text-sm text-slate"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setClassCsvResult(null);
                    setClassCsv(file ? await file.text() : '');
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-classes-csv-check disabled={classesBusy} onClick={() => void sendClassCsv(true)} className={QUIET_ACTION}>
                    {t('cls.csv.check')}
                  </button>
                  <button type="button" data-classes-csv-add disabled={classesBusy} onClick={() => void sendClassCsv(false)} className={PRIMARY_ACTION}>
                    {t('cls.csv.add')}
                  </button>
                </div>
                {classCsvResult && (
                  <div role="status" data-classes-csv-result className="text-sm text-slate">
                    {classCsvResult.problems.length === 0 ? (
                      <p>{classCsvResult.committed ? tCount('cls.csv.added', classCsvResult.created.length) : tCount('cls.csv.ready', classCsvResult.rowCount)}</p>
                    ) : (
                      <div className="rounded-md border border-red-800/30 p-3">
                        <p className="font-semibold text-red-800">{t(classCsvResult.preview ? 'cls.csv.problems' : 'cls.csv.nothing')}</p>
                        <ul className="mt-1 list-disc pl-5">
                          {classCsvResult.problems.map((p, i) => (
                            <li key={`${p.line}-${p.code}-${i}`}>
                              {t('cls.csv.line', { line: p.line })}: {classCsvProblem(p)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
        {classes.length === 0 ? (
          classesLoaded ? <TeachEmpty id="classes" compact onAction={() => document.getElementById('className')?.focus()} /> : <TeachEmpty id="not-loaded" compact />
        ) : (
          <div className="flex flex-col gap-2">
            <p data-classes-count={classes.length} className="text-sm font-semibold text-slate">
              {tCount('cls.list.count', classes.length)}
            </p>
            {mayChangeClassTeacher && <p className="text-sm text-slate">{t(teachers.length > 0 ? 'cls.teacher.how' : 'cls.teacher.noTeachers')}</p>}
            <ul data-classes className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((c) => (
                <li key={c.class_id} data-class={c.class_id} className="flex flex-col gap-2 rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
                  <span data-class-name className="font-semibold">{c.name}</span>
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
          <p data-import-columns className="text-sm text-slate/70">{t('students.import.columns')}</p>
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
            <p data-import-summary className={`mb-2 text-sm font-semibold ${importResult.refused ? 'text-red-800' : 'text-slate'}`}>
              {importSummary(importResult)}
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
                    {t('students.import.row', { row: e.row, name: e.name || e.admissionNo || t('students.import.unnamed'), errors: e.errors.join('; ') })}
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
