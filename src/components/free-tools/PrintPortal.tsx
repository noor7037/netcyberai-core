'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Prints only the given content. While printing, the content is rendered
// into a direct child of <body> and every other body child is hidden by
// the `body.nca-printing` rule in globals.css. `bleed` removes the page
// margin for documents that carry their own (certificates).
export function usePrint() {
  const [job, setJob] = useState<{ node: ReactNode; bleed: boolean } | null>(null);

  useEffect(() => {
    if (!job) return;
    const style = document.createElement('style');
    style.textContent = job.bleed ? '@page { size: A4; margin: 0; }' : '@page { size: A4; margin: 12mm; }';
    document.head.appendChild(style);
    document.body.classList.add('nca-printing');
    const done = () => {
      document.body.classList.remove('nca-printing');
      style.remove();
      setJob(null);
    };
    // Let the portal paint (and images decode) before the print dialog.
    const t = window.setTimeout(() => {
      window.addEventListener('afterprint', done, { once: true });
      window.print();
      // Browsers whose print() returns without an afterprint event.
      window.setTimeout(() => document.body.classList.contains('nca-printing') && done(), 1000);
    }, 150);
    return () => window.clearTimeout(t);
  }, [job]);

  const portal = job ? createPortal(<div id="nca-print-root">{job.node}</div>, document.body) : null;
  return { print: (node: ReactNode, bleed = false) => setJob({ node, bleed }), portal };
}
