'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/control/jobs/${jobId}/retry`, { method: 'POST' }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? 'Retrying…' : 'Retry'}
    </Button>
  );
}
