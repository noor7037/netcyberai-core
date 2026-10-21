import { recomputeTopic } from './account';
import type { ItemSecret } from './items';
import { SUBJECTS, canChangeFreeSubject, type Subject } from './modules';

// Learning records (docs/family-app/02 §4.1–4.2; M1-6, C252). Progress moves only on checked answers: an answer is
// checked on the server against the sealed key, recorded as an attempt, and the topic's progress is recomputed from
// attempts alone. Mastered = right on two days at least seven days apart. Nothing about behaviour is recorded: no time
// in the app, no pages opened. The parent sees and deletes the answers (P2).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function setting(db: Db, key: string, fallback: number): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [key]);
  const v = Number(rows[0]?.value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// The child's free subject: the first subject they study becomes it. Returns whether this subject is open.
export async function claimSubject(db: Db, accountId: string, childId: string, subject: Subject): Promise<boolean> {
  const { rows } = await db.query(
    `update family.children set free_subject = $3, free_subject_set_at = now()
      where account_id = $1 and child_id = $2 and free_subject is null
      returning free_subject`,
    [accountId, childId, subject]
  );
  if (rows[0]) return true;
  const { rows: now } = await db.query(`select free_subject from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  return now[0]?.free_subject === subject;
}

// The parent changes a child's free subject, once the change window has passed since it was last set.
export async function changeFreeSubject(db: Db, accountId: string, childId: string, subject: Subject): Promise<'changed' | 'too_soon' | 'not_found'> {
  const { rows } = await db.query(`select free_subject, free_subject_set_at from family.children where account_id = $1 and child_id = $2 for update`, [accountId, childId]);
  if (!rows[0]) return 'not_found';
  if (rows[0].free_subject === subject) return 'changed';
  const days = await setting(db, 'family.free_subject_change_days', 90);
  const setAt = rows[0].free_subject_set_at ? new Date(String(rows[0].free_subject_set_at)) : null;
  if (rows[0].free_subject && !canChangeFreeSubject(setAt, days)) return 'too_soon';
  await db.query(`update family.children set free_subject = $3, free_subject_set_at = now() where account_id = $1 and child_id = $2`, [accountId, childId, subject]);
  return 'changed';
}

// A checked answer: kept as the child saw it (question and chosen option), then the topic's progress is recomputed.
// A typed question's items count as answers but move no syllabus topic.
export async function recordAnswer(db: Db, a: { accountId: string; childId: string; item: ItemSecret; choice: number; hintUsed: boolean; day: string }): Promise<boolean> {
  const correct = a.choice === a.item.a;
  if (!(SUBJECTS as readonly string[]).includes(a.item.s)) return correct;
  const shown = `${a.item.q} → ${a.item.o[a.choice] ?? ''}`.slice(0, 500);
  await db.query(
    `insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, hint_used, answered_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [a.accountId, a.childId, a.item.s, a.item.k, `${a.item.k}#${a.item.i}`.slice(0, 120), a.item.kind, shown, correct, a.hintUsed, a.day]
  );
  if (!a.item.k.endsWith('.question')) await recomputeTopic(db, a.accountId, a.childId, a.item.k);
  return correct;
}

export type TopicProgress = { topicKey: string; subject: Subject; title: string; answered: number; correct: number; mastered: boolean; lastCorrectOn: string | null };

const dateText = (v: unknown) => (v ? (typeof v === 'string' ? v.slice(0, 10) : `${(v as Date).getFullYear()}-${String((v as Date).getMonth() + 1).padStart(2, '0')}-${String((v as Date).getDate()).padStart(2, '0')}`) : null);

// The child's topics with progress, newest first, with their titles from the catalog released to everyone.
export async function childProgress(db: Db, accountId: string, childId: string, lang: 'en' | 'hi'): Promise<TopicProgress[]> {
  const { rows } = await db.query(
    `select p.topic_key, p.subject, p.answered, p.correct, p.mastered_on, p.last_correct_on,
            (select coalesce(case when $3 = 'hi' then t.title_hi end, t.title_en) from content.topics t
               join content.syllabus_versions v on v.version_id = t.version_id
              where t.topic_key = p.topic_key and v.status = 'published' and v.audience = 'everyone' order by v.academic_year desc limit 1) as topic_title,
            (select coalesce(case when $3 = 'hi' then c.title_hi end, c.title_en) from content.chapters c
               join content.syllabus_versions v on v.version_id = c.version_id
              where c.chapter_key = p.topic_key and v.status = 'published' and v.audience = 'everyone' order by v.academic_year desc limit 1) as chapter_title
       from family.topic_progress p where p.account_id = $1 and p.child_id = $2 order by p.updated_at desc limit 50`,
    [accountId, childId, lang]
  );
  return rows
    .filter((r) => r.topic_title || r.chapter_title)
    .map((r) => ({
      topicKey: String(r.topic_key),
      subject: r.subject as Subject,
      title: String(r.topic_title ?? r.chapter_title),
      answered: Number(r.answered),
      correct: Number(r.correct),
      mastered: r.mastered_on !== null,
      lastCorrectOn: dateText(r.last_correct_on),
    }));
}

// The parent's calm card: the last seven days in a few plain facts. No comparison with other children, no streaks, no
// time in the app.
export type CalmCard = { childId: string; answers: number; right: number; topics: number; mastered: number; practisedTitles: string[] };

export async function calmCard(db: Db, accountId: string, childId: string, today: string, lang: 'en' | 'hi'): Promise<CalmCard> {
  const { rows } = await db.query(
    `select count(*)::int as answers, count(*) filter (where correct)::int as right_answers, count(distinct topic_key) filter (where topic_key not like '%.question')::int as topics
       from family.attempts where account_id = $1 and child_id = $2 and answered_on > $3::date - 7`,
    [accountId, childId, today]
  );
  const progress = await childProgress(db, accountId, childId, lang);
  return {
    childId,
    answers: Number(rows[0]?.answers ?? 0),
    right: Number(rows[0]?.right_answers ?? 0),
    topics: Number(rows[0]?.topics ?? 0),
    mastered: progress.filter((p) => p.mastered).length,
    practisedTitles: progress.slice(0, 3).map((p) => p.title),
  };
}
