import type { PoolClient } from 'pg';
import { noticeClasses, writeNotice } from '@/lib/communication/notices';
import type { StaffRole } from '@/lib/auth/types';
import { chapterView, showcaseChapter } from '@/lib/family/chapters';
import { t, type Lang, type MessageKey } from '@/lib/i18n';

// What the school sees of the Family app's tutor (W16-B3, the proposal's M9), always as counts:
//
//   - Recent doubts: for a teacher's own classes (the office: every class), the last 14 days' questions of the class's
//     linked children, as subject, chapter, topic and how many. Read through family.doubts_for_class(), a definer
//     function that answers for the caller's own school and role only, and only for children whose family linked the
//     app, matched to an active student of that class, with the school's consent for the child's records and the
//     family's study consent in force. No name, no question, no account ever comes back.
//   - Weekly class summaries: the week's counts per class (children, sessions, questions, average quiz score, the three
//     chapters asked about most), for classes with three or more such children, read through
//     family.class_week_summary() by the principal or the school admin. "Draft the notices" writes one notice a class
//     through writeNotice, in that person's own name; like every notice it waits for the principal, whose approval is
//     what sends it. Nothing goes out without that approval.

type Actor = { schoolId: string; userId: string; role: StaffRole };
export const DOUBT_DAYS = 14;
export const DOUBT_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher'];
export const SUMMARY_ROLES: readonly string[] = ['principal', 'school_admin'];
const MAX_CLASSES = 60;

export type DoubtRow = { subject: string; chapter: string | null; topic: string | null; count: number };
export type ClassDoubts = { classId: string; className: string; doubts: DoubtRow[] };

// A showcase chapter's section title for a block id, in the reader's language.
function topicName(chapterKey: string | null, blockId: string | null, lang: Lang): string | null {
  if (!chapterKey || !blockId) return null;
  const chapter = showcaseChapter(chapterKey);
  if (!chapter) return null;
  const view = chapterView(chapter, lang);
  const b = view.blocks[view.ids.indexOf(blockId)];
  return b && 'title' in b && typeof b.title === 'string' ? b.title : null;
}
function chapterName(chapterKey: string | null, titles: { en: string | null; hi: string | null }, lang: Lang): string | null {
  if (!chapterKey) return null;
  const own = lang === 'hi' ? titles.hi : titles.en;
  if (own) return own;
  const showcase = showcaseChapter(chapterKey);
  return showcase ? (showcase.title[lang] ?? showcase.title.en) : null;
}

export async function readRecentDoubts(db: PoolClient, actor: Actor, lang: Lang): Promise<ClassDoubts[]> {
  if (!DOUBT_ROLES.includes(actor.role)) return [];
  const classes = (await noticeClasses(db, actor)).slice(0, MAX_CLASSES);
  const out: ClassDoubts[] = [];
  for (const c of classes) {
    const { rows } = await db.query(`select subject, chapter_key, topic_key, title_en, title_hi, doubts from family.doubts_for_class($1::uuid, $2::int)`, [c.class_id, DOUBT_DAYS]);
    const doubts = (rows as { subject: string; chapter_key: string | null; topic_key: string | null; title_en: string | null; title_hi: string | null; doubts: number }[]).map((r) => ({
      subject: r.subject,
      chapter: chapterName(r.chapter_key, { en: r.title_en, hi: r.title_hi }, lang),
      topic: topicName(r.chapter_key, r.topic_key, lang),
      count: Number(r.doubts),
    }));
    if (doubts.length) out.push({ classId: c.class_id, className: c.name, doubts });
  }
  return out;
}

// ---- weekly class summaries ---------------------------------------------------------------------------------------------
export type ClassSummary = { classId: string; className: string; children: number; sessions: number; questions: number; quizzes: number; quizPercent: number | null; chapters: string[] };

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
// The week the parents' reports were written for: on a Sunday the week ending today, otherwise the week before this one.
export function summaryWeek(today: string): string {
  const d = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, d === 0 ? -6 : 1 - d);
  return d === 0 ? monday : addDays(monday, -7);
}

export async function readClassSummaries(db: PoolClient, actor: Actor, lang: Lang, weekStart: string): Promise<ClassSummary[]> {
  if (!SUMMARY_ROLES.includes(actor.role)) return [];
  const { rows } = await db.query(
    `select s.class_id, c.name, s.children, s.sessions, s.questions, s.quizzes, s.quiz_percent, s.top_chapters, s.top_titles_en, s.top_titles_hi
       from family.class_week_summary($1::date) s join classes c on c.class_id = s.class_id and c.school_id = $2
      order by c.name, s.class_id`,
    [weekStart, actor.schoolId]
  );
  return (rows as { class_id: string; name: string; children: number; sessions: number; questions: number; quizzes: number; quiz_percent: number | null; top_chapters: string[]; top_titles_en: string[]; top_titles_hi: string[] }[]).map((r) => ({
    classId: r.class_id,
    className: r.name,
    children: Number(r.children),
    sessions: Number(r.sessions),
    questions: Number(r.questions),
    quizzes: Number(r.quizzes),
    quizPercent: r.quiz_percent === null ? null : Number(r.quiz_percent),
    chapters: r.top_chapters.map((k, i) => chapterName(k, { en: r.top_titles_en[i] || null, hi: r.top_titles_hi[i] || null }, lang)).filter((x): x is string => !!x),
  }));
}

export const weekText = (weekStart: string, lang: Lang) => new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const BODY: MessageKey = 'pai.summary.body';
// The notice's words: counts and chapter names, no child.
export function summaryBody(s: ClassSummary, weekStart: string, lang: Lang): string {
  const parts = [t(lang, BODY, { week: weekText(weekStart, lang), children: s.children, class: s.className, sessions: s.sessions })];
  if (s.chapters.length) parts.push(t(lang, 'pai.summary.bodyChapters', { chapters: s.chapters.join(', ') }));
  if (s.quizPercent !== null) parts.push(t(lang, 'pai.summary.bodyQuiz', { percent: s.quizPercent }));
  return parts.join(' ');
}

export type DraftResult = { ok: true; drafted: number; already: number } | { ok: false; reason: 'not_allowed' };
// One waiting notice a class, through writeNotice in the actor's own name; a class whose notice with the same words is
// already there (waiting, sent or rejected) is left alone, so pressing twice drafts once.
export async function draftClassSummaries(db: PoolClient, actor: Actor, lang: Lang, weekStart: string): Promise<DraftResult> {
  if (!SUMMARY_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  let drafted = 0;
  let already = 0;
  for (const s of await readClassSummaries(db, actor, lang, weekStart)) {
    const body = summaryBody(s, weekStart, lang);
    const there = (await db.query(`select 1 from class_notices where school_id = $1 and class_id = $2 and body = $3 limit 1`, [actor.schoolId, s.classId, body])).rows[0];
    if (there) {
      already += 1;
      continue;
    }
    const made = await writeNotice(db, actor, { classId: s.classId, body });
    if (made.ok) drafted += 1;
  }
  return { ok: true, drafted, already };
}
