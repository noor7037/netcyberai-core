'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

// Approve / reject / start review / resend invite on one application (C98).
// Each is one POST; the server's state machine decides, and a repeat does
// nothing twice.
type Action = 'start_review' | 'approve' | 'reject' | 'resend_invite';

export function ApplicationActions({ applicationId, actions, canResend }: { applicationId: string; actions: Action[]; canResend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: Action) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/control/applications/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage(data.message ?? data.error ?? 'That did not work.');
      setRejecting(false);
      setMessage(action === 'resend_invite' ? 'Invite queued again.' : 'Done.');
      router.refresh();
    } catch {
      setMessage('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {actions.includes('approve') && (
          <Button type="button" disabled={busy} onClick={() => window.confirm('Approve this school? This creates the school and emails the principal an invitation.') && act('approve')}>
            Approve and invite principal
          </Button>
        )}
        {actions.includes('start_review') && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => act('start_review')}>
            Mark under review
          </Button>
        )}
        {actions.includes('reject') && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting((r) => !r)}>
            Reject…
          </Button>
        )}
        {canResend && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => act('resend_invite')}>
            Resend invite
          </Button>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-col gap-2 rounded-md border border-slate/15 p-3">
          <label htmlFor="reject-reason" className="text-sm font-medium text-slate">
            Reason (kept with the application; not emailed)
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-slate/20 px-3 py-2 text-slate"
          />
          <Button type="button" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => act('reject')}>
            Reject application
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-slate/80">
          {message}
        </p>
      )}
    </div>
  );
}
