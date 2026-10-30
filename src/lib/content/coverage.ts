import type { Sql } from '@/lib/jobs/types';

// The coverage manifest (W9-D, docs/39 §4): what the library holds against what the syllabus asks for, so nobody claims
// coverage without evidence. One row per unit of every published syllabus (content.units), counted from its chapters
// (content.chapters) against the chapter library (content.chapter_contents, the shared chapters only: a parent's own
// upload is private to that family and never counts), with the open chapter requests that name one of its chapters.
// Read-only SQL over tables that already exist; the platform role reads it (Control).
//
// A chapter counts by its best version that is still in use: published, else reviewed, else draft; a retired version
// counts for nothing. A unit is Published when every one of its chapters is published, Missing when none has any
// version at all (or it has no chapters yet), and Partly otherwise. Reviewed and draft chapters are not shown to a
// child, so they never make a unit Published.

export type CoverageFilters = { boardId?: string | null; classLevel?: number | null; subject?: string | null };
export type UnitStatus = 'published' | 'partly' | 'missing';

export type UnitCoverage = {
  boardId: string;
  classLevel: number;
  subject: string;
  unitKey: string;
  unitTitleEn: string;
  unitTitleHi: string | null;
  topics: number;
  chapters: number;
  published: number;
  reviewed: number;
  draft: number;
  none: number;
  openRequests: number;
  lastPublished: string | null;
  status: UnitStatus;
};

export type CoverageTotal = {
  boardId: string;
  classLevel: number;
  subject: string;
  units: number;
  unitsPublished: number;
  chapters: number;
  published: number;
  reviewed: number;
  draft: number;
  none: number;
  openRequests: number;
  // Whole percent of the chapters that are published; null when the syllabus lists no chapter.
  publishedShare: number | null;
};

export type Coverage = { units: UnitCoverage[]; totals: CoverageTotal[]; all: { units: number; chapters: number; published: number; publishedShare: number | null } };

export function unitStatus(c: { chapters: number; published: number; reviewed: number; draft: number }): UnitStatus {
  if (c.chapters > 0 && c.published === c.chapters) return 'published';
  if (c.published + c.reviewed + c.draft === 0) return 'missing';
  return 'partly';
}

const share = (published: number, chapters: number) => (chapters > 0 ? Math.round((published / chapters) * 100) : null);
const day = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' && v ? v.slice(0, 10) : null);

