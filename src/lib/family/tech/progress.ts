// A child's Tech Lab progress. Stars, scores, XP and dates only — never an answer.
// Before the migration is applied the tables are absent: reads return an empty record and writes say they were not saved.

import { indiaDate } from '@/lib/time/india';
import { freshBadges } from './badges';
import { courseCatalog } from './catalog';
import { PASS_PERCENT } from './score';
import { EMPTY_PROGRESS, type TechProgress } from './types';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

async function tablesReady(db: Db): Promise<boolean> {
  const { rows } = await db.query(`select to_regclass('family.tech_lessons_done') as done, to_regclass('family.tech_labs_done') as labs, to_regclass('family.tech_badges') as badges, to_regclass('family.tech_days') as days`);
  const row = rows[0] ?? {};
  return row.done != null && row.labs != null && row.badges != null && row.days != null;
}

export async function readProgress(db: Db, childId: string): Promise<TechProgress> {
  if (!(await tablesReady(db))) return { ...EMPTY_PROGRESS, done: {} };
  const doneRows = await db.query(
    `select lesson_key, stars, best_score, xp from family.tech_lessons_done where child_id = $1`,
    [childId],
  );
  const badgeRows = await db.query(`select badge_id from family.tech_badges where child_id = $1`, [childId]);
  const labRows = await db.query(`select lab_id from family.tech_labs_done where child_id = $1`, [childId]);
  const done: TechProgress['done'] = {};
  let xp = 0;
  for (const row of doneRows.rows) {
    const stars = Number(row.stars) || 0;
    const best = Number(row.best_score) || 0;
    const earned = Number(row.xp) || 0;
    done[String(row.lesson_key)] = { stars, best, xp: earned };
    xp += earned;
  }
  return {
    xp,
    done,
    badges: badgeRows.rows.map((row) => String(row.badge_id)),
    labs: labRows.rows.map((row) => String(row.lab_id)),
  };
}

export async function passPercent(db: Db): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = 'family.tech.pass_percent'`);
  const value = rows[0]?.value;
  const number = typeof value === 'number' ? value : Number(typeof value === 'string' ? value : NaN);
  return Number.isFinite(number) && number >= 1 && number <= 100 ? number : PASS_PERCENT;
}

export async function savePass(
  db: Db,
  accountId: string,
  childId: string,
  lessonKey: string,
  best: number,
  stars: number,
  xp: number,
  gain: number,
): Promise<{ saved: boolean; badges: string[] }> {
  if (!(await tablesReady(db))) return { saved: false, badges: [] };
  const today = indiaDate();
  const previous = await db.query(`select done_on from family.tech_lessons_done where child_id = $1 and lesson_key = $2`, [childId, lessonKey]);
  const firstPass = !previous.rows[0] || previous.rows[0].done_on == null;
  await db.query(
    `insert into family.tech_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, xp, done_on, last_on)
     values ($1, $2, $3, 1, $4, $5, $6, $7::date, $7::date)
     on conflict (child_id, lesson_key) do update set
       tries = least(1000, family.tech_lessons_done.tries + 1),
       best_score = greatest(family.tech_lessons_done.best_score, excluded.best_score),
       stars = greatest(family.tech_lessons_done.stars, excluded.stars),
       xp = greatest(family.tech_lessons_done.xp, excluded.xp),
       done_on = coalesce(family.tech_lessons_done.done_on, excluded.done_on),
       last_on = excluded.last_on`,
    [accountId, childId, lessonKey, best, stars, xp, today],
  );
  if (gain > 0 || firstPass) {
    await db.query(
      `insert into family.tech_days (account_id, child_id, day, lessons, xp)
       values ($1, $2, $3::date, $4, $5)
       on conflict (child_id, day) do update set
         lessons = least(200, family.tech_days.lessons + excluded.lessons),
         xp = least(100000, family.tech_days.xp + excluded.xp)`,
      [accountId, childId, today, firstPass ? 1 : 0, gain],
    );
  }
  const progress = await readProgress(db, childId);
  const earned = freshBadges(courseCatalog(), progress);
  for (const badge of earned) {
    await db.query(
      `insert into family.tech_badges (account_id, child_id, badge_id) values ($1, $2, $3) on conflict (child_id, badge_id) do nothing`,
      [accountId, childId, badge.id],
    );
  }
  return { saved: true, badges: earned.map((badge) => badge.id) };
}

const LAB_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

export async function saveLab(db: Db, accountId: string, childId: string, labId: string): Promise<boolean> {
  if (!LAB_ID.test(labId) || !(await tablesReady(db))) return false;
  await db.query(
    `insert into family.tech_labs_done (account_id, child_id, lab_id) values ($1, $2, $3)
     on conflict (child_id, lab_id) do update set times = least(1000, family.tech_labs_done.times + 1)`,
    [accountId, childId, labId],
  );
  return true;
}
