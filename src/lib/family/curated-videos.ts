import type { FamilyChild } from './children';
import type { Line } from './resolver';
import type { Subject } from './subjects';
import { overlap, words, KEEP, type VideoLanguage } from './videos';

// Curated videos (Noor, 16 Nov 2026): a person's chosen YouTube videos per class, subject and topic, kept in
// content.curated_topic_videos (seeded from the reviewed topic map by scripts/seed_curated_videos.ts). Before a search,
// the finder looks for one matching the child's class, the topic's subject and words and the language; a match is read
// with the search's results so it passes the same live checks, and is shown first (videos.ts rankVideos `curated`).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// ---- the topic map file -------------------------------------------------------------------------------------------

// RFC 4180 CSV: quoted fields may hold commas, line breaks and doubled quotes. Returns the rows as string arrays.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export type CuratedRow = {
  channel_id: string;
  class: string;
  subject: string;
  chapter_number: string;
  chapter_name: string;
  topic: string;
  question_type: string;
  video_id: string;
  title: string;
  url: string;
  duration_s: number;
  language: VideoLanguage;
};

// The topic map's language names; Hinglish is taught in Hindi and English together, so it serves Hindi.
const LANGUAGES: Record<string, VideoLanguage> = {
  english: 'en', hindi: 'hi', hinglish: 'hi', bengali: 'bn', telugu: 'te', marathi: 'mr', tamil: 'ta', urdu: 'ur',
  gujarati: 'gu', kannada: 'kn', malayalam: 'ml', odia: 'or', oriya: 'or', punjabi: 'pa', assamese: 'as',
};
const COLUMNS = ['channel_id', 'class', 'subject', 'chapter_number', 'chapter_name', 'topic', 'question_type', 'video_title', 'video_url', 'duration_mm_ss', 'language'] as const;

