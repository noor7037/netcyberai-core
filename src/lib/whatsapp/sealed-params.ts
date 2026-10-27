import { openSealedLink } from '@/lib/marking/report-links';

// Values the message log keeps sealed and the send-gate opens only when it asks the provider (review of AM-5). The
// family's private result link (C351) is the one so far: the log holds `sealed:<ref>:<lang>`, a reference that opens
// nothing without the server's secret, and the parent receives the link itself; the same link goes with the checked
// paper as a PDF (C366). Anything not sealed is sent as it is.
const SEALED: Readonly<Record<string, readonly string[]>> = { exam_result_ready: ['link'], exam_result_pdf: ['link'] };

export function openSealedParams(templateName: string, filled: Readonly<Record<string, string>>): Record<string, string> {
  const keys = SEALED[templateName];
  if (!keys) return { ...filled };
  const out = { ...filled };
  for (const k of keys) {
    const opened = typeof out[k] === 'string' ? openSealedLink(out[k]) : null;
    if (opened) out[k] = opened;
  }
  return out;
}
