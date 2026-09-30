'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

// Approval mode (C98): manual by default; auto approves a school as soon as
// its email is confirmed. Audited on every change.
export function ApprovalModeToggle({ mode }: { mode: 'manual' | 'auto' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = mode === 'manual' ? 'auto' : 'manual';
  async function change() {
    const question =
      next === 'auto'
        ? 'Switch to automatic approval? Every school whose email is confirmed will be created and its principal invited without your review.'
        : 'Switch back to manual approval? You will approve every school yourself.';
    if (!window.confirm(question)) return;
    setBusy(true);
    await fetch('/api/control/applications/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalMode: next }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate/10 bg-white p-3 text-sm text-slate">
      <span>
        Approval mode: <strong>{mode === 'manual' ? 'Manual (you approve every school)' : 'Automatic'}</strong>
      </span>
      <Button type="button" variant="outline" disabled={busy} onClick={change}>
        {next === 'auto' ? 'Switch to automatic' : 'Switch to manual'}
      </Button>
    </div>
  );
}
