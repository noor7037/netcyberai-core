'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/app-shell/LangContext';
import { Button } from '@/components/ui/Button';

// "Retry" on a dead job (C97): it runs again now, with one more attempt, and the page is read again. A second
// click on a job already retried does nothing. If the request itself did not go through, the button says so.
export function RetryJobButton({ jobId }: { jobId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        data-job-retry={jobId}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const res = await fetch(`/api/control/jobs/${jobId}/retry`, { method: 'POST' }).catch(() => null);
          setBusy(false);
          if (!res?.ok) return setFailed(true);
          router.refresh();
        }}
      >
        {busy ? t('monitoring.jobs.retry.busy') : t('monitoring.jobs.retry')}
      </Button>
      {failed && (
        <span role="status" data-job-retry-failed className="text-sm text-slate">
          {t('monitoring.jobs.retry.failed')}
        </span>
      )}
    </span>
  );
}
