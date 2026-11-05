import { withGuardianContext, withPlatformService, type FamilyClaims } from '@/lib/auth/db';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { indiaDate } from '@/lib/time/india';
import {
  bookAsGuardian,
  cancelAsGuardian,
  guardianPtmBookings,
  guardianPtms,
  noteGuardianBooking,
  noteGuardianCancel,
  type GuardianPtm,
  type GuardianPtmBooked,
  type PtmQueue,
} from '@/lib/ptm/ptm';

// School Link, parent-teacher meetings (W20-E, H5; docs/family-app/03 §4, C230-AA). A family reads and writes the school's
// meetings only as the guardian its connect code was made for (withGuardianContext), so the school's own parent rules
// decide every row: the meetings of that guardian's own child's class, the times of the teachers they may meet, which
// are taken (never by whom), and their own bookings. The library in src/lib/ptm does the work; nothing here runs SQL.
// The emails and the audit row follow as the platform role, after the guardian's transaction has committed.

type Claims = FamilyClaims;
export type { GuardianPtm, GuardianPtmBooked };
export type FamilyBookResult = { ok: true; bookingId: string; heldOn: string; time: string; teacher: string } | { ok: false; reason: 'not_found' | 'not_open' | 'taken' | 'already_booked' };
export type FamilyCancelResult = { ok: true } | { ok: false; reason: 'not_found' };
type Notify = { email: string | null; lang: 'en' | 'hi' };

export async function familyPtmFor(claims: Claims, linkId: string, studentId: string, today: string = indiaDate()): Promise<GuardianPtm[]> {
  return withGuardianContext(claims, linkId, (db, link) => guardianPtms(db, link.schoolId, studentId, today));
}

export async function bookFamilySlot(claims: Claims, linkId: string, input: { studentId: string; slotId: string }, notify: Notify, queue: PtmQueue = jobQueue, today: string = indiaDate()): Promise<FamilyBookResult> {
  const made = await withGuardianContext(claims, linkId, async (db, link) => ({ link, r: await bookAsGuardian(db, link, input, today) }));
  if (!made.r.ok) return made.r;
  const r = made.r;
  await withPlatformService((db) => noteGuardianBooking(db, queue, { schoolId: made.link.schoolId, parentId: made.link.parentId, bookingId: r.bookingId, ptmId: r.ptmId, teacher: r.teacher, heldOn: r.heldOn, time: r.time, ...notify }));
  return { ok: true, bookingId: r.bookingId, heldOn: r.heldOn, time: r.time, teacher: r.teacher };
}

export async function cancelFamilyBooking(claims: Claims, linkId: string, bookingId: string, queue: PtmQueue = jobQueue): Promise<FamilyCancelResult> {
  const done = await withGuardianContext(claims, linkId, async (db, link) => ({ link, r: await cancelAsGuardian(db, { bookingId }) }));
  if (!done.r.ok) return done.r;
  const r = done.r;
  await withPlatformService((db) => noteGuardianCancel(db, queue, { schoolId: done.link.schoolId, parentId: done.link.parentId, bookingId: r.bookingId, ptmId: r.ptmId, teacherId: r.teacherId, heldOn: r.heldOn, time: r.time }));
  return { ok: true };
}

// The guardian's bookings still to come for these matched students, for the notifications feed.
export async function familyPtmFeed(claims: Claims, linkId: string, studentIds: readonly string[], today: string = indiaDate()): Promise<GuardianPtmBooked[]> {
  if (!studentIds.length) return [];
  return withGuardianContext(claims, linkId, (db, link) => guardianPtmBookings(db, link.schoolId, studentIds, today));
}
