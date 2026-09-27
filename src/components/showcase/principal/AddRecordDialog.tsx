'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/visual/Icons';
import { ADD_FORMS, ADD_ROLES, type AddRole, type FieldDef } from '@/demo-fixture/principal-dashboard';

// The reference "+ Add" modal: pick a role, and that role's full form
// opens. This is the website demo, so submitting saves nothing; the
// confirmation says so. Required fields are marked, not enforced, so a
// visitor can try the flow without typing a whole record.

const inputCls =
  'min-h-[40px] w-full rounded-lg border border-slate/20 bg-white px-3 text-sm text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';

function Field({ f, id }: { f: FieldDef; id: string }) {
  const label = (
    <span className="text-xs font-bold text-slate">
      {f.label}
      {f.required && (
        <span aria-hidden="true" className="text-coral-deep">
          {' '}
          *
        </span>
      )}
    </span>
  );
  if (f.kind === 'select') {
    return (
      <label htmlFor={id} className="flex flex-col gap-1">
        {label}
        <select id={id} className={inputCls} defaultValue={f.options[0]}>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }
  if (f.kind === 'textarea') {
    return (
      <label htmlFor={id} className="col-span-2 flex flex-col gap-1">
        {label}
        <textarea id={id} rows={2} className={`${inputCls} py-2`} />
      </label>
    );
  }
  if (f.kind === 'file') {
    return (
      <label htmlFor={id} className="col-span-2 flex flex-col gap-1">
        {label}
        <input id={id} type="file" multiple className="text-sm text-slate file:mr-3 file:rounded-lg file:border-0 file:bg-slate/10 file:px-3 file:py-2 file:text-sm file:font-bold file:text-slate" />
      </label>
    );
  }
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      {label}
      <input id={id} type={f.kind} placeholder={'placeholder' in f ? f.placeholder : undefined} className={inputCls} />
    </label>
  );
}

export function AddRecordDialog({ open, initialRole, onClose, onCreated }: { open: boolean; initialRole: AddRole; onClose: () => void; onCreated: (msg: string) => void }) {
  const [role, setRole] = useState<AddRole>(initialRole);
  useEffect(() => {
    if (open) setRole(initialRole);
  }, [open, initialRole]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = ADD_ROLES.find((r) => r.id === role)!.label;
    onClose();
    onCreated(`Demo: ${label} created · welcome message queued · ID generated · audit event recorded. Nothing was saved.`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add new · Student / Parent / Teacher / Staff / Admin / Other" wide>
      <p className="text-sm text-slate/70">Select a role. Its form opens with every relevant detail.</p>
      <div role="radiogroup" aria-label="Role to add" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ADD_ROLES.map((r) => {
          const on = r.id === role;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setRole(r.id)}
              className={`nca-lift flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal ${on ? 'border-emerald bg-emerald/10' : 'border-slate/10 bg-white'}`}
            >
              <Icon name={r.icon} className="h-5 w-5" />
              {r.label}
            </button>
          );
        })}
      </div>
      <form key={role} onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto pr-1 nca-scroll">
          {ADD_FORMS[role].map((f, i) => (
            <Field key={`${role}-${f.label}`} f={f} id={`add-${role}-${i}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate/10 pt-3">
          <p className="text-xs text-slate/70">Demo form: submitting shows what would happen and saves nothing.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-[40px] rounded-lg border border-slate/20 px-4 text-sm font-bold text-slate hover:bg-slate/5">
              Cancel
            </button>
            <button type="submit" className="nca-lift min-h-[40px] rounded-lg bg-emerald px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
              Create
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
