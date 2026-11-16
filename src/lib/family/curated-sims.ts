import type { FamilyChild } from './children';
import { classFits, curatedFit, parseCsv, subjectFits } from './curated-videos';
import type { Subject } from './subjects';
import { EMBED_ORDER } from './visuals/embed-order';
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

// The topic words must fit this much for an exact or nearby-class match (the curated videos' own bar).
export const SIM_MIN_FIT = 0.5;
// The lower bar of the last tier only: the topic's words found in the parent chapter or the intent's topic (a third of them, 0.33).
export const SIM_BROAD_FIT = 0.33;
// "Nearby" is the child's class plus or minus this many classes.
export const SIM_NEAR_CLASSES = 2;
// A simulation whose lowest class is more than this many classes above the child's class is never shown.
export const SIM_MAX_ABOVE = 3;
// A "generic" simulation covers at least this many classes (a 1-8 PhET sim), so it may serve a class outside its band.
export const SIM_GENERIC_SPAN = 4;

type Tier = { name: string; near: number; min: number; generic?: true };
// Tried in order, each in Hindi then English (simFor): the exact class band, then the child's class plus or minus two, then a generic
// simulation of any band, then the parent topic or chapter at the lower bar within two classes. The subject always has to fit.
export const SIM_TIERS: readonly Tier[] = [
  { name: 'exact', near: 0, min: SIM_MIN_FIT },
  { name: 'near class', near: SIM_NEAR_CLASSES, min: SIM_MIN_FIT },
  { name: 'generic', near: Infinity, min: SIM_MIN_FIT, generic: true },
  { name: 'parent topic', near: SIM_NEAR_CLASSES, min: SIM_BROAD_FIT },
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
// How many classes the band is from the child's class (0 when it holds it).
const gap = (span: [number, number], c: number) => (c < span[0] ? span[0] - c : c > span[1] ? c - span[1] : 0);

function matchTier(rows: readonly Cand[], ask: SimAsk, child: Pick<FamilyChild, 'classLevel'>, tier: Tier): ElabSim | null {
  if (!ask.subject) return null;
  const line = { topicEn: ask.topicEn ?? ask.term, title: [ask.term, ask.title ?? ''].join(' ').trim(), chapterEn: ask.chapterEn ?? '' };
  const fits = rows
    .map((r, order) => ({ r, order, span: classSpan(r.class) }))
    .filter((x): x is typeof x & { span: [number, number] } => !!x.span && subjectFits(x.r.subject, ask.subject!) && x.span[0] <= child.classLevel + SIM_MAX_ABOVE)
    .filter((x) => (tier.generic ? x.span[1] - x.span[0] + 1 >= SIM_GENERIC_SPAN : true) && gap(x.span, child.classLevel) <= tier.near)
    .map((x) => ({ ...x, gap: gap(x.span, child.classLevel), fit: curatedFit({ topic: x.r.topic, chapterName: x.r.chapter_name }, line), rank: EMBED_ORDER.indexOf(x.r.source) }))
    .filter((x) => x.fit >= tier.min)
    .sort((a, b) => b.fit - a.fit || a.gap - b.gap || (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank) || a.order - b.order);
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

