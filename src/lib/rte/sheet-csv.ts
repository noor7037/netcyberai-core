import type { CsvValue } from '@/lib/export/csv';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Desk } from './desk';
import { minorToPlainRupees } from './rules';

// The year's claim sheet as a spreadsheet (C223; C225): the children on the screen's sheet, in its order, with the
// same figures, what the state has paid and what is still due, and a total row. Amounts are plain rupees with two
// places ("1500.50") so a spreadsheet adds them up. A child not raised yet shows the claim the rule gives; one that
// cannot be raised yet shows what is known. The references are the state's, of the receipts not taken back. A claim
// written off counts in the claim total, with what was written off in its own column, so that for the claims raised the
// total claim is what was paid, written off and still due (review of C225).
export function rteSheetCsv(lang: Lang, desk: Desk): { header: string[]; rows: CsvValue[][] } {
  const w = (key: MessageKey) => t(lang, key);
  const header = ['rtd.csv.child', 'rtd.csv.admissionNo', 'rtd.csv.class', 'rtd.csv.fee', 'rtd.csv.rate', 'rtd.csv.claim', 'rtd.csv.received', 'rtd.csv.due', 'rtd.csv.writtenOff', 'rtd.csv.claimedAt', 'rtd.csv.state', 'rtd.csv.raisedOn', 'rtd.csv.paidOn', 'rtd.csv.reference', 'rtd.csv.evidence'].map((k) => w(k as MessageKey));
  const rupees = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : minorToPlainRupees(minor));
  const rows: CsvValue[][] = [];
  let total = 0;
  let received = 0;
  let due = 0;
  let writtenOff = 0;
  for (const c of desk.children.filter((x) => x.onSheet)) {
    const figures = c.claim ?? c.proposed;
    const amount = c.claim?.amount_minor ?? c.proposed?.amount_minor ?? null;
    const off = c.claim?.state === 'written_off' ? c.claim.amount_minor - c.claim.received_minor : null;
    if (amount !== null) total += amount;
    received += c.claim?.received_minor ?? 0;
    due += c.claim?.due_minor ?? 0;
    writtenOff += off ?? 0;
    const references = (c.claim?.receipts ?? []).filter((r) => r.reverses === null && !r.reversed && r.reference).map((r) => r.reference as string);
    rows.push([
      c.name,
      c.admission_no ?? '',
      c.class_name ?? '',
      rupees(figures?.fee_minor),
      rupees(figures?.rate_minor ?? desk.rate?.rate_minor),
      rupees(amount),
      c.claim ? rupees(c.claim.received_minor) : '',
      c.claim ? rupees(c.claim.due_minor) : '',
      rupees(off),
      figures ? w(`rtd.applied.${figures.applied}` as MessageKey) : '',
      w(`rtd.state.${c.claim?.state ?? 'none'}` as MessageKey),
      c.claim?.raised_on ?? '',
      c.claim?.paid_on ?? '',
      references.length ? references.join('; ') : (c.claim?.reference ?? ''),
      c.evidence.length,
    ]);
  }
  rows.push([w('rtd.csv.total'), '', '', '', '', minorToPlainRupees(total), minorToPlainRupees(received), minorToPlainRupees(due), minorToPlainRupees(writtenOff), '', '', '', '', '', '']);
  return { header, rows };
}
