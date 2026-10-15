'use client';

import { useT } from '@/components/app-shell/LangContext';
import { QUIET_ACTION } from '@/components/app-ui/ModulePage';
import type { MessageKey } from '@/lib/i18n';

// "Download" on a list screen (C235-D): the list as Excel (.xlsx) or CSV, for the principal and the school admin.
// Each choice is a plain link to the list's export route, which checks the role again, reads the rows under row level
// security and writes the audit row. A screen shows this only to the office.

export type ExportListName = 'students' | 'staff' | 'classes';

export function ListExport({ lists, status }: { lists: readonly ExportListName[]; status?: string }) {
  const { t } = useT();
  const href = (list: ExportListName, format: 'xlsx' | 'csv') => {
    const q = new URLSearchParams({ format });
    if (list === 'students' && status) q.set('status', status);
    return `/api/app/${list}/export?${q.toString()}`;
  };
  return (
    <details data-list-export={lists.join(',')} className="relative">
      <summary className={`${QUIET_ACTION} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('xport.download')}
      </summary>
      <div className="absolute left-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-md border border-slate/10 bg-white p-2 shadow-lg">
        {lists.map((list) => {
          const name = t(`xport.list.${list}` as MessageKey);
          return (
            <div key={list} className="flex flex-col">
              <a href={href(list, 'xlsx')} download data-export-link={`${list}-xlsx`} className="flex min-h-[44px] items-center rounded px-3 text-sm font-semibold text-slate hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                {t('xport.asExcel', { list: name })}
              </a>
              <a href={href(list, 'csv')} download data-export-link={`${list}-csv`} className="flex min-h-[44px] items-center rounded px-3 text-sm font-semibold text-slate hover:bg-slate/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                {t('xport.asCsv', { list: name })}
              </a>
            </div>
          );
        })}
        <p className="px-3 pb-1 pt-1 text-xs text-slate/70">{t('xport.how')}</p>
      </div>
    </details>
  );
}
