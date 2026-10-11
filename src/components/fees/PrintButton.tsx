'use client';

import { PRIMARY_ACTION } from '@/components/app-ui/ModulePage';

// Opens the browser's print dialog for the page it is on.
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${PRIMARY_ACTION} print:hidden`}>
      {label}
    </button>
  );
}
