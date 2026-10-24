import type { Subject } from '@/lib/contracts/subjects';
import { MAX_NOTE, MAX_PLAN_TOPICS, PLAN_NIGHTS, type HomePlan, type PlanTopic } from './home-plan-shape';
import { syllabusBoardOf, type FamilyChild } from './children';
import { openSubjects } from './learning';
import { subjectAccess } from './modules';
import { titles } from './plan';

// After a parent-teacher meeting (M3-7, C337; docs/family-app/11 R5, Plus): the parent chooses the topics the teacher
// spoke about, from the child's own catalog, and the app makes a home plan of 15 minutes a night for 14 nights, the
// first tonight. The nights go through the topics in turn, so each comes back at least twice. Every night is a catalog
// topic the child can open (its subject's access, C252); a night is done when the child has a checked answer on its
// topic that day, as the day's plan counts it (M2-2). The parent's notes from the meeting stay with the plan, for the
// parent only; nothing here is sent anywhere. For a child matched to a connected school, the parent can ask the teacher
// to follow up (src/lib/family/school.ts, askSchoolFollowup): the school's own follow-up queue.

export { MAX_NOTE, MAX_PLAN_TOPICS, NIGHT_MINUTES, PLAN_NIGHTS, type HomePlan, type HomePlanNight, type PlanTopic } from './home-plan-shape';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{2,119}\.t\d+$/;

// Plus has no checkout before P3 and no school sponsors it yet: a Plus module is used only when Control opens Plus to
// every family for a pilot (family.plus_open, C337).
export async function plusOpen(db: Db): Promise<boolean> {
  return (await db.query(`select value from control.settings where key = 'family.plus_open'`)).rows[0]?.value === true;
}

// "2026-10-25" + n days, as a calendar day (no time zone moves it).
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The 14 nights: night 1 is the first day, and the topics come in turn.
export function planNights(startsOn: string, topics: readonly PlanTopic[]): { night: number; date: string; topicKey: string; subject: Subject }[] {
  if (!topics.length) return [];
  return Array.from({ length: PLAN_NIGHTS }, (_, i) => ({ night: i + 1, date: addDays(startsOn, i), ...topics[i % topics.length] }));
}

// A 12-digit number, in any script, with spaces, dots or dashes between its digits (as the reward's rule, habit.ts).
const hasTwelveDigits = (s: string) => /\p{Nd}{12}/u.test(s.replace(/(\p{Nd})[\s.\-‐-―−]+(?=\p{Nd})/gu, (_, digit: string) => digit));

// The parent's notes: none, or 1 to 1000 characters of plain text with no 12-digit number. undefined: refused.
export function checkNote(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const s = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!s) return null;
  if ([...s].length > MAX_NOTE || /[<>\u0000-\u0009\u000b-\u001f\u007f]/.test(s) || hasTwelveDigits(s)) return undefined;
  return s;
}

const parseTopics = (v: unknown): PlanTopic[] =>
  Array.isArray(v) ? v.filter((t): t is PlanTopic => !!t && typeof t.topicKey === 'string' && TOPIC_KEY.test(t.topicKey) && typeof t.subject === 'string') : [];

