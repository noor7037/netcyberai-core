import type { PoolClient } from 'pg';
import { activePromptVersion, prepareText, type AiContext, type SentText } from '@/lib/ai/platform';
import { parentReportPrompt, type ParentReportAsk } from '@/lib/ai/prompts/family.parent_report';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';
import { guarded } from './chapter-store';
import { showcaseChapter } from './chapters';
import { familyClaims, withFamilyContext, type FamilyClaims } from './db';
import { doneByChild } from './draw-done';
import { fill } from './fill';
import { activeLinks, notifyOff, schoolWeekFor, type FamilySchoolLink, type SchoolWeek } from './school';

// The weekly parent report (W16-B3, the proposal's M9; Programme W16 decision 6): one report a child a week, in the
// Family app (the parent area's Progress, and the notifications feed) and by email. Never by WhatsApp.
//
//   - Queued by ai.ops_daily on a Sunday in India (withWeeklyReports): one tutor.parent_report job an account with a
//     child who asked the tutor that week, idempotent on the account and the week. The platform only lists the accounts
//     (family.report_accounts(): ids and a token version); everything else runs in the family's OWN session.
//   - Written from counts, chapter names and quiz scores only: sessions, questions, chapters, quizzes, weak chapters,
//     minutes of voice and, for a child matched to a school with the school's consent, attendance days and results
//     published (as the guardian, through School Link). A child's words are never read for it: the reads below select
//     no body column, and the prompt is built from the counts alone.
//   - Four sentences in the family's language from family.parent_report; when the profile has no provider (or refuses,
//     or writes a number the counts do not have), the rules-only sentences from the same counts, so a report never waits
//     on a key.
//   - Stored in family.parent_reports (the family's own rows). The email (template family_weekly_report) goes to the
//     account's own address unless the parent turned notices off.

type Db = Pick<PoolClient, 'query'>;
export const TUTOR_PARENT_REPORT_JOB = 'tutor.parent_report';
export const WEAK_PERCENT = 60;
export const WEAK_ASKED = 3;
const MAX_CHAPTERS = 8;
const MAX_QUIZZES = 8;
const SENTENCE_MAX = 300;

// ---- the week, in India -----------------------------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
// The Monday that starts the week of this India date.
export const mondayOf = (iso: string): string => addDays(iso, 1 - isoWeekday(iso));
// The week's instants: from Monday 00:00 to the next Monday 00:00 in India, and its last day.
export function weekWindow(weekStart: string): { from: string; to: string; lastDay: string } {
  return { from: `${weekStart}T00:00:00+05:30`, to: `${addDays(weekStart, 7)}T00:00:00+05:30`, lastDay: addDays(weekStart, 6) };
}

// ---- the counts (pure) ------------------------------------------------------------------------------------------------
export type AskedRow = { conversationId: string; day: string; chapterKey: string | null; n: number };
export type QuizRow = { chapterKey: string; correct: number; total: number };
export type ReportCounts = {
  sessions: number;
  questions: number;
  chapters: { key: string; name: string; asked: number }[];
  quizzes: { chapter: string; percent: number }[];
  quizAverage: number | null;
  weak: string[];
  voiceMinutes: number;
  school: SchoolWeek | null;
  // C514: drawing templates completed in the week (a count only, never a score). Absent in reports written before it.
  drawings?: number;
};

