import { loadChildSettings, meaningLangOf } from './child-settings';
import type { FamilyChild } from './children';
import { drawTemplate } from './draw-templates';
import { syllabusLine, type Line } from './resolver';
import { isSubject } from './subjects';
import { topicVideos, type WithDb } from './video-finder';
import type { VideoLanguage, VideoPick } from './videos';

// C522: two to four videos under any tutor answer, typed, photo or drawing, whenever a topic can be named from what the
// pipeline already has, with no AI call and never from a child's words (the search is our own catalog text):
//   1. the syllabus line the question matched;
//   2. a drawing template's own registry entry (its chapter when it names one, else its title, keyed by class);
//   3. the chapter of the best library passage retrieved for the question, read again from the child's own syllabus.
// The videos are in the language the child's settings name for meanings (meaningLang, all of languages.ts; else the
// app's language); when that language has too few, the app's language (English or Hindi) is used and the card says so.

export const MIN_SHOWN = 2;

export type VideoTopic = { line: Line; child: FamilyChild; accountId: string; language: VideoLanguage };
export type AnswerVideos = { picks: VideoPick[]; topicKey: string; language: VideoLanguage; wanted: VideoLanguage | null };

type Db = Parameters<Parameters<WithDb>[0]>[0];

const TOPIC = /^[a-z0-9][a-z0-9._-]{2,119}$/;

// The topic for an answer's videos, or null when none can be named.
export async function videoTopicOf(
  db: Db,
  a: { line: Line | null; passages: readonly { chapterKey: string; score: number }[]; drawTemplate: string | null; child: FamilyChild; accountId: string }
): Promise<VideoTopic | null> {
  const language = meaningLangOf(await loadChildSettings(db, a.accountId, a.child.childId), a.child.language);
  const line = a.line ?? (await drawLine(db, a.drawTemplate, a.child)) ?? (await passageLine(db, a.passages, a.child));
  return line && TOPIC.test(line.key) ? { line, child: a.child, accountId: a.accountId, language } : null;
}

async function drawLine(db: Db, id: string | null, child: FamilyChild): Promise<Line | null> {
  const t = id ? drawTemplate(id) : null;
  // An activity kind (colour, learn, play, art) is not a school topic: no videos.
  if (!t || t.cat || !isSubject(t.subject)) return null;
  if (t.chapterKey) return syllabusLine(db, child, { kind: 'chapter', key: t.chapterKey });
  return { subject: t.subject, key: `draw.c${child.classLevel}.${t.id}`, chapterEn: t.title.en, topicEn: t.title.en, title: child.language === 'hi' ? t.title.hi : t.title.en };
}

async function passageLine(db: Db, passages: readonly { chapterKey: string; score: number }[], child: FamilyChild): Promise<Line | null> {
  const best = [...passages].sort((x, y) => y.score - x.score).slice(0, 2);
  for (const p of best) {
    const line = await syllabusLine(db, child, { kind: 'chapter', key: p.chapterKey });
    if (line) return line;
  }
  return null;
}

// The languages tried, in order: the chosen one, then the app's (English or Hindi), then English after Hindi.
export function videoLanguages(wanted: VideoLanguage, app: 'en' | 'hi'): VideoLanguage[] {
  const out: VideoLanguage[] = [wanted];
  if (wanted !== app) out.push(app);
  else if (wanted === 'hi') out.push('en');
  return out;
}

// The answer's videos: the first language with at least MIN_SHOWN picks (cached, else one claimed refresh from the
// day's quota), or null. `wanted` is set when a fallback language is shown.
export async function answerVideos(withDb: WithDb, t: VideoTopic): Promise<AnswerVideos | null> {
  for (const language of videoLanguages(t.language, t.child.language)) {
    const picks = await topicVideos(withDb, t.line, t.child, language).catch(() => []);
    if (picks.length >= MIN_SHOWN) return { picks, topicKey: t.line.key, language, wanted: language === t.language ? null : t.language };
  }
  return null;
}
