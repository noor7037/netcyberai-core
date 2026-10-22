'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Prints only the given sheet (M2-4, C278). The Family app may not import the staff side's print helper
// (docs/family-app/03 §14), so this is its own small copy of the same method: while printing, the sheet is rendered
// into a direct child of <body> and every other body child is hidden by the `body.nca-printing` rule in globals.css.
// The page is A4 with an even margin; the browser's own "Save as PDF" makes the PDF (no PDF library).
export function usePrintSheet() {
  const [sheet, setSheet] = useState<ReactNode | null>(null);

  useEffect(() => {
    if (!sheet) return;
    const style = document.createElement('style');
    style.textContent = '@page { size: A4; margin: 14mm; }';
    document.head.appendChild(style);
    document.body.classList.add('nca-printing');
    const done = () => {
      document.body.classList.remove('nca-printing');
      style.remove();
      setSheet(null);
    };
    // Let the sheet paint before the print window opens.
    const timer = window.setTimeout(() => {
      window.addEventListener('afterprint', done, { once: true });
      window.print();
      // Browsers whose print() returns without an afterprint event.
      window.setTimeout(() => document.body.classList.contains('nca-printing') && done(), 1000);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [sheet]);

  const portal = sheet ? createPortal(<div id="nca-print-root">{sheet}</div>, document.body) : null;
  return { print: (node: ReactNode) => setSheet(node), portal };
}
