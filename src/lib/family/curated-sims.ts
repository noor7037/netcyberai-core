import type { FamilyChild } from './children';
import { classFits, parseCsv, subjectFits } from './curated-videos';
import { words } from './videos';
import type { Subject } from './subjects';
import { checkSim, SIM_SOURCES, type ElabSim } from './sim-hosts';

// Curated simulations (Noor, 16 Nov 2026): the AI never searches the web for one. A person approved each, per class, subject, topic
// and language, in content.curated_topic_sims (seeded by scripts/seed_curated_sims.ts from scripts/seed/curated_sims.csv). An
// answer's step 4 shows the best match as a "Try it yourself" card beside the photos. No match: the answer stays as it was.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type SimRow = { class: string; subject: string; chapter_name: string; topic: string; language: string; source: string; title: string; embed_url: string; page_url: string; licence: string; preview: string | null; chapter_number: string };
const COLUMNS = ['class', 'subject', 'chapter_name', 'topic', 'language', 'source', 'title', 'embed_url', 'page_url', 'licence'] as const;
const clean = (v: string | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function simRowsFromCsv(text: string): { rows: SimRow[]; skipped: { line: number; why: string }[] } {
  const [header, ...body] = parseCsv(text);
  const at = new Map((header ?? []).map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = COLUMNS.filter((c) => !at.has(c));
  if (missing.length) throw new Error(`the file has no column ${missing.join(', ')}`);
  const col = (r: string[], c: string) => r[at.get(c) ?? -1] ?? '';
  const rows: SimRow[] = [];
  const skipped: { line: number; why: string }[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const line = i + 2;
    const source = clean(col(r, 'source'), 30);
    const row: SimRow = {
      class: clean(col(r, 'class'), 20), subject: clean(col(r, 'subject'), 80), chapter_number: clean(col(r, 'chapter_number'), 20), chapter_name: clean(col(r, 'chapter_name'), 200),
      topic: clean(col(r, 'topic'), 200), language: clean(col(r, 'language'), 5), source, title: clean(col(r, 'title'), 160), embed_url: clean(col(r, 'embed_url'), 600),
      page_url: clean(col(r, 'page_url'), 600), licence: clean(col(r, 'licence'), 160), preview: clean(col(r, 'preview'), 100) || null,
    };
    const card = checkSim({ source, title: row.title, embed: row.embed_url, page: row.page_url, licence: row.licence, preview: row.preview ?? undefined });
    const why = !SIM_SOURCES.includes(source) ? 'source' : !card ? 'address' : !row.class || !row.subject ? 'class or subject' : !row.topic ? 'topic' : !/^[a-z]{2}$/.test(row.language) ? 'language' : !row.title ? 'title' : '';
    if (why) return void skipped.push({ line, why });
    const key = `${row.embed_url}|${row.class}|${row.subject}|${row.topic}|${row.language}`;
    if (seen.has(key)) return void skipped.push({ line, why: 'duplicate' });
    seen.add(key);
    rows.push(row);
  });
  return { rows, skipped };
}

const lit = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
// One idempotent statement: a row already there (the same address, class, subject, topic and language) is updated, never doubled.
export function simUpsertSql(rows: readonly SimRow[]): string {
  if (!rows.length) return '';
  const values = rows.map((r) => `  (${[r.class, r.subject, r.chapter_number, r.chapter_name, r.topic, r.language, r.source, r.title, r.embed_url, r.page_url, r.licence].map(lit).join(', ')}, ${lit(r.preview)})`).join(',\n');
  return `insert into content.curated_topic_sims (class, subject, chapter_number, chapter_name, topic, language, source, title, embed_url, page_url, licence, preview) values\n${values}\non conflict (embed_url, class, subject, topic, language) do update set chapter_number = excluded.chapter_number, chapter_name = excluded.chapter_name, source = excluded.source, title = excluded.title, page_url = excluded.page_url, licence = excluded.licence, preview = excluded.preview`;
}

// ---- matching -----------------------------------------------------------------------------------------------------

export type SimAsk = { subject: Subject | null; term: string; topicEn?: string | null; title?: string | null; chapterEn?: string | null };
type Cand = Pick<SimRow, 'class' | 'subject' | 'chapter_name' | 'topic' | 'source' | 'title' | 'embed_url' | 'page_url' | 'licence' | 'preview'>;

// 18 Nov 2026 (tight match): a simulation is shown only when its approved topic's words are in the question's own words
// (two of every three, so a two-word topic needs both). The parent chapter never lends a fit, a word is its own or its plural
// only ("time" is not "times tables"), and no match means no simulation: a wrong one is worse than none.
export const SIM_MIN_FIT = 0.67;
// "Nearby" is the child's class plus or minus this many classes.
export const SIM_NEAR_CLASSES = 2;
// A simulation whose lowest class is more than this many classes above the child's class is never shown.
export const SIM_MAX_ABOVE = 3;
// A "generic" simulation covers at least this many classes (a 1-8 PhET sim), so it may serve a class outside its band.
export const SIM_GENERIC_SPAN = 4;

type Tier = { name: string; near: number; min: number; generic?: true };
// Tried in order, each in Hindi then English (simFor): the exact class band, then the child's class plus or minus two, then a generic
// simulation of any band. The subject always has to fit, and the topic has to fit tightly in every tier.
export const SIM_TIERS: readonly Tier[] = [
  { name: 'exact', near: 0, min: SIM_MIN_FIT },
  { name: 'near class', near: SIM_NEAR_CLASSES, min: SIM_MIN_FIT },
  { name: 'generic', near: Infinity, min: SIM_MIN_FIT, generic: true },
];

const STAGES: Record<string, number> = { nursery: -2, prenursery: -3, lkg: -1, ukg: 0 };
const level = (v: string): number | null => {
  const s = v.trim().toLowerCase().replace(/^class\s*/, '').replace(/[^a-z0-9]/g, '');
  return /^\d{1,2}$/.test(s) ? Number(s) : (STAGES[s] ?? null);
};
export function classSpan(cls: string): [number, number] | null {
  const [a, b] = cls.split(/\s*[-–]\s*/);
  const lo = level(a ?? '');
  const hi = b === undefined ? lo : level(b ?? '');
  return lo === null || hi === null ? null : [Math.min(lo, hi), Math.max(lo, hi)];
}
const SIM_COMMON_WORDS = new Set(['angle', 'number', 'time', 'speed', 'distance', 'length', 'shape', 'line', 'point', 'unit', 'value', 'rate', 'sum', 'problem', 'question', 'model', 'introduction', 'basic', 'arithmetic']);
const stem = (w: string) => (w.length > 3 && w.endsWith('es') && /(s|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
// The share of the row's topic words that are, as whole words (or plurals), among the question's own words (0 to 1).
export function tightFit(topic: string, text: string): number {
  const t = Array.from(new Set(words(topic).map(stem)));
  if (!t.length) return 0;
  const seen = new Set(words(text).map(stem));
  // A one-word topic is shown only when the question is about that word (at most three content words) and the word is not an
  // everyday one that sits in any sum ("angle", "time", "speed"): "time" in a question is not a reason for any simulation.
  if (t.length === 1 && (seen.size > 3 || SIM_COMMON_WORDS.has(t[0]!))) return 0;
  return t.filter((w) => seen.has(w)).length / t.length;
}
// How many classes the band is from the child's class (0 when it holds it).
const gap = (span: [number, number], c: number) => (c < span[0] ? span[0] - c : c > span[1] ? c - span[1] : 0);

function matchTier(rows: readonly Cand[], ask: SimAsk, child: Pick<FamilyChild, 'classLevel'>, tier: Tier): ElabSim | null {
  if (!ask.subject) return null;
  // The question's own words only: the chapter it sits in is never a reason to show a simulation.
  const own = [ask.term, ask.topicEn ?? '', ask.title ?? ''].join(' ');
  const fits = rows
    .map((r, order) => ({ r, order, span: classSpan(r.class) }))
    .filter((x): x is typeof x & { span: [number, number] } => !!x.span && subjectFits(x.r.subject, ask.subject!) && x.span[0] <= child.classLevel + SIM_MAX_ABOVE)
    .filter((x) => (tier.generic ? x.span[1] - x.span[0] + 1 >= SIM_GENERIC_SPAN : true) && gap(x.span, child.classLevel) <= tier.near)
    .map((x) => ({ ...x, gap: gap(x.span, child.classLevel), fit: tightFit(x.r.topic, own), titleFit: tightFit(x.r.title, own) }))
    .filter((x) => x.fit >= tier.min)
    // Best topic fit, then the title that also names it, then the nearest class band. The source is not a ranking: PhET, OLabs,
    // Virtual Labs and NASA Eyes compete on how well they fit the topic, and only on the database's own order when all else ties.
    .sort((a, b) => b.fit - a.fit || b.titleFit - a.titleFit || a.gap - b.gap || a.order - b.order);
  for (const { r } of fits) {
    const card = checkSim({ source: r.source, title: r.title, embed: r.embed_url, page: r.page_url, licence: r.licence, preview: r.preview ?? undefined });
    if (card) return card;
  }
  return null;
}

// The best approved simulation for the topic over the tiers above. null when none fits.
export function matchSim(rows: readonly Cand[], ask: SimAsk, child: Pick<FamilyChild, 'classLevel'>): ElabSim | null {
  for (const tier of SIM_TIERS) {
    const hit = matchTier(rows, ask, child, tier);
    if (hit) return hit;
  }
  return null;
}

// Each tier in Hindi first when the answer is Hindi, then English. A table not created yet reads as none.
export async function simFor(db: Db, ask: SimAsk, child: Pick<FamilyChild, 'classLevel'>, language: string): Promise<ElabSim | null> {
  const langs = language === 'en' ? ['en'] : [language, 'en'];
  const loaded = new Map<string, Cand[]>();
  const rowsOf = async (lang: string): Promise<Cand[] | null> => {
    const have = loaded.get(lang);
    if (have) return have;
    await db.query('savepoint curated_sims');
    try {
      const { rows } = await db.query('select class, subject, chapter_name, topic, source, title, embed_url, page_url, licence, preview from content.curated_sims($1)', [lang]);
      await db.query('release savepoint curated_sims');
      loaded.set(lang, rows as never);
      return rows as never;
    } catch {
      await db.query('rollback to savepoint curated_sims').catch(() => undefined);
      return null;
    }
  };
  for (const tier of SIM_TIERS) {
    for (const lang of langs) {
      const rows = await rowsOf(lang);
      if (!rows) return null;
      const hit = matchTier(rows, ask, child, tier);
      if (hit) return hit;
    }
  }
  return null;
}

