import { periodKeyFor, type SessionDates } from '@/lib/fees/dues';
import type { Frequency } from '@/lib/fees/money';

// The school's fee for a class for a school year, as the RTE claim counts it (docs/28 slice 10c, C223; C225): read
// the way dues are raised (src/lib/fees/dues.ts), so it lives apart from the pure ./rules.ts.

export type FeeVersion = { effective_from: string; items: readonly { head_id: string; amount_minor: number; frequency: Frequency }[] };

// Every month of a school year, as "2026-04".
export function monthsOf(session: Pick<SessionDates, 'start_date' | 'end_date'>): string[] {
  const out: string[] = [];
  let y = Number(session.start_date.slice(0, 4));
  let m = Number(session.start_date.slice(5, 7));
  const last = session.end_date.slice(0, 7);
  for (let i = 0; i < 36; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month > last) break;
    out.push(month);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// What the school charges a child of a class for a school year in the heads that count in a claim (`counted`: the
// school's setting fees.rte_claim_heads, ./rules.ts headsCounted). Month by month, as dues are raised: the version of
// the class's fee structure in force on the first of the month (on the session's first day for a month it starts
// in), each head in the months it falls due (periodKeyFor). A one-time head (an admission fee) is charged once in a
// child's time at the school, not each year, so it never counts. Null when no version is in force in any month.
export function yearFeeMinor(versions: readonly FeeVersion[], counted: ReadonlySet<string>, session: SessionDates): number | null {
  const newestFirst = [...versions].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  let total = 0;
  let any = false;
  for (const month of monthsOf(session)) {
    const onDate = `${month}-01` < session.start_date ? session.start_date : `${month}-01`;
    const version = newestFirst.find((v) => v.effective_from <= onDate);
    if (!version) continue;
    any = true;
    for (const item of version.items) {
      if (item.frequency === 'one_time' || !counted.has(item.head_id) || item.amount_minor <= 0) continue;
      if (periodKeyFor(item.frequency, month, session) !== null) total += item.amount_minor;
    }
  }
  return any ? total : null;
}