// A session is a conversation on one India day with at least one question; chapters are those asked about from the
// reader and those quizzed; a chapter is weak when its last quiz of the week is under WEAK_PERCENT or it was asked about three
// times or more.
export function buildCounts(input: { asked: readonly AskedRow[]; quizzes: readonly QuizRow[]; voiceSeconds: number; name: (key: string) => string; school: SchoolWeek | null; drawings?: number }): ReportCounts {
  const sessions = new Set(input.asked.map((r) => `${r.conversationId}:${r.day}`)).size;
  const questions = input.asked.reduce((n, r) => n + r.n, 0);
  const askedBy = new Map<string, number>();
  for (const r of input.asked) if (r.chapterKey) askedBy.set(r.chapterKey, (askedBy.get(r.chapterKey) ?? 0) + r.n);
  const lastQuiz = new Map<string, number>();
  const quizzes = input.quizzes.filter((q) => q.total > 0).map((q) => ({ key: q.chapterKey, percent: Math.round((100 * q.correct) / q.total) }));
  for (const q of quizzes) lastQuiz.set(q.key, q.percent);
  const keys = [...askedBy.keys()].sort((a, b) => (askedBy.get(b) ?? 0) - (askedBy.get(a) ?? 0) || a.localeCompare(b));
  for (const q of quizzes) if (!keys.includes(q.key)) keys.push(q.key);
  const chapters = keys.slice(0, MAX_CHAPTERS).map((key) => ({ key, name: input.name(key), asked: askedBy.get(key) ?? 0 }));
  const weak = keys.filter((k) => (askedBy.get(k) ?? 0) >= WEAK_ASKED || (lastQuiz.has(k) && (lastQuiz.get(k) ?? 100) < WEAK_PERCENT)).map((k) => input.name(k));
  const shown = quizzes.slice(-MAX_QUIZZES);
  return {
    sessions,
    questions,
    chapters,
    quizzes: shown.map((q) => ({ chapter: input.name(q.key), percent: q.percent })),
    quizAverage: quizzes.length ? Math.round(quizzes.reduce((n, q) => n + q.percent, 0) / quizzes.length) : null,
    weak: [...new Set(weak)].slice(0, MAX_CHAPTERS),
    voiceMinutes: Math.round(Math.max(0, input.voiceSeconds) / 60),
    school: input.school,
    ...(input.drawings ? { drawings: Math.max(0, Math.floor(input.drawings)) } : {}),
  };
}

// What the model is given: the counts, nothing else.
export function askOf(c: ReportCounts, lang: Lang): ParentReportAsk {
  return { lang, sessions: c.sessions, questions: c.questions, chapters: c.chapters.map((x) => x.name), quizzes: c.quizzes, weak: c.weak, voiceMinutes: c.voiceMinutes, school: c.school };
}

const list = (_lang: Lang, names: readonly string[]) => names.join(', ');

// The rules-only report: four sentences from the same counts, in the family's language.
export function rulesSentences(c: ReportCounts, lang: Lang): string[] {
  const s1 = c.voiceMinutes > 0 ? t(lang, 'fam.report.s.studiedVoice', { sessions: c.sessions, questions: c.questions, minutes: c.voiceMinutes }) : t(lang, 'fam.report.s.studied', { sessions: c.sessions, questions: c.questions });
  const s2 = c.chapters.length ? t(lang, 'fam.report.s.chapters', { chapters: list(lang, c.chapters.map((x) => x.name)) }) : t(lang, 'fam.report.s.noChapters');
  const s3 =
    c.quizAverage !== null
      ? t(lang, 'fam.report.s.quizzes', { n: c.quizzes.length, percent: c.quizAverage })
      : c.school && c.school.markedDays > 0
        ? t(lang, 'fam.report.s.school', { present: c.school.presentDays, marked: c.school.markedDays })
        : t(lang, 'fam.report.s.noQuiz');
  const s4 = c.weak.length ? t(lang, 'fam.report.s.weak', { chapters: list(lang, c.weak) }) : t(lang, 'fam.report.s.allGood');
  return [s1, s2, s3, s4];
}

// The numbers the counts hold (and any number inside a chapter's or an exam's name).
function allowedNumbers(c: ReportCounts): Set<string> {
  const n = new Set<string>();
  const add = (v: number | null | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v)) n.add(String(v));
  };
  [c.sessions, c.questions, c.voiceMinutes, c.quizAverage, c.quizzes.length, c.chapters.length, c.drawings].forEach(add);
  c.quizzes.forEach((q) => add(q.percent));
  if (c.school) {
    add(c.school.presentDays);
    add(c.school.markedDays);
    c.school.results.forEach((r) => add(r.percent));
  }
  const names = [...c.chapters.map((x) => x.name), ...c.quizzes.map((q) => q.chapter), ...(c.school?.results.map((r) => r.exam) ?? [])];
  for (const name of names) for (const m of name.match(/\d+/g) ?? []) n.add(String(Number(m)));
  return n;
}
const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

