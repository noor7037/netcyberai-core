import type { Sql } from './sql';
import { filterCareers, type CareerQuery } from './filter';
import { buildLanes, crossesForCareer, crossesForStream } from './lanes';
import { FAMILY_VISIBLE_SQL, projectForFamily } from './visibility';
import type { CareerCard, CareerLevel, CrossPath, LateralRoute, ParallelAction, Roadmap, RoadStep, StreamSlug } from './types';

// Family reads. The SQL predicate matches the table policy. A second filter drops anything that is not approved.
// No state column is read or written: the same approved career is offered in every state.

const VIS = FAMILY_VISIBLE_SQL;

type Bag = { reviewState: 'approved' | 'pending' | 'rejected'; reviewDue: string };

function bi(en: string, hi: string) {
  return { en, hi };
}

export async function loadCareerCards(db: Sql, today: string): Promise<CareerCard[]> {
  const { rows } = await db.query(
    `select c.slug, c.field_id, f.name_en, f.name_hi, c.level, c.title_en, c.title_hi, c.summary_en, c.summary_hi, c.streams, c.min_level,
            c.gov_group, c.isco08_code, c.onet_soc_code, c.nco2015_code, c.official_url, c.horizon_en, c.horizon_hi, c.compete_en, c.compete_hi,
            c.review_state, to_char(c.review_due, 'YYYY-MM-DD') as review_due,
            f.review_state as field_state, to_char(f.review_due, 'YYYY-MM-DD') as field_due
       from content.careers c
       join content.career_fields f on f.field_id = c.field_id
      where ${VIS.replaceAll('review_state', 'c.review_state').replaceAll('review_due', 'c.review_due')}
        and ${VIS.replaceAll('review_state', 'f.review_state').replaceAll('review_due', 'f.review_due')}
      order by c.title_en`,
  );
  const cards = rows.map(cardOf);
  return projectForFamily(cards, today).filter((c) => c.fieldOk);
}

type CardRow = CareerCard & Bag & { fieldOk: boolean };

function cardOf(r: Record<string, unknown>): CardRow {
  return {
    slug: String(r.slug),
    fieldId: String(r.field_id),
    fieldName: bi(String(r.name_en), String(r.name_hi)),
    level: r.level as CareerLevel,
    title: bi(String(r.title_en), String(r.title_hi)),
    summary: bi(String(r.summary_en), String(r.summary_hi)),
    streams: (r.streams as StreamSlug[]) ?? [],
    minLevel: String(r.min_level),
    govGroup: (r.gov_group as CareerCard['govGroup']) ?? null,
    isco: r.isco08_code ? String(r.isco08_code) : null,
    onet: r.onet_soc_code ? String(r.onet_soc_code) : null,
    nco: r.nco2015_code ? String(r.nco2015_code) : null,
    officialUrl: r.official_url ? String(r.official_url) : null,
    horizon: r.horizon_en ? bi(String(r.horizon_en), String(r.horizon_hi ?? '')) : null,
    compete: bi(String(r.compete_en), String(r.compete_hi)),
    reviewState: r.review_state as Bag['reviewState'],
    reviewDue: String(r.review_due),
    fieldOk: r.field_state === 'approved',
  };
}

export async function loadCareerHome(db: Sql, query: CareerQuery, today: string): Promise<{ cards: CareerCard[]; fields: { id: string; name: { en: string; hi: string } }[] }> {
  const cards = await loadCareerCards(db, today);
  const fields = [...new Map(cards.map((c) => [c.fieldId, { id: c.fieldId, name: c.fieldName }])).values()];
  return { cards: filterCareers(cards, query), fields };
}

export async function loadRoadmap(db: Sql, slug: string, today: string): Promise<Roadmap | null> {
  const cards = await loadCareerCards(db, today);
  const career = cards.find((c) => c.slug === slug);
  if (!career) return null;
  const steps = projectForFamily(await loadSteps(db, slug), today);
  const actions = projectForFamily(await loadActions(db, slug), today);
  const crosses = crossesForCareer(career.streams, career.minLevel, career.slug, projectForFamily(await loadCrosses(db), today));
  const laterals = projectForFamily(await loadLaterals(db, slug), today);
  return { career, lanes: buildLanes({ steps, actions, laterals }), crosses };
}