export async function coverage(db: Sql, f: CoverageFilters = {}): Promise<Coverage> {
  const { rows } = await db.query(
    `with v as (
       select version_id, board_id, class_level, subject from content.syllabus_versions
        where status = 'published'
          and ($1::text is null or board_id = $1) and ($2::int is null or class_level = $2) and ($3::text is null or subject = $3)
     ),
     ch as (
       select c.version_id, c.unit_id,
              b.rank, b.last_published,
              (select count(*) from content.chapter_requests r
                where r.status in ('received', 'digitizing') and r.board_id = v.board_id and r.class_level = v.class_level and r.subject = v.subject
                  and (r.chapter_key = c.chapter_key or lower(r.title) = lower(c.title_en)))::int as requests
         from content.chapters c
         join v on v.version_id = c.version_id
         left join lateral (
           select max(case cc.status when 'published' then 3 when 'reviewed' then 2 else 1 end) as rank,
                  max(cc.published_at) filter (where cc.status = 'published') as last_published
             from content.chapter_contents cc
            where cc.chapter_key = c.chapter_key and cc.owner_account_id is null and cc.status in ('draft', 'reviewed', 'published')
              and cc.subject = v.subject and (cc.board_id is null or cc.board_id = v.board_id) and (cc.class_level is null or cc.class_level = v.class_level)
         ) b on true
     ),
     per as (
       select unit_id, count(*)::int as chapters,
              count(*) filter (where rank = 3)::int as published, count(*) filter (where rank = 2)::int as reviewed, count(*) filter (where rank = 1)::int as draft,
              sum(requests)::int as requests, max(last_published) as last_published
         from ch where unit_id is not null group by unit_id
     )
     select v.board_id, v.class_level, v.subject, u.unit_key, u.title_en, u.title_hi, u.position,
            (select count(*) from content.topics t join content.chapters c on c.chapter_id = t.chapter_id where c.unit_id = u.unit_id)::int as topics,
            coalesce(per.chapters, 0) as chapters, coalesce(per.published, 0) as published, coalesce(per.reviewed, 0) as reviewed, coalesce(per.draft, 0) as draft,
            coalesce(per.requests, 0) as requests, per.last_published
       from content.units u
       join v on v.version_id = u.version_id
       left join per on per.unit_id = u.unit_id
      order by v.board_id, v.class_level, v.subject, u.position, u.unit_key`,
    [f.boardId ?? null, f.classLevel ?? null, f.subject ?? null]
  );
  const units: UnitCoverage[] = rows.map((r) => {
    const chapters = Number(r.chapters);
    const published = Number(r.published);
    const reviewed = Number(r.reviewed);
    const draft = Number(r.draft);
    return {
      boardId: String(r.board_id),
      classLevel: Number(r.class_level),
      subject: String(r.subject),
      unitKey: String(r.unit_key),
      unitTitleEn: String(r.title_en),
      unitTitleHi: r.title_hi ? String(r.title_hi) : null,
      topics: Number(r.topics),
      chapters,
      published,
      reviewed,
      draft,
      none: chapters - published - reviewed - draft,
      openRequests: Number(r.requests),
      lastPublished: day(r.last_published),
      status: unitStatus({ chapters, published, reviewed, draft }),
    };
  });
  const byGroup = new Map<string, CoverageTotal>();
  for (const u of units) {
    const k = `${u.boardId}|${u.classLevel}|${u.subject}`;
    const t = byGroup.get(k) ?? { boardId: u.boardId, classLevel: u.classLevel, subject: u.subject, units: 0, unitsPublished: 0, chapters: 0, published: 0, reviewed: 0, draft: 0, none: 0, openRequests: 0, publishedShare: null };
    t.units++;
    if (u.status === 'published') t.unitsPublished++;
    t.chapters += u.chapters;
    t.published += u.published;
    t.reviewed += u.reviewed;
    t.draft += u.draft;
    t.none += u.none;
    t.openRequests += u.openRequests;
    byGroup.set(k, t);
  }
  const totals = Array.from(byGroup.values()).map((t) => ({ ...t, publishedShare: share(t.published, t.chapters) }));
  const chapters = totals.reduce((n, t) => n + t.chapters, 0);
  const published = totals.reduce((n, t) => n + t.published, 0);
  return { units, totals, all: { units: units.length, chapters, published, publishedShare: share(published, chapters) } };
}

export const COVERAGE_CSV_HEADER = ['Board', 'Class', 'Subject', 'Unit key', 'Unit (English)', 'Unit (Hindi)', 'Topics', 'Chapters', 'Published', 'Reviewed', 'Draft', 'None', 'Open requests', 'Last published', 'Status'] as const;
export const coverageCsvRow = (u: UnitCoverage): (string | number | null)[] => [
  u.boardId, u.classLevel, u.subject, u.unitKey, u.unitTitleEn, u.unitTitleHi, u.topics, u.chapters, u.published, u.reviewed, u.draft, u.none, u.openRequests, u.lastPublished, u.status,
];

// Reads ?board=&class=&subject= the same way for the page and the export.
export function parseCoverageFilters(p: URLSearchParams): CoverageFilters {
  const board = p.get('board');
  const cls = Number(p.get('class'));
  const subject = p.get('subject');
  return {
    boardId: board && /^[A-Z][A-Z0-9-]{1,15}$/.test(board) ? board : null,
    classLevel: Number.isInteger(cls) && cls >= 1 && cls <= 12 ? cls : null,
    subject: subject && /^[a-z][a-z_]{1,39}$/.test(subject) ? subject : null,
  };
}
