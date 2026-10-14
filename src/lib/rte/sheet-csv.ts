import type { CsvValue } from '@/lib/export/csv';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Desk } from './desk';
import { minorToPlainRupees } from './rules';

// The year's claim sheet as a spreadsheet (C223): the children on the screen's sheet, in its order, with the same
// figures, and a total row. Amounts are plain rupees with two places ("1500.50") so a spreadsheet adds them up.
// A child not raised yet shows the claim the rule gives; one that cannot be raised yet shows what is known.
export function rteSheetCsv(lang: Lang, desk: Desk): { header: string[]; rows: CsvValue[][] } {
  const w = (key: MessageKey) => t(lang, key);
  const header = ['rtd.csv.child', 'rtd.csv.admissionNo', 'rtd.csv.class', 'rtd.csv.fee', 'rtd.csv.rate', 'rtd.csv.claim', 'rtd.csv.claimedAt', 'rtd.csv.state', 'rtd.csv.raisedOn', 'rtd.csv.paidOn', 'rtd.csv.reference', 'rtd.csv.evidence'].map((k) => w(k as MessageKey));
  const rupees = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : minorToPlainRupees(minor));
  const rows: CsvValue[][] = [];
  let total = 0;
  for (const c of desk.children.filter((x) => x.onSheet)) {
    const figures = c.claim ?? c.proposed;
    const amount = c.claim?.amount_minor ?? c.proposed?.amount_minor ?? null;
    if (amount !== null && c.claim?.state !== 'written_off') total += amount;
    rows.push([
      c.name,
      c.admission_no ?? '',
      c.claim?.class_name ?? c.class_name ?? '',
      rupees(figures?.fee_minor),
      rupees(figures?.rate_minor ?? desk.rate?.rate_minor),
      rupees(amount),
      figures ? w(`rtd.applied.${figures.applied}` as MessageKey) : '',
      w(`rtd.state.${c.claim?.state ?? 'none'}` as MessageKey),
      c.claim?.raised_on ?? '',
      c.claim?.paid_on ?? '',
      c.claim?.reference ?? '',
      c.evidence.length,
    ]);
  }
  rows.push([w('rtd.csv.total'), '', '', '', '', minorToPlainRupees(total), '', '', '', '', '', '']);
  return { header, rows };
}