export async function loadStreamCrosses(db: Sql, stream: StreamSlug, today: string): Promise<CrossPath[]> {
  return crossesForStream(stream, projectForFamily(await loadCrosses(db), today));
}

async function loadSteps(db: Sql, slug: string): Promise<(RoadStep & Bag)[]> {
  const { rows } = await db.query(
    `select s.step_key, s.lane, s.sort, s.requirement_en, s.requirement_hi, s.exam_name_en, s.exam_name_hi, s.future_series_key, s.official_url,
            s.review_state, to_char(s.review_due, 'YYYY-MM-DD') as review_due
       from content.career_steps s
       join content.careers c on c.career_id = s.career_id
      where c.slug = $1 and ${VIS.replaceAll('review_state', 's.review_state').replaceAll('review_due', 's.review_due')}`,
    [slug],
  );
  return rows.map((r) => ({
    key: String(r.step_key),
    lane: r.lane,
    sort: Number(r.sort),
    requirement: bi(String(r.requirement_en), String(r.requirement_hi)),
    examName: r.exam_name_en ? bi(String(r.exam_name_en), String(r.exam_name_hi ?? '')) : null,
    futureSeriesKey: r.future_series_key ? String(r.future_series_key) : null,
    officialUrl: r.official_url ? String(r.official_url) : null,
    reviewState: r.review_state,
    reviewDue: String(r.review_due),
  }));
}

async function loadActions(db: Sql, slug: string): Promise<(ParallelAction & Bag)[]> {
  const { rows } = await db.query(
    `select a.action_key, a.stage, a.type, a.title_en, a.title_hi, a.detail_en, a.detail_hi, a.effort, a.cost, a.official_url,
            a.review_state, to_char(a.review_due, 'YYYY-MM-DD') as review_due
       from content.career_parallel_actions a
       join content.careers c on c.career_id = a.career_id
      where c.slug = $1 and ${VIS.replaceAll('review_state', 'a.review_state').replaceAll('review_due', 'a.review_due')}`,
    [slug],
  );
  return rows.map((r) => ({
    key: String(r.action_key),
    stage: r.stage,
    type: r.type,
    title: bi(String(r.title_en), String(r.title_hi)),
    detail: bi(String(r.detail_en), String(r.detail_hi)),
    effort: r.effort,
    cost: r.cost,
    officialUrl: r.official_url ? String(r.official_url) : null,
    reviewState: r.review_state,
    reviewDue: String(r.review_due),
  }));
}

async function loadCrosses(db: Sql): Promise<(CrossPath & Bag)[]> {
  const { rows } = await db.query(
    `select cross_key, via_en, via_hi, conditions_en, conditions_hi, streams, to_slugs, any_graduate, official_url,
            review_state, to_char(review_due, 'YYYY-MM-DD') as review_due
       from content.career_cross_pathways
      where ${VIS}`,
  );
  return rows.map((r) => ({
    key: String(r.cross_key),
    via: bi(String(r.via_en), String(r.via_hi)),
    conditions: bi(String(r.conditions_en), String(r.conditions_hi)),
    officialUrl: r.official_url ? String(r.official_url) : null,
    streams: r.streams ?? [],
    toSlugs: r.to_slugs ?? [],
    anyGraduate: Boolean(r.any_graduate),
    reviewState: r.review_state,
    reviewDue: String(r.review_due),
  }));
}

async function loadLaterals(db: Sql, slug: string): Promise<(LateralRoute & Bag)[]> {
  const { rows } = await db.query(
    `select route_key, from_kind, detail_en, detail_hi, example_en, example_hi, to_slug, min_experience_years, degree_required, official_url,
            review_state, to_char(review_due, 'YYYY-MM-DD') as review_due
       from content.career_lateral_routes
      where to_slug = $1 and ${VIS}`,
    [slug],
  );
  return rows.map((r) => ({
    key: String(r.route_key),
    fromKind: r.from_kind,
    detail: bi(String(r.detail_en), String(r.detail_hi)),
    example: bi(String(r.example_en), String(r.example_hi)),
    toSlug: String(r.to_slug),
    minYears: r.min_experience_years === null ? null : Number(r.min_experience_years),
    degreeRequired: r.degree_required,
    officialUrl: r.official_url ? String(r.official_url) : null,
    reviewState: r.review_state,
    reviewDue: String(r.review_due),
  }));
}
