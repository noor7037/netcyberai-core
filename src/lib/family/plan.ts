import { classSubjects, readFamilyCatalog, type CatalogLang } from './catalog';
import { isPrePrimary, syllabusBoardOf, type FamilyChild } from './children';
import { setting } from './learning';

// The mastery loop's returns and the day's plan (M2-2, C276; docs/family-app/11 L4, L5, R6 step 1; 02 §4.2).
//
// Revisits: a wrong answer brings its topic back after 3 and 10 days (Control settings). A return is done by a checked
// answer on the topic on or after its day, right or wrong; a wrong one schedules again. A pending return is never pushed
// later by another wrong answer.
//
// The plan: built the first time a child's day is asked for and kept for that day: due returns (oldest first), then
// weak topics, then the next topics of the syllabus, until Control's minutes are used. Done when every item has a
// checked answer that day; the answers alone decide it (M2b's Focus Lock reads this). Tomorrow is built fresh from
// tomorrow, so missed days never pile up, and nothing counts what was missed.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type PlanKind = 'revisit' | 'weak' | 'next';
export type PlanItem = { kind: PlanKind; topicKey: string; subject: string; minutes: number };
export type PlanItemView = PlanItem & { title: string; done: boolean; isTopic: boolean };
export type DayPlan = { day: string; minutes: number; items: PlanItemView[]; complete: boolean };

export const ITEM_MINUTES: Record<PlanKind, number> = { revisit: 5, weak: 6, next: 10 };
export const MAX_ITEMS = 12;
const KINDS: readonly PlanKind[] = ['revisit', 'weak', 'next'];
const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const SUBJECT = /^[a-z][a-z_]{1,39}$/;
// A topic key ends in .tNN; a chapter key (a chapter the catalog lists no topics for) does not.
export const isTopicKey = (key: string) => /\.t\d+$/.test(key);

// A stored plan's items, kept only when every field has its shape (a malformed item would leave the day undoneable).
export function parseItems(v: unknown): PlanItem[] {
  if (!Array.isArray(v)) return [];
  const out: PlanItem[] = [];
  for (const x of v.slice(0, MAX_ITEMS)) {
    const o = x as Record<string, unknown> | null;
    if (!o || !KINDS.includes(o.kind as PlanKind) || typeof o.topicKey !== 'string' || !TOPIC_KEY.test(o.topicKey) || typeof o.subject !== 'string' || !SUBJECT.test(o.subject)) continue;
    out.push({ kind: o.kind as PlanKind, topicKey: o.topicKey, subject: o.subject, minutes: ITEM_MINUTES[o.kind as PlanKind] });
  }
  return out;
}

type Candidate = { topicKey: string; subject: string };

