import type { PoolClient } from 'pg';
import type { LinkedSchool, PulseAnswer, SchoolDayMark, SchoolSyllabus, SchoolTaught } from '@/lib/contracts/school-link';
import { answerPulse, readLinkedSchool, readSchoolNews, readSchoolSyllabus, readSchoolToday, redeemConnectCode, requestFollowup, SchoolLinkGoneError, type FollowupRequestResult, type PulseAnswerResult, type SchoolNews, type SchoolNewsKind } from '@/lib/school-link';

// The family's side of School Link (C230-AA; docs/family-app/03 §4): the links an account holds and which family child
// is which student. The school's records are read only through src/lib/school-link (as the guardian), never copied
// here. A family with no link keeps the whole standalone app; a link adds the school's part and unlinking takes it
// away in the same request, while the child's own learning stays.

type Sql = Pick<PoolClient, 'query'>;
type Claims = { accountId: string; tokenVersion: number };

export type FamilySchoolLink = { linkId: string; schoolId: string; linkedAt: string; children: { childId: string; studentId: string }[] };
// At most this many code tries a day per account, so a code cannot be guessed (8 characters of 32, single use).
export const CONNECT_TRIES_PER_DAY = 10;

export async function activeLinks(db: Sql, accountId: string): Promise<FamilySchoolLink[]> {
  const links = (
    await db.query(`select link_id, school_id, linked_at from family.school_links where account_id = $1 and revoked_at is null order by linked_at`, [accountId])
  ).rows as { link_id: string; school_id: string; linked_at: Date }[];
  if (links.length === 0) return [];
  const kids = (await db.query(`select link_id, child_id, student_id from family.child_links where account_id = $1`, [accountId])).rows as {
    link_id: string;
    child_id: string;
    student_id: string;
  }[];
  return links.map((l) => ({
    linkId: l.link_id,
    schoolId: l.school_id,
    linkedAt: new Date(l.linked_at).toISOString(),
    children: kids.filter((k) => k.link_id === l.link_id).map((k) => ({ childId: k.child_id, studentId: k.student_id })),
  }));
}

export type ConnectResult = { ok: true; linkId: string; schoolName: string } | { ok: false; reason: 'bad_code' | 'too_many_tries' };

// The parent enters the code the school gave them. A code is spent once; the same guardian linked twice keeps one link.
export async function connectSchool(db: Sql, accountId: string, typed: unknown, today: string): Promise<ConnectResult> {
  const tries = (
    await db.query(
      `insert into family.connect_attempts (account_id, tried_on, n) values ($1, $2, 1)
       on conflict (account_id, tried_on) do update set n = family.connect_attempts.n + 1 returning n`,
      [accountId, today]
    )
  ).rows[0] as { n: number };
  if (Number(tries.n) > CONNECT_TRIES_PER_DAY) return { ok: false, reason: 'too_many_tries' };
  const spent = await redeemConnectCode(db, accountId, typed);
  if (!spent) return { ok: false, reason: 'bad_code' };
  return { ok: true, linkId: spent.linkId, schoolName: spent.schoolName };
}

// Which family child is which school child: the parent chooses, never a guess. `pairs` names every school child of
// the link; a null child leaves that school child unlinked. A family child is linked to one school child at most.
export async function setChildLinks(
  db: Sql,
  accountId: string,
  linkId: string,
  schoolStudentIds: readonly string[],
  pairs: readonly { studentId: string; childId: string | null }[]
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'bad_request' }> {
  const link = (await db.query(`select 1 from family.school_links where link_id = $1 and account_id = $2 and revoked_at is null`, [linkId, accountId])).rows[0];
  if (!link) return { ok: false, reason: 'not_found' };
  const chosen = pairs.filter((p) => p.childId !== null) as { studentId: string; childId: string }[];
  if (pairs.some((p) => !schoolStudentIds.includes(p.studentId))) return { ok: false, reason: 'bad_request' };
  if (new Set(chosen.map((p) => p.childId)).size !== chosen.length || new Set(pairs.map((p) => p.studentId)).size !== pairs.length) return { ok: false, reason: 'bad_request' };
  const own = new Set(((await db.query(`select child_id from family.children where account_id = $1`, [accountId])).rows as { child_id: string }[]).map((r) => r.child_id));
  if (chosen.some((p) => !own.has(p.childId))) return { ok: false, reason: 'bad_request' };
  await db.query(`delete from family.child_links where link_id = $1 and account_id = $2`, [linkId, accountId]);
  // A family child linked under another link of this account moves to this one (the parent chose it here).
  if (chosen.length) await db.query(`delete from family.child_links where account_id = $1 and child_id = any($2::uuid[])`, [accountId, chosen.map((p) => p.childId)]);
  for (const p of chosen) {
    await db.query(`insert into family.child_links (child_id, link_id, account_id, student_id) values ($1, $2, $3, $4)`, [p.childId, linkId, accountId, p.studentId]);
  }
  return { ok: true };
}

