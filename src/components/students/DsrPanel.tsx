'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

type DsrRequest = {
  request_id: string;
  request_type: 'access' | 'correction' | 'deletion';
  requested_by_description: string;
  status: 'logged' | 'in_progress' | 'completed' | 'rejected';
  authorized_by: string | null;
  executed_at: string | null;
  created_at: string;
};

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  logged: 'warning',
  in_progress: 'warning',
  completed: 'success',
  rejected: 'danger',
};

// Task 3: staff-initiated only (Decision Log C13 -- no parent portal).
// Deletion is the one type with an extra, explicit, separately-
// confirmed step before anything is actually pseudonymized -- this
// panel surfaces Authorize and Execute as two distinct buttons, never
// one combined action, so the gap between "logged" and "irreversible"
// stays visible in the UI, not just in the API.
export function DsrPanel({ studentId, canManage }: { studentId: string; canManage: boolean }) {
  const [requests, setRequests] = useState<DsrRequest[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const toast = useToast();

  async function load() {
    const res = await fetch(`/api/app/students/${studentId}/dsr`);
    if (res.ok) setRequests((await res.json()).requests);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      requestType: String(form.get('requestType')),
      requestedByDescription: String(form.get('requestedByDescription') ?? ''),
      notes: String(form.get('notes') ?? '') || null,
    };
    const res = await fetch(`/api/app/students/${studentId}/dsr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not log request' }));
      toast.show(error, 'danger');
      return;
    }
    setNewOpen(false);
    toast.show('Request logged', 'success');
    load();
  }

  async function handleAuthorize(requestId: string) {
    const res = await fetch(`/api/app/dsr/${requestId}/authorize`, { method: 'POST' });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not authorize' }));
      toast.show(error, 'danger');
      return;
    }
    toast.show('Authorized -- ready to execute', 'success');
    load();
  }

  async function handleExecute(requestId: string) {
    if (!window.confirm('This permanently pseudonymizes the student record. This cannot be undone. Continue?')) return;
    const res = await fetch(`/api/app/dsr/${requestId}/execute`, { method: 'POST' });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'could not execute' }));
      toast.show(error, 'danger');
      return;
    }
    toast.show('Erasure executed', 'success');
    load();
  }

  return (
    <section className="rounded-lg border border-slate/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate">Data subject requests</h2>
        {canManage && (
          <button type="button" onClick={() => setNewOpen(true)} className="min-h-[44px] px-2 text-sm font-semibold text-sapphire">
            + Log request
          </button>
        )}
      </div>
      {requests === null ? (
        <p className="text-sm text-slate/70">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate/70">No requests on record.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.request_id} className="rounded-md border border-slate/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate capitalize">{r.request_type}</p>
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace('_', ' ')}</Badge>
              </div>
              <p className="text-slate/70">{r.requested_by_description}</p>
              <p className="text-xs text-slate/70">{new Date(r.created_at).toLocaleString()}</p>
              {r.request_type === 'deletion' && canManage && r.status !== 'completed' && r.status !== 'rejected' && (
                <div className="mt-2 flex gap-3">
                  {!r.authorized_by && (
                    <button type="button" className="min-h-[44px] px-2 text-sm font-semibold text-amber-text" onClick={() => handleAuthorize(r.request_id)}>
                      Authorize erasure
                    </button>
                  )}
                  {r.authorized_by && !r.executed_at && (
                    <button type="button" className="min-h-[44px] px-2 text-sm font-semibold text-red-800" onClick={() => handleExecute(r.request_id)}>
                      Execute erasure
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Log a data subject request">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Select id="requestType" name="requestType" label="Type" required>
            <option value="access">Access</option>
            <option value="correction">Correction</option>
            <option value="deletion">Deletion</option>
          </Select>
          <Input id="requestedByDescription" name="requestedByDescription" label="Who asked, and how" placeholder="Father, phone call" required />
          <Input id="notes" name="notes" label="Notes (optional)" />
          <button type="submit" className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Log request
          </button>
        </form>
      </Modal>
    </section>
  );
}