// The day's items from the candidates, in order, within the minutes. One topic appears once. The first item always fits,
// so a short budget still gives the child something to do.
export function buildPlan(c: { budget: number; due: Candidate[]; weak: Candidate[]; next: Candidate[] }): PlanItem[] {
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  let used = 0;
  const add = (kind: PlanKind, x: Candidate): boolean => {
    if (seen.has(x.topicKey)) return true;
    const m = ITEM_MINUTES[kind];
    if (items.length >= MAX_ITEMS || (items.length > 0 && used + m > c.budget)) return false;
    items.push({ kind, topicKey: x.topicKey, subject: x.subject, minutes: m });
    seen.add(x.topicKey);
    used += m;
    return true;
  };
  for (const x of c.due) if (!add('revisit', x)) break;
  for (const x of c.weak) if (!add('weak', x)) break;
  for (const x of c.next) if (!add('next', x)) break;
  return items;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// "Friday, 24 October" in the child's language, for the note after a wrong answer.
export const dayLabel = (day: string, lang: 'en' | 'hi') =>
  new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
const dayText = (v: unknown) => (v == null ? null : String(v).slice(0, 10));

// After a checked answer on a syllabus topic: due returns are done; a wrong answer schedules the topic's returns (a
// pending one keeps its day). Returns the day of the first pending return after a wrong answer, else null.
export async function noteRevisits(db: Db, a: { accountId: string; childId: string; topicKey: string; subject: string; day: string; correct: boolean }): Promise<string | null> {
  await db.query(
    `update family.revisits set done_on = $4 where account_id = $1 and child_id = $2 and topic_key = $3 and done_on is null and due_on <= $4::date`,
    [a.accountId, a.childId, a.topicKey, a.day]
  );
  if (a.correct) return null;
  const first = Math.max(1, Math.round(await setting(db, 'family.revisit_first_days', 3)));
  const second = Math.max(first + 1, Math.round(await setting(db, 'family.revisit_second_days', 10)));
  await db.query(
    `insert into family.revisits as r (account_id, child_id, topic_key, subject, step, set_on, due_on)
     values ($1, $2, $3, $4, 1, $5, $6), ($1, $2, $3, $4, 2, $5, $7)
     on conflict (child_id, topic_key, step) do update set subject = excluded.subject, set_on = excluded.set_on, due_on = excluded.due_on, done_on = null
       where r.done_on is not null`,
    [a.accountId, a.childId, a.topicKey, a.subject, a.day, addDays(a.day, first), addDays(a.day, second)]
  );
  const { rows } = await db.query(`select due_on::text as due_on from family.revisits where child_id = $1 and topic_key = $2 and step = 1 and done_on is null`, [a.childId, a.topicKey]);
  return dayText(rows[0]?.due_on);
}

// The candidates for a day, in the order the plan takes them.
async function candidates(db: Db, accountId: string, child: FamilyChild, day: string, lang: CatalogLang) {
  const due = (
    await db.query(
      `select topic_key, subject from family.revisits where account_id = $1 and child_id = $2 and done_on is null and due_on <= $3::date
        order by due_on, step, topic_key limit ${MAX_ITEMS}`,
      [accountId, child.childId, day]
    )
  ).rows.map((r) => ({ topicKey: String(r.topic_key), subject: String(r.subject) }));
  // Weak: answered at least twice, under three in five right, not mastered.
  const weak = (
    await db.query(
      `select topic_key, subject from family.topic_progress
        where account_id = $1 and child_id = $2 and mastered_on is null and answered >= 2 and correct * 5 < answered * 3 and topic_key not like '%.question'
        order by updated_at desc limit 3`,
      [accountId, child.childId]
    )
  ).rows.map((r) => ({ topicKey: String(r.topic_key), subject: String(r.subject) }));
  const next: Candidate[] = [];
  if (!isPrePrimary(child.classLevel)) {
    const board = syllabusBoardOf(child);
    const subjects = child.freeSubject ? [child.freeSubject] : await classSubjects(db, { board, classLevel: child.classLevel, today: day });
    const started = new Set(
      (await db.query(`select topic_key from family.topic_progress where account_id = $1 and child_id = $2`, [accountId, child.childId])).rows.map((r) => String(r.topic_key))
    );
    for (const subject of subjects) {
      const catalog = await readFamilyCatalog(db, { board, classLevel: child.classLevel, subject, lang, today: day });
      if (!catalog) continue;
      for (const ch of catalog.chapters) {
        const keys = ch.topics.length ? ch.topics.map((t) => t.key) : [ch.key];
        for (const k of keys) if (!started.has(k) && next.length < 2) next.push({ topicKey: k, subject });
      }
      if (next.length) break;
    }
  }
  return { due, weak, next };
}

// Titles from the catalog released to everyone, in the asked language (English where no Hindi title was printed).
export async function titles(db: Db, keys: string[], lang: CatalogLang): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const { rows } = await db.query(
    `select k.key,
            coalesce((select coalesce(case when $2 = 'hi' then t.title_hi end, t.title_en) from content.topics t join content.syllabus_versions v on v.version_id = t.version_id
                       where t.topic_key = k.key and v.status = 'published' and v.audience = 'everyone' order by v.academic_year desc limit 1),
                     (select coalesce(case when $2 = 'hi' then c.title_hi end, c.title_en) from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
                       where c.chapter_key = k.key and v.status = 'published' and v.audience = 'everyone' order by v.academic_year desc limit 1)) as title
       from unnest($1::text[]) as k(key)`,
    [keys, lang]
  );
  return new Map(rows.filter((r) => r.title).map((r) => [String(r.key), String(r.title)]));
}

// Today's plan for a child: the stored one, or built and stored now. Its items are marked done from today's checked
// answers, and the day's completion is written to match them (an answer the parent deletes can undo it).
export async function dayPlan(db: Db, accountId: string, child: FamilyChild, day: string, lang: CatalogLang): Promise<DayPlan> {
  const read = async () =>
    (await db.query(`select items, minutes, completed_at from family.plan_days where account_id = $1 and child_id = $2 and day = $3`, [accountId, child.childId, day])).rows[0];
  let row = await read();
  if (!row) {
    const budget = Math.min(30, Math.max(15, Math.round(await setting(db, 'family.plan_minutes', 20))));
    const items = buildPlan({ budget, ...(await candidates(db, accountId, child, day, lang)) });
    await db.query(
      `insert into family.plan_days (account_id, child_id, day, items, minutes) values ($1, $2, $3, $4::jsonb, $5) on conflict (child_id, day) do nothing`,
      [accountId, child.childId, day, JSON.stringify(items), items.reduce((s, i) => s + i.minutes, 0)]
    );
    row = await read();
  }
  const items = parseItems(row?.items);
  const answered = new Set(
    items.length
      ? (
          await db.query(`select distinct topic_key from family.attempts where account_id = $1 and child_id = $2 and answered_on = $3 and topic_key = any($4::text[])`, [
            accountId,
            child.childId,
            day,
            items.map((i) => i.topicKey),
          ])
        ).rows.map((r) => String(r.topic_key))
      : []
  );
  // An item whose topic left the released catalog is dropped from the day, so it cannot hold the day open.
  const names = await titles(db, items.map((i) => i.topicKey), lang);
  const shown = items.filter((i) => names.has(i.topicKey));
  const complete = shown.length > 0 && shown.every((i) => answered.has(i.topicKey));
  if (complete !== (row?.completed_at != null)) {
    await db.query(`update family.plan_days set completed_at = ${complete ? 'now()' : 'null'} where account_id = $1 and child_id = $2 and day = $3`, [accountId, child.childId, day]);
  }
  return {
    day,
    minutes: shown.reduce((s, i) => s + i.minutes, 0),
    complete,
    items: shown.map((i) => ({ ...i, title: names.get(i.topicKey)!, done: answered.has(i.topicKey), isTopic: isTopicKey(i.topicKey) })),
  };
}