// The family ends a link: the school's part disappears at once; the children's own learning stays.
export async function unlinkSchool(db: Sql, accountId: string, linkId: string): Promise<boolean> {
  const closed = (
    await db.query(`update family.school_links set revoked_at = now(), revoked_by = 'family' where link_id = $1 and account_id = $2 and revoked_at is null returning 1`, [linkId, accountId])
  ).rows[0];
  if (!closed) return false;
  await db.query(`delete from family.child_links where link_id = $1 and account_id = $2`, [linkId, accountId]);
  return true;
}

// Read the school's part, as the guardian. A link the school closed meanwhile reads as gone (null), never as an error.
export async function linkedSchool(claims: Claims, linkId: string, matched: readonly string[] = []): Promise<LinkedSchool | null> {
  try {
    return await readLinkedSchool(claims, linkId, { matched });
  } catch (e) {
    if (e instanceof SchoolLinkGoneError) return null;
    throw e;
  }
}

// The parent answers the school's Daily Pulse for a child this app has matched (C336). The database decides the rest:
// the guardian's own consented child, a message sent to the child's class in the last 24 hours, the school's consent for
// messages; a link the school closed meanwhile is not_found.
export async function answerSchoolPulse(
  claims: Claims,
  links: readonly FamilySchoolLink[],
  input: { linkId: string; studentId: string; pulseId: string; answer: PulseAnswer }
): Promise<PulseAnswerResult> {
  const matched = links.some((l) => l.linkId === input.linkId && l.children.some((c) => c.studentId === input.studentId));
  if (!matched) return 'not_found';
  try {
    return await answerPulse(claims, input.linkId, input.studentId, input.pulseId, input.answer);
  } catch (e) {
    if (e instanceof SchoolLinkGoneError) return 'not_found';
    throw e;
  }
}

// The family child's matched school student, if any (the parent chose it; never a guess).
export function matchedStudent(links: readonly FamilySchoolLink[], childId: string): { linkId: string; studentId: string } | null {
  return links.flatMap((l) => l.children.filter((c) => c.childId === childId).map((c) => ({ linkId: l.linkId, studentId: c.studentId })))[0] ?? null;
}

// After a parent-teacher meeting (C337): the parent asks the child's teacher to follow up, in the school's own queue.
// Only for a child matched to a connected school's student; the database decides the rest (consent for messages).
export async function askSchoolFollowup(claims: Claims, links: readonly FamilySchoolLink[], childId: string): Promise<FollowupRequestResult> {
  const m = matchedStudent(links, childId);
  if (!m) return 'not_found';
  try {
    return await requestFollowup(claims, m.linkId, m.studentId);
  } catch (e) {
    if (e instanceof SchoolLinkGoneError) return 'not_found';
    throw e;
  }
}

// A matched child's day at school, for the child's home: null when not matched, gone, or without the school's consent.
export async function schoolTodayFor(
  claims: Claims,
  links: readonly FamilySchoolLink[],
  childId: string
): Promise<{ schoolName: string; today: SchoolDayMark | null; tonight: SchoolTaught[] } | null> {
  const m = links.flatMap((l) => l.children.filter((c) => c.childId === childId).map((c) => ({ linkId: l.linkId, studentId: c.studentId })))[0];
  if (!m) return null;
  try {
    return await readSchoolToday(claims, m.linkId, m.studentId);
  } catch (e) {
    if (e instanceof SchoolLinkGoneError) return null;
    throw e;
  }
}

export async function schoolSyllabusFor(claims: Claims, linkId: string, studentId: string): Promise<SchoolSyllabus | null> {
  try {
    return await readSchoolSyllabus(claims, linkId, studentId);
  } catch (e) {
    if (e instanceof SchoolLinkGoneError) return null;
    throw e;
  }
}

// A school names its subjects in its own words ("Maths", "SST"); the app's subject ids are fixed. They match when the
// letters agree, or by the common short names below; anything else is not guessed.
const SUBJECT_ALIASES: Record<string, string> = { maths: 'mathematics', math: 'mathematics', sst: 'social_science', socialstudies: 'social_science', socialscience: 'social_science', environmentalstudies: 'evs', computer: 'computer_science', computers: 'computer_science' };
const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
export function schoolSubjectIs(schoolName: string, subjectId: string): boolean {
  const n = letters(schoolName);
  return n === letters(subjectId) || SUBJECT_ALIASES[n] === subjectId;
}

