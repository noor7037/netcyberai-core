'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

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

type ClassRow = { class_id: string; name: string };

type ImportRowError = { row: number; name: string; admissionNo: string | null; errors: string[] };
type ImportResult = {
  alreadyImported: boolean;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errors: ImportRowError[];
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
};

export function StudentsView({ title, description, statusFilter }: Props) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
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
      if (search) qs.set('search', search);
      const [studentsRes, classesRes] = await Promise.all([
        fetch(`/api/app/students?${qs.toString()}`),
        fetch('/api/app/classes'),
      ]);
      if (!studentsRes.ok) throw new Error('could not load students');
      const studentsBody = await studentsRes.json();
      const classesBody = classesRes.ok ? await classesRes.json() : { classes: [] };
      setStudents(studentsBody.students);
      setClasses(classesBody.classes);
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
      const { error } = await res.json().catch(() => ({ error: 'could not create student' }));
      toast.show(error, 'danger');
      return;
    }
    setModalOpen(false);
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
      const { error } = await res.json().catch(() => ({ error: 'could not create class' }));
      toast.show(error, 'danger');
      return;
    }
    const { class: created } = await res.json();
    setClasses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    (e.target as HTMLFormElement).reset();
    toast.show(`Class "${created.name}" added`, 'success');
  }

  async function handleImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!(form.get('file') instanceof File) || (form.get('file') as File).size === 0) {
      toast.show('Choose a CSV file first', 'danger');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/app/students/import', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        toast.show(body.error ?? 'import failed', 'danger');
        return;
      }
      setImportResult(body);
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

  const columns: TableColumn<Student>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <Link href={`/app/students/${s.student_id}`} className="font-semibold text-sapphire hover:underline">
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
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-slate/70">{description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setClassModalOpen(true)}
            className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
          >
            Manage classes
          </button>
          {statusFilter === 'pending_consent' && (
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
            >
              Import CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
          >
            + Add student
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-4 flex max-w-sm gap-2"
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

      <Table
        columns={columns}
        rows={students ?? []}
        getRowId={(s) => s.student_id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        errorMessage={errorMessage}
        emptyTitle="No students yet"
        emptyDescription="Add a student manually, or import a CSV from Admissions."
        retryAction={
          <button type="button" onClick={load} className="text-sm font-semibold text-sapphire">
            Retry
          </button>
        }
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add student">
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
            New students start as <strong>pending consent</strong> until a parent/guardian consent is recorded.
          </p>
          <button
            type="submit"
            className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
          >
            Save
          </button>
        </form>
      </Modal>

      <Modal open={classModalOpen} onClose={() => setClassModalOpen(false)} title="Manage classes">
        <form onSubmit={handleCreateClass} className="mb-4 flex items-end gap-2">
          <Input id="className" name="className" label="New class (e.g. 8-A)" required className="flex-1" />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Add
          </button>
        </form>
        {classes.length === 0 ? (
          <p className="text-sm text-slate/70">No classes yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {classes.map((c) => (
              <li key={c.class_id} className="rounded-md border border-slate/10 px-3 py-2 text-sm text-slate">
                {c.name}
              </li>
            ))}
          </ul>
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
            duplicates.
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
          <button
            type="submit"
            disabled={importing}
            className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </form>

        {importResult && (
          <div className="mt-4 border-t border-slate/10 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate">
              {importResult.importedCount} imported, {importResult.skippedCount} skipped of {importResult.rowCount}{' '}
              rows{importResult.alreadyImported ? ' (previously imported)' : ''}
            </p>
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
    </div>
  );
}
