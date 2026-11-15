import type { Sql } from './sql';
import type { DesiredRow } from './import-plan';
import { planImport, type StoredRow } from './import-plan';
import type { ReviewState } from './types';
import { SEED_BATCH, seedRows, type SeedBundle } from './seed-build';

// Writes the seed as pending. A row whose text has not changed keeps its review state, so a second run
// does not un-approve the founder’s decisions. Changed text returns to pending.

export async function importSeed(db: Sql, actorId: string, bundle: SeedBundle): Promise<{ inserted: number; updated: number; unchanged: number }> {
  const { desired } = seedRows(bundle);
  const stored: StoredRow[] = [];
  const reads: { table: string; sql: string }[] = [
    { table: 'career_fields', sql: `select field_id as key, content_hash, review_state from content.career_fields` },
    { table: 'careers', sql: `select slug as key, content_hash, review_state from content.careers` },
    { table: 'career_steps', sql: `select step_key as key, content_hash, review_state from content.career_steps` },
    { table: 'career_parallel_actions', sql: `select action_key as key, content_hash, review_state from content.career_parallel_actions` },
    { table: 'career_cross_pathways', sql: `select cross_key as key, content_hash, review_state from content.career_cross_pathways` },
    { table: 'career_lateral_routes', sql: `select route_key as key, content_hash, review_state from content.career_lateral_routes` },
  ];
  for (const read of reads) {
    const { rows } = await db.query(read.sql);
    for (const r of rows) stored.push({ table: read.table, key: String(r.key), hash: String(r.content_hash), reviewState: r.review_state as ReviewState });
  }
  const plan = planImport(desired, stored);
  const byId = new Map(desired.map((r) => [`${r.table}\t${r.key}`, r]));
  for (const row of plan.insert) await writeRow(db, actorId, byId.get(`${row.table}\t${row.key}`)!, false);
  for (const row of plan.update) await writeRow(db, actorId, byId.get(`${row.table}\t${row.key}`)!, true);
  return { inserted: plan.insert.length, updated: plan.update.length, unchanged: plan.unchanged };
}

async function writeRow(db: Sql, actorId: string, row: DesiredRow, exists: boolean): Promise<void> {
  const w = row.write;
  if (row.table === 'career_fields') return upsertField(db, actorId, row, w, exists);
  if (row.table === 'careers') return upsertCareer(db, actorId, row, w, exists);
  if (row.table === 'career_steps') return upsertStep(db, actorId, row, w, exists);
  if (row.table === 'career_parallel_actions') return upsertAction(db, actorId, row, w, exists);
  if (row.table === 'career_cross_pathways') return upsertCross(db, actorId, row, w, exists);
  return upsertLateral(db, actorId, row, w, exists);
}