export function videoIdOf(url: string): string | null {
  const m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(url.trim());
  return m ? m[1] : null;
}
export function clockSeconds(t: string): number | null {
  const parts = t.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.slice(1).some((v) => v >= 60)) return null;
  return n.reduce((s, v) => s * 60 + v, 0);
}
const clean = (v: string | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// The topic map's rows as table rows, and the lines that could not be read (1-based, the header is line 1).
export function curatedRowsFromCsv(text: string): { rows: CuratedRow[]; skipped: { line: number; why: string }[] } {
  const [header, ...body] = parseCsv(text);
  const at = new Map((header ?? []).map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = COLUMNS.filter((c) => !at.has(c));
  if (missing.length) throw new Error(`the file has no column ${missing.join(', ')}`);
  const col = (r: string[], c: (typeof COLUMNS)[number]) => r[at.get(c)!] ?? '';
  const rows: CuratedRow[] = [];
  const skipped: { line: number; why: string }[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const line = i + 2;
    const url = clean(col(r, 'video_url'), 300);
    const videoId = videoIdOf(url);
    const language = LANGUAGES[clean(col(r, 'language'), 30).toLowerCase()];
    const durationS = clockSeconds(col(r, 'duration_mm_ss'));
    const channelId = clean(col(r, 'channel_id'), 40);
    const topic = clean(col(r, 'topic'), 200);
    const title = clean(col(r, 'video_title'), 300);
    const why = !videoId ? 'video_url' : !language ? 'language' : !durationS || durationS > 36000 ? 'duration' : !/^[A-Za-z0-9_-]{2,40}$/.test(channelId) ? 'channel_id' : !topic ? 'topic' : !title ? 'video_title' : !clean(col(r, 'class'), 20) ? 'class' : !clean(col(r, 'subject'), 80) ? 'subject' : null;
    if (why) return void skipped.push({ line, why });
    const key = `${videoId}|${topic}|${language}`;
    if (seen.has(key)) return void skipped.push({ line, why: 'duplicate' });
    seen.add(key);
    rows.push({
      channel_id: channelId,
      class: clean(col(r, 'class'), 20),
      subject: clean(col(r, 'subject'), 80),
      chapter_number: clean(col(r, 'chapter_number'), 20).replace(/^n\/a$/i, ''),
      chapter_name: clean(col(r, 'chapter_name'), 200).replace(/^n\/a$/i, ''),
      topic,
      question_type: clean(col(r, 'question_type'), 40),
      video_id: videoId!,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      duration_s: durationS!,
      language: language!,
    });
  });
  return { rows, skipped };
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
// One idempotent statement: a row already there (the same video, topic and language) is updated, never doubled.
export function curatedUpsertSql(rows: readonly CuratedRow[]): string {
  if (!rows.length) return '';
  const values = rows
    .map((r) => `  (${[r.channel_id, r.class, r.subject, r.chapter_number, r.chapter_name, r.topic, r.question_type, r.video_id, r.title, r.url].map(lit).join(', ')}, ${Math.floor(r.duration_s)}, ${lit(r.language)})`)
    .join(',\n');
  return `insert into content.curated_topic_videos (channel_id, class, subject, chapter_number, chapter_name, topic, question_type, video_id, title, url, duration_s, language) values\n${values}\non conflict (video_id, topic, language) do update set channel_id = excluded.channel_id, class = excluded.class, subject = excluded.subject, chapter_number = excluded.chapter_number, chapter_name = excluded.chapter_name, question_type = excluded.question_type, title = excluded.title, url = excluded.url, duration_s = excluded.duration_s;\n`;
}

// ---- matching -----------------------------------------------------------------------------------------------------

// Pre-school stages before Class 1.
const STAGES: Record<string, number> = { nursery: -2, prenursery: -3, lkg: -1, ukg: 0 };
const level = (v: string): number | null => {
  const s = v.trim().toLowerCase().replace(/^class\s*/, '').replace(/[^a-z0-9]/g, '');
  if (/^\d{1,2}$/.test(s)) return Number(s);
  return STAGES[s] ?? null;
};
// Whether a class ("7", "6-12", "LKG-UKG", "LKG-1") holds the child's class.
export function classFits(cls: string, classLevel: number): boolean {
  const [a, b] = cls.split(/\s*[-–]\s*/);
  const lo = level(a ?? '');
  const hi = b === undefined ? lo : level(b);
  return lo !== null && hi !== null && classLevel >= Math.min(lo, hi) && classLevel <= Math.max(lo, hi);
}

// The topic map's subject names, as the app's subject ids (a broad one serves its parts and the reverse).
const SUBJECT_NAMES: Record<string, readonly Subject[] | 'any'> = {
  maths: ['mathematics'], math: ['mathematics'], mathematics: ['mathematics'],
  science: ['science', 'physics', 'chemistry', 'biology', 'evs'],
  physics: ['physics', 'science'], chemistry: ['chemistry', 'science'], biology: ['biology', 'science'],
  evs: ['evs', 'science'],
  social: ['social_science', 'history', 'geography', 'political_science', 'economics'],
  'social science': ['social_science', 'history', 'geography', 'political_science', 'economics'],
  history: ['history', 'social_science'], geography: ['geography', 'social_science'], civics: ['political_science', 'social_science'],
  'political science': ['political_science', 'social_science'], economics: ['economics', 'social_science'],
  english: ['english'], hindi: ['hindi'], sanskrit: ['sanskrit'],
  'computer science': ['computer_science', 'informatics_practices'], ai: ['computer_science', 'informatics_practices'], computer: ['computer_science', 'informatics_practices'],
  'all subjects': 'any', gk: 'any', 'general knowledge': 'any',
};
export function subjectFits(subject: string, s: Subject): boolean {
  return subject
    .toLowerCase()
    .split(/\s*[,/&]\s*/)
    .some((name) => {
      const ids = SUBJECT_NAMES[name.trim()];
      return ids === 'any' || (Array.isArray(ids) && ids.includes(s));
    });
}

export type CuratedVideo = { videoId: string; channelId: string; class: string; subject: string; chapterName: string; topic: string };
// How closely a curated topic fits the line (0 to 1): its words in the line's, or the line's in its.
export function curatedFit(c: Pick<CuratedVideo, 'topic' | 'chapterName'>, line: Pick<Line, 'topicEn' | 'title' | 'chapterEn'>): number {
  const lineText = [line.topicEn ?? '', line.title, line.chapterEn].join(' ');
  const topicFit = Math.max(overlap(words(c.topic), lineText), overlap(words([line.topicEn ?? '', line.title].join(' ')), c.topic));
  const chapterFit = c.chapterName ? overlap(words(c.chapterName), lineText) : 0;
  return Math.max(topicFit, chapterFit * 0.8);
}
export const CURATED_MIN_FIT = 0.5;

// The curated videos for a line, best fit first (at most KEEP). A table not created yet reads as none.
export function matchCurated(rows: readonly CuratedVideo[], line: Pick<Line, 'subject' | 'topicEn' | 'title' | 'chapterEn'>, child: Pick<FamilyChild, 'classLevel'>): string[] {
  const fits = rows
    .filter((r) => classFits(r.class, child.classLevel) && subjectFits(r.subject, line.subject))
    .map((r) => ({ id: r.videoId, fit: curatedFit(r, line) }))
    .filter((r) => r.fit >= CURATED_MIN_FIT)
    .sort((a, b) => b.fit - a.fit);
  return Array.from(new Set(fits.map((f) => f.id))).slice(0, KEEP);
}

export async function curatedFor(db: Db, line: Line, child: Pick<FamilyChild, 'classLevel'>, language: VideoLanguage): Promise<string[]> {
  await db.query('savepoint curated_videos');
  try {
    const { rows } = await db.query(`select video_id, channel_id, class, subject, chapter_name, topic from content.curated_videos($1)`, [language]);
    await db.query('release savepoint curated_videos');
    return matchCurated(
      rows.map((r) => ({ videoId: String(r.video_id), channelId: String(r.channel_id), class: String(r.class), subject: String(r.subject), chapterName: String(r.chapter_name ?? ''), topic: String(r.topic) })),
      line,
      child
    );
  } catch (err) {
    if ((err as { code?: string }).code !== '42883') throw err;
    await db.query('rollback to savepoint curated_videos');
    return [];
  }
}
