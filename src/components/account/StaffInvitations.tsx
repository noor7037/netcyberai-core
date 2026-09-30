'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

// Invite staff (C98): the principal or school admin picks the role; the
// invitee gets an email to set a password. No parent or student accounts.
type Invitation = {
  invitation_id: string;
  email: string;
  display_name: string;
  role: string;
  status: 'pending' | 'sent' | 'accepted' | 'revoked' | 'needs_founder';
  sends: number;
  last_sent_at: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  school_admin: 'School admin',
  teacher: 'Teacher',
  accountant: 'Accountant',
  academic_coordinator: 'Academic coordinator',
  principal: 'Principal',
};
const STATUS_LABELS: Record<Invitation['status'], string> = {
  pending: 'Sending…',
  sent: 'Invite sent',
  accepted: 'Signed in',
  revoked: 'Withdrawn',
  needs_founder: 'This email already has a NetCyberAI account. Contact NetCyberAI support to add it to your school.',
};
const ERRORS: Record<string, string> = {
  already_invited: 'This email already has an invitation for this school.',
  role_not_allowed: 'You cannot invite that role.',
  invalid: 'Enter a valid email and a name.',
};

export function StaffInvitations() {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/staff/invitations').catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setInvitations(data.invitations);
    setRoles(data.roles);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/app/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ ok: false, text: ERRORS[data.error] ?? 'That did not work. Please try again.' });
      setMessage({ ok: true, text: `Invitation on its way to ${email}.` });
      setName('');
      setEmail('');
      setRole('');
      await load();
    } catch {
      setMessage({ ok: false, text: 'We could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  async function resend(id: string) {
    setBusy(true);
    await fetch(`/api/app/staff/invitations/${id}/resend`, { method: 'POST' }).catch(() => null);
    setBusy(false);
    setMessage({ ok: true, text: 'Invitation sent again.' });
    await load();
  }

  if (invitations === null) return null;

  return (
    <Card className="flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-slate">Invite staff</h2>
        <p className="text-sm text-slate/80">They get an email to set a password, then sign in to this school with the role you choose.</p>
      </div>
      <form onSubmit={invite} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input id="invite-name" label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input id="invite-email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Select id="invite-role" label="Role" required value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Choose…</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={busy || !role} className="w-full sm:w-auto">
          {busy ? 'Sending…' : 'Send invitation'}
        </Button>
      </form>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-medium ${message.ok ? 'text-emerald-text' : 'text-red-800'}`}>
          {message.text}
        </p>
      )}
      {invitations.length > 0 && (
        <ul className="flex flex-col gap-2">
          {invitations.map((i) => (
            <li key={i.invitation_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3 text-sm">
              <span className="text-slate">
                <strong>{i.display_name}</strong> · {ROLE_LABELS[i.role] ?? i.role} · {i.email}
                <span className="block text-slate/70">{STATUS_LABELS[i.status]}</span>
              </span>
              {(i.status === 'sent' || i.status === 'pending') && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => resend(i.invitation_id)}>
                  Resend
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
