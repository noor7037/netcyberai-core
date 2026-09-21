'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'] as const;
const TENANT_TYPES = ['school', 'coaching', 'college'] as const;

// "Tenant Created" -- the first step this prompt can act on (Lead and
// Approved are pre-tenant, PRD §7.2). Every new row lands at
// onboarding_stage='tenant_created' and pilot_allow_outbound=false by
// column default; this form has no field for either, on purpose.
export function CreateSchoolForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [board, setBoard] = useState<(typeof BOARDS)[number]>('STATE');
  const [tenantType, setTenantType] = useState<(typeof TENANT_TYPES)[number]>('school');
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'error' | 'ok'; message?: string }>({
    kind: 'idle',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'saving' });
    const res = await fetch('/api/control/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, board, tenantType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ kind: 'error', message: data.error ?? `request failed (${res.status})` });
      return;
    }
    setStatus({ kind: 'ok', message: `Created. Onboarding stage: ${data.school.onboarding_stage}` });
    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-slate/10 p-4">
      <h2 className="text-lg font-bold text-slate">New school (Tenant Created)</h2>
      <Input id="school-name" label="School name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Select id="school-board" label="Board" required value={board} onChange={(e) => setBoard(e.target.value as typeof board)}>
        {BOARDS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>
      <Select
        id="school-tenant-type"
        label="Tenant type"
        required
        value={tenantType}
        onChange={(e) => setTenantType(e.target.value as typeof tenantType)}
      >
        {TENANT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'Creating...' : 'Create school'}
      </Button>
      {status.kind === 'error' && <p className="text-sm text-red-800">{status.message}</p>}
      {status.kind === 'ok' && <p className="text-sm text-emerald-text">{status.message}</p>}
    </form>
  );
}
