import { ageBucket, type AgeBucket } from '@/lib/free-tools/rte-claim';
import { daysBetween, readDate } from '@/lib/free-tools/student-data-check';

// How long an RTE claim has waited (docs/28 slice 10c, C223): the website free tool's own buckets, imported, never
// copied (docs/28 section 3 rule 2). Kept apart from ./rules.ts, which the free tool imports.

export type { AgeBucket };

// The free tool's buckets for a claim still unpaid, youngest first. A paid claim is in none of them.
export const UNPAID_BUCKETS: readonly Exclude<AgeBucket, 'paid'>[] = ['upTo90', 'upTo180', 'upTo365', 'overYear'];

// How long a claim has waited since it was raised (filed), and its age bucket by the free tool's own rule. A claim
// with nothing due is 'paid'.
export function ageOf(raisedOn: string, today: string, dueMinor: number): { days: number; bucket: AgeBucket } {
  const from = readDate(raisedOn);
  const to = readDate(today);
  const days = from && to ? Math.max(0, daysBetween(from, to)) : 0;
  return { days, bucket: ageBucket(days, dueMinor) };
}
