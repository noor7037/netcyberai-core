// Words for certificates: a date of birth in words (Transfer Certificate)
// and an amount in words using Indian numbering (lakh, crore) for fee
// receipts. Pure functions, unit-tested.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const ORD_ONES = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth'];
const ORD_TENS: Record<number, string> = { 20: 'Twentieth', 30: 'Thirtieth' };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

// Indian grouping: crore (10^7), lakh (10^5), thousand, hundred.
export function numberInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

export function rupeesInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${numberInWords(rupees)}${paise ? ` and ${numberInWords(paise)} Paise` : ''} Only`;
}

function ordinalDay(d: number): string {
  if (d < 20) return ORD_ONES[d];
  if (ORD_TENS[d]) return ORD_TENS[d];
  return `${TENS[Math.floor(d / 10)]}-${ORD_ONES[d % 10]}`;
}

// "2012-04-23" -> { y, m, d } only when it is a real calendar date.
export function parseIsoDate(s: string): { y: number; m: number; d: number } | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export function dateInWords(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${ordinalDay(p.d)} ${MONTH_NAMES[p.m - 1]} ${numberInWords(p.y)}`;
}

// Indian day/month/year for printing: 23/04/2012.
export function formatDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso.trim();
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function rupees(n: number): string {
  return `₹${inr.format(n)}`;
}