async function upsertField(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  if (!exists) {
    await db.query(
      `insert into content.career_fields (field_id, name_en, name_hi, sort, official_url, review_due, content_hash, import_batch, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [w.field_id, w.name_en, w.name_hi, w.sort, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId],
    );
    return;
  }
  await db.query(
    `update content.career_fields set name_en=$2, name_hi=$3, sort=$4, official_url=$5, content_hash=$6, import_batch=$7, updated_by=$8, updated_at=now(),
       review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null, review_due=$9
     where field_id=$1`,
    [w.field_id, w.name_en, w.name_hi, w.sort, w.official_url, row.hash, SEED_BATCH, actorId, row.reviewDue],
  );
}

async function upsertCareer(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  const params = [w.slug, w.field_id, w.title_en, w.title_hi, w.summary_en, w.summary_hi, w.level, w.streams, w.min_level, w.isco08_code, w.onet_soc_code, w.nco2015_code, w.gov_group, w.official_url, w.horizon_en, w.horizon_hi, w.compete_en, w.compete_hi, row.reviewDue, row.hash, SEED_BATCH, actorId];
  if (!exists) {
    await db.query(
      `insert into content.careers (slug, field_id, title_en, title_hi, summary_en, summary_hi, level, streams, min_level, isco08_code, onet_soc_code, nco2015_code, gov_group, official_url, horizon_en, horizon_hi, compete_en, compete_hi, review_due, content_hash, import_batch, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)`,
      params,
    );
    return;
  }
  await db.query(
    `update content.careers set field_id=$2, title_en=$3, title_hi=$4, summary_en=$5, summary_hi=$6, level=$7, streams=$8, min_level=$9, isco08_code=$10, onet_soc_code=$11, nco2015_code=$12, gov_group=$13, official_url=$14, horizon_en=$15, horizon_hi=$16, compete_en=$17, compete_hi=$18,
       review_due=$19, content_hash=$20, import_batch=$21, updated_by=$22, updated_at=now(), review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null
     where slug=$1`,
    params,
  );
}

async function upsertStep(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  if (!exists) {
    await db.query(
      `insert into content.career_steps (step_key, career_id, lane, sort, requirement_en, requirement_hi, exam_name_en, exam_name_hi, future_series_key, official_url, review_due, content_hash, import_batch, created_by, updated_by)
       select $1, career_id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14 from content.careers where slug=$2`,
      [w.step_key, w.career_slug, w.lane, w.sort, w.requirement_en, w.requirement_hi, w.exam_name_en, w.exam_name_hi, w.future_series_key, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId],
    );
    return;
  }
  await db.query(
    `update content.career_steps set lane=$2, sort=$3, requirement_en=$4, requirement_hi=$5, exam_name_en=$6, exam_name_hi=$7, future_series_key=$8, official_url=$9,
       review_due=$10, content_hash=$11, import_batch=$12, updated_by=$13, updated_at=now(), review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null
     where step_key=$1`,
    [w.step_key, w.lane, w.sort, w.requirement_en, w.requirement_hi, w.exam_name_en, w.exam_name_hi, w.future_series_key, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId],
  );
}

async function upsertAction(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  if (!exists) {
    await db.query(
      `insert into content.career_parallel_actions (action_key, career_id, stage, type, title_en, title_hi, detail_en, detail_hi, effort, cost, official_url, review_due, content_hash, import_batch, created_by, updated_by)
       select $1, career_id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15 from content.careers where slug=$2`,
      [w.action_key, w.career_slug, w.stage, w.type, w.title_en, w.title_hi, w.detail_en, w.detail_hi, w.effort, w.cost, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId],
    );
    return;
  }
  await db.query(
    `update content.career_parallel_actions set stage=$2, type=$3, title_en=$4, title_hi=$5, detail_en=$6, detail_hi=$7, effort=$8, cost=$9, official_url=$10,
       review_due=$11, content_hash=$12, import_batch=$13, updated_by=$14, updated_at=now(), review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null
     where action_key=$1`,
    [w.action_key, w.stage, w.type, w.title_en, w.title_hi, w.detail_en, w.detail_hi, w.effort, w.cost, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId],
  );
}

async function upsertCross(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  const params = [w.cross_key, w.via_en, w.via_hi, w.conditions_en, w.conditions_hi, w.streams, w.to_slugs, w.any_graduate, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId];
  if (!exists) {
    await db.query(
      `insert into content.career_cross_pathways (cross_key, via_en, via_hi, conditions_en, conditions_hi, streams, to_slugs, any_graduate, official_url, review_due, content_hash, import_batch, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
      params,
    );
    return;
  }
  await db.query(
    `update content.career_cross_pathways set via_en=$2, via_hi=$3, conditions_en=$4, conditions_hi=$5, streams=$6, to_slugs=$7, any_graduate=$8, official_url=$9,
       review_due=$10, content_hash=$11, import_batch=$12, updated_by=$13, updated_at=now(), review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null
     where cross_key=$1`,
    params,
  );
}

async function upsertLateral(db: Sql, actorId: string, row: DesiredRow, w: Record<string, unknown>, exists: boolean) {
  const params = [w.route_key, w.from_kind, w.detail_en, w.detail_hi, w.example_en, w.example_hi, w.to_slug, w.min_experience_years, w.degree_required, w.official_url, row.reviewDue, row.hash, SEED_BATCH, actorId];
  if (!exists) {
    await db.query(
      `insert into content.career_lateral_routes (route_key, from_kind, detail_en, detail_hi, example_en, example_hi, to_slug, min_experience_years, degree_required, official_url, review_due, content_hash, import_batch, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
      params,
    );
    return;
  }
  await db.query(
    `update content.career_lateral_routes set from_kind=$2, detail_en=$3, detail_hi=$4, example_en=$5, example_hi=$6, to_slug=$7, min_experience_years=$8, degree_required=$9, official_url=$10,
       review_due=$11, content_hash=$12, import_batch=$13, updated_by=$14, updated_at=now(), review_state='pending', reviewed_by=null, reviewed_at=null, reject_reason=null
     where route_key=$1`,
    params,
  );
}
