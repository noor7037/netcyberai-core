'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

// "Draft the notices" (W16-B3): one waiting notice a class, through the notices' own approval. The words come from the
// server, already in the reader's language.
export function ClassSummaryDraft({ words }: { words: { draft: string; drafted: string; failed: string } }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [count, setCount] = useState(0);
  const draft = async () => {
    setState('busy');
    const res = await fetch('/api/app/parent-ai/class-summaries', { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setState('failed');
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { drafted?: number };
    setCount(Number(body.drafted ?? 0));
    setState('done');
  };
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={draft} disabled={state === 'busy'} data-class-summary-draft>
        {words.draft}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-slate/80">
        {state === 'done' ? words.drafted.replace('{n}', String(count)) : state === 'failed' ? words.failed : ''}
      </p>
    </div>
  );
}
