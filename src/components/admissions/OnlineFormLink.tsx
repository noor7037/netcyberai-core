'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';

// The school's online enquiry form (W21-M1): the link the office shares, on its website, a WhatsApp status or a
// poster's caption. A family's enquiry from it lands here with source "Online form", due for a call back today.
export function OnlineFormLink({ url }: { url: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <details data-adm-online className="rounded-lg border border-slate/10 bg-white p-4">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-bold">{t('adm.online.title')}</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>{t('adm.online.how')}</p>
        <p data-adm-online-url className="break-all rounded-md bg-off-white px-3 py-2 font-mono text-sm">{url}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-adm-online-copy className="min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white" onClick={() => void copy()}>
            {t('adm.online.copy')}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
            {t('adm.online.open')}
          </a>
        </div>
        {copied !== null && <p role="status" className="font-semibold">{t(copied ? 'adm.online.copied' : 'adm.online.copyFailed')}</p>}
      </div>
    </details>
  );
}
