// Turns one track's committed lesson files (data/english/<track>/) into the SQL that loads it into the content
// library as a course version in review (docs/family-app/12 §11, C274): import_source 'repository', import_ref = the
// pull request that committed the files, no importing account. Any super_admin then approves it in Control → Content
// and releases it to everyone as a second step.
//
//   npx tsx scripts/content/english-sql.ts <track> --ref "PR #N" > load.sql
//
// The track must pass the lesson checker (src/lib/family/english/course.ts) first; nothing is printed otherwise. The output
// is a series of statements, each complete on its own and separated by a line "-- ---- <part>", so it can be run in
// parts: the first makes the version (skipped when the track already has a version from the same import_ref), each
// later part adds one unit with its lessons, or the assessments, to that version. Every value is a quoted literal.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { checkTrack, isTrack, type AssessmentFile, type Unit } from '../../src/lib/family/english/course';

const args = process.argv.slice(2);
const track = args[0];
const ref = args[args.indexOf('--ref') + 1];
if (!isTrack(track) || args.indexOf('--ref') < 0 || !ref) {
  console.error('usage: npx tsx scripts/content/english-sql.ts <a|b|c|d> --ref "<pull request>"');
  process.exit(2);
}

const dir = path.resolve(__dirname, '../../data/english', track);
const files = readdirSync(dir).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort();
const units = files.map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Unit);
const assessments = JSON.parse(readFileSync(path.join(dir, 'assessments.json'), 'utf8')) as AssessmentFile;
const problems = checkTrack(track, units, assessments);
if (problems.length > 0) {
  for (const p of problems.slice(0, 50)) console.error(`${p.where}: ${p.problem}`);
  console.error(`${problems.length} problems: nothing printed`);
  process.exit(1);
}

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  if (s.includes('\u0000')) throw new Error('a value contains a NUL character');
  return `'${s.replace(/'/g, "''")}'`;
};
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const version = `(select version_id from content.english_versions where track = ${lit(track)} and import_source = 'repository' and import_ref = ${lit(ref)})`;

const out: string[] = [];
out.push(`-- ---- version: track ${track}, ${ref}
insert into content.english_versions (track, version_no, status, import_source, import_ref)
select ${lit(track)}, coalesce(max(version_no), 0) + 1, 'in_review', 'repository', ${lit(ref)}
  from content.english_versions where track = ${lit(track)}
having not exists (select 1 from content.english_versions where track = ${lit(track)} and import_source = 'repository' and import_ref = ${lit(ref)});`);

for (const u of units) {
  const lessons = u.lessons
    .map(
      (l, i) =>
        `(${[lit(l.key), lit(u.key), String(i + 1), lit(l.kind), lit(l.title.en), lit(l.title.hi ?? l.title.en), String(l.minutes), json(l)].join(', ')})`
    )
    .join(',\n    ');
  out.push(`-- ---- ${u.key}: ${u.title.en}
with v as (select ${version} as version_id),
u as (
  insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic)
  select v.version_id, ${[lit(u.key), String(u.unit), lit(u.title.en), lit(u.title.hi ?? u.title.en), lit(u.can_do.en), lit(u.can_do.hi ?? u.can_do.en), lit(u.pic)].join(', ')}
    from v where v.version_id is not null
      and not exists (select 1 from content.english_units x where x.version_id = v.version_id and x.unit_key = ${lit(u.key)})
  returning version_id
)
insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body)
select u.version_id, x.* from u cross join (values
    ${lessons}
  ) as x(lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body);`);
}

out.push(`-- ---- assessments
insert into content.english_assessments (version_id, kind, body)
select v.version_id, x.kind, x.body from (select ${version} as version_id) v cross join (values
    ${assessments.assessments.map((a) => `(${lit(a.kind)}, ${json(a)})`).join(',\n    ')}
  ) as x(kind, body)
 where v.version_id is not null
   and not exists (select 1 from content.english_assessments y where y.version_id = v.version_id and y.kind = x.kind);`);

process.stdout.write(out.join('\n\n') + '\n');
