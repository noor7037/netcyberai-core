import { familyModuleOn } from './flags';
import { dayPlan, titles } from './plan';
import type { FamilyChild } from './children';

// The habit pieces (M2-3, C277; docs/family-app/11 R7, R9): the forgiving weekly goal, badges for mastered topics, the
// family reward jar, the parent's weekly summary and tonight's talk question. Everything is made of checked answers and
// the plan days they completed; nothing counts time, opens or missed days, and nothing compares one child with another.
// The jar fills in the read path (like a plan day's completion), never from anything a phone sends. NetCyberAI never
// holds or moves money: the parent gives the reward.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
type Lang = 'en' | 'hi';

export const GOAL_MIN = 1;
export const GOAL_MAX = 7;
export const GOAL_DEFAULT = 5;
export const JAR_TARGET_MIN = 3;
export const JAR_TARGET_MAX = 60;
export const REWARD_MAX = 80;
export const TALK_TEMPLATES = 4;

const text = (v: unknown) => (v == null ? null : String(v).slice(0, 10));
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// The Monday on or before a day.
export function mondayOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

export type JarView = { jarId: string; reward: string; targetDays: number; days: number; filled: boolean; startedOn: string; filledOn: string | null };
export type ChildHabit = {
  goal: number;
  // The last seven India days, oldest first, today last: whether the plan was done that day.
  week: boolean[];
  doneDays: number;
  badges: { topicKey: string; title: string; masteredOn: string }[];
  jar: JarView | null;
};