// The model's answer, kept only when it is three to six plain sentences, every number in it is one the counts hold and
// no child's name is in it; the first four are kept. null otherwise (the rules-only report is written instead).
export function checkedSentences(text: string, c: ReportCounts, childNames: readonly string[]): string[] | null {
  const plain = asciiDigits(text.replace(/\s+/g, ' ').trim());
  if (!plain || /[{}[\]#*<>]/.test(plain)) return null;
  const sentences = plain.split(/(?<=[.!?।])\s+/u).map((s) => s.trim()).filter(Boolean);
  if (sentences.length < 3 || sentences.length > 6 || sentences.some((s) => s.length > SENTENCE_MAX)) return null;
  const allowed = allowedNumbers(c);
  for (const m of plain.match(/\d+/g) ?? []) if (!allowed.has(String(Number(m)))) return null;
  const lower = plain.toLowerCase();
  if (childNames.some((name) => name && new RegExp(`(^|[^\\p{L}])${escapeRe(name.toLowerCase())}($|[^\\p{L}])`, 'u').test(lower))) return null;
  return sentences.slice(0, 4);
}

export type ReportBody = { v: 1; lang: Lang; source: 'ai' | 'rules'; counts: ReportCounts; sentences: string[] };

// ---- the family's own reads (in its own session) -----------------------------------------------------------------------
type ChildRow = { childId: string; firstName: string };
type AccountWeek = { email: string; lang: Lang; off: string[]; children: ChildRow[]; asked: Map<string, AskedRow[]>; quizzes: Map<string, QuizRow[]>; voice: Map<string, number>; drawings: Map<string, number>; titles: Map<string, { en: string; hi: string }>; links: FamilySchoolLink[] };

const push = <V>(m: Map<string, V[]>, k: string, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

// Counts only: no body, no answer and no file is selected.
async function readAccountWeek(db: Db, accountId: string, weekStart: string): Promise<AccountWeek | null> {
  const w = weekWindow(weekStart);
  const account = (await db.query(`select email, ui_language from family.accounts where account_id = $1`, [accountId])).rows[0] as { email: string; ui_language: string } | undefined;
  if (!account) return null;
  const children = ((await db.query(`select child_id, first_name from family.children where account_id = $1 order by first_name, child_id`, [accountId])).rows as { child_id: string; first_name: string }[]).map((r) => ({ childId: String(r.child_id), firstName: String(r.first_name) }));
  const asked = new Map<string, AskedRow[]>();
  for (const r of (
    await db.query(
      `select child_id, conversation_id, (created_at at time zone 'Asia/Kolkata')::date::text as day, chapter_key, count(*)::int as n
         from family.tutor_messages
        where account_id = $1 and role = 'child' and created_at >= $2::timestamptz and created_at < $3::timestamptz
        group by 1, 2, 3, 4`,
      [accountId, w.from, w.to]
    )
  ).rows as { child_id: string; conversation_id: string; day: string; chapter_key: string | null; n: number }[])
    push(asked, String(r.child_id), { conversationId: String(r.conversation_id), day: r.day, chapterKey: r.chapter_key, n: Number(r.n) });
  const quizzes = new Map<string, QuizRow[]>();
  for (const r of (
    await db.query(
      `select child_id, chapter_key, mcq_correct, mcq_total from family.chapter_test_attempts
        where account_id = $1 and mcq_total > 0 and submitted_at >= $2::timestamptz and submitted_at < $3::timestamptz order by submitted_at, attempt_id`,
      [accountId, w.from, w.to]
    )
  ).rows as { child_id: string; chapter_key: string; mcq_correct: number; mcq_total: number }[])
    push(quizzes, String(r.child_id), { chapterKey: r.chapter_key, correct: Number(r.mcq_correct), total: Number(r.mcq_total) });
  const voice = new Map<string, number>();
  for (const r of (await db.query(`select child_id, coalesce(sum(voice_seconds), 0)::int as s from family.day_counts where account_id = $1 and day >= $2::date and day <= $3::date group by child_id`, [accountId, weekStart, w.lastDay])).rows as { child_id: string; s: number }[])
    voice.set(String(r.child_id), Number(r.s));
  const keys = [...new Set([...[...asked.values()].flat().map((r) => r.chapterKey), ...[...quizzes.values()].flat().map((q) => q.chapterKey)].filter((k): k is string => !!k))];
  const titles = new Map<string, { en: string; hi: string }>();
  if (keys.length) {
    for (const r of (await db.query(`select distinct on (chapter_key) chapter_key, title_en, title_hi from content.chapter_contents where chapter_key = any($1::text[]) order by chapter_key, version_no desc`, [keys])).rows as { chapter_key: string; title_en: string; title_hi: string }[])
      titles.set(r.chapter_key, { en: r.title_en, hi: r.title_hi });
  }
  return { email: String(account.email), lang: account.ui_language === 'hi' ? 'hi' : 'en', off: await notifyOff(db, accountId), children, asked, quizzes, voice, drawings: await doneByChild(db, accountId, w.from, w.to), titles, links: await activeLinks(db, accountId) };
}

// A chapter's name in the family's language: a published chapter's title, else the showcase chapter's, else the key
// read as words.
export function chapterName(key: string, lang: Lang, titles: ReadonlyMap<string, { en: string; hi: string }>): string {
  const found = titles.get(key);
  if (found) return lang === 'hi' ? found.hi : found.en;
  const showcase = showcaseChapter(key);
  if (showcase) return showcase.title[lang] ?? showcase.title.en;
  return key.replace(/[._-]+/g, ' ').trim();
}

// ---- the job ------------------------------------------------------------------------------------------------------------
export type ReportJob = { payload: Record<string, unknown>; attempts: number };
export type ReportQueue = { enqueue(db: Db, spec: { type: string; payload: Record<string, unknown>; idempotencyKey: string; maxAttempts?: number; schoolId?: string | null }): Promise<unknown> };
export type ReportPlatform = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
// A stand-in for the AI call, for tests: given the prompt, the model's text or null.
export type ReportWriter = (prompt: { system: string; user: string; ask: ParentReportAsk }) => Promise<string | null>;
export type ReportDeps = {
  platform: ReportPlatform;
  queue: ReportQueue;
  family?: <T>(claims: FamilyClaims, fn: (db: Db) => Promise<T>) => Promise<T>;
  school?: (claims: FamilyClaims, links: readonly FamilySchoolLink[], childId: string, from: string, to: string) => Promise<SchoolWeek | null>;
  write?: ReportWriter;
  now?: () => Date;
};
export type WrittenReport = { childId: string; source: 'ai' | 'rules'; emailed: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const reportJobKey = (accountId: string, weekStart: string) => `${TUTOR_PARENT_REPORT_JOB}:${accountId}:${weekStart}`;

// One account's reports for one week. Idempotent: a second run rewrites the same rows and finds the email jobs queued.
export async function writeWeeklyReports(deps: ReportDeps, accountId: string, weekStart: string): Promise<WrittenReport[]> {
  if (!UUID.test(accountId) || !ISO.test(weekStart) || isoWeekday(weekStart) !== 1) return [];
  const w = weekWindow(weekStart);
  const family = deps.family ?? (withFamilyContext as unknown as NonNullable<ReportDeps['family']>);
  const school = deps.school ?? schoolWeekFor;
  const listed = await deps.platform(async (db) => (await db.query(`select account_id, token_version from family.report_accounts($1::timestamptz, $2::timestamptz, $3::uuid)`, [w.from, w.to, accountId])).rows as { account_id: string; token_version: number }[]);
  if (!listed[0]) return [];
  const claims = familyClaims({ accountId, tokenVersion: Number(listed[0].token_version) });
  const day = indiaDate(deps.now?.() ?? new Date());
  const ctxOf = (week: AccountWeek): AiContext => ({ accountId, childFirstNames: week.children.map((c) => c.firstName), day });

  type Plan = { child: ChildRow; counts: ReportCounts; ask: ParentReportAsk; prompt: { system: string; user: string }; prepared: Awaited<ReturnType<typeof prepareText>> | null };
  // Read the week and, with no school to ask, prepare the AI calls in the same transaction.
  const plan = async (db: Db, week: AccountWeek, schoolOf: Map<string, SchoolWeek | null>): Promise<Plan[]> => {
    const version = deps.write ? null : await activePromptVersion(db as never, 'family.parent_report');
    const prompt = parentReportPrompt(version);
    const out: Plan[] = [];
    for (const child of week.children) {
      const asked = week.asked.get(child.childId) ?? [];
      if (asked.length === 0) continue;
      const counts = buildCounts({ asked, quizzes: week.quizzes.get(child.childId) ?? [], voiceSeconds: week.voice.get(child.childId) ?? 0, name: (k) => chapterName(k, week.lang, week.titles), school: schoolOf.get(child.childId) ?? null, drawings: week.drawings.get(child.childId) ?? 0 });
      const ask = askOf(counts, week.lang);
      const p = { system: prompt.system(week.lang), user: prompt.user(ask) };
      const prepared = deps.write ? null : await prepareText(db as never, ctxOf(week), 'family.parent_report', { system: p.system, messages: [{ role: 'user', content: p.user }], maxTokens: 400, temperature: 0.2 });
      out.push({ child, counts, ask, prompt: p, prepared });
    }
    return out;
  };

  let week: AccountWeek | null = null;
  let plans: Plan[] = await family(claims, async (db) => {
    week = await readAccountWeek(db, accountId, weekStart);
    if (!week || week.links.length > 0) return [];
    return plan(db, week, new Map());
  });
  const read = week as AccountWeek | null;
  if (!read) return [];
  if (read.links.length > 0) {
    const schoolOf = new Map<string, SchoolWeek | null>();
    for (const c of read.children) if ((read.asked.get(c.childId) ?? []).length) schoolOf.set(c.childId, await school(claims, read.links, c.childId, weekStart, w.lastDay));
    plans = await family(claims, (db) => plan(db, read, schoolOf));
  }
  if (plans.length === 0) return [];

  // The calls, with no connection held.
  const names = read.children.map((c) => c.firstName);
  const results: { plan: Plan; body: ReportBody; sent: SentText | null }[] = [];
  for (const p of plans) {
    let text: string | null = null;
    let sent: SentText | null = null;
    if (deps.write) text = await deps.write({ ...p.prompt, ask: p.ask }).catch(() => null);
    else if (p.prepared?.ok) {
      sent = await p.prepared.text.send().catch(() => null);
      text = sent?.result.ok ? sent.result.text : null;
    }
    const checked = text ? checkedSentences(text, p.counts, names) : null;
    results.push({ plan: p, sent, body: { v: 1, lang: read.lang, source: checked ? 'ai' : 'rules', counts: p.counts, sentences: checked ?? rulesSentences(p.counts, read.lang) } });
  }

  await family(claims, async (db) => {
    for (const r of results) {
      if (r.sent) await r.sent.record(db as never);
      await db.query(
        `insert into family.parent_reports (account_id, child_id, week_start, body) values ($1, $2, $3::date, $4::jsonb)
         on conflict (account_id, child_id, week_start) do update set body = excluded.body, created_at = now()`,
        [accountId, r.plan.child.childId, weekStart, JSON.stringify(r.body)]
      );
    }
  });

  const mail = EMAIL.test(read.email) && !read.off.includes('notices');
  if (mail) {
    await deps.platform(async (db) => {
      for (const r of results) {
        await deps.queue.enqueue(db, {
          type: 'email.send',
          idempotencyKey: `email.send:${TUTOR_PARENT_REPORT_JOB}:${accountId}:${r.plan.child.childId}:${weekStart}`,
          maxAttempts: 4,
          payload: { to: [read.email], template: 'family_weekly_report', data: { lang: read.lang, childName: r.plan.child.firstName, weekStart, sentences: r.body.sentences.join('\n') } },
        });
      }
    });
  }
  return results.map((r) => ({ childId: r.plan.child.childId, source: r.body.source, emailed: mail }));
}

// tutor.parent_report: payload { accountId, week }. A bad payload or an account gone does nothing and succeeds.
export function parentReportHandler(deps: ReportDeps) {
  return async (job: ReportJob): Promise<{ redact: string[] }> => {
    const { accountId, week } = job.payload as { accountId?: unknown; week?: unknown };
    if (typeof accountId === 'string' && typeof week === 'string') await writeWeeklyReports(deps, accountId, week);
    return { redact: [] };
  };
}

// The week's jobs, one an account with a child who asked the tutor that week. Returns how many were queued (or found).
export async function enqueueWeeklyReports(deps: Pick<ReportDeps, 'platform' | 'queue'>, weekStart: string): Promise<number> {
  if (!ISO.test(weekStart) || isoWeekday(weekStart) !== 1) return 0;
  const w = weekWindow(weekStart);
  return deps.platform(async (db) => {
    const accounts = (await db.query(`select account_id from family.report_accounts($1::timestamptz, $2::timestamptz, null)`, [w.from, w.to])).rows as { account_id: string }[];
    for (const a of accounts) await deps.queue.enqueue(db, { type: TUTOR_PARENT_REPORT_JOB, idempotencyKey: reportJobKey(a.account_id, weekStart), maxAttempts: 3, payload: { accountId: a.account_id, week: weekStart } });
    return accounts.length;
  });
}

// ai.ops_daily, with the weekly reports: the inner job runs first; on a Sunday in India (the job's date, or today) the
// week that ends that day is queued.
export function withWeeklyReports<J extends ReportJob, O>(inner: (job: J) => Promise<O>, deps: Pick<ReportDeps, 'platform' | 'queue' | 'now'>): (job: J) => Promise<O> {
  return async (job) => {
    const out = await inner(job);
    const asked = job.payload.date;
    const today = typeof asked === 'string' && ISO.test(asked) ? asked : indiaDate(deps.now?.() ?? new Date());
    if (isoWeekday(today) === 7) await enqueueWeeklyReports(deps, mondayOf(today));
    return out;
  };
}

// ---- reading it back (the parent area, the feed) ---------------------------------------------------------------------
export type StoredReport = { weekStart: string; body: ReportBody };
// Read under a savepoint, so a database without the table yet shows no report instead of failing the page.
export async function listReports(db: Db, accountId: string, childId: string, limit = 4): Promise<StoredReport[]> {
  return guarded(db as never, 'parent_reports_read', () => readReports(db, accountId, childId, limit), []);
}
async function readReports(db: Db, accountId: string, childId: string, limit: number): Promise<StoredReport[]> {
  const { rows } = await db.query(`select week_start::text as week_start, body from family.parent_reports where account_id = $1 and child_id = $2 order by week_start desc limit $3`, [accountId, childId, Math.min(Math.max(limit, 1), 12)]);
  return (rows as { week_start: string; body: ReportBody }[]).map((r) => ({ weekStart: r.week_start, body: r.body }));
}

// The newest report of this child made in the last days, for the notifications feed.
export const REPORT_FEED_DAYS = 7;
export async function latestReportFor(db: Db, accountId: string, childId: string): Promise<{ weekStart: string } | null> {
  const r = (await db.query(`select week_start::text as week_start from family.parent_reports where account_id = $1 and child_id = $2 and created_at > now() - ($3::int * interval '1 day') order by week_start desc limit 1`, [accountId, childId, REPORT_FEED_DAYS])).rows[0] as { week_start: string } | undefined;
  return r ? { weekStart: r.week_start } : null;
}

// The heading a parent reads: "This week with Asha" (the feed, the email's subject, the Progress card).
export const reportTitle = (lang: Lang, firstName: string): string => fill(t(lang, REPORT_TITLE), { child: firstName });
const REPORT_TITLE: MessageKey = 'fam.report.title';