// The school syllabus a child matched to a school student reads in Study, for one of the app's subjects; null when the
// child is not matched, the link is gone, or the school has no units for that subject. `links` come from activeLinks()
// in the family's own transaction, read before this (one connection at a time).
export async function schoolChaptersFor(claims: Claims, links: readonly FamilySchoolLink[], childId: string, subjectId: string): Promise<{ title: string; topics: string[] }[] | null> {
  return (await schoolStudyFor(claims, links, childId, subjectId)).chapters;
}

// For Study, one read: the school's syllabus for one of the app's subjects (null when none), and what the class covered
// today in that subject for tonight's practice (C335, L10; empty when nothing).
export async function schoolStudyFor(
  claims: Claims,
  links: readonly FamilySchoolLink[],
  childId: string,
  subjectId: string
): Promise<{ chapters: { title: string; topics: string[] }[] | null; tonight: SchoolTaught[] }> {
  const m = links.flatMap((l) => l.children.filter((c) => c.childId === childId).map((c) => ({ linkId: l.linkId, studentId: c.studentId })))[0];
  if (!m) return { chapters: null, tonight: [] };
  const syllabus = await schoolSyllabusFor(claims, m.linkId, m.studentId);
  const subject = syllabus?.subjects.find((x) => schoolSubjectIs(x.name, subjectId));
  return {
    chapters: subject && subject.chapters.length > 0 ? subject.chapters : null,
    tonight: (syllabus?.tonight ?? []).filter((t) => schoolSubjectIs(t.subject, subjectId)),
  };
}

// ---- what is new from the school, and what the parent hears of (M3-8a, C338) ------------------------------------------

export const NEWS_KINDS: readonly SchoolNewsKind[] = ['homework', 'notices', 'results'];
// The kinds a parent can turn off: the school's three, and tonight's practice and plan (pushed in M3-8b).
export const NOTIFY_KINDS = ['homework', 'notices', 'results', 'tonight'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type { SchoolNews };

export async function notifyOff(db: Sql, accountId: string): Promise<NotifyKind[]> {
  const { rows } = await db.query(`select kind from family.notify_off where account_id = $1`, [accountId]);
  return NOTIFY_KINDS.filter((k) => rows.some((r) => r.kind === k));
}

export async function setNotify(db: Sql, accountId: string, kind: NotifyKind, on: boolean): Promise<void> {
  if (on) await db.query(`delete from family.notify_off where account_id = $1 and kind = $2`, [accountId, kind]);
  else await db.query(`insert into family.notify_off (account_id, kind) values ($1, $2) on conflict do nothing`, [accountId, kind]);
}

export type SeenRow = { linkId: string; kind: SchoolNewsKind; seenAt: string };
export async function readSeen(db: Sql, accountId: string): Promise<SeenRow[]> {
  const { rows } = await db.query(`select link_id, kind, seen_at from family.school_seen where account_id = $1`, [accountId]);
  return (rows as { link_id: string; kind: SchoolNewsKind; seen_at: Date }[]).map((r) => ({ linkId: r.link_id, kind: r.kind, seenAt: new Date(r.seen_at).toISOString() }));
}

// The parent has looked at the school's part: everything up to now is seen, for the account's own open link only.
export async function markSchoolSeen(db: Sql, accountId: string, linkId: string): Promise<boolean> {
  const own = (await db.query(`select 1 from family.school_links where link_id = $1 and account_id = $2 and revoked_at is null`, [linkId, accountId])).rows[0];
  if (!own) return false;
  for (const kind of NEWS_KINDS) {
    await db.query(
      `insert into family.school_seen (account_id, link_id, kind, seen_at) values ($1, $2, $3, now()) on conflict (account_id, link_id, kind) do update set seen_at = excluded.seen_at`,
      [accountId, linkId, kind]
    );
  }
  return true;
}

// What is new from the connected schools for the matched children, kind by kind, leaving out the kinds the parent
// turned off. A kind never looked at counts from when the link was made, so a new link does not arrive with a pile.
export async function schoolNewsFor(claims: Claims, links: readonly FamilySchoolLink[], seen: readonly SeenRow[], off: readonly NotifyKind[]): Promise<SchoolNews & { total: number }> {
  const sum: SchoolNews = { homework: 0, notices: 0, results: 0 };
  for (const l of links) {
    if (!l.children.length) continue;
    const since = Object.fromEntries(NEWS_KINDS.map((k) => [k, seen.find((x) => x.linkId === l.linkId && x.kind === k)?.seenAt ?? l.linkedAt])) as Record<SchoolNewsKind, string>;
    try {
      const n = await readSchoolNews(claims, l.linkId, l.children.map((c) => c.studentId), since);
      for (const k of NEWS_KINDS) if (!off.includes(k)) sum[k] += n[k];
    } catch (e) {
      if (!(e instanceof SchoolLinkGoneError)) throw e;
    }
  }
  return { ...sum, total: sum.homework + sum.notices + sum.results };
}