export async function weeklyGoal(db: Db, accountId: string, childId: string): Promise<number | null> {
  const { rows } = await db.query(`select weekly_goal from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  return rows[0] ? Number(rows[0].weekly_goal) : null;
}

// The child's open jar with its progress; sets filled_on, once, when the plan days on or after the start reach the target.
export async function openJar(db: Db, accountId: string, childId: string, today: string): Promise<JarView | null> {
  const { rows } = await db.query(
    `select jar_id, reward, target_days, started_on::text as started_on, filled_on::text as filled_on from family.reward_jars
      where account_id = $1 and child_id = $2 and given_on is null`,
    [accountId, childId]
  );
  const j = rows[0];
  if (!j) return null;
  const started = String(j.started_on).slice(0, 10);
  const target = Number(j.target_days);
  const { rows: c } = await db.query(
    `select count(*)::int as n from family.plan_days where account_id = $1 and child_id = $2 and completed_at is not null and day >= $3::date and day <= $4::date`,
    [accountId, childId, started, today]
  );
  const days = Number(c[0]?.n ?? 0);
  let filledOn = text(j.filled_on);
  if (!filledOn && days >= target) {
    const r = await db.query(`update family.reward_jars set filled_on = $3::date where jar_id = $1 and account_id = $2 and filled_on is null returning filled_on::text as filled_on`, [j.jar_id, accountId, today]);
    filledOn = text(r.rows[0]?.filled_on) ?? today;
  }
  return { jarId: String(j.jar_id), reward: String(j.reward), targetDays: target, days: Math.min(days, target), filled: filledOn !== null, startedOn: started, filledOn };
}

// Badges: one per mastered topic, newest first. Never for days or time.
export async function masteredBadges(db: Db, accountId: string, childId: string, lang: Lang, limit = 30) {
  const { rows } = await db.query(
    `select topic_key, mastered_on::text as mastered_on from family.topic_progress
      where account_id = $1 and child_id = $2 and mastered_on is not null and topic_key not like '%.question' order by mastered_on desc, updated_at desc limit 100`,
    [accountId, childId]
  );
  const names = await titles(db, rows.map((r) => String(r.topic_key)), lang);
  return rows
    .filter((r) => names.has(String(r.topic_key)))
    .slice(0, limit)
    .map((r) => ({ topicKey: String(r.topic_key), title: names.get(String(r.topic_key))!, masteredOn: String(r.mastered_on).slice(0, 10) }));
}

// The child's home: this week's circles, the badges and the open jar. Reads today's plan first (when the plan is on) so
// that today's completion is written before it is counted.
export async function childHabit(db: Db, accountId: string, child: FamilyChild, today: string, lang: Lang): Promise<ChildHabit> {
  if (await familyModuleOn(db, 'plan', accountId)) await dayPlan(db, accountId, child, today, lang);
  const goal = (await weeklyGoal(db, accountId, child.childId)) ?? GOAL_DEFAULT;
  const { rows } = await db.query(
    `select day::text as day from family.plan_days where account_id = $1 and child_id = $2 and completed_at is not null and day > $3::date - 7 and day <= $3::date`,
    [accountId, child.childId, today]
  );
  const done = new Set(rows.map((r) => String(r.day).slice(0, 10)));
  const week = Array.from({ length: 7 }, (_, i) => done.has(addDays(today, i - 6)));
  return { goal, week, doneDays: week.filter(Boolean).length, badges: await masteredBadges(db, accountId, child.childId, lang), jar: await openJar(db, accountId, child.childId, today) };
}

// ---- the parent's changes -----------------------------------------------------------------------------------------

export type HabitProblem = 'goal_bad' | 'reward_bad' | 'target_bad' | 'jar_exists' | 'jar_not_full' | 'jar_full' | 'not_found';

export async function setGoal(db: Db, accountId: string, childId: string, goal: unknown): Promise<'ok' | HabitProblem> {
  if (typeof goal !== 'number' || !Number.isInteger(goal) || goal < GOAL_MIN || goal > GOAL_MAX) return 'goal_bad';
  const r = await db.query(`update family.children set weekly_goal = $3 where account_id = $1 and child_id = $2`, [accountId, childId, goal]);
  return (r.rowCount ?? 0) > 0 ? 'ok' : 'not_found';
}

// A 12-digit number, in any script, with spaces, dots or dashes between its digits (family code may not import the
// website's rule, docs/family-app/03 §14; this one is stricter on purpose: it refuses any 12 digits in a row).
const hasTwelveDigits = (s: string) => /\p{Nd}{12}/u.test(s.replace(/(\p{Nd})[\s.\-\u2010-\u2015\u2212]+(?=\p{Nd})/gu, (_, digit: string) => digit));

// A reward is plain text the parent writes: 1 to 80 characters, no markup or control characters, no 12-digit number.
export function checkReward(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || [...s].length > REWARD_MAX) return null;
  if (/[<>\u0000-\u001f\u007f]/.test(s) || hasTwelveDigits(s)) return null;
  return s;
}

export async function createJar(db: Db, accountId: string, childId: string, rewardRaw: unknown, targetRaw: unknown, today: string): Promise<'ok' | HabitProblem> {
  const reward = checkReward(rewardRaw);
  if (!reward) return 'reward_bad';
  if (typeof targetRaw !== 'number' || !Number.isInteger(targetRaw) || targetRaw < JAR_TARGET_MIN || targetRaw > JAR_TARGET_MAX) return 'target_bad';
  const r = await db.query(
    `insert into family.reward_jars (account_id, child_id, reward, target_days, started_on)
     select $1, $2, $3, $4, $5::date from family.children where account_id = $1 and child_id = $2
     on conflict (child_id) where given_on is null do nothing returning jar_id`,
    [accountId, childId, reward, targetRaw, today]
  );
  if ((r.rowCount ?? 0) > 0) return 'ok';
  const { rows } = await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  return rows[0] ? 'jar_exists' : 'not_found';
}

// The parent marks the reward given; only a full jar can be.
export async function giveJar(db: Db, accountId: string, childId: string, today: string): Promise<'ok' | HabitProblem> {
  await openJar(db, accountId, childId, today);
  const r = await db.query(
    `update family.reward_jars set given_on = $3::date where account_id = $1 and child_id = $2 and given_on is null and filled_on is not null returning jar_id`,
    [accountId, childId, today]
  );
  if ((r.rowCount ?? 0) > 0) return 'ok';
  const { rows } = await db.query(`select 1 from family.reward_jars where account_id = $1 and child_id = $2 and given_on is null`, [accountId, childId]);
  return rows[0] ? 'jar_not_full' : 'not_found';
}

// Only an unfilled jar is removed; a full one is given.
export async function removeJar(db: Db, accountId: string, childId: string, today: string): Promise<'ok' | HabitProblem> {
  await openJar(db, accountId, childId, today);
  const r = await db.query(`delete from family.reward_jars where account_id = $1 and child_id = $2 and given_on is null and filled_on is null returning jar_id`, [accountId, childId]);
  if ((r.rowCount ?? 0) > 0) return 'ok';
  const { rows } = await db.query(`select 1 from family.reward_jars where account_id = $1 and child_id = $2 and given_on is null`, [accountId, childId]);
  return rows[0] ? 'jar_full' : 'not_found';
}

// ---- the parent's weekly summary and tonight's question ---------------------------------------------------------------

export type WeeklySummary = { done: number; goal: number; masteredCount: number; masteredTitles: string[]; support: string | null };
export type TalkQuestion = { template: number; topic: string } | null;
export type ParentHabit = { childId: string; goal: number; jar: JarView | null; summary: WeeklySummary; talk: TalkQuestion };

export async function weeklySummary(db: Db, accountId: string, childId: string, today: string, lang: Lang): Promise<WeeklySummary> {
  const monday = mondayOf(today);
  const goal = (await weeklyGoal(db, accountId, childId)) ?? GOAL_DEFAULT;
  const { rows: d } = await db.query(
    `select count(*)::int as n from family.plan_days where account_id = $1 and child_id = $2 and completed_at is not null and day >= $3::date and day <= $4::date`,
    [accountId, childId, monday, addDays(monday, 6)]
  );
  const { rows: m } = await db.query(
    `select topic_key from family.topic_progress where account_id = $1 and child_id = $2 and mastered_on >= $3::date and mastered_on <= $4::date and topic_key not like '%.question'
      order by mastered_on desc, updated_at desc`,
    [accountId, childId, monday, addDays(monday, 6)]
  );
  // The weakest topic still to master: answered at least twice, the lowest share right (and not all right).
  const { rows: w } = await db.query(
    `select topic_key from family.topic_progress
      where account_id = $1 and child_id = $2 and mastered_on is null and answered >= 2 and correct < answered and topic_key not like '%.question'
      order by correct::float / answered, answered desc, updated_at desc limit 5`,
    [accountId, childId]
  );
  const names = await titles(db, [...m.map((r) => String(r.topic_key)), ...w.map((r) => String(r.topic_key))], lang);
  const mastered = m.filter((r) => names.has(String(r.topic_key)));
  const weak = w.find((r) => names.has(String(r.topic_key)));
  return {
    done: Number(d[0]?.n ?? 0),
    goal,
    masteredCount: mastered.length,
    masteredTitles: mastered.slice(0, 3).map((r) => names.get(String(r.topic_key))!),
    support: weak ? names.get(String(weak.topic_key))! : null,
  };
}

// One question from a topic answered on the latest day with answers in the last 7 days, from a fixed set of templates,
// picked by the day so it changes daily. No AI call.
export async function talkQuestion(db: Db, accountId: string, childId: string, today: string, lang: Lang): Promise<TalkQuestion> {
  const { rows: latest } = await db.query(
    `select max(answered_on)::text as day from family.attempts where account_id = $1 and child_id = $2 and answered_on > $3::date - 7 and answered_on <= $3::date and topic_key not like '%.question'`,
    [accountId, childId, today]
  );
  const day = text(latest[0]?.day);
  if (!day) return null;
  const { rows } = await db.query(
    `select distinct topic_key from family.attempts where account_id = $1 and child_id = $2 and answered_on = $3::date and topic_key not like '%.question' order by topic_key`,
    [accountId, childId, day]
  );
  const names = await titles(db, rows.map((r) => String(r.topic_key)), lang);
  const keys = rows.map((r) => String(r.topic_key)).filter((k) => names.has(k));
  if (!keys.length) return null;
  const n = dayNumber(today);
  return { template: n % TALK_TEMPLATES, topic: names.get(keys[n % keys.length])! };
}

export async function parentHabit(db: Db, accountId: string, childId: string, today: string, lang: Lang): Promise<ParentHabit> {
  const summary = await weeklySummary(db, accountId, childId, today, lang);
  return { childId, goal: summary.goal, jar: await openJar(db, accountId, childId, today), summary, talk: await talkQuestion(db, accountId, childId, today, lang) };
}
