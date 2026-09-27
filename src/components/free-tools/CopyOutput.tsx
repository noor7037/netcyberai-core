'use client';

import { useState } from 'react';
import { Icon } from '@/components/visual/Icons';

// A read-only generated message with Copy and "Share on WhatsApp". The
// share link has no phone number: WhatsApp asks the user which chat to
// send it to, so the tool never messages anyone by itself.
export function CopyOutput({ id, label, text }: { id: string; label: string; text: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      const el = document.getElementById(id) as HTMLTextAreaElement | null;
      el?.select();
      setCopied('failed');
    }
    window.setTimeout(() => setCopied('idle'), 2500);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold text-slate">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        value={text}
        rows={Math.min(14, Math.max(6, text.split('\n').length + 1))}
        className="w-full rounded-xl border border-slate/20 bg-white px-4 py-3 font-sans text-sm leading-relaxed text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-sapphire px-4 text-sm font-semibold text-white hover:bg-sapphire/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
        >
          <Icon name="check" className="h-4 w-4" /> Copy
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border-2 border-emerald px-4 text-sm font-semibold text-emerald hover:bg-emerald/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
        >
          <Icon name="chat" className="h-4 w-4" /> Share on WhatsApp
        </a>
        <span role="status" className="text-sm font-semibold text-emerald">
          {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Selected: press Ctrl+C to copy' : ''}
        </span>
      </div>
    </div>
  );
}
