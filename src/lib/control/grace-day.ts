import { indiaDate } from '@/lib/time/india';

// The last day of a grace period, as India's date (YYYY-MM-DD), from the
// instant it ends (C204). Two things write that instant: the nightly billing
// check ends grace at 00:00 India time of the first read-only day, and
// Control ends a grace period set by hand at 23:59:59 of its last day. One
// millisecond before either is inside the last day, so every screen that
// names the day (Billing & Plans, a school's page in Control, the line the
// school itself reads) asks here and they cannot differ by a day. Always
// India's calendar, whatever the reader's own time zone.
export function lastGraceDay(graceEndsAt: string | number | Date): string {
  return indiaDate(new Date(new Date(graceEndsAt).getTime() - 1));
}
