'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/visual/Icons';

// Opens the browser's own print dialog, where "Save as PDF" is a
// destination on every major desktop and mobile browser. No PDF file is
// hosted, so there is no download link that could go stale.
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Icon name="download" className="h-5 w-5" /> Save as PDF or print
    </Button>
  );
}
