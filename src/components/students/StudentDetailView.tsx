'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DocumentCapture } from './DocumentCapture';
import { ConsentPanel } from './ConsentPanel';
import { DsrPanel } from './DsrPanel';

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

type Guardian = { parent_id: string; name: string; phone: string; email: string | null; relation: string | null };

const STATUS_VARIANT: Record<Student['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending_consent: 'warning',
  active: 'success',
  inactive: 'neutral',
  transferred: 'danger',
};

export function StudentDetailView({ student: initial, canEdit }: { student: Student; canEdit: boolean }) {
  const [student, setStudent] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`/api/app/students/${student.student_id}/guardians`)
      .then((r) => r.json())
      .then((body) => setGuardians(body.guardians ?? []))
      .catch(() => setGuardians([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get('name') ?? ''),
      admissionNo: String(form.get('admissionNo') ?? ''),
      rollNo: String(form.get('rollNo') ?? ''),
      dob: String(form.get('dob') ?? '') || null,
    };
    const res = await fetch(`/api/app/students/${student.student_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not save changes' }));
      toast.show(error, 'danger');
      return;
    }
    const { student: updated } = await res.json();
    setStudent((prev) => ({ ...prev, ...updated }));
    setEditing(false);
    toast.show('Saved', 'success');
  }

  async function handleAddGuardian(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get('name') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      relation: String(form.get('relation') ?? ''),
    };
    const res = await fetch(`/api/app/students/${student.student_id}/guardians`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not add guardian' }));
      toast.show(error, 'danger');
      return;
    }
    const { guardian } = await res.json();
    setGuardians((prev) => [...(prev ?? []), guardian]);
    setAddOpen(false);
    toast.show('Guardian added', 'success');
  }

  async function handleUnlink(parentId: string) {
    const res = await fetch(`/api/app/students/${student.student_id}/guardians?parentId=${parentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.show('Could not unlink guardian', 'danger');
      return;
    }
    setGuardians((prev) => (prev ?? []).filter((g) => g.parent_id !== parentId));
    toast.show('Guardian unlinked', 'success');
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate">{student.name}</h1>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[student.status]}>{student.status.replace('_', ' ')}</Badge>
          <Link href={`/app/students/${student.student_id}/id-card`} className="text-sm font-semibold text-sapphire">
            ID card
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-slate/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate">Details</h2>
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-sapphire">
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Input id="name" name="name" label="Full name" defaultValue={student.name} required />
            <Input id="admissionNo" name="admissionNo" label="Admission number" defaultValue={student.admission_no ?? ''} />
            <Input id="rollNo" name="rollNo" label="Roll number" defaultValue={student.roll_no ?? ''} />
            <Input id="dob" name="dob" label="Date of birth" type="date" defaultValue={student.dob ?? ''} />
            <div className="flex gap-2">
              <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] px-4 text-sm text-slate/70">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-slate/70">Admission No</dt>
            <dd className="text-slate">{student.admission_no ?? '—'}</dd>
            <dt className="text-slate/70">Class</dt>
            <dd className="text-slate">{student.class_name ?? '—'}</dd>
            <dt className="text-slate/70">Roll No</dt>
            <dd className="text-slate">{student.roll_no ?? '—'}</dd>
            <dt className="text-slate/70">Date of birth</dt>
            <dd className="text-slate">{student.dob ?? '—'}</dd>
          </dl>
        )}
      </section>

      <section className="rounded-lg border border-slate/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate">Guardians</h2>
          {canEdit && (
            <button type="button" onClick={() => setAddOpen(true)} className="text-sm font-semibold text-sapphire">
              + Add guardian
            </button>
          )}
        </div>
        {guardians === null ? (
          <p className="text-sm text-slate/70">Loading…</p>
        ) : guardians.length === 0 ? (
          <p className="text-sm text-slate/70">No guardians linked yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guardians.map((g) => (
              <li key={g.parent_id} className="flex items-center justify-between rounded-md border border-slate/10 p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate">
                    {g.name} {g.relation && <span className="font-normal text-slate/70">({g.relation})</span>}
                  </p>
                  <p className="text-slate/70">
                    {g.phone}
                    {g.email ? ` · ${g.email}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <button type="button" onClick={() => handleUnlink(g.parent_id)} className="text-red-800">
                    Unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-6">
        <ConsentPanel studentId={student.student_id} guardians={guardians ?? []} canManage={canEdit} />
        <DocumentCapture studentId={student.student_id} guardians={guardians ?? []} />
        <DsrPanel studentId={student.student_id} canManage={canEdit} />
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add guardian">
        <form onSubmit={handleAddGuardian} className="flex flex-col gap-4">
          <Input id="g-name" name="name" label="Full name" required />
          <Input id="g-phone" name="phone" label="Phone (WhatsApp)" required />
          <Input id="g-email" name="email" label="Email" type="email" />
          <Input id="g-relation" name="relation" label="Relation" placeholder="Father, Mother, Guardian…" />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}