// The child's open plan, with each night's title in the child's language and its done mark; null when there is none.
// A topic that has left the released catalog keeps its night, untitled, so the 14 nights never shift.
export async function homePlan(db: Db, accountId: string, child: FamilyChild, today: string, lang: 'en' | 'hi'): Promise<HomePlan | null> {
  const row = (
    await db.query(`select plan_id, starts_on::text as starts_on, topics, note, followup_asked_at from family.home_plans where account_id = $1 and child_id = $2 and stopped_at is null`, [
      accountId,
      child.childId,
    ])
  ).rows[0];
  if (!row) return null;
  const startsOn = String(row.starts_on);
  const nights = planNights(startsOn, parseTopics(row.topics));
  const keys = Array.from(new Set(nights.map((n) => n.topicKey)));
  const names = await titles(db, keys, lang);
  const answered = new Set(
    (
      await db.query(
        `select distinct topic_key, answered_on::text as day from family.attempts where account_id = $1 and child_id = $2 and topic_key = any($3::text[]) and answered_on between $4::date and $5::date`,
        [accountId, child.childId, keys, startsOn, addDays(startsOn, PLAN_NIGHTS - 1)]
      )
    ).rows.map((r) => `${r.topic_key}@${r.day}`)
  );
  const shown = nights.map((n) => ({ ...n, title: names.get(n.topicKey) ?? '', done: answered.has(`${n.topicKey}@${n.date}`) }));
  return {
    planId: String(row.plan_id),
    startsOn,
    note: (row.note as string | null) ?? null,
    followupAsked: row.followup_asked_at != null,
    nights: shown,
    tonight: shown.find((n) => n.date === today && n.title) ?? null,
  };
}

export type StartPlanResult = { ok: true; planId: string } | { ok: false; reason: 'topics' | 'note' | 'not_found' };

// A new plan from the parent's chosen topics, starting today; the open one, if any, is stopped. Each topic must be in
// the catalog released to everyone for the child's board and class, in a subject the child can open.
export async function startHomePlan(db: Db, accountId: string, child: FamilyChild, input: { topics: unknown; note: unknown }, today: string): Promise<StartPlanResult> {
  const note = checkNote(input.note);
  if (note === undefined) return { ok: false, reason: 'note' };
  const asked = Array.isArray(input.topics) ? input.topics : null;
  if (!asked || asked.length < 1 || asked.length > MAX_PLAN_TOPICS || !asked.every((k) => typeof k === 'string' && TOPIC_KEY.test(k)) || new Set(asked).size !== asked.length) {
    return { ok: false, reason: 'topics' };
  }
  const { rows } = await db.query(
    `select distinct on (t.topic_key) t.topic_key, v.subject
       from content.topics t join content.syllabus_versions v on v.version_id = t.version_id
      where t.topic_key = any($1::text[]) and v.board_id = $2 and v.class_level = $3 and v.status = 'published' and v.audience = 'everyone'
      order by t.topic_key, v.academic_year desc`,
    [asked, syllabusBoardOf(child), child.classLevel]
  );
  const openToAll = await openSubjects(db);
  const found = new Map(rows.map((r) => [String(r.topic_key), String(r.subject) as Subject]));
  if (found.size !== asked.length || [...found.values()].some((s) => !subjectAccess(child, s, openToAll).open)) return { ok: false, reason: 'topics' };
  const owned = (await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, child.childId])).rows[0];
  if (!owned) return { ok: false, reason: 'not_found' };
  // Two plans made at once for one child: the second waits, then stops the first (never a duplicate-row error).
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`home_plan:${child.childId}`]);
  await db.query(`update family.home_plans set stopped_at = now() where account_id = $1 and child_id = $2 and stopped_at is null`, [accountId, child.childId]);
  const made = await db.query(
    `insert into family.home_plans (account_id, child_id, starts_on, topics, note) values ($1, $2, $3::date, $4::jsonb, $5) returning plan_id`,
    [accountId, child.childId, today, JSON.stringify((asked as string[]).map((k) => ({ topicKey: k, subject: found.get(k) }))), note]
  );
  return { ok: true, planId: String(made.rows[0].plan_id) };
}

export async function stopHomePlan(db: Db, accountId: string, childId: string): Promise<boolean> {
  return ((await db.query(`update family.home_plans set stopped_at = now() where account_id = $1 and child_id = $2 and stopped_at is null`, [accountId, childId])).rowCount ?? 0) > 0;
}

// The school has the request (or already had one open): the plan remembers it, so the button says so.
export async function noteFollowupAsked(db: Db, accountId: string, childId: string): Promise<void> {
  await db.query(`update family.home_plans set followup_asked_at = now() where account_id = $1 and child_id = $2 and stopped_at is null and followup_asked_at is null`, [accountId, childId]);
}
